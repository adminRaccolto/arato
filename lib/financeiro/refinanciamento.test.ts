import assert from "node:assert/strict";
import test from "node:test";
import { planejarEncerramento, podeRestaurar, saldoDevedorOrigem, type TituloOrigem } from "./refinanciamento.ts";

const t = (o: Partial<TituloOrigem>): TituloOrigem => ({ id: "x", tipo: "pagar", status: "em_aberto", valor: 100, valor_pago: null,
  data_vencimento: "2027-01-10", descricao: "Cédula — Parcela 1 — Amortização", ...o });

test("saldo: amortizações a pagar + o que falta das parciais + juros já vencidos; juros futuros e pagos fora", () => {
  const titulos = [
    t({ id: "a1", valor: 1000 }),
    t({ id: "a2", status: "parcial", valor: 1000, valor_pago: 400 }),
    t({ id: "a3", status: "baixado", valor: 1000, valor_pago: 1000 }),
    t({ id: "j1", descricao: "Cédula — Parcela 1 — Juros", valor: 200, data_vencimento: "2026-09-01", status: "vencido" }),
    t({ id: "j2", descricao: "Cédula — Parcela 2 — Juros", valor: 150, data_vencimento: "2027-03-01" }),
    t({ id: "c1", status: "cancelado", valor: 999 }),
    t({ id: "r1", tipo: "receber", valor: 5000 }),
  ];
  assert.equal(saldoDevedorOrigem(titulos, "2026-10-30"), 1000 + 600 + 200);
});

test("encerramento: aberto cancela, parcial fecha no pago, borderô fica", () => {
  const p = planejarEncerramento([
    t({ id: "a" }), t({ id: "b", status: "parcial", valor_pago: 40 }), t({ id: "c", lote_id: "L1" }),
    t({ id: "d", status: "baixado", valor_pago: 100 }), t({ id: "e", tipo: "receber" }),
  ]);
  assert.deepEqual(p.cancelar.map(x => x.id), ["a"]);
  assert.deepEqual(p.encerrarParcial.map(x => x.id), ["b"]);
  assert.deepEqual(p.emBordero.map(x => x.id), ["c"]);
});

test("desvincular só devolve o título que ninguém mexeu depois", () => {
  assert.equal(podeRestaurar({ status: "cancelado", valor: 100, valor_pago: null }, { id: "a", status: "em_aberto", valor: 100, observacao: null }), true);
  assert.equal(podeRestaurar({ status: "baixado", valor: 100, valor_pago: 100 }, { id: "a", status: "em_aberto", valor: 100, observacao: null }), false);
  assert.equal(podeRestaurar({ status: "baixado", valor: 40, valor_pago: 40 }, { id: "b", status: "parcial", valor: 100, valor_pago: 40, observacao: null }), true);
  assert.equal(podeRestaurar({ status: "baixado", valor: 100, valor_pago: 100 }, { id: "b", status: "parcial", valor: 100, valor_pago: 40, observacao: null }), false);
});
