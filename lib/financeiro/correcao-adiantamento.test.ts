import { test } from "node:test";
import assert from "node:assert/strict";
import { acaoSalario, efeitosCorrecao } from "./correcao-adiantamento.ts";

const A = { funcionario_id: "a", competencia: "2026-10", valor: 700 };

test("valor corrigido na mesma folha: só a diferença", () => {
  assert.deepEqual(efeitosCorrecao(A, { ...A, valor: 800 }), [{ funcionario_id: "a", competencia: "2026-10", delta: 100 }]);
  assert.deepEqual(efeitosCorrecao(A, { ...A, valor: 500 }), [{ funcionario_id: "a", competencia: "2026-10", delta: -200 }]);
  assert.deepEqual(efeitosCorrecao(A, A), []);
});

test("funcionário ou competência errada: sai de uma folha e entra na outra", () => {
  assert.deepEqual(efeitosCorrecao(A, { ...A, funcionario_id: "b" }), [
    { funcionario_id: "a", competencia: "2026-10", delta: -700 },
    { funcionario_id: "b", competencia: "2026-10", delta: 700 },
  ]);
  assert.deepEqual(efeitosCorrecao(A, { ...A, competencia: "2026-11", valor: 500 }), [
    { funcionario_id: "a", competencia: "2026-10", delta: -700 },
    { funcionario_id: "a", competencia: "2026-11", delta: 500 },
  ]);
});

test("salário em aberto atualiza; pago nunca muda: gera diferença ou desconto", () => {
  assert.equal(acaoSalario(100, false), "atualizar");
  assert.equal(acaoSalario(-100, false), "atualizar");
  assert.equal(acaoSalario(100, true), "descontar");
  assert.equal(acaoSalario(-100, true), "pagar_diferenca");
  assert.equal(acaoSalario(0, true), "nada");
});
