import { test } from "node:test";
import assert from "node:assert/strict";
import { lerModoFaturamento, modoDaNota } from "./modo-faturamento.ts";

test("modo da URL: só os três conhecidos", () => {
  assert.equal(lerModoFaturamento("contrato"), "contrato");
  assert.equal(lerModoFaturamento("remessa"), "remessa");
  assert.equal(lerModoFaturamento("x"), null);
  assert.equal(lerModoFaturamento(null), null);
});

test("cada NF de saída cai no seu modo", () => {
  assert.equal(modoDaNota({ cfop: "6.101", dados_nf_json: { contrato_id: "c1" } }), "contrato");
  assert.equal(modoDaNota({ cfop: "6.501" }), "avulsa");
  assert.equal(modoDaNota({ cfop: "5.905", dados_nf_json: { contrato_id: "c1" } }), "remessa");
  assert.equal(modoDaNota({ cfop: "6.117" }), "remessa");
  assert.equal(modoDaNota({ cfop: "6.923" }), "remessa");
  assert.equal(modoDaNota({ cfop: "5.949" }), "remessa");
  assert.equal(modoDaNota({ cfop: "5.555" }), "devolucao");
  assert.equal(modoDaNota({ cfop: "6.556" }), "devolucao");
  assert.equal(modoDaNota({ cfop: "5.202" }), "devolucao");
  assert.equal(modoDaNota({ cfop: "6.909" }), "devolucao");
  assert.equal(modoDaNota({ cfop: "6.908" }), "remessa");
  assert.equal(lerModoFaturamento("devolucao"), "devolucao");
  assert.equal(modoDaNota({ cfop: "" }), null);
});

test("remessa gravada sem CFOP: pelo número ou pela palavra na natureza", () => {
  assert.equal(modoDaNota({ cfop: "", natureza: "REMESSA SIMBÓLICA DE MERCADORIA" }), "remessa");
  assert.equal(modoDaNota({ cfop: null, natureza: "5934 - REMESSA SIMBOLICA DE MERCADORIA DEPOSITADA" }), "remessa");
  assert.equal(modoDaNota({ cfop: "", natureza: "5.101 Venda de produção" }), "avulsa");
  assert.equal(modoDaNota({ cfop: "", natureza: "Venda" }), null);
  assert.equal(modoDaNota({ cfop: "5.101", natureza: "REMESSA" }), "avulsa");
});
