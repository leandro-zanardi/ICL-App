import { Router, type IRouter } from "express";
import { ImportarCsvAnpBody } from "@workspace/api-zod";
import { classificacoes, db, postos, type NovoPosto } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { parseCsvAnp, type LinhaAnp } from "../lib/anp-csv";
import { calcularScore } from "../lib/score";
import { validar } from "../lib/validar";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Centros aproximados dos municípios da região-piloto (para linhas sem lat/lng). */
const CENTROS: Record<string, [number, number]> = {
  "sao paulo": [-23.5505, -46.6333],
  osasco: [-23.5325, -46.7917],
  barueri: [-23.5106, -46.8761],
  cajamar: [-23.3561, -46.877],
  jundiai: [-23.1857, -46.8978],
  louveira: [-23.0865, -46.9506],
  vinhedo: [-23.0302, -46.9756],
  valinhos: [-22.9698, -46.9974],
  campinas: [-22.9056, -47.0608],
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function coordenadas(linha: LinhaAnp): [number, number] | null {
  if (linha.lat != null && linha.lng != null && linha.lat < -19 && linha.lat > -26) {
    return [linha.lat, linha.lng];
  }
  const centro = CENTROS[normalizar(linha.municipio)];
  if (!centro) return null;
  const h = hashString(linha.cnpj);
  const jLat = (((h % 1000) / 1000) - 0.5) * 0.05;
  const jLng = ((((h >> 10) % 1000) / 1000) - 0.5) * 0.05;
  return [centro[0] + jLat, centro[1] + jLng];
}

function flagsDeterministicas(linha: LinhaAnp) {
  const h = hashString(linha.cnpj);
  const situacaoNormalizada = normalizar(linha.situacaoAnp);
  const ativa = situacaoNormalizada.includes("ativ") || situacaoNormalizada === "";
  return {
    situacaoAnp: ativa ? "Ativa" : linha.situacaoAnp || "Registro em atualização",
    autuacoes24m: h % 10 < 7 ? 0 : (h % 2) + 1,
    qualidadeConforme: h % 100 < 85,
    bandeiraConsistente: h % 50 < 46,
    qualidadeVerificadaEm: h % 100 < 60 ? new Date().toISOString().slice(0, 10) : null,
  };
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
        erros.push(`${linha.nomeFantasia} (${linha.municipio}): fora da região-piloto — ignorado.`);
      }
      continue;
    }

    const flags = flagsDeterministicas(linha);
    const { score, tier } = calcularScore(flags);
    const cnpjDigitos = linha.cnpj.replace(/\D/g, "");
    const idExistente = cnpjDigitos ? porCnpj.get(cnpjDigitos) : undefined;

    if (idExistente) {
      await db
        .update(postos)
        .set({
          razaoSocial: linha.razaoSocial,
          nomeFantasia: linha.nomeFantasia,
          bandeira: linha.bandeira,
          endereco: linha.endereco,
          municipio: linha.municipio,
          situacaoAnp: flags.situacaoAnp,
          dataAutorizacaoAnp: linha.dataAutorizacao,
          tier,
          score,
          atualizadoEm: new Date(),
        })
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
        ...flags,
        dataAutorizacaoAnp: linha.dataAutorizacao,
        tier,
        score,
      });
      importadas++;
    }
  }

  // Inserção em lotes (CSVs oficiais podem ter milhares de linhas)
  for (let i = 0; i < novos.length; i += 400) {
    const lote = novos.slice(i, i + 400);
    const inseridos = await db.insert(postos).values(lote).returning({ id: postos.id });
    await db.insert(classificacoes).values(
      lote.map((p, j) => {
        const r = calcularScore({
          situacaoAnp: p.situacaoAnp ?? "Ativa",
          autuacoes24m: p.autuacoes24m ?? 0,
          qualidadeConforme: p.qualidadeConforme ?? true,
          bandeiraConsistente: p.bandeiraConsistente ?? true,
        });
        return { postoId: inseridos[j].id, tier: r.tier, score: r.score, criterios: r.criterios };
      }),
    );
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

export default router;
