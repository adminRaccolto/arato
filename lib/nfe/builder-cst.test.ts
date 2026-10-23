import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNFe, type NFeInput } from "./builder";

const base = (cst?: string): NFeInput => ({
  emitente: { cpf_cnpj: "17679842949", razao_social: "DIRCEU OGLIARI", ie: "138830525", crt: "3", logradouro: "ROD MT-338", numero: "SN",
    bairro: "ZONA RURAL", municipio_ibge: "5108006", municipio_nome: "Tapurah", uf: "MT", cep: "78573000", ambiente: "homologacao", serie: "1", numero_nfe: 5566 },
  destinatario: { nome: "ARMAZEM TESTE", cpf_cnpj: "05198812000107", ie: "132158159", municipio_ibge: "5105259", municipio_nome: "Lucas do Rio Verde", uf: "MT", cep: "78455000", logradouro: "AV", numero: "1", bairro: "CENTRO" },
  itens: [{ codigo: "0001", descricao: "CONCRIZ VSF", ncm: "38089199", cfop: "5905", unidade: "KG", quantidade: 2, valor_unitario: 246.92, valor_desconto: 63.55, cst_icms: cst }],
  natureza: "REMESSA PARA DEPOSITO", infCpl: "TEXTO DO USUARIO",
});

test("remessa 5905 sem escolha: CST 41 pela regra do CFOP", () => {
  const { xml } = buildNFe(base());
  assert.match(xml, /<ICMS40><orig>0<\/orig><CST>41<\/CST><\/ICMS40>/);
});

test("remessa 5905 com 051 escolhido: sai ICMS51 diferido sobre o valor líquido", () => {
  const { xml } = buildNFe(base("51"));
  assert.match(xml, /<ICMS51><orig>0<\/orig><CST>51<\/CST><modBC>3<\/modBC><vBC>430\.29<\/vBC>/);
  assert.doesNotMatch(xml, /<CST>41<\/CST>/);
  assert.match(xml, /<infCpl>TEXTO DO USUARIO<\/infCpl>/);
});
