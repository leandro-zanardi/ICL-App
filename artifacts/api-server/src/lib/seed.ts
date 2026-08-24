import {
  anpSincronizacoes,
  carteiras,
  checkins,
  classificacoes,
  db,
  denuncias,
  eventos,
  postos,
  recompensas,
  resgates,
  rotasCache,
  transacoesPontos,
  usuarios,
  type NovoPosto,
} from "@workspace/db";
import { inArray, isNotNull, sql } from "drizzle-orm";
import { calcularScore } from "./score";
import { logger } from "./logger";

/** PRNG determinístico — o reset da demo sempre recria o mesmo cenário. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BANDEIRAS: Array<{ nome: string; peso: number }> = [
  { nome: "Horizonte", peso: 25 },
  { nome: "Atlântica", peso: 20 },
  { nome: "NovaSul", peso: 18 },
  { nome: "Pátria Energia", peso: 17 },
  { nome: "Bandeira Branca", peso: 20 },
];

const SUFIXOS = [
  "Estrela", "Trevo", "Portal", "Vitória", "Planalto", "Colinas", "Primavera",
  "Imperador", "Andorinhas", "Bela Vista", "São Jorge", "Monções", "Ipê",
  "Jacarandá", "Alvorada", "Serra Azul", "Continental", "Girassol", "Paineiras",
  "San Marino", "Líder", "Farol", "Progresso", "Aliança", "Regente", "Castelo",
  "Fortaleza", "Nova Era", "Aurora", "Diamante", "Guarani", "Tropical",
];

const VIAS = [
  "Av. Brasil", "Rua das Palmeiras", "Av. Industrial", "Rod. Anhanguera",
  "Rod. dos Bandeirantes", "Av. Central", "Rua XV de Novembro",
  "Av. das Nações", "Estrada Velha de Campinas", "Av. Marginal",
  "Av. dos Expedicionários", "Rua Barão de Itapura",
];

interface Anchor {
  municipio: string;
  pontos: Array<[number, number]>;
  quantidade: number;
}

const ANCHORS: Anchor[] = [
  {
    municipio: "São Paulo",
    pontos: [
      [-23.5614, -46.6559], [-23.5268, -46.6822], [-23.5015, -46.7145],
      [-23.5505, -46.6333], [-23.601, -46.668], [-23.533, -46.612], [-23.576, -46.64],
    ],
    quantidade: 25,
  },
  { municipio: "Osasco", pontos: [[-23.5325, -46.7917]], quantidade: 5 },
  { municipio: "Barueri", pontos: [[-23.5106, -46.8761]], quantidade: 5 },
  { municipio: "Cajamar", pontos: [[-23.3561, -46.877]], quantidade: 4 },
  { municipio: "Jundiaí", pontos: [[-23.1857, -46.8978], [-23.21, -46.9124]], quantidade: 8 },
  { municipio: "Louveira", pontos: [[-23.0865, -46.9506]], quantidade: 3 },
  { municipio: "Vinhedo", pontos: [[-23.0302, -46.9756]], quantidade: 4 },
  { municipio: "Valinhos", pontos: [[-22.9698, -46.9974]], quantidade: 4 },
  {
    municipio: "Campinas",
    pontos: [[-22.9056, -47.0608], [-22.885, -47.045], [-22.925, -47.08]],
    quantidade: 10,
  },
];

/** Postos-vitrine posicionados nos pontos de teleporte da demonstração. */
const FLAGSHIPS: Array<Partial<NovoPosto> & { nomeFantasia: string }> = [
  {
    nomeFantasia: "Posto Horizonte Paulista",
    razaoSocial: "Horizonte Paulista Comércio de Combustíveis Ltda",
    bandeira: "Horizonte",
    endereco: "Av. Paulista, 1500 — Bela Vista",
    municipio: "São Paulo",
    lat: -23.562, lng: -46.6565,
  },
  {
    nomeFantasia: "Posto Horizonte Anhanguera km 40",
    razaoSocial: "Horizonte Rodovias Ltda",
    bandeira: "Horizonte",
    endereco: "Rod. Anhanguera, km 40 — Jordanésia",
    municipio: "Cajamar",
    lat: -23.3085, lng: -46.877,
  },
  {
    nomeFantasia: "Posto Horizonte Campinas Centro",
    razaoSocial: "Horizonte Campinas Combustíveis Ltda",
    bandeira: "Horizonte",
    endereco: "Av. Francisco Glicério, 890 — Centro",
    municipio: "Campinas",
    lat: -22.9046, lng: -47.0613,
  },
  {
    nomeFantasia: "Auto Posto Atlântica Consolação",
    razaoSocial: "Atlântica Consolação Derivados de Petróleo Ltda",
    bandeira: "Atlântica",
    endereco: "Rua da Consolação, 2210 — Consolação",
    municipio: "São Paulo",
    lat: -23.557, lng: -46.662,
  },
  {
    nomeFantasia: "Posto NovaSul Bandeirantes km 68",
    razaoSocial: "NovaSul Rodoviário Ltda",
    bandeira: "NovaSul",
    endereco: "Rod. dos Bandeirantes, km 68",
    municipio: "Jundiaí",
    lat: -23.155, lng: -46.928,
  },
];

