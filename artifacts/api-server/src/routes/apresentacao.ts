import { Router, type IRouter } from "express";
import { db, denuncias, eventos, postos } from "@workspace/db";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { BANDEIRA_ASSOCIADA } from "../lib/score";
import { hub, type EventoFeedPayload } from "../lib/sse";

const router: IRouter = Router();

/** Início do dia no fuso de São Paulo (UTC-3, sem horário de verão). */
function inicioDoDiaSp(): Date {
  const OFFSET = 3 * 3_600_000;
  const agoraSp = new Date(Date.now() - OFFSET);
  return new Date(
    Date.UTC(agoraSp.getUTCFullYear(), agoraSp.getUTCMonth(), agoraSp.getUTCDate()) + OFFSET,
  );
}

router.get("/apresentacao/dashboard", async (_req, res) => {
  const inicio = inicioDoDiaSp();

  const [postosRede, contagens, maisVistosRede, denunciasMunicipio, recentes] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(postos)
      .where(eq(postos.bandeira, BANDEIRA_ASSOCIADA)),
    db
      .select({ tipo: eventos.eventType, total: sql<number>`count(*)::int` })
      .from(eventos)
      .where(gte(eventos.criadoEm, inicio))
      .groupBy(eventos.eventType),
    db
      .select({ postoId: eventos.postoId, total: sql<number>`count(*)::int` })
      .from(eventos)
      .where(
        and(
          eq(eventos.eventType, "visualizou_posto"),
          gte(eventos.criadoEm, inicio),
          isNotNull(eventos.postoId),
          eq(eventos.redeAssociada, true),
        ),
      )
      .groupBy(eventos.postoId)
      .orderBy(desc(sql`count(*)`))
      .limit(5),
    db
      .select({ municipio: eventos.municipio, total: sql<number>`count(*)::int` })
      .from(eventos)
      .where(and(eq(eventos.eventType, "denuncia"), isNotNull(eventos.municipio)))
      .groupBy(eventos.municipio)
      .orderBy(desc(sql`count(*)`))
      .limit(6),
    db.select().from(eventos).orderBy(desc(eventos.criadoEm)).limit(12),
  ]);

  // Fallback: sem visualizações da rede hoje, mostra o panorama geral.
  let maisVistos = maisVistosRede;
  if (maisVistos.length === 0) {
    maisVistos = await db
      .select({ postoId: eventos.postoId, total: sql<number>`count(*)::int` })
      .from(eventos)
      .where(
        and(
          eq(eventos.eventType, "visualizou_posto"),
          gte(eventos.criadoEm, inicio),
          isNotNull(eventos.postoId),
        ),
      )
      .groupBy(eventos.postoId)
      .orderBy(desc(sql`count(*)`))
      .limit(5);
  }

  const idsVistos = maisVistos.map((m) => m.postoId).filter((id): id is string => Boolean(id));
  const postosVistos = idsVistos.length
    ? await db.select().from(postos).where(sql`${postos.id} in ${idsVistos}`)
    : [];
  const porId = new Map(postosVistos.map((p) => [p.id, p]));

  const contagem = (tipo: string) => contagens.find((c) => c.tipo === tipo)?.total ?? 0;

  // Complementa denúncias por município com a tabela oficial (denúncias reais).
  const denunciasTabela = await db
    .select({ municipio: denuncias.municipio, total: sql<number>`count(*)::int` })
    .from(denuncias)
    .where(isNotNull(denuncias.municipio))
    .groupBy(denuncias.municipio);

  const porMunicipio = new Map<string, number>();
  for (const d of denunciasMunicipio) {
    if (d.municipio) porMunicipio.set(d.municipio, d.total);
  }
  for (const d of denunciasTabela) {
    if (d.municipio) {
      porMunicipio.set(d.municipio, Math.max(porMunicipio.get(d.municipio) ?? 0, d.total));
    }
  }

  res.json({
    associada: "Distribuidora Horizonte",
    postos_rede: postosRede[0]?.total ?? 0,
    visualizacoes_hoje: contagem("visualizou_posto"),
    checkins_hoje: contagem("checkin"),
    resgates_hoje: contagem("resgate"),
    rotas_hoje: contagem("rota_tracada"),
    denuncias_hoje: contagem("denuncia"),
    postos_mais_vistos: maisVistos
      .filter((m) => m.postoId && porId.has(m.postoId))
      .map((m) => {
        const p = porId.get(m.postoId!)!;
        return {
          posto_id: p.id,
          nome_fantasia: p.nomeFantasia,
          municipio: p.municipio,
          visualizacoes: m.total,
        };
      }),
    denuncias_por_municipio: [...porMunicipio.entries()]
      .map(([municipio, total]) => ({ municipio, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6),
    eventos_recentes: recentes.map((e) => ({
      id: e.id,
      event_type: e.eventType,
      descricao: e.descricao,
      municipio: e.municipio,
      rede_associada: e.redeAssociada,
      criado_em: e.criadoEm.toISOString(),
    })),
  });
});

router.get("/apresentacao/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  res.write(": conectado\n\n");

  const listener = (payload: EventoFeedPayload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  hub.on("evento", listener);

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    hub.off("evento", listener);
  });
});

export default router;
