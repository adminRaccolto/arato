import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { grupoDoNcm, ncmsDoPadraoAgro, PADRAO_AGRO, NCM_PRESETS_MT } from "./ncm-padrao";
import { resolverTributacaoNFe } from "./tributacao-nfe";

const todos = PADRAO_AGRO.flatMap(g => g.itens);

test("catálogo do agro: NCM de 8 dígitos, sem repetição, IBS/CBS que a emissão monta", () => {
  assert.equal(new Set(todos.map(i => i.ncm)).size, todos.length);
  for (const i of todos) {
    assert.match(i.ncm, /^\d{8}$/, i.ncm);
    assert.ok(i.descricao.trim(), i.ncm);
    assert.ok(["000", "200"].includes(i.ibs_cbs_cst), i.ncm);
    assert.ok(i.ibs_cbs_cclasstrib.startsWith(i.ibs_cbs_cst), i.ncm);
    // Descrições novas só com ASCII/Latin-1 (o infCpl é limpo na emissão — sanitizeNFeTxt —, mas a descrição aparece em tela e planilha)
    if (!NCM_PRESETS_MT.includes(i)) assert.ok(!/[–—‘’“”]/.test(i.descricao + i.inf_cpl), `caractere tipográfico em ${i.ncm}`);
    assert.equal(i.ibs_cbs_reducao_pct, i.ibs_cbs_cst === "200" ? 60 : 0, i.ncm);
  }
  // Grãos: tributação completa de MT. Demais: ICMS/PIS/COFINS pela operação.
  for (const g of NCM_PRESETS_MT) assert.ok(g.icms_cst_interno && g.pis_cst, g.ncm);
  for (const i of todos.filter(i => !NCM_PRESETS_MT.includes(i))) assert.deepEqual([i.icms_cst_interno, i.icms_cst_externo, i.pis_cst, i.cofins_cst], ["", "", "", ""], i.ncm);
  // Insumos do Anexo IX com 200038; peça do caso real (recusa) com tributação integral
  assert.equal(todos.find(i => i.ncm === "31052000")?.ibs_cbs_cclasstrib, "200038");
  assert.equal(todos.find(i => i.ncm === "12011000")?.ibs_cbs_cclasstrib, "200038");
  assert.equal(todos.find(i => i.ncm === "84099999")?.ibs_cbs_cclasstrib, "000001");
  assert.equal(todos.find(i => i.ncm === "01022990")?.ibs_cbs_cclasstrib, "200036");
});

test("carga do padrão: só o que falta, com contagem por grupo", () => {
  const tudo = ncmsDoPadraoAgro([]);
  assert.equal(tudo.novos.length, todos.length);
  assert.equal(tudo.porGrupo.reduce((s, g) => s + g.qtd, 0), todos.length);
  const r = ncmsDoPadraoAgro(["1201.90.00", "84099999"]);
  assert.equal(r.novos.length, todos.length - 2);
  assert.ok(!r.novos.some(n => n.ncm === "12019000" || n.ncm === "84099999"));
  assert.equal(r.porGrupo.find(g => g.grupo === "Grãos (venda)")?.qtd, NCM_PRESETS_MT.length - 1);
  assert.equal(ncmsDoPadraoAgro(todos.map(i => i.ncm)).novos.length, 0);
  assert.equal(grupoDoNcm("31021010"), "Fertilizantes e corretivos");
  assert.equal(grupoDoNcm("99999999"), "");
});

// Banco simulado: devolve as linhas da tabela pedida em qualquer encadeamento
function dbFake(tabelas: Record<string, unknown[]>): SupabaseClient {
  return { from: (t: string) => {
    const res = { data: tabelas[t] ?? [], error: null };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "in", "eq", "order", "range"]) q[m] = () => q;
    q.single = () => Promise.resolve({ data: { conta_id: null }, error: null });
    q.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, falha);
    return q;
  } } as unknown as SupabaseClient;
}
const nota = (ncm: string, cfop: string) => ({
  destinatario: { nome: "X", cpf_cnpj: "11222333000144" }, natureza: "T", data_emissao: "2026-11-16",
  itens: [{ codigo: "1", descricao: "PECA", ncm, cfop, unidade: "UN", quantidade: 1, valor_unitario: 10 }],
});

test("emissão: NCM 'pela operação' só dá o IBS/CBS; grão segue com ICMS do NCM na venda", async () => {
  const peca = { id: "n1", fazenda_id: "f1", ...todos.find(i => i.ncm === "84099999")! };
  const soja = { id: "n2", fazenda_id: "f1", ...NCM_PRESETS_MT[0] };
  const db = dbFake({ ncm_tributacoes: [peca, soja], operacoes_fiscais: [] });
  const [venda] = await resolverTributacaoNFe(db, "f1", nota("84099999", "5101") as never, { ibs_cbs_ativo: "sim" }, "3");
  assert.equal(venda.cst_icms, undefined);           // não sai diferido como grão
  assert.equal(venda.pis_cst, undefined);
  assert.equal(venda.regra_fiscal?.texto_legal, null);
  assert.deepEqual([venda.ibsCbs?.cst, venda.ibsCbs?.cclasstrib], ["000", "000001"]);
  const [grao] = await resolverTributacaoNFe(db, "f1", nota("12019000", "5101") as never, { ibs_cbs_ativo: "sim" }, "3");
  assert.equal(grao.cst_icms, "051");
  assert.equal(grao.pis_cst, "06");
  assert.deepEqual([grao.ibsCbs?.cst, grao.ibsCbs?.cclasstrib, grao.ibsCbs?.reducaoPct], ["200", "200036", 60]);
});
