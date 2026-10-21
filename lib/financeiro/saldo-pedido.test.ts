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

test("pedido em dólar: NFs em reais convertidas pela PTAX do dia de cada uma", async () => {
  const { totalNfsNaMoeda } = await import("./saldo-pedido.ts");
  const ptax = async (d: string) => (d === "2026-10-20" ? 5.0 : d === "2026-10-21" ? 4.0 : null);
  assert.equal(await totalNfsNaMoeda([{ valor_total: 10000, data_emissao: "2026-10-20" }, { valor_total: 4000, data_emissao: "2026-10-21" }], "USD", ptax), 3000);
  assert.equal(await totalNfsNaMoeda([{ valor_total: 10000, data_emissao: "2026-10-20" }], "BRL", ptax), 10000);
  assert.equal(await totalNfsNaMoeda([{ valor_total: 10000, data_emissao: "2026-01-01" }], "USD", ptax), null);
});
