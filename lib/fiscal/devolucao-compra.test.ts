import { test } from "node:test";
import assert from "node:assert/strict";
import { ieDaDevolucao, ieDoDestinatarioNoXml, itemDevolvivel, itensDoXmlNfe, municipioDoDestinatarioNoXml, nfsDosTitulos, podeDevolverNf, precoEDescontoDoItem, valoresDaDevolucao } from "./devolucao-compra.ts";

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

const XML_DESC = `<infNFe><det nItem="1"><prod><cProd>A</cProd><xProd>GLIFOSATO 20L</xProd><qCom>10.0000</qCom><vUnCom>100.00</vUnCom><vProd>1000.00</vProd><vDesc>80.00</vDesc></prod><imposto/></det>`
  + `<det nItem="2"><prod><cProd>B</cProd><xProd>ADJUVANTE</xProd><qCom>4.0000</qCom><vProd>200.00</vProd></prod></det></infNFe>`;

test("XML: lê produto, quantidade, valor e desconto de cada <det>", () => {
  assert.deepEqual(itensDoXmlNfe(XML_DESC), [
    { xProd: "GLIFOSATO 20L", qCom: 10, vProd: 1000, vDesc: 80 },
    { xProd: "ADJUVANTE", qCom: 4, vProd: 200, vDesc: 0 },
  ]);
  assert.deepEqual(itensDoXmlNfe(null), []);
});

test("desconto por item vem do XML: valor cheio do produto e líquido descontado", () => {
  const itens = [
    { id: "b", descricao_produto: "Adjuvante X", descricao_nf: "ADJUVANTE", quantidade: 4, valor_total: 200 },
    { id: "a", descricao_produto: "Glifosato", descricao_nf: "GLIFOSATO 20L", quantidade: 10, valor_total: 1000 },
  ];
  const v = valoresDaDevolucao(itens, { valor_total: 1120, valor_desconto: 80 }, itensDoXmlNfe(XML_DESC));
  assert.equal(v.fonte, "xml");
  assert.equal(v.descontoNf, 80);
  assert.equal(v.porItem.a.unitBruto, 100);
  assert.equal(v.porItem.a.unitLiquido, 92);
  assert.equal(v.porItem.b.unitBruto, 50);
  assert.equal(v.porItem.b.unitLiquido, 50);
});

test("sem XML: rateia o desconto do cabeçalho pelo valor de cada item", () => {
  const itens = [{ id: "a", descricao_produto: "A", quantidade: 10, valor_total: 750 }, { id: "b", descricao_produto: "B", quantidade: 5, valor_total: 250 }];
  const v = valoresDaDevolucao(itens, { valor_total: 900, valor_desconto: 100 }, []);
  assert.equal(v.fonte, "cabecalho");
  assert.equal(v.porItem.a.unitBruto, 75);
  assert.equal(v.porItem.a.unitLiquido, 67.5);
  assert.equal(v.porItem.b.unitLiquido, 45);
});

test("sem desconto informado e NF abaixo da soma: a diferença vira desconto; acréscimo fica no preço", () => {
  const itens = [{ id: "a", descricao_produto: "A", quantidade: 10, valor_total: 1000 }];
  const menor = valoresDaDevolucao(itens, { valor_total: 950 }, null);
  assert.equal(menor.fonte, "total");
  assert.equal(menor.porItem.a.unitBruto, 100);
  assert.equal(menor.porItem.a.unitLiquido, 95);
  const maior = valoresDaDevolucao(itens, { valor_total: 1050 }, null);
  assert.equal(maior.fonte, "nenhum");
  assert.equal(maior.fatorAcrescimo, 1.05);
  assert.equal(maior.porItem.a.unitBruto, maior.porItem.a.unitLiquido);
});

test("item que não casa com o XML: usa o desconto do cabeçalho", () => {
  const itens = [{ id: "a", descricao_produto: "A", quantidade: 10, valor_total: 999 }];
  assert.equal(valoresDaDevolucao(itens, { valor_total: 900, valor_desconto: 99 }, itensDoXmlNfe(XML_DESC)).fonte, "cabecalho");
});

test("item da NF-e de devolução: valor cheio + desconto fechando no líquido", () => {
  assert.deepEqual(precoEDescontoDoItem(3, 100, 276), { valor_unitario: 100, valor_desconto: 24 });
  assert.deepEqual(precoEDescontoDoItem(3, 50, 150), { valor_unitario: 50, valor_desconto: 0 });
  // devolução parcial com centavos: vProd − vDesc = líquido exato
  const r = precoEDescontoDoItem(7, 33.333333, 7 * 30.111111);
  assert.equal(Math.round((Math.round(7 * r.valor_unitario * 100) / 100 - r.valor_desconto) * 100) / 100, Math.round(7 * 30.111111 * 100) / 100);
});
