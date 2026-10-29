import { test } from "node:test";
import assert from "node:assert/strict";
import { avosDecimo, calcularDecimo } from "./decimo-terceiro.ts";

test("avos: ano inteiro, admissão no meio do ano e a regra dos 15 dias", () => {
  assert.equal(avosDecimo("2020-03-10", null, 2026), 12);
  assert.equal(avosDecimo("2026-07-01", null, 2026), 6);
  assert.equal(avosDecimo("2026-07-17", null, 2026), 6);     // julho com 15 dias (17 a 31) conta
  assert.equal(avosDecimo("2026-07-18", null, 2026), 5);     // com 14 dias não
  assert.equal(avosDecimo("2025-01-01", "2026-03-10", 2026), 2); // jan, fev (mar com 10 dias não conta)
  assert.equal(avosDecimo("2027-01-05", null, 2026), 0);
});

test("parcelas: 1ª metade sem descontos, 2ª com INSS e IRRF sobre o total", () => {
  const c = calcularDecimo(3000, 12);
  assert.equal(c.bruto, 3000);
  assert.equal(c.parcela1, 1500);
  assert.ok(c.inss > 0);
  assert.equal(c.irrf, 0);                                    // até R$ 5.000 isento
  assert.equal(Math.round((c.parcela1 + c.parcela2 + c.inss + c.irrf) * 100) / 100, 3000);
  assert.equal(calcularDecimo(3000, 6).bruto, 1500);
});
