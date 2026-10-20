import test from "node:test";
import assert from "node:assert/strict";
import { planejarLimpeza, type NfDup } from "./dedup-nf.ts";

const CH = "35" + "1".repeat(42);
const nf = (id: string, extra: Partial<NfDup> = {}): NfDup => ({ id, numero: "100", serie: "1", chave_acesso: CH, emitente_cnpj: "11.222.333/0001-44", fazenda_id: "f1", created_at: `2026-10-0${id.slice(-1)}T10:00:00Z`, status: "pendente", ...extra });
const conta = new Set(["f1", "f2"]);

test("duas cópias pendentes sem vínculo: remove a mais nova, mantém a mais antiga", () => {
  const r = planejarLimpeza([nf("a1"), nf("a2")], new Set(), conta);
  assert.deepEqual(r.remover, ["a2"]); assert.equal(r.gruposDuplicados, 1);
});
test("processada nunca é removida e a pendente (de outra origem) sai", () => {
  const r = planejarLimpeza([nf("a1"), nf("a2", { status: "processada" })], new Set(), conta);
  assert.deepEqual(r.remover, ["a1"]);
});
test("duas processadas: nada é removido", () => {
  const r = planejarLimpeza([nf("a1", { status: "processada" }), nf("a2", { status: "processada" })], new Set(), conta);
  assert.deepEqual(r.remover, []);
});
test("cópia pendente com título vinculado fica", () => {
  const r = planejarLimpeza([nf("a1"), nf("a2")], new Set(["a2"]), conta);
  assert.deepEqual(r.remover, ["a1"]); // a2 (com vínculo) é a mantida; a1 sem vínculo sai
  const r2 = planejarLimpeza([nf("a1", { status: "processada" }), nf("a2")], new Set(["a2"]), conta);
  assert.deepEqual(r2.remover, []); assert.equal(r2.mantidasPorVinculo, 1);
});
test("cópia em fazenda órfã (fora da conta) é a que sai", () => {
  const r = planejarLimpeza([nf("a1", { fazenda_id: "orfa" }), nf("a2")], new Set(), conta);
  assert.deepEqual(r.remover, ["a1"]);
});
test("sem chave: mesmo número + série + CNPJ do fornecedor é duplicada", () => {
  const r = planejarLimpeza([nf("a1", { chave_acesso: null }), nf("a2", { chave_acesso: null })], new Set(), conta);
  assert.deepEqual(r.remover, ["a2"]);
});
test("cópia sem chave junta com a que tem chave pelo número + série + CNPJ", () => {
  const r = planejarLimpeza([nf("a1"), nf("a2", { chave_acesso: null })], new Set(), conta);
  assert.deepEqual(r.remover, ["a2"]);
});
test("números iguais de fornecedores diferentes não são duplicata", () => {
  const r = planejarLimpeza([nf("a1", { chave_acesso: null }), nf("a2", { chave_acesso: null, emitente_cnpj: "99.888.777/0001-66" })], new Set(), conta);
  assert.deepEqual(r.remover, []);
});
test("duas chaves diferentes com mesmo número não são duplicata (NF corrigida)", () => {
  const r = planejarLimpeza([nf("a1"), nf("a2", { chave_acesso: "35" + "2".repeat(42) })], new Set(), conta);
  assert.deepEqual(r.remover, []);
});
