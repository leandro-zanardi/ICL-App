import { Router, type IRouter } from "express";
import { ListarPostosQueryParams } from "@workspace/api-zod";
import { db, postos, checkins } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { haversineKm, geohash5 } from "../lib/geo";
import { calcularScore, isRedeAssociada } from "../lib/score";
import { publicarEvento } from "../lib/sse";
import { validar } from "../lib/validar";

const router: IRouter = Router();

router.get("/postos", async (req, res) => {
  const query = validar(ListarPostosQueryParams, req.query, res);
  if (!query) return;

  const { lat, lng, raio_km, somente_selo, q } = query;
  const todos = await db.select().from(postos);

  const termo = q
    ? q
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
    : null;

  const resultado = todos
    .map((p) => ({
      posto: p,
      distanciaKm: haversineKm(lat, lng, p.lat, p.lng),
    }))
    .filter(({ posto, distanciaKm }) => {
      if (distanciaKm > raio_km) return false;
      if (somente_selo && posto.tier !== "selo") return false;
      if (termo) {
        const alvo = `${posto.nomeFantasia} ${posto.bandeira} ${posto.municipio} ${posto.endereco}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (!alvo.includes(termo)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const tierPeso = (t: string) => (t === "selo" ? 0 : 1);
      const dt = tierPeso(a.posto.tier) - tierPeso(b.posto.tier);
      if (dt !== 0) return dt;
      return a.distanciaKm - b.distanciaKm;
    })
    .slice(0, 120)
    .map(({ posto, distanciaKm }) => ({
      id: posto.id,
      nome_fantasia: posto.nomeFantasia,
      bandeira: posto.bandeira,
      endereco: posto.endereco,
      municipio: posto.municipio,
      uf: posto.uf,
      lat: posto.lat,
      lng: posto.lng,
      tier: posto.tier,
      score: posto.score,
      distancia_km: Math.round(distanciaKm * 10) / 10,
      rede_associada: isRedeAssociada(posto.bandeira),
    }));

  res.json(resultado);
});

router.get("/postos/:id", async (req, res) => {
  const id = req.params.id;
  const [posto] = await db.select().from(postos).where(eq(postos.id, id)).limit(1);

  if (!posto) {
    res.status(404).json({ error: "Posto não encontrado." });
    return;
  }

  const [{ totalCheckins }] = await db
    .select({ totalCheckins: sql<number>`count(*)::int` })
    .from(checkins)
    .where(eq(checkins.postoId, posto.id));

  const { criterios } = calcularScore(posto);

  publicarEvento({
    eventType: "visualizou_posto",
    descricao: `Motorista visualizou ${posto.nomeFantasia} (${posto.municipio})`,
    municipio: posto.municipio,
    redeAssociada: isRedeAssociada(posto.bandeira),
    postoId: posto.id,
    geohash: geohash5(posto.lat, posto.lng),
    sessionId: req.sessionId,
  }).catch(() => undefined);

  res.json({
    id: posto.id,
    cnpj: posto.cnpj,
    razao_social: posto.razaoSocial,
    nome_fantasia: posto.nomeFantasia,
    bandeira: posto.bandeira,
    endereco: posto.endereco,
    municipio: posto.municipio,
    uf: posto.uf,
    lat: posto.lat,
    lng: posto.lng,
    tier: posto.tier,
    score: posto.score,
    criterios,
    situacao_anp: posto.situacaoAnp,
    data_autorizacao_anp: posto.dataAutorizacaoAnp,
    qualidade_verificada_em: posto.qualidadeVerificadaEm,
    autuacoes_24m: posto.autuacoes24m,
    total_checkins: totalCheckins,
    atualizado_em: posto.atualizadoEm.toISOString(),
  });
});

export default router;
