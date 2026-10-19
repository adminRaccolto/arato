import test from "node:test";
import assert from "node:assert/strict";
import { derivarDespesasFinanciadas } from "./cedula-despesas.ts";

test("CCB Sicoob: contratado 206.972,70, liberado 200.000,00, IOF 6.972,70", () => {
  const r = derivarDespesasFinanciadas({ valor_financiado: 206972.7, valor_liberado: 200000, valor_iof: 6972.7 });
  assert.deepEqual(r, { iof: 6972.7, tarifas: 0, liberadoLiquido: 200000 });
});
test("sem detalhe da despesa, a diferença vira IOF quando há IOF %", () => {
  const r = derivarDespesasFinanciadas({ valor_financiado: 206972.7, valor_liberado: 200000, iof_pct: 3.37 });
  assert.equal(r.iof, 6972.7); assert.equal(r.tarifas, 0);
});
test("sem detalhe e sem IOF %, a diferença vira tarifas/seguro", () => {
  const r = derivarDespesasFinanciadas({ valor_financiado: 100000, valor_liberado: 98000 });
  assert.equal(r.tarifas, 2000); assert.equal(r.iof, 0);
});
test("liberado igual ao financiado: sem despesa financiada", () => {
  const r = derivarDespesasFinanciadas({ valor_financiado: 500000, valor_liberado: 500000 });
  assert.deepEqual(r, { iof: 0, tarifas: 0, liberadoLiquido: 500000 });
});
test("liberado ausente: líquido = financiado menos despesas", () => {
  const r = derivarDespesasFinanciadas({ valor_financiado: 206972.7, valor_iof: 6972.7 });
  assert.equal(r.liberadoLiquido, 200000);
});
