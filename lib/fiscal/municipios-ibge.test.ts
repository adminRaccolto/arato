import test from "node:test";
import assert from "node:assert/strict";
import { ibgeDoMunicipio } from "./municipios-ibge.ts";

test("acha o município pela UF e pelo nome, com ou sem acento", () => {
  assert.equal(ibgeDoMunicipio("MT", "NOVA MUTUM"), "5106224");
  assert.equal(ibgeDoMunicipio("mt", "Nova Mutum"), "5106224");
  assert.equal(ibgeDoMunicipio("MT", "Cuiabá"), "5103403");
  assert.equal(ibgeDoMunicipio("MT", "CUIABA"), "5103403");
  assert.equal(ibgeDoMunicipio("SP", "São Paulo"), "3550308");
});

test("cidade de outra UF, nome desconhecido ou vazio não devolvem código", () => {
  assert.equal(ibgeDoMunicipio("SP", "Nova Mutum"), "");
  assert.equal(ibgeDoMunicipio("MT", "Cidade Inexistente"), "");
  assert.equal(ibgeDoMunicipio("", "Nova Mutum"), "");
  assert.equal(ibgeDoMunicipio("MT", ""), "");
});
