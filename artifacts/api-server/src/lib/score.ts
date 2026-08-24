/**
 * Cálculo da nota oficial da ANP e do tier do Selo Combustível Legal.
 *
 * A nota ANP é mantida separada do score/tier do ICL:
 * - notaAnpColetada: valor recebido da fonte oficial;
 * - notaAnpCalculada: réplica local da fórmula pública;
 * - score/tier: classificação de confiança exibida no mapa.
 */

export interface EventoIrregularidade {
  dataFiscalizacao: string | Date;
  classificacao?: string | null;
}

export interface AmostraPmqcNota {
  dataColeta: string | Date;
  conforme: boolean;
}

export interface RegistroOrigemCombustivel {
  distribuidoraPosto?: string | null;
  distribuidoraOrigem: string;
  volumePct: number;
}

export interface EntradaNotaAnp {
  situacao?: string | null;
  /** Alias legado usado pelo cadastro do protótipo. */
  situacaoAnp?: string | null;
  irregularidades?: readonly EventoIrregularidade[];
  amostras?: readonly AmostraPmqcNota[];
  /** Data de referência; útil para manter testes e reprocessamentos determinísticos. */
  referencia?: string | Date;
}

export interface ResultadoNotaAnp {
  nota: 0 | 1 | 2 | 3 | 4 | 5;
  desconto: number;
  infracoesRecentes: number;
  infracoesAntigas: number;
  amostrasNcRecentes: number;
  amostrasNcAntigas: number;
  motivoZero: "situacao_inativa" | "desconto_excedido" | null;
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function dataValida(valor: string | Date | undefined): Date | null {
  if (valor == null) return null;
  const data = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function subtrairAnosCalendario(data: Date, anos: number): Date {
  const limite = new Date(data.getTime());
  const mesOriginal = limite.getUTCMonth();
  limite.setUTCFullYear(limite.getUTCFullYear() - anos);

  // 29/02 não existe em anos não bissextos; o limite vira 28/02, não 01/03.
  if (limite.getUTCMonth() !== mesOriginal) limite.setUTCDate(0);
  return limite;
}

function dataNaJanela(data: string | Date, referencia: Date): "recente" | "antiga" | null {
  const evento = dataValida(data);
  if (!evento || evento > referencia) return null;

  if (evento >= subtrairAnosCalendario(referencia, 2)) return "recente";
  if (evento >= subtrairAnosCalendario(referencia, 5)) return "antiga";
  return null;
}

function eInfracaoContabilizavel(classificacao: string | null | undefined): boolean {
  const tipo = normalizar(classificacao ?? "");
  return tipo.includes("vicio de qualidade") || tipo.includes("vicio de quantidade");
}

export function situacaoEmOperacao(situacao: string | null | undefined): boolean {
  const valor = normalizar(situacao ?? "");
  if (
    valor.includes("interdit") ||
    valor.includes("inativ") ||
    valor.includes("suspens") ||
    valor.includes("cancel")
  ) {
    return false;
  }
  // "Ativa" é o valor usado pelo seed legado; "EM OPERAÇÃO" é o valor ANP.
  return valor === "ativa" || valor.includes("em operacao");
}

/**
 * Replica a fórmula pública da nota do app ANP Com Vc – Postos.
 *
 * O desconto é arredondado antes de ser subtraído da nota base 5. Eventos fora
 * da janela de cinco anos não entram no cálculo.
 */
export function calcularNotaAnp(entrada: EntradaNotaAnp): ResultadoNotaAnp {
  const referencia = dataValida(entrada.referencia) ?? new Date();
  const situacao = entrada.situacao ?? entrada.situacaoAnp;
  const infracoes = { recentes: 0, antigas: 0 };
  const amostrasNc = { recentes: 0, antigas: 0 };

  for (const irregularidade of entrada.irregularidades ?? []) {
    if (!eInfracaoContabilizavel(irregularidade.classificacao)) continue;
    const janela = dataNaJanela(irregularidade.dataFiscalizacao, referencia);
    if (janela === "recente") infracoes.recentes++;
    if (janela === "antiga") infracoes.antigas++;
  }

  for (const amostra of entrada.amostras ?? []) {
    if (amostra.conforme) continue;
    const janela = dataNaJanela(amostra.dataColeta, referencia);
    if (janela === "recente") amostrasNc.recentes++;
    if (janela === "antiga") amostrasNc.antigas++;
  }

  const desconto =
    2 * infracoes.recentes +
    infracoes.antigas +
    amostrasNc.recentes +
    0.5 * amostrasNc.antigas;
  const descontoArredondado = Math.round(desconto);
  const situacaoInativa = !situacaoEmOperacao(situacao);
  const descontoExcedido = desconto > 5;
  const nota = situacaoInativa || descontoExcedido
    ? 0
    : Math.max(0, Math.min(5, 5 - descontoArredondado));

  return {
    nota: nota as ResultadoNotaAnp["nota"],
    desconto,
    infracoesRecentes: infracoes.recentes,
    infracoesAntigas: infracoes.antigas,
    amostrasNcRecentes: amostrasNc.recentes,
    amostrasNcAntigas: amostrasNc.antigas,
    motivoZero: situacaoInativa
      ? "situacao_inativa"
      : descontoExcedido
        ? "desconto_excedido"
        : null,
  };
}

/** Alias com nome explícito para consumidores que não usam a abreviação ANP. */
export const calcularNotaOficialAnp = calcularNotaAnp;

export interface SeloConfig {
  notaMinima: number;
  origemMinimaPct: number;
  janelaIrregularidadesMeses: number;
}

export const SELO_CONFIG: Readonly<SeloConfig> = {
  notaMinima: 4,
  origemMinimaPct: 95,
  janelaIrregularidadesMeses: 24,
};

export interface CriteriosSelo {
  // Campos legados mantidos para compatibilidade com a ficha atual.
  situacao_anp_ativa: boolean;
  sem_autuacoes_24m: boolean;
  qualidade_conforme: boolean;
  bandeira_consistente: boolean;
  // Critérios transparentes da regra ANP/ICL.
  situacao_em_operacao: boolean;
  nota_minima: boolean;
  sem_irregularidades_24m: boolean;
  origem_consistente: boolean;
}

export interface EntradaScore {
  situacaoAnp: string;
  autuacoes24m: number;
  qualidadeConforme: boolean;
  bandeiraConsistente: boolean;
  /** Campos ANP novos; opcionais para que o seed e integrações antigas continuem válidos. */
  situacao?: string | null;
  notaAnpColetada?: number | null;
  notaAnpCalculada?: number | null;
  irregularidades24m?: number | null;
  origemPropriaPct?: number | null;
  origemConsistente?: boolean | null;
  alertaOrigem?: boolean | null;
  bandeira?: string | null;
  distribuidora?: string | null;
  irregularidades?: readonly EventoIrregularidade[];
  origens?: readonly RegistroOrigemCombustivel[];
  referencia?: string | Date;
}

export interface ResultadoScore {
  score: number;
  tier: "selo" | "regular" | "sem_verificacao";
  criterios: CriteriosSelo;
}

function eBandeiraBranca(bandeira: string | null | undefined): boolean {
  return normalizar(bandeira ?? "").includes("bandeira branca");
}

function contarIrregularidadesNoPeriodo(
  irregularidades: readonly EventoIrregularidade[],
  meses: number,
  referencia: Date,
): number {
  const inicio = new Date(referencia.getTime());
  inicio.setUTCMonth(inicio.getUTCMonth() - meses);

  return irregularidades.reduce((total, irregularidade) => {
    const data = dataValida(irregularidade.dataFiscalizacao);
    return data && data <= referencia && data >= inicio ? total + 1 : total;
  }, 0);
}

function origemAtendeCriterio(
  entrada: EntradaScore,
  config: SeloConfig,
): boolean {
  if (entrada.origemConsistente != null) return entrada.origemConsistente;
  if (entrada.origens && entrada.origens.length > 0) {
    if (eBandeiraBranca(entrada.bandeira)) return entrada.alertaOrigem !== true;

    const distribuidora = normalizar(
      entrada.distribuidora ?? entrada.origens[0]?.distribuidoraPosto ?? "",
    );
    if (!distribuidora) return false;

    const percentualProprio = entrada.origens.reduce(
      (total, origem) =>
        normalizar(origem.distribuidoraOrigem) === distribuidora
          ? total + origem.volumePct
          : total,
      0,
    );
    return percentualProprio >= config.origemMinimaPct;
  }
  if (entrada.origemPropriaPct != null) {
    return entrada.origemPropriaPct >= config.origemMinimaPct;
  }
  return eBandeiraBranca(entrada.bandeira) && entrada.alertaOrigem !== true;
}

function calcularCriteriosAnp(
  entrada: EntradaScore,
  config: SeloConfig,
): CriteriosSelo {
  const situacao = entrada.situacao ?? entrada.situacaoAnp;
  const referencia = dataValida(entrada.referencia) ?? new Date();
  const situacaoEmOperacaoAgora = situacaoEmOperacao(situacao);
  const nota = entrada.notaAnpCalculada ?? entrada.notaAnpColetada;
  const notaMinima = nota != null && nota >= config.notaMinima;
  const semIrregularidades =
    entrada.irregularidades != null
      ? contarIrregularidadesNoPeriodo(
          entrada.irregularidades,
          config.janelaIrregularidadesMeses,
          referencia,
        ) === 0
      : (entrada.irregularidades24m ?? entrada.autuacoes24m) === 0;
  const origemConsistente = origemAtendeCriterio(entrada, config);

  return {
    situacao_anp_ativa: situacaoEmOperacaoAgora,
    sem_autuacoes_24m: semIrregularidades,
    qualidade_conforme: notaMinima,
    bandeira_consistente: origemConsistente,
    situacao_em_operacao: situacaoEmOperacaoAgora,
    nota_minima: notaMinima,
    sem_irregularidades_24m: semIrregularidades,
    origem_consistente: origemConsistente,
  };
}

/**
 * Deriva a classificação do selo. Para cadastros sem as colunas ANP novas,
 * usa os quatro critérios legados, preservando o comportamento da demonstração.
 */
export function derivarSelo(
  entrada: EntradaScore,
  config: SeloConfig = SELO_CONFIG,
): ResultadoScore {
  const temDadosAnp =
    entrada.situacao != null ||
    entrada.notaAnpCalculada != null ||
    entrada.notaAnpColetada != null ||
    entrada.irregularidades24m != null ||
    entrada.origemConsistente != null ||
    entrada.origemPropriaPct != null ||
    entrada.irregularidades != null ||
    entrada.origens != null;

  if (!temDadosAnp) {
    const criterios: CriteriosSelo = {
      situacao_anp_ativa: normalizar(entrada.situacaoAnp) === "ativa",
      sem_autuacoes_24m: entrada.autuacoes24m === 0,
      qualidade_conforme: entrada.qualidadeConforme,
      bandeira_consistente: entrada.bandeiraConsistente,
      situacao_em_operacao: normalizar(entrada.situacaoAnp) === "ativa",
      nota_minima: entrada.qualidadeConforme,
      sem_irregularidades_24m: entrada.autuacoes24m === 0,
      origem_consistente: entrada.bandeiraConsistente,
    };
    const score =
      (criterios.situacao_anp_ativa ? 40 : 0) +
      (criterios.sem_autuacoes_24m ? 25 : 0) +
      (criterios.qualidade_conforme ? 25 : 0) +
      (criterios.bandeira_consistente ? 10 : 0);
    return {
      score,
      tier: criterios.situacao_anp_ativa
        ? criterios.sem_autuacoes_24m &&
          criterios.qualidade_conforme &&
          criterios.bandeira_consistente
          ? "selo"
          : "regular"
        : "sem_verificacao",
      criterios,
    };
  }

  const criterios = calcularCriteriosAnp(entrada, config);
  const score =
    (criterios.situacao_em_operacao ? 40 : 0) +
    (criterios.nota_minima ? 25 : 0) +
    (criterios.sem_irregularidades_24m ? 25 : 0) +
    (criterios.origem_consistente ? 10 : 0);
  const selo =
    criterios.situacao_em_operacao &&
    criterios.nota_minima &&
    criterios.sem_irregularidades_24m &&
    criterios.origem_consistente;

  return {
    score,
    tier: criterios.situacao_em_operacao ? (selo ? "selo" : "regular") : "sem_verificacao",
    criterios,
  };
}

export function calcularScore(
  entrada: EntradaScore,
  config: SeloConfig = SELO_CONFIG,
): ResultadoScore {
  return derivarSelo(entrada, config);
}

/** Bandeira da associada fictícia usada no painel B2B. */
export const BANDEIRA_ASSOCIADA = "Horizonte";

export function isRedeAssociada(bandeira: string): boolean {
  return bandeira.trim().toLowerCase() === BANDEIRA_ASSOCIADA.toLowerCase();
}