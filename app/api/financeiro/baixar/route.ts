/**
 * POST /api/financeiro/baixar
 * Baixa (ou reabre) um lançamento CP/CR usando service_role_key
 * — imune a JWT expirado e RLS.
 *
 * Ação "baixar":  salva data_baixa, valor_pago, status e sincroniza parcelas_pagamento.
 * Ação "reabrir": reseta data_baixa, valor_pago, status para em_aberto/vencido.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      acao:          "baixar" | "reabrir";
      lancamento_id: string;
      // baixar
      valor_pago_agora?: number;
      data_baixa?:       string;
      conta_bancaria?:   string;
      pessoa_id?:        string;
      operacao_gerencial_id?: string;
      ano_safra_id?:     string;
      ciclo_id?:         string;
      observacao?:       string;
      desconto_valor?:   number;
      nova_data_vencimento?: string;
    };

    const sb = admin();
    const id  = body.lancamento_id;

    if (body.acao === "reabrir") {
      const { data: l } = await sb.from("lancamentos").select("data_vencimento").eq("id", id).single();
      const hoje = new Date().toISOString().slice(0, 10);
      const novoStatus = l?.data_vencimento && l.data_vencimento < hoje ? "vencido" : "em_aberto";
      const { error } = await sb.from("lancamentos")
        .update({ status: novoStatus, data_baixa: null, valor_pago: null, lote_id: null })
        .eq("id", id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, novo_status: novoStatus });
    }

    // ── BAIXAR ──────────────────────────────────────────────────────────────
    const { data: atual } = await sb.from("lancamentos")
      .select("valor, cotacao_usd, moeda, valor_pago, contrato_financeiro_id, data_vencimento")
      .eq("id", id).single();

    const cotacao    = (atual?.cotacao_usd as number | null) ?? 5.12;
    const valorTotal = atual?.moeda === "USD" ? (atual.valor ?? 0) * cotacao : (atual?.valor ?? 0);
    const jaRPago    = (atual?.valor_pago as number | null) ?? 0;
    const agora      = body.valor_pago_agora ?? 0;
    const novoTotal  = jaRPago + agora;
    const desconto   = body.desconto_valor ?? 0;
    const novoStatus = novoTotal + desconto >= valorTotal - 0.01 ? "baixado" : "parcial";

    const patch: Record<string, unknown> = {
      status:         novoStatus,
      valor_pago:     novoTotal,
      data_baixa:     body.data_baixa,
      conta_bancaria: body.conta_bancaria ?? null,
    };
    if (body.pessoa_id)              patch.pessoa_id              = body.pessoa_id;
    if (body.operacao_gerencial_id)  patch.operacao_gerencial_id  = body.operacao_gerencial_id;
    if (body.ano_safra_id)           patch.ano_safra_id           = body.ano_safra_id;
    if (body.ciclo_id)               patch.ciclo_id               = body.ciclo_id;
    if (body.observacao)             patch.observacao             = body.observacao;

    const { error } = await sb.from("lancamentos").update(patch).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    // Reprograma vencimento se pagamento parcial com nova data
    if (novoStatus === "parcial" && body.nova_data_vencimento) {
      await sb.from("lancamentos")
        .update({ data_vencimento: body.nova_data_vencimento })
        .eq("id", id);
    }

    // Sincroniza parcelas_pagamento via lancamento_id
    const patchParcela = {
      status:          novoStatus === "baixado" ? "pago" : "parcial",
      data_pagamento:  body.data_baixa,
    };
    await sb.from("parcelas_pagamento").update(patchParcela).eq("lancamento_id", id);

    // Fallback via contrato_financeiro_id + data_vencimento
    if (atual?.contrato_financeiro_id && atual?.data_vencimento) {
      await sb.from("parcelas_pagamento")
        .update(patchParcela)
        .eq("contrato_id", atual.contrato_financeiro_id)
        .eq("data_vencimento", atual.data_vencimento)
        .neq("status", "pago");
    }

    return NextResponse.json({ ok: true, novo_status: novoStatus, novo_total: novoTotal });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
