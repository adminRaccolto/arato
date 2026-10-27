import assert from "node:assert/strict";
import test from "node:test";
import { LC116, codigoLC116 } from "./lc116.ts";

test("lista da LC 116 sem código repetido e com serviços médicos", () => {
  assert.equal(new Set(LC116.map(c => c.codigo)).size, LC116.length);
  assert.ok(LC116.some(c => c.codigo === "4.01" && /Medicina/.test(c.descricao)));
  assert.ok(LC116.length > 190);
});
test("código da prefeitura/SIEG em outro formato casa com o item da lista", () => {
  assert.equal(codigoLC116("04.02.01"), "4.02");
  assert.equal(codigoLC116("14.01"), "14.01");
  assert.equal(codigoLC116("7.01"), "7.01");
  assert.equal(codigoLC116("11,05"), "11.05");
  assert.equal(codigoLC116("4.22"), "4.22");
  assert.equal(codigoLC116("130501"), "13.05");
  assert.equal(codigoLC116("0701"), "7.01");
  assert.equal(codigoLC116("FGTS A RECOLHER"), null);
  assert.equal(codigoLC116("103"), "1.03");
  assert.equal(codigoLC116(""), null);
});
