import { Router, type IRouter } from "express";
import {
  ImportarCsvAnpBody,
  IniciarSincronizacaoAnpBody,
  IniciarSincronizacaoAnpResponse,
  ListarSincronizacoesAnpResponse,
  ObterSincronizacaoAnpParams,
  ObterSincronizacaoAnpResponse,
} from "@workspace/api-zod";
import { anpSincronizacoes, db, postos, type NovoPosto } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import { parseCsvAnp, type LinhaAnp } from "../lib/anp-csv";
import { iniciarSincronizacaoAnp, MUNICIPIOS_ANP } from "../lib/anp-sync";
import { validar } from "../lib/validar";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function apresentarSincronizacao(execucao: typeof anpSincronizacoes.$inferSelect) {
  return {
    id: execucao.id,
    municipios: Array.isArray(execucao.municipios)
      ? execucao.municipios.filter((municipio): municipio is string => typeof municipio === "string")
      : [],
    status: execucao.status,
    postos_lidos: execucao.postosLidos,
    postos_atualizados: execucao.postosAtualizados,
    paginas_coletadas: execucao.paginasColetadas,
    divergencias_nota: execucao.divergenciasNota,
    erros: Array.isArray(execucao.erros)
      ? execucao.erros.filter((erro): erro is string => typeof erro === "string")
      : [],
    iniciado_em: execucao.iniciadoEm?.toISOString() ?? null,
    concluido_em: execucao.concluidoEm?.toISOString() ?? null,
    criado_em: execucao.criadoEm.toISOString(),
  };
}

function coordenadas(linha: LinhaAnp): [number, number] | null {
  if (linha.lat != null && linha.lng != null && linha.lat < -19 && linha.lat > -26) {
    return [linha.lat, linha.lng];
  }
  return null;
}

router.post("/admin/importar", async (req, res) => {
  const body = validar(ImportarCsvAnpBody, req.body, res);
  if (!body) return;

  const parsed = parseCsvAnp(body.csv);
  if (parsed.linhas.length === 0) {
    res.status(400).json({
      erro: parsed.erros[0] ?? "Nenhuma linha válida encontrada no CSV.",
    });
    return;
  }

  const existentes = await db
    .select({ id: postos.id, cnpj: postos.cnpj })
    .from(postos);
  const porCnpj = new Map(existentes.map((p) => [p.cnpj.replace(/\D/g, ""), p.id]));

  let importadas = 0;
  let atualizadas = 0;
  let descartadas = 0;
  const erros = [...parsed.erros];
  const novos: NovoPosto[] = [];

  for (const linha of parsed.linhas) {
    if (linha.uf !== "SP") {
      descartadas++;
      continue;
    }

    const coords = coordenadas(linha);
    if (!coords) {
      descartadas++;
      if (erros.length < 15) {
        erros.push(`${linha.nomeFantasia} (${linha.municipio}): coordenadas oficiais ausentes ou inválidas — ignorado.`);
      }
      continue;
    }

    const cnpjDigitos = linha.cnpj.replace(/\D/g, "");
    const idExistente = cnpjDigitos ? porCnpj.get(cnpjDigitos) : undefined;

    if (idExistente) {
      const atualizacao: Partial<typeof postos.$inferInsert> = {
        razaoSocial: linha.razaoSocial,
        nomeFantasia: linha.nomeFantasia,
        bandeira: linha.bandeira,
        endereco: linha.endereco,
        municipio: linha.municipio,
        cnpj: cnpjDigitos,
        situacao: linha.situacaoAnp,
        situacaoAnp: linha.situacaoAnp,
        sincronizadoEm: new Date(),
        atualizadoEm: new Date(),
      };
      if (linha.dataAutorizacao) atualizacao.dataAutorizacaoAnp = linha.dataAutorizacao;
      if (linha.codigoInstalacaoAnp !== undefined) atualizacao.codigoInstalacaoAnp = linha.codigoInstalacaoAnp;
      if (linha.distribuidora !== undefined) atualizacao.distribuidora = linha.distribuidora;
      if (linha.tempoAutorizacaoAnos !== undefined) {
        atualizacao.tempoAutorizacaoAnos = linha.tempoAutorizacaoAnos;
      }
      if (linha.notaAnp !== undefined) atualizacao.notaAnpColetada = linha.notaAnp;

      await db
        .update(postos)
        .set(atualizacao)
        .where(eq(postos.id, idExistente));
      atualizadas++;
    } else {
      novos.push({
        cnpj: linha.cnpj,
        razaoSocial: linha.razaoSocial,
        nomeFantasia: linha.nomeFantasia,
        bandeira: linha.bandeira,
        endereco: linha.endereco,
        municipio: linha.municipio,
        uf: linha.uf,
        lat: coords[0],
        lng: coords[1],
        codigoInstalacaoAnp: linha.codigoInstalacaoAnp ?? null,
        distribuidora: linha.distribuidora ?? null,
        tempoAutorizacaoAnos: linha.tempoAutorizacaoAnos ?? null,
        notaAnpColetada: linha.notaAnp ?? null,
        situacao: linha.situacaoAnp,
        situacaoAnp: linha.situacaoAnp,
        dataAutorizacaoAnp: linha.dataAutorizacao,
        sincronizadoEm: new Date(),
      });
      importadas++;
    }
  }

  // Inserção em lotes (CSVs oficiais podem ter milhares de linhas)
  for (let i = 0; i < novos.length; i += 400) {
    const lote = novos.slice(i, i + 400);
    await db.insert(postos).values(lote);
  }

  const [totais] = await db
    .select({
      total: sql<number>`count(*)::int`,
      selo: sql<number>`count(*) filter (where ${postos.tier} = 'selo')::int`,
    })
    .from(postos);

  logger.info({ importadas, atualizadas, descartadas }, "Importação de CSV da ANP concluída");

  res.json({
    linhas_lidas: parsed.linhasLidas,
    importadas,
    atualizadas,
    descartadas,
    postos_total: totais?.total ?? 0,
    postos_selo: totais?.selo ?? 0,
    erros: erros.slice(0, 15),
  });
});

router.post("/admin/sincronizar-anp", async (req, res): Promise<void> => {
  const body = validar(IniciarSincronizacaoAnpBody, req.body ?? {}, res);
  if (!body) return;

  const municipios = body.municipios as Array<(typeof MUNICIPIOS_ANP)[number]>;
  const execucao = await iniciarSincronizacaoAnp(municipios);
  res.status(202).json(IniciarSincronizacaoAnpResponse.parse(apresentarSincronizacao(execucao)));
});

router.get("/admin/sincronizacoes", async (_req, res): Promise<void> => {
  const execucoes = await db
    .select()
    .from(anpSincronizacoes)
    .orderBy(desc(anpSincronizacoes.criadoEm))
    .limit(20);
  res.json(ListarSincronizacoesAnpResponse.parse(execucoes.map(apresentarSincronizacao)));
});

router.get("/admin/sincronizacoes/:id", async (req, res): Promise<void> => {
  const params = validar(ObterSincronizacaoAnpParams, req.params, res);
  if (!params) return;
  const [execucao] = await db
    .select()
    .from(anpSincronizacoes)
    .where(eq(anpSincronizacoes.id, params.id))
    .limit(1);
  if (!execucao) {
    res.status(404).json({ erro: "Sincronização não encontrada." });
    return;
  }
  res.json(ObterSincronizacaoAnpResponse.parse(apresentarSincronizacao(execucao)));
});

export default router;
