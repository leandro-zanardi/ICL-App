/**
 * Cálculo do score de confiança e do tier do Selo Combustível Legal.
 *
 * Pesos (0–100):
 * - Situação ANP ativa ............ 40
 * - Zero autuações nos últimos 24m  25
 * - Qualidade do combustível ok ... 25
 * - Bandeira consistente .......... 10
 *
 * Tiers:
 * - selo            → todos os quatro critérios atendidos
 * - sem_verificacao → situação ANP não está ativa
 * - regular         → ativo, mas com pendência em algum critério
 */
export interface CriteriosSelo {
  situacao_anp_ativa: boolean;
  sem_autuacoes_24m: boolean;
  qualidade_conforme: boolean;
  bandeira_consistente: boolean;
}

export interface EntradaScore {
  situacaoAnp: string;
  autuacoes24m: number;
  qualidadeConforme: boolean;
  bandeiraConsistente: boolean;
}

export interface ResultadoScore {
  score: number;
  tier: "selo" | "regular" | "sem_verificacao";
  criterios: CriteriosSelo;
}

export function calcularScore(entrada: EntradaScore): ResultadoScore {
  const criterios: CriteriosSelo = {
    situacao_anp_ativa: entrada.situacaoAnp.trim().toLowerCase() === "ativa",
    sem_autuacoes_24m: entrada.autuacoes24m === 0,
    qualidade_conforme: entrada.qualidadeConforme,
    bandeira_consistente: entrada.bandeiraConsistente,
  };

  const score =
    (criterios.situacao_anp_ativa ? 40 : 0) +
    (criterios.sem_autuacoes_24m ? 25 : 0) +
    (criterios.qualidade_conforme ? 25 : 0) +
    (criterios.bandeira_consistente ? 10 : 0);

  let tier: ResultadoScore["tier"];
  if (!criterios.situacao_anp_ativa) {
    tier = "sem_verificacao";
  } else if (
    criterios.sem_autuacoes_24m &&
    criterios.qualidade_conforme &&
    criterios.bandeira_consistente
  ) {
    tier = "selo";
  } else {
    tier = "regular";
  }

  return { score, tier, criterios };
}

/** Bandeira da associada fictícia usada no painel B2B. */
export const BANDEIRA_ASSOCIADA = "Horizonte";

export function isRedeAssociada(bandeira: string): boolean {
  return bandeira.trim().toLowerCase() === BANDEIRA_ASSOCIADA.toLowerCase();
}
