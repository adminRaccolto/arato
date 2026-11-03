import { test } from "node:test";
import assert from "node:assert/strict";
import { ieDaDevolucao, ieDoDestinatarioNoXml, itemDevolvivel, municipioDoDestinatarioNoXml, nfsDosTitulos, podeDevolverNf } from "./devolucao-compra.ts";

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

test("IE do comprador vem do bloco do destinatário, não do emitente", () => {
  const xml = "<emit><CNPJ>1</CNPJ><IE>111</IE></emit><dest><CPF>2</CPF><xNome>F</xNome><enderDest><UF>MT</UF></enderDest><indIEDest>1</indIEDest><IE>133663310</IE></dest><det/>";
  assert.equal(ieDoDestinatarioNoXml(xml), "133663310");
  assert.equal(ieDoDestinatarioNoXml("<emit><IE>111</IE></emit><dest><CPF>2</CPF></dest><det><IE>9</IE></det>"), null);
  assert.equal(ieDoDestinatarioNoXml(null), null);
});

test("IE da devolução: a da origem; senão a única; com várias, não adivinha", () => {
  const ies = [{ ie: "133663310" }, { ie: "132997460" }];
  assert.equal(ieDaDevolucao(ies, "13.299.746-0")?.ie, "132997460");
  assert.equal(ieDaDevolucao(ies, null), null);
  assert.equal(ieDaDevolucao(ies, "999"), null);
  assert.equal(ieDaDevolucao([ies[0]], null)?.ie, "133663310");
});

test("sem IE na nota, usa o município do comprador; ambíguo, não adivinha", () => {
  const ies = [{ ie: "133663310", municipio: "Canarana" }, { ie: "132997460", municipio: "Campinapolis" }];
  const xml = "<emit><xMun>SINOP</xMun></emit><dest><CPF>2</CPF><enderDest><xMun>CANARANA</xMun></enderDest><indIEDest>9</indIEDest></dest>";
  assert.equal(municipioDoDestinatarioNoXml(xml), "CANARANA");
  assert.equal(ieDaDevolucao(ies, null, "CANARANA")?.ie, "133663310");
  assert.equal(ieDaDevolucao(ies, null, "Campinápolis")?.ie, "132997460");
  assert.equal(ieDaDevolucao([...ies, { ie: "1", municipio: "Canarana" }], null, "Canarana"), null);
  assert.equal(ieDaDevolucao(ies, null, "Sorriso"), null);
});
