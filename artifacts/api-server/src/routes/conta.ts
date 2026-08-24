import { Router, type IRouter } from "express";
import { EnviarOtpBody, VerificarOtpBody } from "@workspace/api-zod";
import { carteiras, db, transacoesPontos, usuarios } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { validar } from "../lib/validar";

const router: IRouter = Router();

const CODIGO_DEMO = "1234";
const BONUS_BOAS_VINDAS = 120;

router.post("/conta/otp", (req, res) => {
  const body = validar(EnviarOtpBody, req.body, res);
  if (!body) return;

  res.json({
    modo_demo: true,
    mensagem: `Código enviado para ${body.contato}. Neste protótipo, use o código 1234.`,
  });
});

router.post("/conta/verificar", async (req, res) => {
  const body = validar(VerificarOtpBody, req.body, res);
  if (!body) return;

  if (body.codigo !== CODIGO_DEMO) {
    res.status(401).json({ error: "Código inválido. No modo demonstração, use 1234." });
    return;
  }

  const contato = body.contato.trim();
  let [usuario] = await db.select().from(usuarios).where(eq(usuarios.contato, contato)).limit(1);

  if (!usuario) {
    [usuario] = await db.insert(usuarios).values({ contato }).returning();
    await db.insert(carteiras).values({ userId: usuario.id, saldoPontos: BONUS_BOAS_VINDAS });
    await db.insert(transacoesPontos).values({
      userId: usuario.id,
      tipo: "credito",
      pontos: BONUS_BOAS_VINDAS,
      descricao: "Bônus de boas-vindas",
    });
  }

  res.json({
    token: usuario.id,
    usuario: {
      id: usuario.id,
      contato: usuario.contato,
      criado_em: usuario.criadoEm.toISOString(),
    },
  });
});

router.get("/conta/carteira", requireAuth, async (req, res) => {
  const userId = req.userId!;

  let [carteira] = await db.select().from(carteiras).where(eq(carteiras.userId, userId)).limit(1);
  if (!carteira) {
    [carteira] = await db.insert(carteiras).values({ userId, saldoPontos: 0 }).returning();
  }

  const transacoes = await db
    .select()
    .from(transacoesPontos)
    .where(eq(transacoesPontos.userId, userId))
    .orderBy(desc(transacoesPontos.criadoEm))
    .limit(20);

  res.json({
    saldo: carteira.saldoPontos,
    transacoes: transacoes.map((t) => ({
      id: t.id,
      tipo: t.tipo,
      pontos: t.pontos,
      descricao: t.descricao,
      criado_em: t.criadoEm.toISOString(),
    })),
  });
});

export default router;
