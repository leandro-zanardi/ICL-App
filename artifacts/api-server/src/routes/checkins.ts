import { Router, type IRouter } from "express";
import { CriarCheckinBody } from "@workspace/api-zod";
import { carteiras, checkins, db, postos, transacoesPontos } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { geohash5, haversineKm } from "../lib/geo";
import { isRedeAssociada } from "../lib/score";
import { publicarEvento } from "../lib/sse";
import { validar } from "../lib/validar";

const router: IRouter = Router();

const PONTOS_CHECKIN = 50;
const COOLDOWN_HORAS = 6;

router.post("/checkins", requireAuth, async (req, res) => {
  const body = validar(CriarCheckinBody, req.body, res);
  if (!body) return;

  const userId = req.userId!;
  const [posto] = await db.select().from(postos).where(eq(postos.id, body.posto_id)).limit(1);

  if (!posto) {
    res.status(404).json({ erro: "Posto não encontrado." });
    return;
  }

  if (posto.tier !== "selo") {
    res.status(409).json({
      erro: "O check-in está disponível apenas em postos com o Selo Combustível Legal.",
    });
    return;
  }

  const limite = new Date(Date.now() - COOLDOWN_HORAS * 3_600_000);
  const [recente] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .where(
      and(
        eq(checkins.userId, userId),
        eq(checkins.postoId, posto.id),
        gte(checkins.criadoEm, limite),
      ),
    )
    .orderBy(desc(checkins.criadoEm))
    .limit(1);

  if (recente) {
    res.status(409).json({
      erro: `Você já fez check-in neste posto nas últimas ${COOLDOWN_HORAS} horas. Volte mais tarde.`,
    });
    return;
  }

  const distanciaM = Math.round(haversineKm(body.lat, body.lng, posto.lat, posto.lng) * 1000);

  await db.insert(checkins).values({
    userId,
    postoId: posto.id,
    lat: body.lat,
    lng: body.lng,
    distanciaM,
    pontos: PONTOS_CHECKIN,
  });

  const [carteira] = await db
    .insert(carteiras)
    .values({ userId, saldoPontos: PONTOS_CHECKIN })
    .onConflictDoUpdate({
      target: carteiras.userId,
      set: {
        saldoPontos: sql`${carteiras.saldoPontos} + ${PONTOS_CHECKIN}`,
        atualizadoEm: new Date(),
      },
    })
    .returning();

  await db.insert(transacoesPontos).values({
    userId,
    tipo: "credito",
    pontos: PONTOS_CHECKIN,
    descricao: `Check-in no ${posto.nomeFantasia}`,
  });

  publicarEvento({
    eventType: "checkin",
    descricao: `Check-in confirmado no ${posto.nomeFantasia} (${posto.municipio})`,
    municipio: posto.municipio,
    redeAssociada: isRedeAssociada(posto.bandeira),
    postoId: posto.id,
    geohash: geohash5(posto.lat, posto.lng),
    sessionId: req.sessionId,
  }).catch(() => undefined);

  res.status(201).json({
    pontos_ganhos: PONTOS_CHECKIN,
    saldo: carteira.saldoPontos,
    posto_nome: posto.nomeFantasia,
    distancia_m: distanciaM,
  });
});

export default router;
