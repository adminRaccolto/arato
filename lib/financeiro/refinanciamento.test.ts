import assert from "node:assert/strict";
import test from "node:test";
import { planejarLiquidacao, podeRestaurar, saldoDevedorOrigem, type TituloOrigem } from "./refinanciamento.ts";

const t = (o: Partial<TituloOrigem>): TituloOrigem => ({ id: "x", tipo: "pagar", status: "em_aberto", valor: 100, valor_pago: null,
  data_vencimento: "2027-01-10", descricao: "Cédula — Parcela 1 — Amortização", ...o });

const titulos = [
  t({ id: "a1", valor: 1000, data_vencimento: "2027-01-10" }),
  t({ id: "a2", status: "parcial", valor: 1000, valor_pago: 400, data_vencimento: "2026-09-10" }),
  t({ id: "a3", status: "baixado", valor: 1000, valor_pago: 1000 }),
  t({ id: "j1", descricao: "Cédula — Parcela 1 — Juros", valor: 200, data_vencimento: "2026-09-01", status: "vencido" }),
  t({ id: "j2", descricao: "Cédula — Parcela 2 — Juros", valor: 150, data_vencimento: "2027-01-10" }),
  t({ id: "j3", descricao: "Cédula — Parcela 3 — Juros", valor: 120, data_vencimento: "2028-01-10" }),
  t({ id: "c1", status: "cancelado", valor: 999 }),
  t({ id: "r1", tipo: "receber", valor: 5000 }),
];

test("saldo: amortizações a pagar + o que falta das parciais + juros já vencidos; juros futuros e pagos fora", () => {
  assert.equal(saldoDevedorOrigem(titulos, "2026-10-30"), 1000 + 600 + 200);
});

test("liquidação: valor do banco paga amortizações e juros vencidos, a diferença vai aos juros do período, o resto é desconto", () => {
  const l = planejarLiquidacao(titulos, 1850, "2026-10-30");
  const por = Object.fromEntries(l.itens.map(i => [i.titulo.id, i]));
  assert.deepEqual(Object.keys(por).sort(), ["a1", "a2", "j1", "j2", "j3"]);
  assert.equal(por.a1.pago, 1000); assert.equal(por.a2.pago, 600); assert.equal(por.j1.pago, 200);
  assert.equal(por.j2.pago, 50); assert.equal(por.j2.desconto, 100);
  assert.equal(por.j3.pago, 0); assert.equal(por.j3.desconto, 120);
  assert.equal(l.total, 1850);
});

test("liquidação: valor acima da dívida toda entra como juros no último título; borderô fica de fora", () => {
  const l = planejarLiquidacao([t({ id: "a", valor: 100 }), t({ id: "b", lote_id: "L1" })], 130, "2026-10-30");
  assert.deepEqual(l.emBordero.map(x => x.id), ["b"]);
  assert.equal(l.itens.length, 1); assert.equal(l.itens[0].pago, 130); assert.equal(l.itens[0].juros, 30); assert.equal(l.total, 130);
});

test("desvincular só devolve o título que ninguém mexeu depois", () => {
  const liq = { id: "a", acao: "baixado" as const, status: "em_aberto", valor: 100, valor_pago: 0, observacao: null, pago_depois: 100 };
  assert.equal(podeRestaurar({ status: "baixado", valor: 100, valor_pago: 100 }, liq), true);
  assert.equal(podeRestaurar({ status: "baixado", valor: 100, valor_pago: 100, conciliado: true }, liq), false);
  assert.equal(podeRestaurar({ status: "em_aberto", valor: 100, valor_pago: 0 }, liq), false);
  // vínculos antigos (título cancelado/encerrado)
  assert.equal(podeRestaurar({ status: "cancelado", valor: 100, valor_pago: null }, { id: "a", status: "em_aberto", valor: 100, observacao: null }), true);
  assert.equal(podeRestaurar({ status: "baixado", valor: 40, valor_pago: 40 }, { id: "b", status: "parcial", valor: 100, valor_pago: 40, observacao: null }), true);
  assert.equal(podeRestaurar({ status: "baixado", valor: 100, valor_pago: 100 }, { id: "b", status: "parcial", valor: 100, valor_pago: 40, observacao: null }), false);
});
