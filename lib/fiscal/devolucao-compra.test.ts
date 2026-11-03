import { test } from "node:test";
import assert from "node:assert/strict";
import { itemDevolvivel, nfsDosTitulos, podeDevolverNf } from "./devolucao-compra.ts";

test("entrega de entrega futura pode ser devolvida; simples faturamento não", () => {
  assert.equal(podeDevolverNf("remessa"), true);
  assert.equal(podeDevolverNf("insumos"), true);
  assert.equal(podeDevolverNf("vef"), false);
  assert.equal(podeDevolverNf(null), false);
});

test("item da entrega entra na devolução; item de VEF e item sem produto não", () => {
  assert.equal(itemDevolvivel({ insumo_id: "i", tipo_apropiacao: "remessa" }), true);
  assert.equal(itemDevolvivel({ insumo_id: "i", tipo_apropiacao: "estoque" }), true);
  assert.equal(itemDevolvivel({ tipo_apropiacao: "direto" }), true);
  assert.equal(itemDevolvivel({ insumo_id: "i", tipo_apropiacao: "vef" }), false);
  assert.equal(itemDevolvivel({ tipo_apropiacao: "remessa" }), false);
});

test("títulos a abater: a NF e os faturamentos ligados, sem repetir", () => {
  assert.deepEqual(nfsDosTitulos("r", [{ vef_nf_entrada_id: "v1" }, { vef_nf_entrada_id: "v1" }, { vef_nf_entrada_id: null }]), ["r", "v1"]);
  assert.deepEqual(nfsDosTitulos("n", []), ["n"]);
});
