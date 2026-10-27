import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagamentoLote } from "../supabase";
import { acumularPagamentoBordero, arredondarMoeda, ratearMoeda, resumoBordero, type ValoresPagamentoBordero } from "./saldo-bordero";

type Item = { id: string; lancamento_id: string; origem_tabela?: "lancamentos" | "empresa_lancamentos"; valor_pago: number; valor_juros?: number; valor_multa?: number; valor_desconto?: number };
type Original = {
  id: string; lote_id: string | null; status: string; valor: number; moeda?: string; cotacao_usd?: number;
  valor_pago: number | null; valor_juros: number | null; valor_multa: number | null; valor_desconto: number | null;
  data_baixa?: string | null; data_pagamento?: string | null; conta_bancaria?: string | null;
  contrato_financeiro_id?: string | null; titulo_origem_id?: string | null; pagamento_parcial?: boolean | null; valor_titulo_origem?: number | null;
};
type Lote = PagamentoLote;
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

  // Pagamento parcial de borderô a pagar divide o borderô (Seção 379), como o título avulso (Seção 375). Fora da
  // divisão (seguem acumulando no mesmo borderô): Contas a Receber, borderô que já tinha pagamento acumulado e
  // títulos em dólar, de contrato financeiro ou com pagamento anterior ao borderô.
  const dividir = lote.tipo === "pagar" && pagamento.saldo > 0 && resumo.liquidado === 0
    && documentos.every(d => (d.original.moeda ?? "BRL") === "BRL" && !d.original.contrato_financeiro_id && !((d.original.valor_pago ?? 0) > 0));
  if (dividir) {
    if (pagamento.juros > 0 || pagamento.multa > 0)
      throw erro("Juros e multa entram no pagamento que quita o borderô. Neste pagamento parcial informe só o valor pago (e o desconto, se houver).");
    return dividirBordero(db, lote as Lote, itens, documentos, principal, descontos, data, conta, titulo, pagamento.principal, pagamento.desconto);
  }
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

/** Pagamento parcial: o borderô fica pago com o valor pago e nasce um borderô em aberto com o saldo. Cada título é
 * dividido pelo gatilho da Seção 375/379: a parte paga fica neste borderô e a parte em aberto vai para o novo. */
