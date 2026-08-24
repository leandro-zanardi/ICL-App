import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const DIAGNOSTIC_TIMEOUT_MS = 4_000;

async function contarPostosComPrazo(): Promise<number> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const result = await Promise.race([
      pool.query<{ postos_count: string }>(
        "SELECT count(*)::int AS postos_count FROM app.postos",
      ),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Consulta de diagnóstico excedeu o prazo.")),
          DIAGNOSTIC_TIMEOUT_MS,
        );
      }),
    ]);

    return Number(result.rows[0]?.postos_count ?? 0);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Diagnóstico humano: diferentemente de /healthz, verifica o banco com prazo
 * curto. O healthcheck de publicação continua independente do banco.
 */
router.get("/health", async (req, res) => {
  try {
    const postosCount = await contarPostosComPrazo();
    res.json({ ok: true, db: true, postos_count: postosCount });
  } catch (error) {
    req.log.warn({ err: error }, "Banco indisponível no diagnóstico de saúde");
    res.status(503).json({ ok: false, db: false, postos_count: null });
  }
});

export default router;
