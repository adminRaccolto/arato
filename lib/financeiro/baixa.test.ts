import assert from "node:assert/strict";
import test from "node:test";
import { excedeLimiteBaixa, limiteBaixa } from "./baixa.ts";

test("sem juros/multa o teto é o valor do título", () => {
  assert.equal(limiteBaixa({ valor: 1000 }), 1000);
  assert.equal(excedeLimiteBaixa({ valor: 1000 }, 1000), false);
  assert.equal(excedeLimiteBaixa({ valor: 1000 }, 1000.01), false);   // 1 centavo de tolerância
  assert.equal(excedeLimiteBaixa({ valor: 1000 }, 1000.5), true);
  assert.equal(excedeLimiteBaixa({ valor: 1000 }, 1200), true);
});

test("juros e multa informados ampliam o teto; desconto reduz", () => {
  const t = { valor: 1000, valor_juros: 30, valor_multa: 20, valor_desconto: 10 };
  assert.equal(limiteBaixa(t), 1040);
  assert.equal(excedeLimiteBaixa(t, 1040), false);
  assert.equal(excedeLimiteBaixa(t, 1041), true);
});

test("baixa parcial acumulada: o total pago depois é que conta", () => {
  assert.equal(excedeLimiteBaixa({ valor: 1000 }, 400 + 600), false);
  assert.equal(excedeLimiteBaixa({ valor: 1000 }, 400 + 700), true);
});

test("título em dólar converte pela cotação", () => {
  assert.equal(limiteBaixa({ valor: 100, moeda: "USD", cotacao_usd: 5 }), 500);
  assert.equal(excedeLimiteBaixa({ valor: 100, moeda: "USD", cotacao_usd: 5 }, 600), true);
});
