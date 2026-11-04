import type { SupabaseClient } from "@supabase/supabase-js";

/** Tira os títulos informados das linhas de extrato conciliadas e limpa o flag conciliado deles (produtor e empresa). */
export async function desvincularExtrato(sb: SupabaseClient, ids: string[]) {
  for (const id of ids) {
    const { data: linhas } = await sb.from("extrato_transacoes").select("id, lancamento_id, lancamento_ids")
      .or(`lancamento_id.eq.${id},lancamento_ids.cs.{${id}}`);
    for (const t of linhas ?? []) {
      const todos: string[] = (t.lancamento_ids?.length ? t.lancamento_ids : t.lancamento_id ? [t.lancamento_id] : []) as string[];
      const resto = todos.filter(x => x !== id);
      await sb.from("extrato_transacoes").update(resto.length
        ? { lancamento_ids: resto, lancamento_id: resto[0], updated_at: new Date().toISOString() }
        : { conciliado: false, lancamento_ids: null, lancamento_id: null, lancamento_desc: null, lancamento_valor: null, origem_vinculo: null, confianca: null, regra_id: null, updated_at: new Date().toISOString() }
      ).eq("id", t.id);
    }
    await sb.from("lancamentos").update({ conciliado: false }).eq("id", id);
    await sb.from("empresa_lancamentos").update({ conciliado: false }).eq("id", id);
  }
}
