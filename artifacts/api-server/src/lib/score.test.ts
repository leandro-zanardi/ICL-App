import assert from "node:assert/strict";
import test from "node:test";
import { calcularNotaAnp, derivarSelo } from "./score.ts";

const referencia = "2026-01-01";
const recente = "2025-06-01";
const antiga = "2023-06-01";

test("nota 5 para posto em operação sem ocorrências", () => {
  const resultado = calcularNotaAnp({
    situacao: "EM OPERAÇÃO",
    referencia,
    irregularidades: [],
    amostras: [],
  });

  assert.equal(resultado.nota, 5);
  assert.equal(resultado.desconto, 0);
});

test("uma amostra PMQC não conforme recente reduz a nota para 4", () => {
  const resultado = calcularNotaAnp({
    situacao: "EM OPERAÇÃO",
    referencia,
    amostras: [{ dataColeta: recente, conforme: false }],
  });

  assert.equal(resultado.nota, 4);
  assert.equal(resultado.amostrasNcRecentes, 1);
});

test("infração recente e amostra não conforme antiga arredondam o desconto antes da subtração", () => {
  const resultado = calcularNotaAnp({
    situacao: "EM OPERAÇÃO",
    referencia,
    irregularidades: [{ dataFiscalizacao: recente, classificacao: "vício de qualidade" }],
    amostras: [{ dataColeta: antiga, conforme: false }],
  });

  // 2 + 0,5 = 2,5; round(2,5) = 3; 5 - 3 = 2.
  assert.equal(resultado.desconto, 2.5);
  assert.equal(resultado.nota, 2);
});

test("posto inativo recebe nota zero mesmo sem ocorrências", () => {
  const resultado = calcularNotaAnp({
    situacao: "INTERDITADO TOTALMENTE",
    referencia,
  });

  assert.equal(resultado.nota, 0);
  assert.equal(resultado.motivoZero, "situacao_inativa");
});

test("desconto acima de cinco recebe nota zero", () => {
  const resultado = calcularNotaAnp({
    situacao: "EM OPERAÇÃO",
    referencia,
    irregularidades: [
      { dataFiscalizacao: recente, classificacao: "vício de qualidade" },
      { dataFiscalizacao: recente, classificacao: "vício de quantidade" },
      { dataFiscalizacao: recente, classificacao: "vício de qualidade" },
    ],
  });

  assert.equal(resultado.desconto, 6);
  assert.equal(resultado.nota, 0);
  assert.equal(resultado.motivoZero, "desconto_excedido");
});

test("selo usa a origem observada e os limiares configuráveis", () => {
  const entrada = {
    situacaoAnp: "Ativa",
    autuacoes24m: 0,
    qualidadeConforme: true,
    bandeiraConsistente: true,
    situacao: "EM OPERAÇÃO",
    notaAnpCalculada: 4,
    distribuidora: "Horizonte Combustíveis",
    bandeira: "Horizonte",
    referencia,
    irregularidades: [],
    origens: [
      {
        distribuidoraPosto: "Horizonte Combustíveis",
        distribuidoraOrigem: "Horizonte Combustíveis",
        volumePct: 95,
      },
    ],
  };

  assert.equal(derivarSelo(entrada).tier, "selo");
  assert.equal(derivarSelo(entrada, { notaMinima: 4, origemMinimaPct: 96, janelaIrregularidadesMeses: 24 }).tier, "regular");
});

test("janelas da nota usam limites de anos-calendário, inclusive em ano bissexto", () => {
  const doisAnosExatos = calcularNotaAnp({
    situacao: "EM OPERAÇÃO",
    referencia: "2025-03-01",
    irregularidades: [{ dataFiscalizacao: "2023-03-01", classificacao: "vício de qualidade" }],
  });
  const cincoAnosExatos = calcularNotaAnp({
    situacao: "EM OPERAÇÃO",
    referencia: "2026-03-01",
    amostras: [{ dataColeta: "2021-03-01", conforme: false }],
  });
  const aniversarioBissexto = calcularNotaAnp({
    situacao: "EM OPERAÇÃO",
    referencia: "2024-02-29",
    amostras: [{ dataColeta: "2022-02-28", conforme: false }],
  });

  assert.equal(doisAnosExatos.infracoesRecentes, 1);
  assert.equal(cincoAnosExatos.amostrasNcAntigas, 1);
  assert.equal(aniversarioBissexto.amostrasNcRecentes, 1);
});