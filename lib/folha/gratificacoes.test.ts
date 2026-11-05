import { test } from "node:test";
import assert from "node:assert/strict";
import { descontoNoSalario } from "./gratificacoes.ts";

test("adiantamento de salário e registro antigo continuam descontando o valor integral", () => {
  assert.equal(descontoNoSalario({ valor: 700 }), 700);
  assert.equal(descontoNoSalario({ valor: 700, descontado_gratificacao_cp: 0 }), 700);
});

test("adiantamento abatido da gratificação no CP não é descontado novamente no salário", () => {
  assert.equal(descontoNoSalario({ valor: 700, descontado_gratificacao_cp: 700 }), 0);
  assert.equal(descontoNoSalario({ valor: 1000, descontado_gratificacao_cp: 700 }), 300);
  assert.equal(descontoNoSalario({ valor: 10.13, descontado_gratificacao_cp: 10.12 }), 0.01);
});
