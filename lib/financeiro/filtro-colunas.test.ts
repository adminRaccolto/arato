import test from "node:test";
import assert from "node:assert/strict";
import { casaFiltroTexto, casaFiltroNumero } from "./filtro-colunas.ts";

test("texto ignora acento e caixa", () => {
  assert.ok(casaFiltroTexto("Adubação Tropical", "adubacao"));
  assert.ok(!casaFiltroTexto("Soja", "milho"));
  assert.ok(casaFiltroTexto("qualquer", ""));
});
test("número exato, maior, menor e faixa", () => {
  assert.ok(casaFiltroNumero(1500.5, "1.500,50"));
  assert.ok(casaFiltroNumero(1500, "1500"));
  assert.ok(!casaFiltroNumero(1500, "1600"));
  assert.ok(casaFiltroNumero(2000, ">1000"));
  assert.ok(!casaFiltroNumero(500, ">1000"));
  assert.ok(casaFiltroNumero(500, "<1000"));
  assert.ok(casaFiltroNumero(1500, "1000-2000"));
  assert.ok(!casaFiltroNumero(2500, "1000-2000"));
});
test("valor ausente não passa filtro numérico preenchido", () => {
  assert.ok(!casaFiltroNumero(null, "10"));
  assert.ok(casaFiltroNumero(null, ""));
});
