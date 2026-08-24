import { db, rotasCache } from "@workspace/db";
import { eq } from "drizzle-orm";
import { haversineKm, type LatLng } from "./geo";
import { logger } from "./logger";

export interface RotaCalculada {
  polyline: LatLng[];
  distanciaKm: number;
  duracaoMin: number;
  fonte: "osrm" | "cache" | "fallback";
}

/**
 * Trajeto aproximado São Paulo → Campinas pelo corredor
 * Anhanguera/Bandeirantes — usado como fallback quando o OSRM público
 * não responde (demo nunca quebra).
 */
export const FALLBACK_SP_CAMPINAS: LatLng[] = [
  [-23.5346, -46.7017],
  [-23.5081, -46.7223],
  [-23.4694, -46.7523],
  [-23.4322, -46.7823],
  [-23.3946, -46.8172],
  [-23.3561, -46.8543],
  [-23.3081, -46.8764],
  [-23.2609, -46.8975],
  [-23.2101, -46.9124],
  [-23.1557, -46.9251],
  [-23.0865, -46.9506],
  [-23.0302, -46.9756],
  [-22.9698, -46.9974],
  [-22.9352, -47.0286],
  [-22.9056, -47.0608],
];

function chaveCache(origem: LatLng, destino: LatLng): string {
  const r = (n: number) => n.toFixed(3);
  return `${r(origem[0])},${r(origem[1])}|${r(destino[0])},${r(destino[1])}`;
}

function rotaLinear(origem: LatLng, destino: LatLng): RotaCalculada {
  const pontos: LatLng[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pontos.push([
      origem[0] + (destino[0] - origem[0]) * t,
      origem[1] + (destino[1] - origem[1]) * t,
    ]);
  }
  const distanciaKm = haversineKm(origem[0], origem[1], destino[0], destino[1]) * 1.25;
  return {
    polyline: pontos,
    distanciaKm,
    duracaoMin: (distanciaKm / 72) * 60,
    fonte: "fallback",
  };
}

function pertoDe(a: LatLng, alvo: LatLng, kmMax: number): boolean {
  return haversineKm(a[0], a[1], alvo[0], alvo[1]) <= kmMax;
}

function rotaFallback(origem: LatLng, destino: LatLng): RotaCalculada {
  const sp: LatLng = [-23.5505, -46.6333];
  const campinas: LatLng = [-22.9056, -47.0608];

  // Se o par se parece com SP → Campinas (em qualquer direção), usa o corredor real.
  const idaSpCampinas = pertoDe(origem, sp, 40) && pertoDe(destino, campinas, 30);
  const voltaCampinasSp = pertoDe(origem, campinas, 30) && pertoDe(destino, sp, 40);

  if (idaSpCampinas || voltaCampinasSp) {
    const corredor = voltaCampinasSp
      ? [...FALLBACK_SP_CAMPINAS].reverse()
      : FALLBACK_SP_CAMPINAS;
    const polyline: LatLng[] = [origem, ...corredor, destino];
    let distanciaKm = 0;
    for (let i = 1; i < polyline.length; i++) {
      distanciaKm += haversineKm(
        polyline[i - 1][0],
        polyline[i - 1][1],
        polyline[i][0],
        polyline[i][1],
      );
    }
    return { polyline, distanciaKm, duracaoMin: (distanciaKm / 82) * 60, fonte: "fallback" };
  }

  return rotaLinear(origem, destino);
}

async function consultarOsrm(origem: LatLng, destino: LatLng): Promise<RotaCalculada | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origem[1]},${origem[0]};${destino[1]},${destino[0]}` +
    `?overview=full&geometries=geojson&alternatives=false`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4500),
      headers: { "User-Agent": "combustivel-legal-prototipo/0.1" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: Array<[number, number]> };
      }>;
    };
    const rota = data.routes?.[0];
    if (data.code !== "Ok" || !rota) return null;

    return {
      polyline: rota.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng),
      distanciaKm: rota.distance / 1000,
      duracaoMin: rota.duration / 60,
      fonte: "osrm",
    };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "OSRM indisponível, usando cache/fallback");
    return null;
  }
}

export async function calcularRotaVeicular(
  origem: LatLng,
  destino: LatLng,
): Promise<RotaCalculada> {
  const chave = chaveCache(origem, destino);

  const osrm = await consultarOsrm(origem, destino);
  if (osrm) {
    // Atualiza o cache de forma silenciosa (best effort).
    db.insert(rotasCache)
      .values({
        chave,
        polyline: osrm.polyline,
        distanciaKm: osrm.distanciaKm,
        duracaoMin: osrm.duracaoMin,
        fonte: "osrm",
      })
      .onConflictDoUpdate({
        target: rotasCache.chave,
        set: {
          polyline: osrm.polyline,
          distanciaKm: osrm.distanciaKm,
          duracaoMin: osrm.duracaoMin,
        },
      })
      .catch((err: Error) => logger.warn({ err: err.message }, "Falha ao gravar cache de rota"));
    return osrm;
  }

  const [cache] = await db.select().from(rotasCache).where(eq(rotasCache.chave, chave)).limit(1);
  if (cache) {
    return {
      polyline: cache.polyline as LatLng[],
      distanciaKm: cache.distanciaKm,
      duracaoMin: cache.duracaoMin,
      fonte: "cache",
    };
  }

  return rotaFallback(origem, destino);
}