const RECOMPENSAS_SEED = [
  {
    nome: "R$ 10 na troca de óleo",
    descricao: "Desconto de R$ 10 na troca de óleo em postos participantes com o selo.",
    categoria: "manutencao",
    custoPontos: 500,
  },
  {
    nome: "Lavagem simples",
    descricao: "Uma lavagem externa gratuita em postos participantes.",
    categoria: "lavagem",
    custoPontos: 300,
  },
  {
    nome: "Café na conveniência",
    descricao: "Um café expresso na loja de conveniência do posto participante.",
    categoria: "conveniencia",
    custoPontos: 150,
  },
  {
    nome: "Desconto em lubrificante",
    descricao: "10% de desconto em lubrificantes selecionados.",
    categoria: "manutencao",
    custoPontos: 250,
  },
];

function escolherBandeira(rng: () => number): string {
  const total = BANDEIRAS.reduce((s, b) => s + b.peso, 0);
  let alvo = rng() * total;
  for (const b of BANDEIRAS) {
    alvo -= b.peso;
    if (alvo <= 0) return b.nome;
  }
  return BANDEIRAS[0].nome;
}

function gerarCnpj(rng: () => number): string {
  const d = () => Math.floor(rng() * 10);
  return `${d()}${d()}${d()}${d()}${d()}${d()}${d()}${d()}0001${d()}${d()}`;
}

