import assert from "node:assert/strict";
import test from "node:test";
import { saldoDoPedido } from "./saldo-pedido.ts";

test("saldo = total do pedido menos as NFs processadas", () => {
  assert.equal(saldoDoPedido(100000, 30000), 70000);
  assert.equal(saldoDoPedido(100000, 0), 100000);
});

test("NFs que cobrem ou passam o pedido zeram o saldo (nunca negativo)", () => {
  assert.equal(saldoDoPedido(8400, 8400), 0);
  assert.equal(saldoDoPedido(46500, 241758.15), 0);
});

test("arredonda em centavos", () => {
  assert.equal(saldoDoPedido(100, 33.33), 66.67);
});
