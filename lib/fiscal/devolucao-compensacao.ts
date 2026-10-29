// Devolução de compra × títulos da NF original — ENCONTRO DE CONTAS (29/10/2026). Antes a devolução sempre gerava um
// título a receber do fornecedor e deixava os CPs da compra em aberto (caso real: NF 158602 da RZK devolvida inteira —
// R$ 2,4 mi a pagar e R$ 2,4 mi a receber, ao mesmo tempo). Agora o valor devolvido abate os CPs ainda em aberto da NF
// original (das últimas parcelas para as primeiras), sem caixa; o título a receber da devolução fica baixado no valor
// compensado e só o que sobrar (CP já pago) continua a receber. Tudo o que foi abatido fica gravado na NF de devolução
// (nf_entradas.compensacoes — Seção 393) para o cancelamento/estorno da devolução devolver os CPs como estavam.
import type { SupabaseClient } from "@supabase/supabase-js";

type Compensacao = { lancamento_id: string; valor: number; valor_pago_antes: number | null; status_antes: string; data_baixa_antes: string | null;
  conciliado_antes: boolean | null; observacao_antes: string | null; forma_antes: string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const ABERTOS = ["em_aberto", "vencido", "vencendo", "parcial"];

/** Abate o valor da devolução nos CPs em aberto da NF original. Sem a Seção 393, não faz nada (fica o título a receber). */
export async function compensarDevolucao(sb: SupabaseClient, p: { nfDevId: string; nfOrigemId: string; numeroDev: string; valor: number; data: string; crId?: string | null }): Promise<{ compensado: number; titulos: number }> {
  const { error: eCol } = await sb.from("nf_entradas").select("compensacoes").eq("id", p.nfDevId).maybeSingle();
  if (eCol) return { compensado: 0, titulos: 0 };
  const { data: cps } = await sb.from("lancamentos")
    .select("id, valor, valor_pago, status, data_baixa, conciliado, observacao, forma_pagamento, natureza, moeda, data_vencimento, lote_id")
    .eq("nf_entrada_id", p.nfOrigemId).eq("tipo", "pagar").in("status", ABERTOS)
    .order("data_vencimento", { ascending: false });
  let resta = r2(p.valor);
  const feitas: Compensacao[] = [];
  for (const cp of cps ?? []) {
    if (resta <= 0.005) break;
    if (cp.natureza === "previsao" || (cp.moeda ?? "BRL") !== "BRL" || cp.lote_id) continue;
    const saldo = r2(Number(cp.valor) - Number(cp.valor_pago ?? 0));
    if (saldo <= 0.005) continue;
    const v = r2(Math.min(saldo, resta));
    const pago = r2(Number(cp.valor_pago ?? 0) + v);
    const { error } = await sb.from("lancamentos").update({
      valor_pago: pago, status: pago >= Number(cp.valor) - 0.01 ? "baixado" : "parcial", data_baixa: p.data, conciliado: true,
      forma_pagamento: "Compensação (devolução)",
      observacao: [cp.observacao, `Compensado com a devolução NF ${p.numeroDev} (R$ ${v.toFixed(2)})`].filter(Boolean).join(" | ").slice(0, 1000),
    }).eq("id", cp.id);
    if (error) continue;
    feitas.push({ lancamento_id: cp.id, valor: v, valor_pago_antes: cp.valor_pago, status_antes: cp.status, data_baixa_antes: cp.data_baixa,
      conciliado_antes: cp.conciliado, observacao_antes: cp.observacao, forma_antes: cp.forma_pagamento });
    resta = r2(resta - v);
  }
  const compensado = r2(p.valor - resta);
  if (!feitas.length) return { compensado: 0, titulos: 0 };
  await sb.from("nf_entradas").update({ compensacoes: feitas }).eq("id", p.nfDevId);
  // Título a receber da devolução: baixado no que foi compensado (o resto continua a receber do fornecedor)
  if (p.crId) {
    await sb.from("lancamentos").update({
      valor_pago: compensado, status: compensado >= p.valor - 0.01 ? "baixado" : "parcial", data_baixa: p.data, conciliado: compensado >= p.valor - 0.01,
      observacao: `Compensado com os títulos a pagar da NF de compra (R$ ${compensado.toFixed(2)})${resta > 0.005 ? ` — falta receber R$ ${resta.toFixed(2)}` : ""}`,
    }).eq("id", p.crId);
  }
  return { compensado, titulos: feitas.length };
}

/** Desfaz o encontro de contas (cancelamento/estorno da devolução): os CPs da compra voltam como estavam. */
export async function desfazerCompensacaoDevolucao(sb: SupabaseClient, nfDevId: string): Promise<number> {
  const { data: nf, error } = await sb.from("nf_entradas").select("compensacoes").eq("id", nfDevId).maybeSingle();
  if (error || !nf?.compensacoes) return 0;
  const lista = nf.compensacoes as Compensacao[];
  for (const c of lista) {
    const { data: cp } = await sb.from("lancamentos").select("valor_pago").eq("id", c.lancamento_id).maybeSingle();
    if (!cp) continue;
    const pagoDepois = r2(Number(cp.valor_pago ?? 0) - c.valor);
    const comoAntes = Math.abs(pagoDepois - Number(c.valor_pago_antes ?? 0)) < 0.01;
    await sb.from("lancamentos").update(comoAntes
      ? { valor_pago: c.valor_pago_antes, status: c.status_antes, data_baixa: c.data_baixa_antes, conciliado: c.conciliado_antes ?? false, observacao: c.observacao_antes, forma_pagamento: c.forma_antes }
      : { valor_pago: pagoDepois > 0 ? pagoDepois : null, status: pagoDepois > 0 ? "parcial" : "em_aberto" },
    ).eq("id", c.lancamento_id);
  }
  // O título a receber da devolução volta a "em aberto" (quem cancela/estorna a devolução depois o remove)
  await sb.from("lancamentos").update({ valor_pago: null, status: "em_aberto", data_baixa: null, conciliado: false }).eq("nf_entrada_id", nfDevId).eq("tipo", "receber");
  await sb.from("nf_entradas").update({ compensacoes: null }).eq("id", nfDevId);
  return lista.length;
}
