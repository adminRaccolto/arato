import test from "node:test";
import assert from "node:assert/strict";
import { ehModelo, ligacoesDePai, operacoesFaltando } from "./sincronizar.ts";

test("modelo do sistema não tem fazenda nem cliente; operação de cliente não é modelo", () => {
  assert.equal(ehModelo({ fazenda_id: null, conta_id: null }), true);
  assert.equal(ehModelo({ fazenda_id: null, conta_id: "c1" }), false);
  assert.equal(ehModelo({ fazenda_id: "f1", conta_id: null }), false);
});

test("sincronizar só traz o código que falta no cliente", () => {
  const modelos = [{ id: "m1", classificacao: "1" }, { id: "m2", classificacao: "1.01" }, { id: "m3", classificacao: "2" }];
  assert.deepEqual(operacoesFaltando(modelos, ["1", "2", "9.99"]).map(m => m.classificacao), ["1.01"]);
  assert.equal(operacoesFaltando(modelos, ["1", "1.01", "2"]).length, 0);
});

test("o pai da operação nova é a operação do cliente com o código do pai do modelo", () => {
  const modelos = [{ id: "m1", classificacao: "1" }, { id: "m2", classificacao: "1.01", parent_id: "m1" }];
  const noCliente = new Map([["1", "c1"], ["1.01", "c2"]]);
  assert.deepEqual(ligacoesDePai([modelos[1]], modelos, noCliente), [{ id: "c2", parent_id: "c1" }]);
  assert.deepEqual(ligacoesDePai([modelos[1]], modelos, new Map([["1.01", "c2"]])), []);
});