function dataAleatoria(rng: () => number, anoMin: number, anoMax: number): string {
  const ano = anoMin + Math.floor(rng() * (anoMax - anoMin + 1));
  const mes = 1 + Math.floor(rng() * 12);
  const dia = 1 + Math.floor(rng() * 28);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function dataRecente(rng: () => number, diasMax: number): string {
  const d = new Date(Date.now() - Math.floor(rng() * diasMax) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

interface FlagsPosto {
  situacaoAnp: string;
  autuacoes24m: number;
  qualidadeConforme: boolean;
  bandeiraConsistente: boolean;
  qualidadeVerificadaEm: string | null;
}

function gerarFlags(rng: () => number, bandeira: string, forcarSelo = false): FlagsPosto {
  const selo = forcarSelo || rng() < (bandeira === "Horizonte" ? 0.65 : 0.32);
  if (selo) {
    return {
      situacaoAnp: "Ativa",
      autuacoes24m: 0,
      qualidadeConforme: true,
      bandeiraConsistente: true,
      qualidadeVerificadaEm: dataRecente(rng, 45),
    };
  }

  if (rng() < 0.14) {
    // Sem verificação ativa (registro em atualização junto à ANP)
    return {
      situacaoAnp: "Registro em atualização",
      autuacoes24m: rng() < 0.5 ? 0 : 1,
      qualidadeConforme: rng() < 0.7,
      bandeiraConsistente: rng() < 0.85,
      qualidadeVerificadaEm: null,
    };
  }

  // Regular: ativo com alguma pendência
  const tipoPendencia = rng();
  return {
    situacaoAnp: "Ativa",
    autuacoes24m: tipoPendencia < 0.5 ? 1 + Math.floor(rng() * 2) : 0,
    qualidadeConforme: tipoPendencia < 0.5 ? true : tipoPendencia < 0.8 ? false : true,
    bandeiraConsistente: tipoPendencia >= 0.8 ? false : true,
    qualidadeVerificadaEm: rng() < 0.5 ? dataRecente(rng, 180) : null,
  };
}

function montarPostosSeed(): NovoPosto[] {
  const rng = mulberry32(20260824);
  const lista: NovoPosto[] = [];
  let sufixoIdx = 0;

  for (const flag of FLAGSHIPS) {
    const flags = gerarFlags(rng, flag.bandeira ?? "Horizonte", true);
    const { score, tier } = calcularScore(flags);
    lista.push({
      cnpj: gerarCnpj(rng),
      razaoSocial: flag.razaoSocial ?? `${flag.nomeFantasia} Ltda`,
      nomeFantasia: flag.nomeFantasia,
      bandeira: flag.bandeira ?? "Horizonte",
      endereco: flag.endereco ?? "Endereço não informado",
      municipio: flag.municipio ?? "São Paulo",
      uf: "SP",
      lat: flag.lat ?? -23.55,
      lng: flag.lng ?? -46.63,
      ...flags,
      dataAutorizacaoAnp: dataAleatoria(rng, 2005, 2020),
      tier,
      score,
    });
  }

  for (const anchor of ANCHORS) {
    for (let i = 0; i < anchor.quantidade; i++) {
      const base = anchor.pontos[i % anchor.pontos.length];
      const lat = base[0] + (rng() - 0.5) * 0.045;
      const lng = base[1] + (rng() - 0.5) * 0.045;
      const bandeira = escolherBandeira(rng);
      const sufixo = SUFIXOS[sufixoIdx % SUFIXOS.length];
      sufixoIdx++;
      const via = VIAS[Math.floor(rng() * VIAS.length)];
      const numero = 100 + Math.floor(rng() * 4200);
      const flags = gerarFlags(rng, bandeira);
      const { score, tier } = calcularScore(flags);

      const padraoNome = rng();
      const nomeFantasia =
        padraoNome < 0.45
          ? `Posto ${bandeira === "Bandeira Branca" ? sufixo : `${bandeira} ${sufixo}`}`
          : padraoNome < 0.75
            ? `Auto Posto ${sufixo}`
            : `Centro Automotivo ${sufixo}`;

      lista.push({
        cnpj: gerarCnpj(rng),
        razaoSocial: `${sufixo} Comércio de Combustíveis Ltda`,
        nomeFantasia,
        bandeira,
        endereco: `${via}, ${numero}`,
        municipio: anchor.municipio,
        uf: "SP",
        lat,
        lng,
        ...flags,
        dataAutorizacaoAnp: dataAleatoria(rng, 2004, 2022),
        tier,
        score,
      });
    }
  }

  return lista;
}

/** Executor de queries: o banco global ou uma transação em andamento. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Identificador da trava consultiva do Postgres que serializa seed/reset.
 * Em autoscale, várias instâncias podem subir ao mesmo tempo; sem a trava,
 * todas veriam o banco vazio e aplicariam o seed em duplicidade.
 */
const TRAVA_SEED = 727_001;

/** Interno: sempre chamar através de seedIfEmpty/resetDemo (que seguram a trava). */
async function seed(
  executor: Executor = db,
): Promise<{ postos: number; recompensas: number }> {
  const dados = montarPostosSeed();
  const inseridos = await executor
    .insert(postos)
    .values(dados)
    .returning({ id: postos.id });

  // Snapshot de classificação por posto (auditoria dos critérios)
  const snapshots = dados.map((p, i) => {
    const { criterios, score, tier } = calcularScore({
      situacaoAnp: p.situacaoAnp ?? "Ativa",
      autuacoes24m: p.autuacoes24m ?? 0,
      qualidadeConforme: p.qualidadeConforme ?? true,
      bandeiraConsistente: p.bandeiraConsistente ?? true,
    });
    return { postoId: inseridos[i].id, tier, score, criterios };
  });
  await executor.insert(classificacoes).values(snapshots);
  await executor.insert(recompensas).values(RECOMPENSAS_SEED);

  logger.info(
    { postos: inseridos.length, selo: dados.filter((d) => d.tier === "selo").length },
    "Seed da demonstração aplicado",
  );
  return { postos: inseridos.length, recompensas: RECOMPENSAS_SEED.length };
}

export async function seedIfEmpty(): Promise<void> {
  await db.transaction(async (tx) => {
    // Somente uma instância aplica o seed; as demais aguardam a trava
    // e encontram os dados já criados.
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_SEED})`);
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(postos);
    if (total > 0) return;
    await seed(tx);
  });
}

/** Limpa todos os dados e recria o cenário inicial da demonstração (atômico). */
export async function resetDemo(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${TRAVA_SEED})`);
    await tx.delete(eventos);
    await tx.delete(checkins);
    await tx.delete(resgates);
    await tx.delete(transacoesPontos);
    await tx.delete(carteiras);
    await tx.delete(usuarios);
    await tx.delete(denuncias);
    await tx.delete(rotasCache);

    const [sincronizacaoAtiva] = await tx
      .select({ id: anpSincronizacoes.id })
      .from(anpSincronizacoes)
      .where(inArray(anpSincronizacoes.status, ["queued", "running"]))
      .limit(1);
    if (sincronizacaoAtiva) {
      throw new Error("Não é possível reiniciar a demonstração enquanto a sincronização ANP está em andamento.");
    }

    // Uma base importada da ANP é a fonte de verdade. O reset da barra de
    // demonstração só limpa a atividade do usuário e jamais repõe o seed por
    // cima de registros reais, preservando IDs usados por vínculos existentes.
    const [{ totalReais }] = await tx
      .select({ totalReais: sql<number>`count(*)::int` })
      .from(postos)
      .where(isNotNull(postos.sincronizadoEm));
    if (totalReais > 0) {
      return;
    }

    await tx.delete(classificacoes);
    await tx.delete(postos);
    await tx.delete(recompensas);
    await seed(tx);
  });
}
