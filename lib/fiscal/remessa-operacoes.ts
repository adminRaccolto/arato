// Operações de remessa (tela Documentos Fiscais → Remessas): o usuário escolhe a operação, não digita o CFOP.
// O CFOP sai pela UF do emitente × UF do destinatário (interno 5xxx / interestadual 6xxx). As informações fiscais
// vêm do cadastro de Operações Fiscais do cliente quando houver uma com o mesmo CFOP; senão, da regra do CFOP.
import { cstExibicaoPorCfop } from "../nfe/cst-por-cfop.ts";

export type OperacaoRemessa = { chave: string; nome: string; interno: string; externo: string; natureza: string };

export const OPERACOES_REMESSA: OperacaoRemessa[] = [
  { chave: "armazem", nome: "Depósito em armazém geral", interno: "5905", externo: "6905", natureza: "Remessa para depósito em armazém geral" },
  { chave: "armazem_simbolica", nome: "Remessa simbólica para armazém geral", interno: "5934", externo: "6934", natureza: "Remessa simbólica para armazém geral" },
  { chave: "emprestimo", nome: "Empréstimo", interno: "5949", externo: "6949", natureza: "Remessa em empréstimo" },
  { chave: "conserto", nome: "Conserto ou reparo", interno: "5915", externo: "6915", natureza: "Remessa para conserto ou reparo" },
  { chave: "industrializacao", nome: "Industrialização por encomenda", interno: "5901", externo: "6901", natureza: "Remessa para industrialização por encomenda" },
  { chave: "industrializacao_ordem", nome: "Industrialização por conta e ordem do adquirente", interno: "5924", externo: "6924", natureza: "Remessa para industrialização por conta e ordem do adquirente" },
  { chave: "demonstracao", nome: "Demonstração", interno: "5912", externo: "6912", natureza: "Remessa para demonstração" },
  { chave: "comodato", nome: "Comodato", interno: "5908", externo: "6908", natureza: "Remessa de bem por conta de contrato de comodato" },
  { chave: "outras", nome: "Outras saídas não especificadas", interno: "5949", externo: "6949", natureza: "Outras saídas não especificadas" },
];

export type OperacaoFiscalCadastro = {
  nome: string; cfop_interno: string; cfop_externo: string;
  icms_cst_interno?: string | null; icms_cst_externo?: string | null; inf_cpl_template?: string | null; ativa?: boolean | null;
};

export type InfoFiscalRemessa = {
  cfop: string; interestadual: boolean; ufIndefinida: boolean; natureza: string;
  cst: string; cstDoCadastro: boolean; operacaoFiscal: string | null; infCpl: string | null;
};

const cst3 = (v?: string | null) => (v ? String(v).replace(/\D/g, "").padStart(3, "0").slice(-3) : "");

/** CFOP e informações fiscais da operação para a UF do emitente e a do destinatário. Sem UF de um dos lados, interno. */
export function infoFiscalRemessa(op: OperacaoRemessa, ufEmitente: string | null | undefined, ufDestino: string | null | undefined,
  cadastro: OperacaoFiscalCadastro[] = []): InfoFiscalRemessa {
  const a = String(ufEmitente ?? "").trim().toUpperCase(), b = String(ufDestino ?? "").trim().toUpperCase();
  const ufIndefinida = !a || !b;
  const interestadual = !ufIndefinida && a !== b;
  const cfop = interestadual ? op.externo : op.interno;
  const cad = cadastro.find(c => c.ativa !== false && (interestadual ? c.cfop_externo : c.cfop_interno) === cfop);
  const cstCad = cst3(interestadual ? cad?.icms_cst_externo : cad?.icms_cst_interno);
  return {
    cfop, interestadual, ufIndefinida, natureza: op.natureza,
    cst: cstCad || cstExibicaoPorCfop(cfop), cstDoCadastro: !!cstCad,
    operacaoFiscal: cad?.nome ?? null, infCpl: cad?.inf_cpl_template?.trim() || null,
  };
}

/** Operação que corresponde a um CFOP vindo do XML (remessa emitida em outro sistema); 5949 genérico vira "outras". */
export function operacaoPorCfop(cfop: string | null | undefined): OperacaoRemessa | undefined {
  const c = String(cfop ?? "").replace(/\D/g, "");
  return OPERACOES_REMESSA.find(o => o.chave !== "emprestimo" && (o.interno === c || o.externo === c));
}
