import test from "node:test";
import assert from "node:assert/strict";
import { mesmaNfse, planejarLimpezaNfse, type NfseDup } from "./dedup-nfse.ts";

const n = (id: string, x: Partial<NfseDup> = {}): NfseDup => ({ id, fazenda_id: "f1", numero_nf: "1064", serie: null, prestador_cnpj: "12.345.678/0001-90", data_prestacao: "2026-09-10", status: "pendente", created_at: `2026-09-1${id.slice(-1)}T10:00:00Z`, ...x });
const conta = new Set(["f1", "f2"]);

test("mesmo número e prestador, CNPJ com e sem pontuação: é a mesma nota", () => {
  assert.ok(mesmaNfse(n("a1"), n("a2", { prestador_cnpj: "12345678000190" })));
});
test("fazendas diferentes da conta não impedem a identificação", () => {
  assert.ok(mesmaNfse(n("a1"), n("a2", { fazenda_id: "f2" })));
});
test("data digitada errada por alguns dias ainda é a mesma nota; um ano depois não", () => {
  assert.ok(mesmaNfse(n("a1"), n("a2", { data_prestacao: "2026-09-14" })));
  assert.ok(!mesmaNfse(n("a1"), n("a2", { data_prestacao: "2027-09-10" })));
});
test("zeros à esquerda no número são ignorados", () => {
  assert.ok(mesmaNfse(n("a1"), n("a2", { numero_nf: "001064" })));
});
test("prestadores diferentes não são a mesma nota; a série é ignorada (SIEG grava NFS, a tela sugere 1)", () => {
  assert.ok(!mesmaNfse(n("a1"), n("a2", { prestador_cnpj: "99.888.777/0001-66" })));
  assert.ok(mesmaNfse(n("a1", { serie: "NFS" }), n("a2", { serie: "1" })));
});
test("sem CNPJ do prestador não dá para afirmar duplicidade", () => {
  assert.ok(!mesmaNfse(n("a1", { prestador_cnpj: null }), n("a2", { prestador_cnpj: null })));
});
test("cancelada não conta", () => {
  assert.ok(!mesmaNfse(n("a1"), n("a2", { status: "cancelada" })));
});
test("limpeza: mantém a processada, remove a pendente; nunca remove processada", () => {
  const r = planejarLimpezaNfse([n("a1"), n("a2", { status: "processada" })], conta);
  assert.deepEqual(r.remover, ["a1"]);
  const r2 = planejarLimpezaNfse([n("a1", { status: "processada" }), n("a2", { status: "processada" })], conta);
  assert.deepEqual(r2.remover, []);
});
test("limpeza: cópia pendente com título vinculado fica", () => {
  const r = planejarLimpezaNfse([n("a1", { status: "processada" }), n("a2", { lancamento_id: "L1" })], conta);
  assert.deepEqual(r.remover, []); assert.equal(r.mantidasPorVinculo, 1);
});
test("limpeza: pendentes iguais em fazendas da conta, fica a mais antiga", () => {
  const r = planejarLimpezaNfse([n("a1"), n("a2", { fazenda_id: "f2" }), n("a3")], conta);
  assert.deepEqual(r.remover.sort(), ["a2", "a3"]);
});
