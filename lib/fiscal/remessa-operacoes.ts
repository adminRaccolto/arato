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

export type OpcaoCfopRemessa = { cfop: string; nome: string; natureza: string; cadastrada: boolean };

/** Opções do seletor de CFOP da NF de remessa, na direção da remessa (interno × interestadual):
 *  1) Operações Fiscais ativas do cliente (a lista deve vir com as da fazenda emitente primeiro — elas ganham no empate);
 *  2) as operações padrão de remessa (5905, 5934, 5915…), mesmo sem cadastro;
 *  3) o CFOP sugerido, se ainda não estiver. Um CFOP aparece uma vez só. */
export function opcoesCfopRemessa(ufEmitente: string | null | undefined, ufDestino: string | null | undefined,
  cadastro: OperacaoFiscalCadastro[], sugerido?: string | null): OpcaoCfopRemessa[] {
  const a = String(ufEmitente ?? "").trim().toUpperCase(), b = String(ufDestino ?? "").trim().toUpperCase();
  const interestadual = !!a && !!b && a !== b;
  const vistos = new Map<string, OpcaoCfopRemessa>();
  for (const c of cadastro) {
    if (c.ativa === false) continue;
    const cfop = String((interestadual ? c.cfop_externo : c.cfop_interno) ?? "").replace(/\D/g, "");
    if (/^\d{4}$/.test(cfop) && !vistos.has(cfop)) vistos.set(cfop, { cfop, nome: c.nome, natureza: c.nome, cadastrada: true });
  }
  for (const op of OPERACOES_REMESSA) {
    if (op.chave === "emprestimo") continue;   // mesmo CFOP de "outras saídas"
    const cfop = interestadual ? op.externo : op.interno;
    if (!vistos.has(cfop)) vistos.set(cfop, { cfop, nome: `${op.nome} — sem Operação Fiscal cadastrada`, natureza: op.natureza, cadastrada: false });
  }
  const sug = String(sugerido ?? "").replace(/\D/g, "");
  if (/^\d{4}$/.test(sug) && !vistos.has(sug)) vistos.set(sug, { cfop: sug, nome: "sugerido — sem Operação Fiscal cadastrada", natureza: "", cadastrada: false });
  return [...vistos.values()].sort((x, y) => x.cfop.localeCompare(y.cfop));
}

/** Informações fiscais de um CFOP escolhido no seletor: CST, texto legal e nome da Operação Fiscal cadastrada com ele
 *  (na direção da remessa; se não houver, em qualquer direção); sem cadastro, CST pela regra do CFOP. */
export function infoFiscalPorCfop(cfop: string, ufEmitente: string | null | undefined, ufDestino: string | null | undefined,
  cadastro: OperacaoFiscalCadastro[] = []): InfoFiscalRemessa {
  const a = String(ufEmitente ?? "").trim().toUpperCase(), b = String(ufDestino ?? "").trim().toUpperCase();
  const ufIndefinida = !a || !b;
  const interestadual = !ufIndefinida && a !== b;
  const c = cfop.replace(/\D/g, "");
  const ativos = cadastro.filter(x => x.ativa !== false);
  const naDirecao = ativos.find(x => (interestadual ? x.cfop_externo : x.cfop_interno) === c);
  const cad = naDirecao ?? ativos.find(x => x.cfop_interno === c || x.cfop_externo === c);
  // CST do lado em que o CFOP está no cadastro (interno ou interestadual)
  const ladoExterno = naDirecao ? interestadual : cad?.cfop_externo === c && cad?.cfop_interno !== c;
  const cstCad = cad ? cst3(ladoExterno ? cad.icms_cst_externo : cad.icms_cst_interno) : "";
  return {
    cfop: c, interestadual, ufIndefinida, natureza: cad?.nome ?? "",
    cst: cstCad || cstExibicaoPorCfop(c), cstDoCadastro: !!cstCad,
    operacaoFiscal: cad?.nome ?? null, infCpl: cad?.inf_cpl_template?.trim() || null,
  };
}
