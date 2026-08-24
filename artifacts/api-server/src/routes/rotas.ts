import { Router, type IRouter } from "express";
import { CalcularRotaBody } from "@workspace/api-zod";
import { db, postos } from "@workspace/db";
import { distanceToPolyline, samplePolyline, type LatLng } from "../lib/geo";
import { buscarEnderecos, type GeoPonto } from "../lib/geocode";
import { calcularRotaVeicular } from "../lib/osrm";
import { isRedeAssociada } from "../lib/score";
import { publicarEvento } from "../lib/sse";
import { validar } from "../lib/validar";

const router: IRouter = Router();

const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

async function resolverPonto(texto: string, labelCoord: string): Promise<GeoPonto | null> {
  const m = COORD_RE.exec(texto);
  if (m) {
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { label: labelCoord, lat, lng };
    }
    return null;
  }
  const resultados = await buscarEnderecos(texto);
  return resultados[0] ?? null;
}

router.post("/rotas", async (req, res) => {
  const body = validar(CalcularRotaBody, req.body, res);
  if (!body) return;

  const [origem, destino] = await Promise.all([
    resolverPonto(body.origem, "Minha localização"),
    resolverPonto(body.destino, "Destino"),
  ]);

  if (!origem) {
    res.status(400).json({ error: "Não encontramos o endereço de origem informado." });
    return;
  }
  if (!destino) {
    res.status(400).json({ error: "Não encontramos o endereço de destino informado." });
    return;
  }

  const rota = await calcularRotaVeicular([origem.lat, origem.lng], [destino.lat, destino.lng]);
  const amostra = samplePolyline(rota.polyline as LatLng[], 300);

  const todos = await db.select().from(postos);
  const corredor = todos
    .map((p) => {
      const { distanciaKm, indice } = distanceToPolyline(p.lat, p.lng, amostra);
      return { posto: p, desvioKm: distanciaKm, indice };
    })
    .filter((c) => c.desvioKm <= 3)
    .sort((a, b) => a.indice - b.indice || a.desvioKm - b.desvioKm)
    .slice(0, 24)
    .map((c, idx) => ({
      id: c.posto.id,
      nome_fantasia: c.posto.nomeFantasia,
      bandeira: c.posto.bandeira,
      endereco: c.posto.endereco,
      municipio: c.posto.municipio,
      lat: c.posto.lat,
      lng: c.posto.lng,
      tier: c.posto.tier,
      score: c.posto.score,
      desvio_km: Math.round(c.desvioKm * 10) / 10,
      ordem: idx + 1,
      rede_associada: isRedeAssociada(c.posto.bandeira),
    }));

  publicarEvento({
    eventType: "rota_tracada",
    descricao: `Rota traçada até ${destino.label}`,
    municipio: null,
    sessionId: req.sessionId,
  }).catch(() => undefined);

  res.json({
    origem,
    destino,
    polyline: rota.polyline,
    distancia_km: Math.round(rota.distanciaKm * 10) / 10,
    duracao_min: Math.round(rota.duracaoMin),
    postos: corredor,
    fonte: rota.fonte,
  });
});

export default router;
