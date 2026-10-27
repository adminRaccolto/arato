import assert from "node:assert/strict";
import test from "node:test";
import { alocarEntregaPorLinha, linhasSemConversao, statusPorEntrega } from "./entrega-pedido.ts";

test("NF em kg não soma em linha pedida em bag (sem conversão segura)", () => {
  const linhas = [{ id: "l1", insumo_id: "olimpo", quantidade: 97, unidade: "bag" }];
  const nf = [{ insumo_id: "olimpo", pedido_item_id: "l1", quantidade: 71520, unidade: "kg" }];
  assert.equal(alocarEntregaPorLinha(linhas, nf).get("l1"), 0);
  assert.equal(linhasSemConversao(linhas, nf).get("l1"), "kg");
});

test("t ↔ kg e lt ↔ L convertem", () => {
  const linhas = [{ id: "l1", insumo_id: "calc", quantidade: 30, unidade: "t" }, { id: "l2", insumo_id: "glif", quantidade: 100, unidade: "lt" }];
  const nf = [{ insumo_id: "calc", quantidade: 12000, unidade: "kg" }, { insumo_id: "glif", pedido_item_id: "l2", quantidade: 40, unidade: "L" }];
  const e = alocarEntregaPorLinha(linhas, nf);
  assert.equal(e.get("l1"), 12);
  assert.equal(e.get("l2"), 40);
  assert.equal(linhasSemConversao(linhas, nf).size, 0);
});

test("sem unidade informada mantém o comportamento antigo; vínculo exato antes do preenchimento em ordem", () => {
  const linhas = [{ id: "a", insumo_id: "x", quantidade: 10 }, { id: "b", insumo_id: "x", quantidade: 10 }];
  const e = alocarEntregaPorLinha(linhas, [{ insumo_id: "x", pedido_item_id: "b", quantidade: 4 }, { insumo_id: "x", quantidade: 15 }]);
  assert.equal(e.get("b"), 9);
  assert.equal(e.get("a"), 10);
});

test("pedido com NF processada não volta para aprovado", () => {
  const linhas = [{ id: "l1", quantidade: 97 }];
  assert.equal(statusPorEntrega(linhas, new Map([["l1", 0]]), true), "parcialmente_entregue");
  assert.equal(statusPorEntrega(linhas, new Map([["l1", 0]]), false), "aprovado");
  assert.equal(statusPorEntrega(linhas, new Map([["l1", 97]]), true), "entregue");
});
