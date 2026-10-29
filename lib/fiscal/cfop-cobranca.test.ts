import { test } from "node:test";
import assert from "node:assert/strict";
import { cobrancaDaNf } from "./cfop-cobranca.ts";

test("remessa de entrega futura não é cobrança; simples faturamento é", () => {
  assert.equal(cobrancaDaNf("5116", ["5116", "5116"]), "entrega_futura");
  assert.equal(cobrancaDaNf("6117", []), "entrega_futura");
  assert.equal(cobrancaDaNf("5922", ["5922"]), "compra");
});

test("comodato, conserto e armazenagem não geram CP", () => {
  assert.equal(cobrancaDaNf("6908", ["6908"]), "sem_cobranca");
  assert.equal(cobrancaDaNf("5915", ["5915"]), "sem_cobranca");
  assert.equal(cobrancaDaNf("5906", []), "sem_cobranca");
});

test("CFOP genérico 5949 pede confirmação; mistura com compra é compra", () => {
  assert.equal(cobrancaDaNf("5949", ["5949", "5949"]), "confirmar");
  assert.equal(cobrancaDaNf("5102", ["5102", "5949"]), "compra");
  assert.equal(cobrancaDaNf("5102", ["5102"]), "compra");
  assert.equal(cobrancaDaNf(null, []), "compra");
});
