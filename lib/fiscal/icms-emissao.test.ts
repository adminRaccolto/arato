import test from "node:test";
import assert from "node:assert/strict";
import { icmsDaEmissao, OPCOES_CST_EMISSAO } from "./icms-emissao";
import { buildNFe, type NFeInput } from "../nfe/builder";
import { montarRascunhoDuplicado } from "./duplicar-nota";

const campos = { cfop: "5.101", cst_icms: "", aliq_icms: "", red_bc: "" };
const base: NFeInput = {
  emitente: { cpf_cnpj: "52998224725", razao_social: "PRODUTOR TESTE", ie: "123456789", crt: "3", logradouro: "ESTRADA", numero: "SN", bairro: "ZONA RURAL", municipio_ibge: "5108006", municipio_nome: "Tapurah", uf: "MT", cep: "78573000", ambiente: "homologacao", serie: "1", numero_nfe: 1 },
  destinatario: { nome: "DESTINATARIO TESTE", cpf_cnpj: "11222333000181", ie: "123456789", municipio_ibge: "5108006", municipio_nome: "Tapurah", uf: "MT", cep: "78573000" },
  itens: [{ codigo: "1", descricao: "SOJA", ncm: "12019000", cfop: "5101", unidade: "KG", quantidade: 1, valor_unitario: 100 }], natureza: "VENDA",
};

test("CST manual altera XML de venda; Automático mantém o CFOP", () => {
  assert.deepEqual(icmsDaEmissao(campos), {});
  assert.match(buildNFe(base).xml, /<CST>51<\/CST>/);
  for (const o of OPCOES_CST_EMISSAO) {
    const dados = icmsDaEmissao({ ...campos, cst_icms: o.v, aliq_icms: "17", red_bc: "40" });
    const { xml } = buildNFe({ ...base, itens: base.itens.map(i => ({ ...i, ...dados })) });
    assert.match(xml, new RegExp(`<CST>${o.v.slice(-2)}</CST>`));
    assert.equal(dados.cst_icms_manual, true);
    if (o.v === "000") assert.match(xml, /<vICMS>17.00<\/vICMS>/);
    if (o.v === "020") { assert.match(xml, /<vBC>60.00<\/vBC>/); assert.match(xml, /<vICMS>10.20<\/vICMS>/); }
  }
});

test("alíquota zero é preservada e campos de outra escolha não vazam", () => {
  assert.equal(icmsDaEmissao({ ...campos, cst_icms: "000", aliq_icms: "0" }).pICMS, 0);
  assert.deepEqual(icmsDaEmissao({ ...campos, cst_icms: "040", aliq_icms: "17", red_bc: "40" }), { cst_icms: "40", cst_icms_manual: true });
  assert.deepEqual(icmsDaEmissao({ ...campos, aliq_icms: "17", red_bc: "40" }), {});
  assert.deepEqual(icmsDaEmissao({ ...campos, cfop: "6.556", aliq_icms: "12", red_bc: "41,18" }), { pICMS: 12, pRedBC: 41.18 });
});

test("valida CST, alíquota e redução antes de salvar ou emitir", () => {
  assert.throws(() => icmsDaEmissao({ ...campos, cst_icms: "090" }), /CST/);
  assert.throws(() => icmsDaEmissao({ ...campos, cst_icms: "020" }), /redução/);
  for (const aliq_icms of ["101", "-1", "NaN", "Infinity", "abc"]) assert.throws(() => icmsDaEmissao({ ...campos, cst_icms: "000", aliq_icms }), /percentual/);
});

test("duplicação preserva a escolha e os percentuais do rascunho", () => {
  const f = { ...campos, cst_icms: "020", aliq_icms: "17", red_bc: "40" };
  const r = montarRascunhoDuplicado({ id: "nf-origem", fazenda_id: "faz", tipo: "saida", status: "autorizada", numero: "1", valor_total: 100, dados_nf_json: f }, { numero: "2" }, "2026-11-17");
  const recuperado = { ...campos, ...r.dados_nf_json };
  assert.deepEqual(icmsDaEmissao(recuperado), icmsDaEmissao(f));
  assert.equal(r.dados_nf_json.cst_icms, "020");
});
