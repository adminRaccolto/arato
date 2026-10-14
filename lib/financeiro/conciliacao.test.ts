import assert from "node:assert/strict";
import test from "node:test";
import { ajustarVinculosParaFk, linhaMudou } from "./conciliacao.ts";

test("título de Empresa (fora de lancamentos) vai só para lancamento_ids e lancamento_id fica nulo", () => {
  const rows = [{ lancamento_id: "emp-1", lancamento_ids: null as string[] | null }];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].lancamento_id, null);
  assert.deepEqual(rows[0].lancamento_ids, ["emp-1"]);
});

test("título do produtor mantém lancamento_id (FK válida)", () => {
  const rows = [{ lancamento_id: "prod-1", lancamento_ids: ["prod-1"] }];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].lancamento_id, "prod-1");
});

test("vários títulos com ids mistos: lancamento_ids existente é preservado", () => {
  const rows = [{ lancamento_id: "emp-1", lancamento_ids: ["emp-1", "prod-1"] }];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].lancamento_id, null);
  assert.deepEqual(rows[0].lancamento_ids, ["emp-1", "prod-1"]);
});

const ex = { valor: 100, conciliado: true, lancamento_id: "a", lancamento_ids: ["a"], lancamento_desc: "d", lancamento_valor: 100 };
const nova = { valor: 100, conciliado: true, lancamento_id: "a", lancamento_ids: ["a"], lancamento_desc: "d", lancamento_valor: 100 };

test("linha idêntica não é regravada; linha nova é", () => {
  assert.equal(linhaMudou(ex, nova, false), false);
  assert.equal(linhaMudou(undefined, nova, false), true);
});

test("mudança de vínculo, de valor ou de conciliado é detectada", () => {
  assert.equal(linhaMudou(ex, { ...nova, conciliado: false }, false), true);
  assert.equal(linhaMudou(ex, { ...nova, lancamento_ids: ["a", "b"] }, false), true);
  assert.equal(linhaMudou(ex, { ...nova, valor: 100.5 }, false), true);
  assert.equal(linhaMudou(ex, { ...nova, lancamento_id: "b" }, false), true);
});

test("ordem dos ids não conta como mudança", () => {
  assert.equal(linhaMudou({ ...ex, lancamento_ids: ["a", "b"] }, { ...nova, lancamento_ids: ["b", "a"] }, false), false);
});

test("origem/confiança só contam quando as colunas novas existem", () => {
  assert.equal(linhaMudou({ ...ex, origem_vinculo: "manual" }, { ...nova, origem_vinculo: "sugestao" }, false), false);
  assert.equal(linhaMudou({ ...ex, origem_vinculo: "manual" }, { ...nova, origem_vinculo: "sugestao" }, true), true);
});
