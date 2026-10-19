import test from "node:test";
import assert from "node:assert/strict";
import { repartirCronograma } from "./cronograma.ts";

const perto = (a: number, b: number, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} deveria estar a ${tol} de ${b}`);

test("CCB Sicoob 826134: 5 prestações anuais de 51.514,46 sobre 206.972,70", () => {
  const { linhas } = repartirCronograma(206972.7, [51514.46, 51514.46, 51514.46, 51514.46, 51514.46]);
  const juros = [16067.6, 13315.81, 10350.39, 7154.76, 3711.05];
  const amort = [35446.86, 38198.65, 41164.07, 44359.7, 47803.41];
  const saldo = [171525.84, 133327.18, 92163.11, 47803.41, 0];
  linhas.forEach((l, i) => { perto(l.juros, juros[i]); perto(l.amortizacao, amort[i]); perto(l.saldo, saldo[i]); });
  perto(linhas.reduce((s, l) => s + l.juros, 0), 50599.61, 0.1);
  perto(linhas.reduce((s, l) => s + l.amortizacao, 0), 206972.7, 0.01);
});

test("a soma das amortizações é sempre igual ao principal e o saldo final é zero", () => {
  const { linhas } = repartirCronograma(100000, [30000, 30000, 30000, 30000]);
  perto(linhas.reduce((s, l) => s + l.amortizacao, 0), 100000, 0.01);
  assert.equal(linhas[linhas.length - 1].saldo, 0);
});

test("SAC: amortização constante com juros decrescentes é reconhecida", () => {
  // principal 120.000, taxa 10% a.p., amortização 40.000: prestações 52.000, 48.000, 44.000
  const { taxaPeriodo, linhas } = repartirCronograma(120000, [52000, 48000, 44000]);
  perto(taxaPeriodo * 100, 10, 0.01);
  linhas.forEach(l => perto(l.amortizacao, 40000, 0.05));
});

test("prestações que só cobrem o principal: sem juros", () => {
  const { taxaPeriodo, linhas } = repartirCronograma(100000, [50000, 50000]);
  assert.equal(taxaPeriodo, 0);
  assert.deepEqual(linhas.map(l => l.juros), [0, 0]);
});

test("pagamento único no vencimento (bullet)", () => {
  const { linhas } = repartirCronograma(500000, [515817]);
  perto(linhas[0].amortizacao, 500000, 0.01); perto(linhas[0].juros, 15817, 0.01);
});
