import { test } from "node:test";
import assert from "node:assert/strict";
import { numeroDigitado, registrarEdicao, resolverParcela } from "./parcela-edicao.ts";

const P = { valor_parcela: 1100, amortizacao: 1000, juros: 100, despesas_acessorios: 0 };

test("número do campo numérico não perde o decimal (bug: 1234.56 virava 123456)", () => {
  assert.equal(numeroDigitado("1234.56"), 1234.56);
  assert.equal(numeroDigitado("1.234,56"), 1234.56);
  assert.ok(Number.isNaN(numeroDigitado("")));
});

test("editar amortização e juros recalcula o valor da parcela", () => {
  let ed = registrarEdicao(undefined, "amortizacao", "900");
  ed = registrarEdicao(ed, "juros", "150");
  assert.deepEqual(resolverParcela(P, ed), { valor_parcela: 1050, amortizacao: 900, juros: 150, despesas_acessorios: 0 });
});

test("editar valor e amortização recalcula os juros", () => {
  let ed = registrarEdicao(undefined, "valor_parcela", "1200");
  ed = registrarEdicao(ed, "amortizacao", "1000");
  assert.equal(resolverParcela(P, ed).juros, 200);
});

test("editar valor e juros recalcula a amortização", () => {
  let ed = registrarEdicao(undefined, "juros", "300");
  ed = registrarEdicao(ed, "valor_parcela", "1500");
  assert.equal(resolverParcela(P, ed).amortizacao, 1200);
});

test("só um campo: amortização ou juros mexem no valor; valor mexe na amortização", () => {
  assert.equal(resolverParcela(P, registrarEdicao(undefined, "juros", "50")).valor_parcela, 1050);
  assert.equal(resolverParcela(P, registrarEdicao(undefined, "valor_parcela", "1300")).amortizacao, 1200);
});

test("três editados: o mais antigo é o calculado", () => {
  let ed = registrarEdicao(undefined, "valor_parcela", "5000");
  ed = registrarEdicao(ed, "amortizacao", "800");
  ed = registrarEdicao(ed, "juros", "120");
  assert.equal(resolverParcela(P, ed).valor_parcela, 920);
});

test("encargos entram no valor da parcela", () => {
  const p = { ...P, valor_parcela: 1110, despesas_acessorios: 10 };
  assert.equal(resolverParcela(p, registrarEdicao(undefined, "amortizacao", "500")).valor_parcela, 610);
});

test("combinação que dá valor negativo vira erro", () => {
  let ed = registrarEdicao(undefined, "valor_parcela", "100");
  ed = registrarEdicao(ed, "amortizacao", "500");
  assert.ok(resolverParcela(P, ed).erro);
});
