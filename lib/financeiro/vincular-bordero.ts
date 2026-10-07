import type { SupabaseClient } from "@supabase/supabase-js";
import { chaveTitulo } from "./cp-grid";

export type ItemBordero = { lancamento_id: string; origem_tabela?: "lancamentos" | "empresa_lancamentos"; valor_pago: number };

export function validarItensBordero(itens: ItemBordero[]) {
  if (!itens.length) throw new Error("Selecione pelo menos um título para criar o borderô.");
  const chaves = itens.map(i => chaveTitulo(i.origem_tabela ?? "lancamentos", i.lancamento_id));
  if (new Set(chaves).size !== chaves.length) throw new Error("O mesmo título não pode aparecer duas vezes no borderô.");
  if (itens.some(i => !i.lancamento_id || !Number.isFinite(i.valor_pago) || i.valor_pago <= 0))
    throw new Error("Todos os títulos do borderô devem ter saldo maior que zero.");
}

/** Reserva por comparação atômica: duas abas não conseguem tomar o mesmo título.
 * Executada antes de qualquer baixa. Em erro, libera somente os vínculos deste lote.
 */
export async function vincularItensBordero(db: SupabaseClient, loteId: string, tipo: "pagar" | "receber", itens: ItemBordero[]) {
  try {
    validarItensBordero(itens);
    for (const origem of ["lancamentos", "empresa_lancamentos"] as const) {
      const ids = itens.filter(i => (i.origem_tabela ?? "lancamentos") === origem).map(i => i.lancamento_id);
      for (let inicio = 0; inicio < ids.length; inicio += 200) {
        // Detecta também vínculos antigos cujo lote_id não foi espelhado no lançamento.
        const { data, error } = await db.from("pagamento_lote_itens").select("lancamento_id, origem_tabela")
          .in("lancamento_id", ids.slice(inicio, inicio + 200));
        if (error) throw error;
        if (data?.some(i => (i.origem_tabela ?? "lancamentos") === origem))
          throw new Error("Um dos títulos já pertence a um borderô. Atualize a lista antes de tentar novamente.");
      }
    }
    for (const item of itens) {
      const origem = item.origem_tabela ?? "lancamentos";
      const { data, error } = await db.from(origem).update({ lote_id: loteId })
        .eq("id", item.lancamento_id).eq("tipo", tipo).is("lote_id", null)
        .in("status", origem === "lancamentos" ? ["em_aberto", "vencido", "vencendo", "parcial"] : ["pendente", "parcial"])
        .select("id");
      if (error) throw error;
      if (data?.length !== 1) throw new Error("Um dos títulos já foi agrupado, baixado ou alterado. Atualize a lista antes de tentar novamente.");
    }
    const { error } = await db.from("pagamento_lote_itens").insert(itens.map(i => ({
      lote_id: loteId, lancamento_id: i.lancamento_id, origem_tabela: i.origem_tabela ?? "lancamentos", valor_pago: i.valor_pago,
    })));
    if (error) throw error;
  } catch (erro) {
    // Não apagar o cabeçalho se a liberação falhar: conserva a referência
    // para que o usuário possa cancelar o borderô e recuperar seus títulos.
    const liberacoes = await Promise.all([
      db.from("lancamentos").update({ lote_id: null }).eq("lote_id", loteId),
      db.from("empresa_lancamentos").update({ lote_id: null }).eq("lote_id", loteId),
      db.from("pagamento_lote_itens").delete().eq("lote_id", loteId),
    ]);
    if (liberacoes.some(r => r.error))
      throw new Error("A criação não foi concluída e houve falha ao liberar os títulos. Atualize a tela e cancele o borderô para liberar os vínculos.");
    const { error } = await db.from("pagamento_lotes").delete().eq("id", loteId);
    if (error) throw new Error("Os títulos foram liberados, mas não foi possível remover o borderô vazio. Atualize a tela e cancele-o.");
    throw erro;
  }
}