async function dividirBordero(db: SupabaseClient, lote: Lote, itens: Item[],
  documentos: { origem: "lancamentos" | "empresa_lancamentos"; original: Original; valor: number; saldo: number }[],
  principal: number[], descontos: number[], data: string, conta: string,
  titulo: ValoresPagamentoBordero & { numero_titulo?: string }, totalPrincipal: number, totalDesconto: number) {
  const vencimento = (titulo.novo_vencimento_saldo ?? "").trim();
  const origemLote = lote.lote_origem_id ?? lote.id;
  const valorOrigem = lote.valor_lote_origem ?? lote.valor_total;
  const novo = await db.from("pagamento_lotes").insert({
    fazenda_id: lote.fazenda_id, tipo: lote.tipo, status: "pendente", descricao: lote.descricao ?? null,
    numero_titulo: (titulo.numero_titulo !== undefined ? titulo.numero_titulo || null : lote.numero_titulo ?? null),
    data_vencimento: vencimento || lote.data_vencimento || null,
    valor_total: arredondarMoeda(lote.valor_total - totalPrincipal), valor_pago: null, valor_juros: 0, valor_multa: 0, valor_desconto: 0,
    lote_origem_id: origemLote, valor_lote_origem: valorOrigem, pagamento_parcial: false,
  }).select("id").single();
  if (novo.error) throw novo.error;
  const saldoId = (novo.data as { id: string }).id;
  const desfazer: (() => Promise<void>)[] = [];
  try {
    for (let n = 0; n < documentos.length; n++) {
      const { origem, original, valor, saldo } = documentos[n];
      if (saldo === 0) continue;
      const item = itens[n];
      if (principal[n] === 0) {
        // Título que não recebeu nada do rateio passa inteiro para o borderô do saldo
        const r = await db.from(origem).update({ lote_id: saldoId }).eq("id", original.id).eq("lote_id", lote.id).eq("status", original.status).select("id");
        if (r.error) throw r.error;
        if (r.data?.length !== 1) throw erro("Um dos títulos foi alterado durante o pagamento. Atualize a tela e tente novamente.");
        desfazer.push(async () => {
          const v = await db.from(origem).update({ lote_id: lote.id }).eq("id", original.id).eq("lote_id", saldoId).select("id");
          if (v.error || v.data?.length !== 1) throw erro("Falha ao reverter título.");
        });
        const ri = await db.from("pagamento_lote_itens").delete().eq("id", item.id).eq("lote_id", lote.id).select("id");
        if (ri.error) throw ri.error;
        desfazer.push(async () => {
          const v = await db.from("pagamento_lote_itens").insert({ id: item.id, lote_id: lote.id, lancamento_id: item.lancamento_id, origem_tabela: origem, valor_pago: item.valor_pago });
          if (v.error) throw erro("Falha ao reverter rateio.");
        });
        continue;
      }
      const campoData = origem === "lancamentos" ? "data_baixa" : "data_pagamento";
      const caixa = arredondarMoeda(principal[n] - descontos[n]);
      const quita = principal[n] >= saldo;
      const patch = {
        valor_pago: caixa, valor_juros: null, valor_multa: null, valor_desconto: descontos[n] || null,
        status: quita ? (origem === "lancamentos" ? "baixado" : "pago") : "parcial",
        [campoData]: data, conta_bancaria: conta,
        ...(quita ? {} : { lote_saldo_id: saldoId, vencimento_saldo: vencimento || null }),
      };
      const r = await db.from(origem).update(patch).eq("id", original.id).eq("lote_id", lote.id).eq("status", original.status).is("valor_pago", null).select("id");
      if (r.error) throw r.error;
      if (r.data?.length !== 1) throw erro("Um dos títulos foi alterado durante o pagamento. Atualize a tela e tente novamente.");
      desfazer.push(async () => {
        // Apaga a parte em aberto criada pelo gatilho e devolve o título ao estado anterior
        if (!quita) {
          const parte = await db.from(origem).delete().eq("lote_id", saldoId).eq("titulo_origem_id", original.titulo_origem_id ?? original.id).select("id");
          if (parte.error) throw erro("Falha ao reverter título.");
        }
        const v = await db.from(origem).update({
          valor: original.valor, status: original.status, valor_pago: original.valor_pago, valor_juros: original.valor_juros,
          valor_multa: original.valor_multa, valor_desconto: original.valor_desconto, [campoData]: original[campoData] ?? null,
          conta_bancaria: original.conta_bancaria ?? null, pagamento_parcial: original.pagamento_parcial ?? false,
          titulo_origem_id: original.titulo_origem_id ?? null, valor_titulo_origem: original.valor_titulo_origem ?? null,
        }).eq("id", original.id).eq("lote_id", lote.id).select("id");
        if (v.error || v.data?.length !== 1) throw erro("Falha ao reverter título.");
      });
      const ri = await db.from("pagamento_lote_itens").update({ valor_pago: caixa, valor_juros: null, valor_multa: null, valor_desconto: descontos[n] || null })
        .eq("id", item.id).eq("lote_id", lote.id).select("id");
      if (ri.error) throw ri.error;
      if (ri.data?.length !== 1) throw erro("O item do borderô foi alterado durante o pagamento.");
      desfazer.push(async () => {
        const v = await db.from("pagamento_lote_itens").update({ valor_pago: item.valor_pago, valor_juros: item.valor_juros ?? null,
          valor_multa: item.valor_multa ?? null, valor_desconto: item.valor_desconto ?? null }).eq("id", item.id).eq("lote_id", lote.id).select("id");
        if (v.error || v.data?.length !== 1) throw erro("Falha ao reverter rateio.");
      });
    }
    // Itens do borderô do saldo: as partes em aberto (e os títulos movidos inteiros)
    const novosItens: { lote_id: string; lancamento_id: string; origem_tabela: string; valor_pago: number }[] = [];
    for (const origem of ["lancamentos", "empresa_lancamentos"] as const) {
      const r = await db.from(origem).select("id, valor").eq("lote_id", saldoId).order("id");
      if (r.error) throw r.error;
      for (const t of (r.data ?? []) as { id: string; valor: number }[])
        novosItens.push({ lote_id: saldoId, lancamento_id: t.id, origem_tabela: origem, valor_pago: arredondarMoeda(Number(t.valor)) });
    }
    const somaSaldo = arredondarMoeda(novosItens.reduce((s, i) => s + i.valor_pago, 0));
    if (Math.abs(somaSaldo - arredondarMoeda(lote.valor_total - totalPrincipal)) > 0.01)
      throw erro("O saldo dos títulos não confere com o saldo do borderô. Nada foi alterado; atualize a tela e tente novamente.");
    if (novosItens.length) {
      const ri = await db.from("pagamento_lote_itens").insert(novosItens);
      if (ri.error) throw ri.error;
    }
    // Este borderô passa a ser o pagamento: pago, com o valor pago
    const patch: Record<string, unknown> = {
      status: "pago", valor_total: arredondarMoeda(totalPrincipal), valor_pago: arredondarMoeda(totalPrincipal),
      valor_juros: 0, valor_multa: 0, valor_desconto: arredondarMoeda(totalDesconto),
      data_pagamento: data, conta_bancaria: conta, pagamento_parcial: true, lote_origem_id: origemLote, valor_lote_origem: valorOrigem,
    };
    if (titulo.numero_titulo !== undefined) patch.numero_titulo = titulo.numero_titulo || null;
    let q = db.from("pagamento_lotes").update(patch).eq("id", lote.id).eq("status", lote.status ?? "pendente");
    q = lote.valor_pago == null ? q.is("valor_pago", null) : q.eq("valor_pago", lote.valor_pago);
    const r = await q.select("id");
    if (r.error) throw r.error;
    if (r.data?.length !== 1) throw erro("O borderô foi alterado durante o pagamento. Atualize a tela.");
  } catch (e) {
    let falhou = false;
    for (const reverter of desfazer.reverse()) {
      try { await reverter(); } catch { falhou = true; }
    }
    // O FK remove em cascata os itens do borderô do saldo
    const del = await db.from("pagamento_lotes").delete().eq("id", saldoId);
    if (del.error) falhou = true;
    if (falhou) throw erro("O pagamento não foi concluído e houve falha na reversão. Confira os títulos antes de tentar novamente.");
    throw e;
  }
}
