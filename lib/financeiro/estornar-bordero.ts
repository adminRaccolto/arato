import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagamentoLote } from "../supabase";
import { arredondarMoeda, resumoBordero } from "./saldo-bordero";

/** Remove somente os valores deste borderô, preservando pagamentos anteriores. */
export async function estornarBorderoComSaldo(db: SupabaseClient, loteId: string) {
  const cabecalho = await db.from("pagamento_lotes").select("*").eq("id", loteId).single();
  if (cabecalho.error) throw cabecalho.error;
  const lote = cabecalho.data as PagamentoLote;
  if (!lote || resumoBordero(lote).liquidado <= 0) throw new Error("O borderô não tem pagamento para estornar.");
  const planos = [];
  for (let inicio = 0; ; inicio += 1000) {
    const membros = await db.from("pagamento_lote_itens").select("*").eq("lote_id", loteId).order("id").range(inicio, inicio + 999);
    if (membros.error) throw membros.error;
    for (const item of membros.data ?? []) {
      const origem = item.origem_tabela ?? "lancamentos";
      if (!["lancamentos", "empresa_lancamentos"].includes(origem)) throw new Error("Origem inválida no borderô.");
      const r = await db.from(origem).select("*").eq("id", item.lancamento_id).eq("lote_id", loteId).single();
      if (r.error) throw r.error;
      const original = r.data;
      if (!original) throw new Error("Um título não pertence mais ao borderô. Atualize a tela.");
      const valores: Record<string, number> = {};
      for (const campo of ["valor_pago", "valor_juros", "valor_multa", "valor_desconto"]) {
        const resto = arredondarMoeda((original[campo] ?? 0) - (item[campo] ?? 0));
        if (resto < -0.01) throw new Error("Os valores do título divergem do borderô. Confira os pagamentos antes de estornar.");
        valores[campo] = Math.max(0, resto);
      }
      const principal = arredondarMoeda(valores.valor_pago - valores.valor_juros - valores.valor_multa + valores.valor_desconto);
      const valorTotal = original.valor * (original.moeda === "USD" ? original.cotacao_usd ?? 5.12 : 1);
      const campoData = origem === "lancamentos" ? "data_baixa" : "data_pagamento";
      const patch = { ...valores, lote_id: null,
        status: principal >= arredondarMoeda(valorTotal) ? (origem === "lancamentos" ? "baixado" : "pago") : principal > 0 ? "parcial" : origem === "lancamentos" ? "em_aberto" : "pendente",
        [campoData]: valores.valor_pago > 0 ? original[campoData] : null,
        conta_bancaria: valores.valor_pago > 0 ? original.conta_bancaria : null };
      planos.push({ origem, original, patch, campoData });
    }
    if (!membros.data || membros.data.length < 1000) break;
  }
  const aplicados: typeof planos = [];
  try {
    for (const plano of planos) {
      let q = db.from(plano.origem).update(plano.patch).eq("id", plano.original.id).eq("lote_id", loteId);
      for (const campo of ["valor_pago", "valor_juros", "valor_multa", "valor_desconto"])
        q = plano.original[campo] == null ? q.is(campo, null) : q.eq(campo, plano.original[campo]);
      const r = await q.select("id");
      if (r.error) throw r.error;
      if (r.data?.length !== 1) throw new Error("O título foi alterado durante o estorno. Atualize a tela.");
      aplicados.push(plano);
    }
    // O FK remove os itens em cascata, junto com o cabeçalho, numa única operação.
    let q = db.from("pagamento_lotes").delete().eq("id", loteId).eq("status", lote.status ?? "pago");
    q = lote.valor_pago == null ? q.is("valor_pago", null) : q.eq("valor_pago", lote.valor_pago);
    const r = await q.select("id");
    if (r.error) throw r.error;
    if (r.data?.length !== 1) throw new Error("O borderô foi alterado durante o estorno. Atualize a tela.");
  } catch (e) {
    let falhou = false;
    for (const { origem, original, patch, campoData } of aplicados.reverse()) {
      try {
        const restore = { status: original.status, lote_id: loteId, valor_pago: original.valor_pago,
          valor_juros: original.valor_juros, valor_multa: original.valor_multa, valor_desconto: original.valor_desconto,
          [campoData]: original[campoData], conta_bancaria: original.conta_bancaria };
        const r = await db.from(origem).update(restore).eq("id", original.id).is("lote_id", null)
          .eq("valor_pago", patch.valor_pago).eq("valor_juros", patch.valor_juros).eq("valor_multa", patch.valor_multa)
          .eq("valor_desconto", patch.valor_desconto).select("id");
        if (r.error || r.data?.length !== 1) falhou = true;
      } catch { falhou = true; }
    }
    if (falhou) throw new Error("O estorno não foi concluído e houve falha na reversão. Confira os títulos antes de tentar novamente.");
    throw e;
  }
}
