import { Router, type IRouter } from "express";
import { CriarResgateBody } from "@workspace/api-zod";
import { carteiras, db, recompensas, resgates, transacoesPontos } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { publicarEvento } from "../lib/sse";
import { validar } from "../lib/validar";

const router: IRouter = Router();

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function gerarCodigo(): string {
  const bloco = () =>
    Array.from({ length: 4 }, () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]).join("");
  return `CL-${bloco()}-${bloco()}`;
}

function formatarRecompensa(r: typeof recompensas.$inferSelect) {
  return {
    id: r.id,
    nome: r.nome,
    descricao: r.descricao,
    custo_pontos: r.custoPontos,
    categoria: r.categoria,
  };
}

router.get("/resgates", requireAuth, async (req, res) => {
  const linhas = await db
    .select({ resgate: resgates, recompensa: recompensas })
    .from(resgates)
    .innerJoin(recompensas, eq(resgates.recompensaId, recompensas.id))
    .where(eq(resgates.userId, req.userId!))
    .orderBy(desc(resgates.criadoEm));

  res.json(
    linhas.map(({ resgate, recompensa }) => ({
      id: resgate.id,
      codigo: resgate.codigo,
      status: resgate.status,
      criado_em: resgate.criadoEm.toISOString(),
      recompensa: formatarRecompensa(recompensa),
    })),
  );
});

router.post("/resgates", requireAuth, async (req, res) => {
  const body = validar(CriarResgateBody, req.body, res);
  if (!body) return;

  const userId = req.userId!;
  const [recompensa] = await db
    .select()
    .from(recompensas)
    .where(eq(recompensas.id, body.recompensa_id))
    .limit(1);

  if (!recompensa || !recompensa.ativa) {
    res.status(404).json({ erro: "Recompensa não encontrada." });
    return;
  }

  const [carteira] = await db.select().from(carteiras).where(eq(carteiras.userId, userId)).limit(1);
  const saldo = carteira?.saldoPontos ?? 0;

  if (saldo < recompensa.custoPontos) {
    const faltam = recompensa.custoPontos - saldo;
    res.status(409).json({
      erro: `Pontos insuficientes: faltam ${faltam} pontos para este resgate.`,
    });
    return;
  }

  const [resgate] = await db
    .insert(resgates)
    .values({
      userId,
      recompensaId: recompensa.id,
      codigo: gerarCodigo(),
      custoPontos: recompensa.custoPontos,
    })
    .returning();

  await db
    .update(carteiras)
    .set({
      saldoPontos: sql`${carteiras.saldoPontos} - ${recompensa.custoPontos}`,
      atualizadoEm: new Date(),
    })
    .where(eq(carteiras.userId, userId));

  await db.insert(transacoesPontos).values({
    userId,
    tipo: "debito",
    pontos: recompensa.custoPontos,
    descricao: `Resgate: ${recompensa.nome}`,
  });

  publicarEvento({
    eventType: "resgate",
    descricao: `Cupom resgatado: ${recompensa.nome}`,
    municipio: null,
    sessionId: req.sessionId,
  }).catch(() => undefined);

  res.status(201).json({
    id: resgate.id,
    codigo: resgate.codigo,
    status: resgate.status,
    criado_em: resgate.criadoEm.toISOString(),
    recompensa: formatarRecompensa(recompensa),
  });
});

export default router;
