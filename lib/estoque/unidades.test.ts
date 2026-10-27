import assert from "node:assert/strict";
import test from "node:test";
import { fatorUnidade, unidadePadrao } from "./unidades.ts";

test("grafias da mesma unidade viram uma só", () => {
  assert.equal(unidadePadrao("LT"), "l");
  assert.equal(unidadePadrao(" Ton "), "t");
  assert.equal(unidadePadrao("KG"), "kg");
  assert.equal(unidadePadrao("bombona"), "bombona");
});

test("conversão só quando é segura", () => {
  assert.equal(fatorUnidade("t", "kg"), 1000);
  assert.equal(fatorUnidade("kg", "t"), 0.001);
  assert.equal(fatorUnidade("lt", "L"), 1);
  assert.equal(fatorUnidade("mL", "l"), 0.001);
  assert.equal(fatorUnidade("bag", "kg"), null);
  assert.equal(fatorUnidade("kg", "l"), null);
  assert.equal(fatorUnidade("un", "l"), null);
  assert.equal(fatorUnidade("", "kg"), null);
});
