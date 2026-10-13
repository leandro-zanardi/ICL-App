import { Router, type IRouter } from "express";
import { CriarDenunciaBody } from "@workspace/api-zod";
import { db, denunciaAndamentos, denuncias, postos } from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { publicarEvento } from "../lib/sse";
import { validar } from "../lib/validar";

const router: IRouter = Router();

const CATEGORIA_LABEL: Record<string, string> = {
  qualidade_combustivel: "qualidade do combustível",
  volume_bomba: "volume da bomba",
  posto_clone: "suspeita de posto clone",
  outra: "outros",
};

export async function apresentarDenuncias(lista: (typeof denuncias.$inferSelect)[]) {
  if (lista.length === 0) return [];
  const ids = lista.map((d) => d.id);
  const andamentos = await db
    .select()
    .from(denunciaAndamentos)
    .where(inArray(denunciaAndamentos.denunciaId, ids))
    .orderBy(denunciaAndamentos.criadoEm);
  const postoIds = [...new Set(lista.map((d) => d.postoId).filter((id): id is string => !!id))];
  const nomes = new Map<string, string>();
  if (postoIds.length > 0) {
    const rows = await db
      .select({ id: postos.id, nome: postos.nomeFantasia })
      .from(postos)
      .where(inArray(postos.id, postoIds));
    rows.forEach((r) => nomes.set(r.id, r.nome));
  }
  return lista.map((d) => ({
    id: d.id,
    client_id: d.clientId,
    protocolo: d.protocolo,
    categoria: d.categoria,
    posto_id: d.postoId,
    posto_nome: d.postoId ? (nomes.get(d.postoId) ?? null) : null,
    municipio: d.municipio,
    descricao: d.descricao,
    status: d.status,
    criado_em: d.criadoEm.toISOString(),
    andamentos: andamentos
      .filter((a) => a.denunciaId === d.id)
      .map((a) => ({
        id: a.id,
        status: a.status,
        orgao: a.orgao,
        mensagem: a.mensagem,
        criado_em: a.criadoEm.toISOString(),
      })),
  }));
}

router.get("/denuncias", async (req, res) => {
  if (!req.sessionId) {
    res.json([]);
    return;
  }
  const lista = await db
    .select()
    .from(denuncias)
    .where(eq(denuncias.sessionId, req.sessionId))
    .orderBy(desc(denuncias.criadoEm))
    .limit(100);
  res.json(await apresentarDenuncias(lista));
});

router.post("/denuncias", async (req, res) => {
  const body = validar(CriarDenunciaBody, req.body, res);
  if (!body) return;

  // Reenvio da mesma denúncia (mesmo aparelho): devolve o protocolo existente.
  if (req.sessionId && body.client_id) {
    const [existente] = await db
      .select()
      .from(denuncias)
      .where(and(eq(denuncias.sessionId, req.sessionId), eq(denuncias.clientId, body.client_id)))
      .limit(1);
    if (existente) {
      res.status(201).json({
        id: existente.id,
        protocolo: existente.protocolo,
        criado_em: existente.criadoEm.toISOString(),
      });
      return;
    }
  }

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
      sessionId: req.sessionId ?? null,
      clientId: body.client_id ?? null,
    })
    .returning();

  await db.insert(denunciaAndamentos).values({
    denunciaId: criada.id,
    status: "recebida",
    orgao: "ICL",
    mensagem: "Denúncia recebida pelo ICL.",
  });

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
