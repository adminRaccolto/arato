import assert from "node:assert/strict";
import test from "node:test";
import { casarSubstitutas, momentoDoCancelamento } from "./nf-substituta.ts";

const nf = (id: string, emissao: string, valor: number, extra: Partial<{ cnpj: string; status: string; chave: string }> = {}) =>
  ({ id, cnpj: extra.cnpj ?? "12.345.678/0001-90", numero: id, emissao, valor, status: extra.status ?? "pendente", chave: extra.chave ?? null });

test("acha a substituta do mesmo emitente, depois da cancelada e com valor parecido", () => {
  const m = casarSubstitutas([nf("c1", "2026-10-01", 1000)], [nf("s1", "2026-10-03", 1020, { cnpj: "12345678000190" }), nf("x", "2026-10-02", 5000)]);
  assert.equal(m.get("c1")?.id, "s1");
});

test("sem substituta: outro emitente, emitida antes, valor muito diferente, cancelada ou fora do prazo", () => {
  const m = casarSubstitutas([nf("c1", "2026-10-01", 1000)], [
    nf("a", "2026-10-02", 1000, { cnpj: "99.999.999/0001-99" }),
    nf("b", "2026-09-30", 1000),
    nf("c", "2026-10-02", 1500),
    nf("d", "2026-10-02", 1000, { status: "cancelada" }),
    nf("e", "2027-02-01", 1000),
  ]);
  assert.equal(m.size, 0);
});

test("cada substituta vale para uma cancelada só; valor mais próximo ganha", () => {
  const m = casarSubstitutas([nf("c1", "2026-10-01", 1000), nf("c2", "2026-10-02", 1000)], [nf("s1", "2026-10-05", 1000), nf("s2", "2026-10-06", 990)]);
  assert.equal(m.get("c1")?.id, "s1");
  assert.equal(m.get("c2")?.id, "s2");
});

test("cancelamento antes ou depois da entrada", () => {
  assert.equal(momentoDoCancelamento("2026-10-01T10:00:00-04:00", "2026-10-02T12:00:00Z"), "antes");
  assert.equal(momentoDoCancelamento("2026-10-05T10:00:00-04:00", "2026-10-02T12:00:00Z"), "depois");
  assert.equal(momentoDoCancelamento("", "2026-10-02"), null);
});
