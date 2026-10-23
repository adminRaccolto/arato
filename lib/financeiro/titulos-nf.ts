/**
 * Títulos (CP) gerados por uma NF de entrada — do produtor (lancamentos) E da Empresa (empresa_lancamentos).
 *
 * Estornar/excluir uma NF tem que desfazer TODOS os títulos dela. A rota de estorno só apagava os do produtor: o CP da
 * Empresa (NF destinada a transportadora) ficava para trás e, ao processar a NF de novo, nascia outro — valor em dobro
 * no Contas a Pagar. Excluir NF apagava só o primeiro título (nf.lancamento_id), deixando parcelas e títulos da Empresa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type TituloProd = { id: string; status: string; conciliado: boolean | null; lote_id: string | null; valor: number; data_baixa?: string | null };
type TituloEmp = { id: string; status: string; conciliado: boolean | null; lote_id: string | null; valor: number };

async function carregar(sb: SupabaseClient, nfId: string) {
  const [{ data: nf }, { data: prod }, { data: emp }] = await Promise.all([
    sb.from("nf_entradas").select("lancamento_id, emp_lancamento_id").eq("id", nfId).maybeSingle(),
    sb.from("lancamentos").select("id,status,conciliado,lote_id,valor,data_baixa").eq("nf_entrada_id", nfId),
    sb.from("empresa_lancamentos").select("id,status,conciliado,lote_id,valor").eq("nf_entrada_id", nfId),
  ]);
  const prodIds = new Set((prod ?? []).map(t => t.id as string));
  const empIds = new Set((emp ?? []).map(t => t.id as string));
  const extraProd = nf?.lancamento_id && !prodIds.has(nf.lancamento_id) ? (await sb.from("lancamentos").select("id,status,conciliado,lote_id,valor,data_baixa").eq("id", nf.lancamento_id)).data ?? [] : [];
  const extraEmp = nf?.emp_lancamento_id && !empIds.has(nf.emp_lancamento_id) ? (await sb.from("empresa_lancamentos").select("id,status,conciliado,lote_id,valor").eq("id", nf.emp_lancamento_id)).data ?? [] : [];
  return { prod: [...(prod ?? []), ...extraProd] as TituloProd[], emp: [...(emp ?? []), ...extraEmp] as TituloEmp[] };
}

export type TituloParaEstorno = { id: string; status: string; conciliado: boolean | null; lote_id: string | null; valor: number };

/** O que impede apagar cada título: pago (inteiro ou parcial), conciliado com o extrato ou dentro de borderô. */
export function motivosBloqueio(titulos: TituloParaEstorno[], lado: "produtor" | "empresa"): string[] {
  const nome = lado === "produtor" ? "título a pagar" : "título da Empresa";
  const pago = lado === "produtor" ? ["baixado", "parcial"] : ["pago", "parcial"];
  return titulos.flatMap(t => {
    const v = `R$ ${Number(t.valor).toFixed(2)}`;
    if (pago.includes(t.status)) return [`${nome} de ${v} já ${lado === "produtor" ? "baixado" : "pago"}`];
    if (t.conciliado) return [`${nome} de ${v} conciliado com o extrato`];
    if (t.lote_id) return [`${nome} de ${v} em borderô`];
    return [];
  });
}

export function mensagemBloqueio(problemas: string[], documento = "a NF"): string | null {
  return problemas.length
    ? `Não dá para desfazer ${documento}: há ${problemas.join("; ")}. Estorne a baixa, a conciliação ou o borderô antes e tente de novo.`
    : null;
}

/** Mensagem se algum título da NF já foi pago, conciliado ou está em borderô (não dá para apagar sem desfazer isso antes). */
export async function titulosBloqueiamEstorno(sb: SupabaseClient, nfId: string): Promise<string | null> {
  const { prod, emp } = await carregar(sb, nfId);
  return mensagemBloqueio([...motivosBloqueio(prod, "produtor"), ...motivosBloqueio(emp, "empresa")]);
}

/** Apaga todos os títulos da NF (produtor e Empresa). Erro de exclusão interrompe — nunca engole. */
export async function excluirTitulosDaNf(sb: SupabaseClient, nfId: string): Promise<void> {
  const { prod, emp } = await carregar(sb, nfId);
  // Solta os ponteiros da NF antes (uma FK de nf_entradas para o título impediria a exclusão)
  await sb.from("nf_entradas").update({ lancamento_id: null, emp_lancamento_id: null }).eq("id", nfId);
  if (prod.length) {
    const { error } = await sb.from("lancamentos").delete().in("id", prod.map(t => t.id));
    if (error) throw new Error(`excluir títulos a pagar da NF: ${error.message}`);
  }
  if (emp.length) {
    const { error } = await sb.from("empresa_lancamentos").delete().in("id", emp.map(t => t.id));
    if (error) throw new Error(`excluir títulos da Empresa da NF: ${error.message}`);
  }
}
