// Devolução recusada pelo fornecedor — parte de banco (service role). Regras em lib/fiscal/recusa-devolucao.ts.
// Desfaz a devolução do mesmo jeito que o cancelamento da NF-e de devolução (fiscal_concluir_evento, Seção 445):
// os títulos da compra voltam como estavam, o título a receber da devolução sai, as saídas de estoque saem (o saldo é
// recalculado pelas movimentações, Seção 365) e os itens saem — a NF de compra volta a ter saldo para devolver.
// O registro da devolução fica, com status "cancelada" e a observação da recusa; as duas NF-e ficam no Monitor.
import type { SupabaseClient } from "@supabase/supabase-js";
import { atualizarSituacaoDevolucao, desfazerCompensacaoDevolucao } from "./devolucao-compensacao";

const ABERTOS = ["em_aberto", "vencido", "vencendo", "cancelado"];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** O que impede desfazer a devolução (verificado ANTES de emitir a NF-e de entrada). null = pode seguir. */
export async function bloqueioRecusa(sb: SupabaseClient, devId: string): Promise<string | null> {
  const { data: dev, error } = await sb.from("nf_entradas").select("id, status, compensacoes").eq("id", devId).maybeSingle();
  if (error) throw error;
  if (!dev) return "O registro da devolução não foi encontrado no Arato.";
  if (dev.status === "cancelada") return null; // já desfeita (retomada de uma recusa interrompida)
  const { count: diretos } = await sb.from("nf_entrada_itens").select("id", { count: "exact", head: true }).eq("nf_entrada_id", devId).eq("tipo_apropiacao", "direto");
  if (diretos) return "Esta devolução tem item de Apropriação Direta (manutenção ou abastecimento): o custo original precisa ser conferido à mão. Fale com o suporte antes de registrar a recusa.";
  const comp = Array.isArray(dev.compensacoes) ? (dev.compensacoes as { valor: number }[]) : [];
  const compensado = r2(comp.reduce((s, c) => s + Number(c.valor || 0), 0));
  const { data: titulos, error: eT } = await sb.from("lancamentos").select("id, tipo, status, valor_pago, lote_id, conciliado").eq("nf_entrada_id", devId);
  if (eT) throw eT;
  for (const t of titulos ?? []) {
    if (t.lote_id) return "O título a receber desta devolução está em um borderô: retire-o do borderô antes de registrar a recusa.";
    const aberto = ABERTOS.includes(String(t.status)) && !Number(t.valor_pago || 0) && !t.conciliado;
    // Baixado só pelo encontro de contas com os títulos da compra: isso é desfeito junto
    const soCompensado = t.tipo === "receber" && comp.length > 0 && Math.abs(Number(t.valor_pago || 0) - compensado) < 0.01;
    if (!aberto && !soCompensado) return "O título a receber desta devolução já teve recebimento ou conciliação: estorne a baixa em Contas a Receber antes de registrar a recusa.";
  }
  const { count: empresa } = await sb.from("empresa_lancamentos").select("id", { count: "exact", head: true }).eq("nf_entrada_id", devId);
  if (empresa) return "Esta devolução tem título no financeiro da Empresa: estorne-o antes de registrar a recusa.";
  // Saldo do item calculado pelas movimentações (Seção 365): sem isso, apagar a saída não devolve o saldo
  const { error: eSaldo } = await sb.from("saldo_insumo_fazenda").select("insumo_id").limit(1);
  if (eSaldo) return "O saldo de estoque ainda não é calculado pelas movimentações (Seção 365): fale com o suporte.";
  return null;
}

/** Desfaz a devolução no Arato. Pode ser chamada de novo (devolução já cancelada: só confere a NF de compra). */
export async function desfazerDevolucaoRecusada(sb: SupabaseClient, devId: string, observacao: string): Promise<void> {
  const { data: dev, error } = await sb.from("nf_entradas").select("id, status, observacao, nf_origem_id").eq("id", devId).single();
  if (error) throw error;
  if (dev.status !== "cancelada") {
    await desfazerCompensacaoDevolucao(sb, devId);
    const { error: eM } = await sb.from("movimentacoes_estoque").delete().eq("nf_entrada_id", devId);
    if (eM) throw new Error(`Não foi possível desfazer as saídas de estoque da devolução: ${eM.message}`);
    const { error: eL } = await sb.from("lancamentos").delete().eq("nf_entrada_id", devId);
    if (eL) throw new Error(`Não foi possível excluir o título a receber da devolução: ${eL.message}`);
    const { error: eI } = await sb.from("nf_entrada_itens").delete().eq("nf_entrada_id", devId);
    if (eI) throw new Error(`Não foi possível liberar os itens da devolução: ${eI.message}`);
    const { error: eS } = await sb.from("nf_entradas").update({
      status: "cancelada",
      observacao: [dev.observacao, observacao].filter(Boolean).join(" | ").slice(0, 2000),
    }).eq("id", devId);
    if (eS) throw new Error(`Não foi possível marcar a devolução como recusada: ${eS.message}`);
  }
  if (dev.nf_origem_id) await atualizarSituacaoDevolucao(sb, dev.nf_origem_id as string).catch(() => null);
}
