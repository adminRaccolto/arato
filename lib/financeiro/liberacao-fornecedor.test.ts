import { test } from "node:test";
import assert from "node:assert/strict";
import { quitarCp, desfazerQuitacao } from "./liberacao-fornecedor.ts";

const cp = { id: "a", valor: 500000, valor_pago: 100000, status: "parcial", data_vencimento: "2026-11-30" };

test("financiamento quita o saldo (total ou parcial) e não passa do saldo", () => {
  assert.deepEqual(quitarCp(cp, 400000), { valor_pago: 500000, status: "baixado" });
  assert.deepEqual(quitarCp(cp, 150000), { valor_pago: 250000, status: "parcial" });
  assert.ok("erro" in quitarCp(cp, 400001));
});

test("estorno devolve o valor ao título", () => {
  assert.deepEqual(desfazerQuitacao({ ...cp, valor_pago: 500000, status: "baixado" }, 400000, "2026-10-29"), { valor_pago: 100000, status: "parcial", data_baixa_nula: false });
  assert.deepEqual(desfazerQuitacao({ ...cp, valor_pago: 400000 }, 400000, "2026-12-01"), { valor_pago: null, status: "vencido", data_baixa_nula: true });
});
