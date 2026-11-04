import { test } from "node:test";
import assert from "node:assert/strict";
import { precoKgDoContrato } from "./preco-nf.ts";

test("preço por saca vira preço por kg pelo item do contrato", () => {
  const r = precoKgDoContrato({ produto: "Soja", preco: 120, moeda: "BRL" }, [{ produto: "Soja", unidade: "kg", quantidade: 300000, valor_total: 600000 }], 60);
  assert.equal(r.precoKg, 2);
  assert.equal(r.aviso, "");
});

test("produto vendido por kg não é dividido por 60", () => {
  const r = precoKgDoContrato({ produto: "Gergelim", preco: 4.2, moeda: "BRL" }, [{ produto: "Gergelim", unidade: "kg", quantidade: 250000.2, valor_total: 1050000.84 }], 60);
  assert.equal(Math.round(r.precoKg * 100) / 100, 4.2);
});

test("sem item em kg, usa preço ÷ kg da saca", () => {
  assert.equal(precoKgDoContrato({ produto: "Milho", preco: 60, moeda: "BRL" }, [], 60).precoKg, 1);
  assert.equal(precoKgDoContrato({ produto: "Algodão", preco: 150, moeda: "BRL" }, [{ produto: "Algodão", unidade: "sc", quantidade: 10, valor_total: 1500 }], 15).precoKg, 10);
});

test("contrato em dólar converte pela cotação do contrato; sem ela, pela PTAX; sem nenhuma, não inventa preço", () => {
  const itens = [{ produto: "Soja", unidade: "kg", quantidade: 60000, valor_total: 21000 }];
  assert.equal(Math.round(precoKgDoContrato({ produto: "Soja", moeda: "USD", cotacao_usd: 5 }, itens, 60, 6).precoKg * 100) / 100, 1.75);
  assert.equal(Math.round(precoKgDoContrato({ produto: "Soja", moeda: "USD" }, itens, 60, 6).precoKg * 100) / 100, 2.1);
  const sem = precoKgDoContrato({ produto: "Soja", moeda: "USD" }, itens, 60, null);
  assert.equal(sem.precoKg, 0);
  assert.match(sem.aviso, /sem cotação/);
});
