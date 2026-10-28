import { test } from "node:test";
import assert from "node:assert/strict";
import { ratearRetorno, problemasRateio, quantidadesPorRemessa, chavesReferenciadas } from "./retorno-rateio.ts";

const rems = [{ id: "nova", saldo: 600, data: "2026-10-10" }, { id: "antiga", saldo: 400, data: "2026-09-01" }];

test("rateio começa pela remessa mais antiga, até o saldo de cada uma", () => {
  assert.deepEqual(ratearRetorno(700, rems), [{ id: "nova", valor: 300 }, { id: "antiga", valor: 400 }]);
  assert.deepEqual(ratearRetorno(1000, rems), [{ id: "nova", valor: 600 }, { id: "antiga", valor: 400 }]);
  assert.deepEqual(problemasRateio(1000, rems, ratearRetorno(1000, rems)), []);
});

test("problemas: soma diferente, acima do saldo e remessa sem valor", () => {
  assert.equal(problemasRateio(700, rems, [{ id: "nova", valor: 300 }, { id: "antiga", valor: 300 }]).length, 1);
  assert.match(problemasRateio(700, rems, [{ id: "nova", valor: 100 }, { id: "antiga", valor: 600 }]).join(), /acima do saldo/);
  assert.match(problemasRateio(400, rems, [{ id: "nova", valor: 0 }, { id: "antiga", valor: 400 }]).join(), /precisa de um valor/);
  // NF maior que o saldo das remessas: a sobra fica na última e aparece como acima do saldo
  assert.match(problemasRateio(1200, rems, ratearRetorno(1200, rems)).join(), /acima do saldo/);
});

test("quantidades seguem a proporção do valor de cada remessa", () => {
  const q = quantidadesPorRemessa([{ insumo_id: "I", quantidade: 1000 }], 1000, [{ id: "a", valor: 600 }, { id: "b", valor: 400 }]);
  assert.deepEqual(q, [{ id: "a", itens: [{ insumo_id: "I", quantidade: 600 }] }, { id: "b", itens: [{ insumo_id: "I", quantidade: 400 }] }]);
});

test("chaves referenciadas do XML", () => {
  const k1 = "5".repeat(44), k2 = "6".repeat(44);
  assert.deepEqual(chavesReferenciadas(`<NFref><refNFe>${k1}</refNFe></NFref><NFref><refNFe>${k2}</refNFe></NFref><refNFe>${k1}</refNFe>`), [k1, k2]);
});
