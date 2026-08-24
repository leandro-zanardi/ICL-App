import assert from "node:assert/strict";
import test from "node:test";
import { parseCsvAnp } from "./anp-csv.ts";

test("reconhece o cabeçalho e os campos do CSV oficial da ANP", () => {
  const csv = [
    "CNPJ;RAZÃO SOCIAL;NOME FANTASIA;BANDEIRA;ENDEREÇO;COMPLEMENTO;BAIRRO;CEP;MUNICÍPIO;UF;LATITUDE;LONGITUDE;SITUAÇÃO;DATA PUBLICAÇÃO",
    "12.345.678/0001-90;Posto Exemplo Ltda.;Posto Exemplo;Bandeira Exemplo;Rua dos Testes, 100;Loja 1;Centro;13000-000;CAMPINAS;SP;-22,9056;-47,0608;ATIVO;2024-02-15",
  ].join("\n");

  const resultado = parseCsvAnp(csv);

  assert.equal(resultado.linhasLidas, 1);
  assert.deepEqual(resultado.erros, []);
  assert.deepEqual(resultado.linhas, [
    {
      cnpj: "12345678000190",
      razaoSocial: "Posto Exemplo Ltda.",
      nomeFantasia: "Posto Exemplo",
      bandeira: "Bandeira Exemplo",
      endereco: "Rua dos Testes, 100 — Loja 1 — Centro — CEP 13000-000",
      municipio: "CAMPINAS",
      uf: "SP",
      lat: -22.9056,
      lng: -47.0608,
      situacaoAnp: "ATIVO",
      dataAutorizacao: "2024-02-15",
    },
  ]);
});