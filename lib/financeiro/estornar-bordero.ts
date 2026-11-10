import type { SupabaseClient } from "@supabase/supabase-js";

/** O banco restaura a fotografia da baixa e os vínculos de extrato na mesma transação. */
export async function estornarBorderoComSaldo(db: SupabaseClient, loteId: string) {
  const { data, error } = await db.rpc("bordero_acao_atomica", {p_lote:loteId,p_acao:"estornar"});
  if(error) throw error;
  return data;
}
