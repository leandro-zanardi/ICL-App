import { Router, type IRouter } from "express";
import { db, recompensas } from "@workspace/db";
import { asc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/recompensas", async (_req, res) => {
  const lista = await db
    .select()
    .from(recompensas)
    .where(eq(recompensas.ativa, true))
    .orderBy(asc(recompensas.custoPontos));

  res.json(
    lista.map((r) => ({
      id: r.id,
      nome: r.nome,
      descricao: r.descricao,
      custo_pontos: r.custoPontos,
      categoria: r.categoria,
    })),
  );
});

export default router;
