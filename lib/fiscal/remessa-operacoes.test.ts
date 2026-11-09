import { test } from "node:test";
import assert from "node:assert/strict";
import { OPERACOES_REMESSA, infoFiscalRemessa, operacaoPorCfop } from "./remessa-operacoes.ts";

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
