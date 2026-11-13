import { test } from "node:test";
import assert from "node:assert/strict";
import { cfopRetornoSugerido, finalidadeRetorno, infCplRetorno, itensDoRetorno, lerXmlDevolucao, prazoCancelamento, totalDosItens, validarRecusa, valorInformado } from "./recusa-devolucao.ts";

const XML = `<nfeProc><NFe><infNFe><ide><natOp>Devolução de Compra</natOp></ide>
<emit><CPF>06368435640</CPF><xNome>Produtor</xNome></emit>
<dest><CNPJ>14865100000195</CNPJ><xNome>CANARANA COMERCIO</xNome><enderDest><xLgr>NAO INFORMADO</xLgr><nro>S/N</nro><xBairro>NAO INFORMADO</xBairro><cMun>5102702</cMun><xMun>MT</xMun><UF>MT</UF><CEP>00000000</CEP></enderDest><indIEDest>2</indIEDest></dest>
<det nItem="1"><prod><xProd>SUP ESTICADOR</xProd><NCM>84099999</NCM><CFOP>5411</CFOP><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>547.3672206859</vUnCom><vProd>1094.73</vProd><vDesc>94.73</vDesc></prod>
<imposto><ICMS><ICMS51><orig>0</orig><CST>51</CST><vBC>1000.00</vBC><pICMS>12.00</pICMS></ICMS51></ICMS></imposto></det>
<det nItem="2"><prod><xProd>OLEO</xProd><NCM>27101932</NCM><CFOP>5556</CFOP><uCom>L</uCom><qCom>10.0000</qCom><vUnCom>20</vUnCom><vProd>200.00</vProd></prod>
<imposto><ICMS><ICMS20><orig>0</orig><CST>20</CST><pRedBC>41.1800</pRedBC><vBC>117.64</vBC><pICMS>17.00</pICMS></ICMS20></ICMS></imposto></det>
</infNFe></NFe><protNFe><infProt><chNFe>5126</chNFe><dhRecbto>2026-11-11T16:01:10-04:00</dhRecbto><nProt>1512</nProt></infProt></protNFe></nfeProc>`;

test("lê fornecedor, itens com ICMS e hora da autorização do XML da devolução", () => {
  const r = lerXmlDevolucao(XML);
  assert.equal(r.autorizadaEm, "2026-11-11T16:01:10-04:00");
  assert.deepEqual(r.dest, { nome: "CANARANA COMERCIO", cpf_cnpj: "14865100000195", ie: undefined, logradouro: undefined, numero: "S/N", bairro: undefined, municipio_ibge: "5102702", municipio_nome: undefined, uf: "MT", cep: undefined });
  assert.equal(r.itens.length, 2);
  assert.deepEqual(r.itens[0], { descricao: "SUP ESTICADOR", ncm: "84099999", cfop: "5411", unidade: "UN", quantidade: 2, valor_unitario: 547.3672206859, valor_desconto: 94.73, valor_produto: 1094.73, cst: "51", pICMS: 12, pRedBC: null });
  assert.equal(r.itens[1].pRedBC, 41.18);
  assert.equal(totalDosItens(r.itens), 1200);
  assert.deepEqual(lerXmlDevolucao(""), { dest: null, itens: [], autorizadaEm: null });
});

test("endereço genérico conta como não informado", () => {
  assert.equal(valorInformado("NAO INFORMADO"), undefined);
  assert.equal(valorInformado("Não informado"), undefined);
  assert.equal(valorInformado("00000000"), undefined);
  assert.equal(valorInformado("78640000"), "78640000");
  assert.equal(valorInformado("Rua 1"), "Rua 1");
});

test("prazo de cancelamento: 24 horas da autorização", () => {
  const aut = "2026-11-11T16:01:10-04:00";
  assert.equal(prazoCancelamento(aut, new Date("2026-11-12T15:00:00-04:00")).dentro, true);
  assert.equal(prazoCancelamento(aut, new Date("2026-11-12T16:01:11-04:00")).dentro, false);
  assert.equal(prazoCancelamento(aut).limite?.toISOString(), "2026-11-12T20:01:10.000Z");
  assert.deepEqual(prazoCancelamento(null), { dentro: false, limite: null });
});

test("CFOP sugerido e finalidade do retorno", () => {
  assert.equal(cfopRetornoSugerido("5.202"), "1949");
  assert.equal(cfopRetornoSugerido("6202"), "2949");
  assert.equal(finalidadeRetorno("1949"), "1");
  assert.equal(finalidadeRetorno("1.202"), "4");
  assert.equal(finalidadeRetorno("2411"), "4");
});

test("itens do retorno repetem valores, desconto e ICMS da devolução com o CFOP de entrada", () => {
  const { itens, erro } = itensDoRetorno(lerXmlDevolucao(XML).itens, "1.949");
  assert.equal(erro, null);
  assert.deepEqual(itens[0], { descricao: "SUP ESTICADOR", ncm: "84099999", cfop: "1949", unidade: "UN", quantidade: 2, valor_unitario: 547.3672206859, valor_desconto: 94.73, cst_icms: "51", pICMS: 12 });
  assert.deepEqual(itens[1], { descricao: "OLEO", ncm: "27101932", cfop: "1949", unidade: "L", quantidade: 10, valor_unitario: 20, cst_icms: "20", pICMS: 17, pRedBC: 41.18 });
  const semCst = itensDoRetorno([{ ...lerXmlDevolucao(XML).itens[0], cst: "90" }], "1949");
  assert.match(semCst.erro ?? "", /CST 90/);
});

test("validação e texto complementar", () => {
  assert.match(validarRecusa({ motivo: "curto", cfop: "1949" }) ?? "", /motivo/);
  assert.match(validarRecusa({ motivo: "Fornecedor recusou o produto", cfop: "5949" }) ?? "", /entrada/);
  assert.equal(validarRecusa({ motivo: "Fornecedor recusou o produto", cfop: "1.949" }), null);
  assert.match(infCplRetorno({ numero: "3", serie: "923", chave: "5126", motivo: " Sem pedido ", destinatario: "CANARANA" }), /devolucao 3\/923 \(chave 5126\), recusada por CANARANA\. Motivo da recusa: Sem pedido$/);
});
