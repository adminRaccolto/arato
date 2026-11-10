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
  assert.equal(modoDaNota({ cfop: "5.555" }), "avulsa");
  assert.equal(modoDaNota({ cfop: "" }), null);
});
