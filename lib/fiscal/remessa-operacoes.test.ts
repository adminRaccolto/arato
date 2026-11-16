import { test } from "node:test";
import assert from "node:assert/strict";
import { OPERACOES_REMESSA, infoFiscalPorCfop, infoFiscalRemessa, operacaoPorCfop, opcoesCfopRemessa } from "./remessa-operacoes.ts";

const op = (chave: string) => OPERACOES_REMESSA.find(o => o.chave === chave)!;

test("CFOP pela UF: mesma UF interno, outra UF interestadual, sem UF fica interno e avisa", () => {
  assert.equal(infoFiscalRemessa(op("armazem"), "MT", "MT").cfop, "5905");
  const inter = infoFiscalRemessa(op("emprestimo"), "MT", "GO");
  assert.equal(inter.cfop, "6949"); assert.equal(inter.interestadual, true);
  assert.equal(inter.natureza, "Remessa em empréstimo");
  const semUf = infoFiscalRemessa(op("conserto"), "MT", "");
  assert.equal(semUf.cfop, "5915"); assert.equal(semUf.ufIndefinida, true);
});

test("informações fiscais do cadastro de Operações Fiscais têm preferência sobre a regra do CFOP", () => {
  const cad = [{ nome: "Remessa para Armazém / Depósito", cfop_interno: "5905", cfop_externo: "6905", icms_cst_interno: "41", icms_cst_externo: "050", inf_cpl_template: "Não incidência do ICMS." }];
  const i = infoFiscalRemessa(op("armazem"), "MT", "MT", cad);
  assert.equal(i.cst, "041"); assert.equal(i.cstDoCadastro, true);
  assert.equal(i.operacaoFiscal, "Remessa para Armazém / Depósito"); assert.equal(i.infCpl, "Não incidência do ICMS.");
  assert.equal(infoFiscalRemessa(op("armazem"), "MT", "PR", cad).cst, "050");
  const semCad = infoFiscalRemessa(op("armazem"), "MT", "MT");
  assert.equal(semCad.cstDoCadastro, false); assert.equal(semCad.cst, "041"); assert.equal(semCad.infCpl, null);
  assert.equal(infoFiscalRemessa(op("armazem"), "MT", "MT", [{ ...cad[0], ativa: false }]).operacaoFiscal, null);
});

test("CFOP do XML encontra a operação; 5949 vira outras saídas", () => {
  assert.equal(operacaoPorCfop("6.905")?.chave, "armazem");
  assert.equal(operacaoPorCfop("5949")?.chave, "outras");
  assert.equal(operacaoPorCfop("5102"), undefined);
});

test("seletor de CFOP da remessa: Operações Fiscais da fazenda na direção certa + o sugerido", () => {
  const cad = [
    { nome: "Remessa para Armazém / Depósito", cfop_interno: "5905", cfop_externo: "6905", icms_cst_interno: "51", icms_cst_externo: "41", inf_cpl_template: "Texto armazém" },
    { nome: "Outras Saídas", cfop_interno: "5949", cfop_externo: "6949", icms_cst_interno: "90", icms_cst_externo: "90" },
    { nome: "Inativa", cfop_interno: "5915", cfop_externo: "6915", ativa: false },
  ];
  const internas = opcoesCfopRemessa("MT", "MT", cad, "5905");
  // cadastradas + padrão de remessa (5934 simbólica para armazém sempre aparece)
  for (const c of ["5905", "5949", "5934", "5915", "5901", "5924", "5912", "5908"]) assert.ok(internas.some(o => o.cfop === c), c);
  assert.equal(internas.find(o => o.cfop === "5905")!.cadastrada, true);
  assert.equal(internas.find(o => o.cfop === "5949")!.nome, "Outras Saídas");
  assert.match(internas.find(o => o.cfop === "5934")!.nome, /sem Operação Fiscal/);
  assert.equal(internas.find(o => o.cfop === "5934")!.natureza, "Remessa simbólica para armazém geral");
  assert.ok(opcoesCfopRemessa("MT", "PR", cad, "6905").every(o => o.cfop.startsWith("6")));
  assert.ok(opcoesCfopRemessa("MT", "MT", cad, "5555").some(o => o.cfop === "5555" && !o.cadastrada));

  const i = infoFiscalPorCfop("5949", "MT", "MT", cad);
  assert.equal(i.cst, "090"); assert.equal(i.operacaoFiscal, "Outras Saídas"); assert.ok(i.cstDoCadastro);
  const e = infoFiscalPorCfop("6905", "MT", "PR", cad);
  assert.equal(e.cst, "041"); assert.equal(e.infCpl, "Texto armazém");
  const semCad = infoFiscalPorCfop("5934", "MT", "MT", cad);
  assert.equal(semCad.cstDoCadastro, false); assert.equal(semCad.operacaoFiscal, null);
});
