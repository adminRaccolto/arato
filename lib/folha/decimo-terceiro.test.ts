import { test } from "node:test";
import assert from "node:assert/strict";
import { avosDecimo, calcularDecimo, valorPrimeira } from "./decimo-terceiro.ts";

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

test("salário + complemento: paga sobre o total, INSS e IRRF só sobre o salário base", () => {
  const comp = calcularDecimo(5000, 12, 2000);
  const soSalario = calcularDecimo(3000, 12);
  assert.equal(comp.bruto, 5000);
  assert.equal(comp.parcela1, 2500);
  assert.equal(comp.brutoTributavel, 3000);
  assert.equal(comp.inss, soSalario.inss);
  assert.equal(comp.irrf, soSalario.irrf);
  assert.equal(comp.parcela2, Math.round((5000 - comp.inss - comp.irrf - 2500) * 100) / 100);
  assert.notEqual(comp.inss, calcularDecimo(5000, 12).inss);
});
test("complemento proporcional aos avos e sem base negativa", () => {
  const c = calcularDecimo(5000, 6, 2000);
  assert.equal(c.bruto, 2500);
  assert.equal(c.brutoTributavel, 1500);
  assert.equal(calcularDecimo(1000, 12, 2000).inss, 0);
  assert.equal(calcularDecimo(3000, 12).brutoTributavel, 3000);
});

test("% da 1ª parcela: descontos sempre na 2ª e 1ª limitada ao líquido", () => {
  const c70 = calcularDecimo(3000, 12, 0, 70);
  assert.equal(c70.parcela1, 2100);
  assert.equal(c70.limitada, false);
  assert.equal(c70.pct1, 70);
  assert.equal(Math.round((c70.parcela1 + c70.parcela2 + c70.inss + c70.irrf) * 100) / 100, 3000);
  const c100 = calcularDecimo(3000, 12, 0, 100);
  assert.equal(c100.limitada, true);
  assert.equal(c100.parcela1, Math.round((3000 - c100.inss - c100.irrf) * 100) / 100);
  assert.equal(c100.parcela2, 0);
  assert.ok(c100.pct1 < 100);
  assert.equal(calcularDecimo(3000, 12).parcela1, 1500);          // padrão continua 50%
  assert.equal(valorPrimeira(1000, 0, 0, 40).valor, 400);          // abaixo do mínimo: calcula, a tela avisa
  assert.equal(valorPrimeira(1000, 50, 0, 200).valor, 950);        // % fora da faixa vira 100% e bate no teto
});
