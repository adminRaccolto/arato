import assert from "node:assert/strict";
import test from "node:test";
import { dataIso } from "./extrair-cedula.ts";

test("data do contrato vira AAAA-MM-DD em qualquer formato comum de cédula", () => {
  assert.equal(dataIso("2026-09-10"), "2026-09-10");
  assert.equal(dataIso("10/09/2026"), "2026-09-10");
  assert.equal(dataIso("10.09.26"), "2026-09-10");
  assert.equal(dataIso("Canarana-MT, 10 de setembro de 2026"), "2026-09-10");
  assert.equal(dataIso("1º de março de 2027".replace("º", "")), "2027-03-01");
  assert.equal(dataIso("31/02/2026"), null);
  assert.equal(dataIso(""), null);
  assert.equal(dataIso(null), null);
});
