import test from "node:test";
import assert from "node:assert/strict";
import { situacaoUsoAdiantamento } from "./usar-adiantamento";

test("adiantamento com título em aberto abate o próprio título, até o menor saldo", () => {
  assert.deepEqual(situacaoUsoAdiantamento({ valor: 1000, valor_aplicado_cp: 600, status: "pendente" }, { status: "em_aberto", valor: 400 }),
    { modo: "abate_adiantamento", disponivel: 400, bloqueio: null });
  // parte já paga em dinheiro: só o que está em aberto pode ser usado
  assert.equal(situacaoUsoAdiantamento({ valor: 1000, status: "pendente" }, { status: "parcial", valor: 1000, valor_pago: 300 }).disponivel, 700);
});

test("adiantamento antigo, já pago, quita a conta escolhida", () => {
  assert.deepEqual(situacaoUsoAdiantamento({ valor: 1000, valor_aplicado_cp: 250, status: "descontado" }, { status: "baixado", valor: 1000, valor_pago: 1000 }),
    { modo: "quita_conta", disponivel: 750, bloqueio: null });
  assert.equal(situacaoUsoAdiantamento({ valor: 500, status: "pendente" }, null).modo, "quita_conta");
});

test("bloqueios: borderô, sem saldo, cancelado", () => {
  assert.match(situacaoUsoAdiantamento({ valor: 1000, status: "pendente" }, { status: "em_aberto", valor: 1000, lote_id: "x" }).bloqueio!, /borderô/);
  assert.match(situacaoUsoAdiantamento({ valor: 1000, valor_aplicado_cp: 1000, status: "pendente" }, { status: "cancelado", valor: 0 }).bloqueio!, /saldo/);
  assert.match(situacaoUsoAdiantamento({ valor: 1000, status: "cancelado" }, null).bloqueio!, /não disponível/);
});
