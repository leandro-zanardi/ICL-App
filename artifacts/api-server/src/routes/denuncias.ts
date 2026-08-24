import { Router, type IRouter } from "express";
import { CriarDenunciaBody } from "@workspace/api-zod";
import { db, denuncias, postos } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { publicarEvento } from "../lib/sse";
import { validar } from "../lib/validar";

const router: IRouter = Router();

const CATEGORIA_LABEL: Record<string, string> = {
  qualidade_combustivel: "qualidade do combustível",
  volume_bomba: "volume da bomba",
  posto_clone: "suspeita de posto clone",
  outra: "outros",
};

router.post("/denuncias", async (req, res) => {
  const body = validar(CriarDenunciaBody, req.body, res);
  if (!body) return;

  let municipio: string | null = null;
  let postoId: string | null = null;

  if (body.posto_id) {
    const [posto] = await db.select().from(postos).where(eq(postos.id, body.posto_id)).limit(1);
    if (posto) {
      postoId = posto.id;
      municipio = posto.municipio;
    }
  }

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(denuncias);
  const protocolo = `ICL-${new Date().getFullYear()}-${String(total + 1).padStart(6, "0")}`;

  const [criada] = await db
    .insert(denuncias)
    .values({
      protocolo,
      categoria: body.categoria,
      postoId,
      municipio,
      descricao: body.descricao,
      fotoNome: body.foto_nome ?? null,
    })
    .returning();

  publicarEvento({
    eventType: "denuncia",
    descricao: `Denúncia recebida${municipio ? ` em ${municipio}` : ""} (${CATEGORIA_LABEL[body.categoria] ?? body.categoria})`,
    municipio,
    postoId,
    sessionId: req.sessionId,
  }).catch(() => undefined);

  res.status(201).json({
    id: criada.id,
    protocolo: criada.protocolo,
    criado_em: criada.criadoEm.toISOString(),
  });
});

export default router;
