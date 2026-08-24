import { logger } from "./logger";

export interface GeoPonto {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Lugares conhecidos da região-piloto — resposta instantânea e à prova de
 * falhas para os termos usados na demonstração.
 */
const GAZETTEER: Array<GeoPonto & { termos: string[] }> = [
  { label: "Av. Paulista, São Paulo — SP", lat: -23.5614, lng: -46.6559, termos: ["paulista"] },
  { label: "Campinas — SP", lat: -22.9056, lng: -47.0608, termos: ["campinas"] },
  { label: "Jundiaí — SP", lat: -23.1857, lng: -46.8978, termos: ["jundiai", "jundiaí"] },
  { label: "Osasco — SP", lat: -23.5325, lng: -46.7917, termos: ["osasco"] },
  { label: "Barueri — SP", lat: -23.5106, lng: -46.8761, termos: ["barueri", "alphaville"] },
  { label: "Cajamar — SP", lat: -23.3561, lng: -46.877, termos: ["cajamar"] },
  { label: "Louveira — SP", lat: -23.0865, lng: -46.9506, termos: ["louveira"] },
  { label: "Vinhedo — SP", lat: -23.0302, lng: -46.9756, termos: ["vinhedo"] },
  { label: "Valinhos — SP", lat: -22.9698, lng: -46.9974, termos: ["valinhos"] },
  {
    label: "Aeroporto de Viracopos, Campinas — SP",
    lat: -23.0074,
    lng: -47.1345,
    termos: ["viracopos", "aeroporto"],
  },
  {
    label: "Centro, São Paulo — SP",
    lat: -23.5505,
    lng: -46.6333,
    termos: ["centro de sao paulo", "sé", "se, sao paulo", "sao paulo", "são paulo"],
  },
  {
    label: "Rod. Anhanguera km 40, Cajamar — SP",
    lat: -23.3081,
    lng: -46.8764,
    termos: ["anhanguera"],
  },
  {
    label: "Rod. dos Bandeirantes, Jundiaí — SP",
    lat: -23.2101,
    lng: -46.9124,
    termos: ["bandeirantes"],
  },
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buscarNoGazetteer(q: string): GeoPonto[] {
  const nq = normalizar(q);
  return GAZETTEER.filter((p) => p.termos.some((t) => nq.includes(normalizar(t)))).map(
    ({ label, lat, lng }) => ({ label, lat, lng }),
  );
}

const cache = new Map<string, GeoPonto[]>();

/**
 * Busca de endereços com viés para a região-piloto (SP capital + corredor
 * Anhanguera/Bandeirantes), proxied no servidor para não expor o cliente a
 * limites do Nominatim.
 */
export async function buscarEnderecos(q: string): Promise<GeoPonto[]> {
  const chave = normalizar(q);
  const memo = cache.get(chave);
  if (memo) return memo;

  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    countrycodes: "br",
    limit: "6",
    // Caixa da região-piloto (lon1,lat1,lon2,lat2) — viés, sem exclusão.
    viewbox: "-47.4,-22.6,-46.2,-23.9",
  });

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: AbortSignal.timeout(4500),
      headers: {
        "User-Agent": "combustivel-legal-prototipo/0.1 (demo institucional)",
        "Accept-Language": "pt-BR",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
    }>;

    const pontos: GeoPonto[] = data.map((r) => ({
      label: r.display_name.split(",").slice(0, 3).join(",").trim(),
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));

    const resultado = pontos.length > 0 ? pontos : buscarNoGazetteer(q);
    if (resultado.length > 0) cache.set(chave, resultado);
    return resultado;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Nominatim indisponível, usando gazetteer");
    return buscarNoGazetteer(q);
  }
}
