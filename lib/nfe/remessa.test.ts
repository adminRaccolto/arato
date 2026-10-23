import { test } from "node:test";
import assert from "node:assert/strict";
import { ratearDescontoNf, emissorDoProdutor } from "./remessa.ts";

test("NF 427 Verdena: desconto do cabeçalho rateado fecha no centavo", () => {
  const itens = [493.84, 1155, 1366.64, 291.73, 1140, 1366.64, 21999.78, 64472.9];
  const r = ratearDescontoNf(11875.98, 92286.53, itens);
  assert.equal(Math.round(r.reduce((s, v) => s + v, 0) * 100), 1187598);
  assert.ok(Math.abs(r[0] - 493.84 * 11875.98 / 92286.53) < 0.01);
});

test("sem desconto ou sem base: zero em todos", () => {
  assert.deepEqual(ratearDescontoNf(0, 100, [50, 50]), [0, 0]);
  assert.deepEqual(ratearDescontoNf(10, 0, [0]), [0]);
});

test("só parte dos itens: leva só a parte do desconto deles", () => {
  const r = ratearDescontoNf(100, 1000, [500]);
  assert.deepEqual(r, [50]);
});

test("emitente segue o CPF do produtor escolhido", () => {
  const emissores = [{ key: "fiscal_pf_02312739160" }, { key: "fiscal_pf_17679842949" }];
  const cfgs = { fiscal_pf_02312739160: { cpf_cnpj_emitente: "023.127.391-60" }, fiscal_pf_17679842949: { cpf_cnpj_emitente: "176.798.429-49" } };
  assert.equal(emissorDoProdutor("176.798.429-49", emissores, cfgs), "fiscal_pf_17679842949");
  assert.equal(emissorDoProdutor("111.111.111-11", emissores, cfgs), null);
  assert.equal(emissorDoProdutor("", emissores, cfgs), null);
});
