import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagamentoLote } from "../supabase";
import { acumularPagamentoBordero, arredondarMoeda, ratearMoeda, resumoBordero, type ValoresPagamentoBordero } from "./saldo-bordero";

type Item = { id: string; lancamento_id: string; origem_tabela?: "lancamentos" | "empresa_lancamentos"; valor_pago: number; valor_juros?: number; valor_multa?: number; valor_desconto?: number };
type Original = {
  id: string; lote_id: string | null; status: string; valor: number; moeda?: string; cotacao_usd?: number;
  valor_pago: number | null; valor_juros: number | null; valor_multa: number | null; valor_desconto: number | null;
  data_baixa?: string | null; data_pagamento?: string | null; conta_bancaria?: string | null;
};
function erro(mensagem: string) { return new Error(mensagem); }

/** Mantém o saldo no próprio título e acumula as liquidações em PF/PJ. */
export async function confirmarBorderoComSaldo(db: SupabaseClient, loteId: string, data: string, conta: string,
  titulo: ValoresPagamentoBordero & { numero_titulo?: string; principal_anterior?: number } = {}) {
  const cabecalho = await db.from("pagamento_lotes").select("*").eq("id", loteId).single();
  if (cabecalho.error) throw cabecalho.error;
  const lote = cabecalho.data as PagamentoLote;
  if (!lote) throw erro("Borderô não encontrado.");
  const resumo = resumoBordero(lote);
  if (titulo.principal_anterior !== undefined && arredondarMoeda(titulo.principal_anterior) !== resumo.liquidado)
    throw erro("O borderô recebeu outro pagamento. Atualize a tela antes de confirmar.");
  const pagamento = acumularPagamentoBordero(lote, titulo);
  const itens: Item[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const r = await db.from("pagamento_lote_itens").select("*").eq("lote_id", loteId).order("id").range(inicio, inicio + 999);
    if (r.error) throw r.error;
    itens.push(...(r.data ?? []) as Item[]);
    if (!r.data || r.data.length < 1000) break;
  }
  if (!itens.length) throw erro("Borderô sem itens.");
  const originais = new Map<string, Original>();
  for (const origem of ["lancamentos", "empresa_lancamentos"] as const) {
    const ids = itens.filter(i => (i.origem_tabela ?? "lancamentos") === origem).map(i => i.lancamento_id);
    if (new Set(ids).size !== ids.length) throw erro("Há títulos repetidos dentro do borderô. Confira os vínculos antes de pagar.");
    for (let inicio = 0; inicio < ids.length; inicio += 200) {
      const r = await db.from(origem).select("*").in("id", ids.slice(inicio, inicio + 200));
      if (r.error) throw r.error;
      for (const original of (r.data ?? []) as Original[]) originais.set(`${origem}:${original.id}`, original);
    }
  }
  const documentos = itens.map(i => {
    const origem = i.origem_tabela ?? "lancamentos";
    const original = originais.get(`${origem}:${i.lancamento_id}`);
    if (!original || original.lote_id !== loteId || original.status === "cancelado")
      throw erro("Um dos títulos não pertence mais a este borderô ou foi cancelado. Atualize a tela.");
    const valor = original.valor * (original.moeda === "USD" ? original.cotacao_usd ?? 5.12 : 1);
    const liquidado = (original.valor_pago ?? 0) - (original.valor_juros ?? 0) - (original.valor_multa ?? 0) + (original.valor_desconto ?? 0);
    return { origem, original, valor, saldo: arredondarMoeda(Math.max(0, valor - liquidado)) };
  });
  const somaSaldos = arredondarMoeda(documentos.reduce((s, d) => s + d.saldo, 0));
  if (Math.abs(somaSaldos - resumo.saldo) > 0.01)
    throw erro("O saldo dos títulos diverge do borderô. Atualize a tela e confira os pagamentos antes de continuar.");
  const pesos = documentos.map(d => d.saldo);
  const principal = ratearMoeda(pagamento.principal, pesos);
  const descontos = ratearMoeda(pagamento.desconto, principal);
  const juros = ratearMoeda(pagamento.juros, pesos);
  const multas = ratearMoeda(pagamento.multa, pesos);
  const desfazer: (() => Promise<void>)[] = [];
  try {
    for (let n = 0; n < documentos.length; n++) {
      const { origem, original, valor, saldo } = documentos[n];
      if (saldo === 0) continue;
      const campoData = origem === "lancamentos" ? "data_baixa" : "data_pagamento";
      const caixa = arredondarMoeda(principal[n] - descontos[n] + juros[n] + multas[n]);
      const valores = {
        valor_pago: arredondarMoeda((original.valor_pago ?? 0) + caixa),
        valor_juros: arredondarMoeda((original.valor_juros ?? 0) + juros[n]),
        valor_multa: arredondarMoeda((original.valor_multa ?? 0) + multas[n]),
        valor_desconto: arredondarMoeda((original.valor_desconto ?? 0) + descontos[n]),
      };
      const liquidado = arredondarMoeda(valores.valor_pago - valores.valor_juros - valores.valor_multa + valores.valor_desconto);
      const patch = { ...valores, status: liquidado >= arredondarMoeda(valor) ? (origem === "lancamentos" ? "baixado" : "pago") : "parcial", [campoData]: data, conta_bancaria: conta };
      let q = db.from(origem).update(patch).eq("id", original.id).eq("lote_id", loteId).eq("status", original.status);
      for (const campo of ["valor_pago", "valor_juros", "valor_multa", "valor_desconto"] as const)
        q = original[campo] == null ? q.is(campo, null) : q.eq(campo, original[campo]);
      const r = await q.select("id");
      if (r.error) throw r.error;
      if (r.data?.length !== 1) throw erro("Um dos títulos foi alterado durante o pagamento. Atualize a tela e tente novamente.");
      desfazer.push(async () => {
        const restore = { status: original.status, valor_pago: original.valor_pago, valor_juros: original.valor_juros,
          valor_multa: original.valor_multa, valor_desconto: original.valor_desconto, [campoData]: original[campoData] ?? null, conta_bancaria: original.conta_bancaria ?? null };
        const r = await db.from(origem).update(restore).eq("id", original.id).eq("lote_id", loteId)
          .eq("valor_pago", valores.valor_pago).eq("valor_juros", valores.valor_juros).eq("valor_multa", valores.valor_multa)
          .eq("valor_desconto", valores.valor_desconto).eq(campoData, data).eq("conta_bancaria", conta).select("id");
        if (r.error || r.data?.length !== 1) throw erro("Falha ao reverter título.");
      });
      const item = itens[n];
      // No primeiro pagamento, valor_pago do item ainda era o peso inicial.
      const patchItem = {
        valor_pago: arredondarMoeda((resumo.liquidado > 0 ? item.valor_pago : 0) + caixa),
        valor_juros: arredondarMoeda((item.valor_juros ?? 0) + juros[n]),
        valor_multa: arredondarMoeda((item.valor_multa ?? 0) + multas[n]),
        valor_desconto: arredondarMoeda((item.valor_desconto ?? 0) + descontos[n]),
      };
      const ri = await db.from("pagamento_lote_itens").update(patchItem).eq("id", item.id).eq("lote_id", loteId).select("id");
      if (ri.error) throw ri.error;
      if (ri.data?.length !== 1) throw erro("O item do borderô foi alterado durante o pagamento.");
      desfazer.push(async () => {
        const r = await db.from("pagamento_lote_itens").update({ valor_pago: item.valor_pago,
          valor_juros: item.valor_juros ?? null, valor_multa: item.valor_multa ?? null, valor_desconto: item.valor_desconto ?? null })
          .eq("id", item.id).eq("lote_id", loteId).eq("valor_pago", patchItem.valor_pago).select("id");
        if (r.error || r.data?.length !== 1) throw erro("Falha ao reverter rateio.");
      });
    }
    // Só publica o novo estado do borderô depois de atualizar todos os títulos.
    const patch: Record<string, unknown> = { ...pagamento.patch, data_pagamento: data, conta_bancaria: conta };
    if (titulo.numero_titulo !== undefined) patch.numero_titulo = titulo.numero_titulo || null;
    let q = db.from("pagamento_lotes").update(patch).eq("id", loteId).eq("status", lote.status ?? "pago");
    q = lote.valor_pago == null ? q.is("valor_pago", null) : q.eq("valor_pago", lote.valor_pago);
    const r = await q.select("id");
    if (r.error) throw r.error;
    if (r.data?.length !== 1) throw erro("O borderô foi alterado durante o pagamento. Atualize a tela.");
  } catch (e) {
    let falhou = false;
    for (const reverter of desfazer.reverse()) {
      try { await reverter(); } catch { falhou = true; }
    }
    if (falhou) throw erro("O pagamento não foi concluído e houve falha na reversão. Confira os títulos antes de tentar novamente.");
    throw e;
  }
}
