/**
 * POST /api/financeiro/bordero-acao
 * Cancelar, estornar e confirmar pagamento de um borderô — usa
 * service_role_key, imune a JWT expirado e RLS.
 *
 * Antes essas 3 ações chamavam o supabase direto do navegador (cliente
 * anônimo) — caso real: bordêros pendentes ficavam "vazios" (0 itens em
 * pagamento_lote_itens, 0 lançamentos com lote_id apontando pra eles, mas o
 * registro em pagamento_lotes nunca era excluído) porque o DELETE do
 * navegador falhava silenciosamente por RLS/JWT expirado sem que o usuário
 * conseguisse repetir a ação com sucesso — o mesmo padrão já documentado em
 * outras rotas deste projeto (JWT expira, a policy está correta, mas o
 * cliente anônimo não reautentica a tempo).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

async function excluirLote(sb: SupabaseClient, lote_id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: ie } = await sb.from("pagamento_lote_itens").delete().eq("lote_id", lote_id);
  if (ie) return { ok: false, error: ie.message };
  const { error: de } = await sb.from("pagamento_lotes").delete().eq("id", lote_id);
  if (de) return { ok: false, error: de.message };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      acao: "cancelar" | "estornar" | "confirmar";
      lote_id: string;
      data_pagamento?: string;
      conta_bancaria?: string;
    };
    const { acao, lote_id } = body;
    if (!lote_id) return NextResponse.json({ ok: false, error: "lote_id obrigatório" }, { status: 400 });

    const sb = admin();

    // ── CANCELAR — borderô pendente, ainda não baixou nenhum lançamento ──────
    if (acao === "cancelar") {
      const { error: ue } = await sb.from("lancamentos").update({ lote_id: null }).eq("lote_id", lote_id);
      if (ue) return NextResponse.json({ ok: false, error: ue.message }, { status: 500 });
      const res = await excluirLote(sb, lote_id);
      if (!res.ok) return NextResponse.json(res, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ── ESTORNAR — borderô já pago; reverte os lançamentos pra em_aberto ─────
    if (acao === "estornar") {
      const { error: ue } = await sb.from("lancamentos")
        .update({ status: "em_aberto", lote_id: null, valor_pago: null, data_baixa: null, conta_bancaria: null })
        .eq("lote_id", lote_id).eq("status", "baixado");
      if (ue) return NextResponse.json({ ok: false, error: ue.message }, { status: 500 });
      const res = await excluirLote(sb, lote_id);
      if (!res.ok) return NextResponse.json(res, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ── CONFIRMAR — define data/conta e baixa todos os títulos do borderô ────
    if (acao === "confirmar") {
      const { data_pagamento, conta_bancaria } = body;
      if (!data_pagamento || !conta_bancaria) {
        return NextResponse.json({ ok: false, error: "Data de pagamento e conta bancária são obrigatórios" }, { status: 400 });
      }

      const { data: itens, error: ie } = await sb.from("pagamento_lote_itens")
        .select("lancamento_id, valor_pago, valor_multa, valor_juros, valor_desconto")
        .eq("lote_id", lote_id);
      if (ie) return NextResponse.json({ ok: false, error: ie.message }, { status: 500 });

      const { error: le } = await sb.from("pagamento_lotes")
        .update({ status: "pago", data_pagamento, conta_bancaria })
        .eq("id", lote_id);
      if (le) return NextResponse.json({ ok: false, error: le.message }, { status: 500 });

      // Acumula sobre o valor_pago já existente (título parcial não perde o
      // que já tinha sido pago) e decide baixado/parcial com a mesma regra
      // da baixa individual — mesmo fix aplicado hoje em criarPagamentoLote.
      const ids = (itens ?? []).map(i => i.lancamento_id);
      const { data: atuais } = await sb.from("lancamentos")
        .select("id, valor, cotacao_usd, moeda, valor_pago")
        .in("id", ids);
      const mapaAtual = new Map((atuais ?? []).map(l => [l.id as string, l]));

      for (const item of (itens ?? [])) {
        const at        = mapaAtual.get(item.lancamento_id);
        const cotacao    = (at?.cotacao_usd as number | null) ?? 5.12;
        const valorTotal = at?.moeda === "USD" ? (at.valor ?? 0) * cotacao : (at?.valor ?? 0);
        const jaPago     = (at?.valor_pago as number | null) ?? 0;
        const novoTotal  = jaPago + item.valor_pago;
        const desconto   = item.valor_desconto ?? 0;
        const novoStatus = novoTotal + desconto >= valorTotal - 0.01 ? "baixado" : "parcial";
        const { error: be } = await sb.from("lancamentos")
          .update({
            status: novoStatus, valor_pago: novoTotal, data_baixa: data_pagamento, conta_bancaria, lote_id,
            valor_multa: item.valor_multa || null, valor_juros: item.valor_juros || null, valor_desconto: item.valor_desconto || null,
          })
          .eq("id", item.lancamento_id);
        if (be) return NextResponse.json({ ok: false, error: be.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
