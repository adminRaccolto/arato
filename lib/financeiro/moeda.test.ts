import test from "node:test";
import assert from "node:assert/strict";
import { cotacaoEfetiva, valorEmReais, fmtNaMoeda, ehUSD } from "./moeda.ts";

test("USD usa símbolo US$ e BRL usa R$", () => {
  assert.match(fmtNaMoeda(10, "USD"), /^US\$ 10,00$/);
  assert.match(fmtNaMoeda(10, "BRL").replace(/\s/g, " "), /R\$ 10,00/);
});
test("conversão pela cotação do lançamento", () => {
  assert.equal(valorEmReais(1000, "USD", 5.5), 5500);
  assert.equal(valorEmReais(1000, "BRL", 5.5), 1000);
});
test("sem cotação nem PTAX, USD não converte", () => {
  assert.equal(valorEmReais(1000, "USD", cotacaoEfetiva(null, null)), null);
});
test("cotação do título tem prioridade sobre a PTAX", () => {
  assert.equal(cotacaoEfetiva(5.2, 5.6), 5.2);
  assert.equal(cotacaoEfetiva(0, 5.6), 5.6);
  assert.ok(ehUSD("usd"));
});
