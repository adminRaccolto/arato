import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValoresPagamentoBordero } from "./saldo-bordero";

/** Usar com cliente do servidor, após validar o acesso ao borderô. Sem sequência de updates por título. */
export async function confirmarBorderoComSaldo(db: SupabaseClient, loteId: string, data: string, conta: string,
  titulo: ValoresPagamentoBordero & { numero_titulo?: string; principal_anterior?: number; requisicao_id?: string } = {}) {
  const { data: resultado, error } = await db.rpc("bordero_acao_atomica", {
    p_lote: loteId, p_acao: "confirmar", p_data: data, p_conta: conta,
    p_titulo: { ...titulo, requisicao_id: titulo.requisicao_id ?? crypto.randomUUID() },
  });
  if(error) throw error;
  return resultado;
}
