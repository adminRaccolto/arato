/**
 * POST /api/empresa-lancamentos/baixar
 * Baixa (total/parcial, com juros/multa/desconto e prorrogação do saldo) ou reabre
 * um lançamento de empresa_lancamentos — mesma regra do /api/financeiro/baixar do produtor.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser, validateFazendaAccess } from "../../../../lib/api-auth";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });

    const body = await req.json() as {
      acao: "baixar" | "reabrir";
      lancamento_id: string;
      valor_pago_agora?: number;
      data_baixa?: string;
      conta_bancaria?: string;
      observacao?: string;
      multa_valor?: number;
      juros_valor?: number;
      desconto_valor?: number;
      nova_data_vencimento?: string;
    };

    const sb = admin();
    const { data: atual } = await sb.from("empresa_lancamentos")
      .select("fazenda_id, valor, moeda, cotacao_usd, valor_pago, data_vencimento, valor_desconto")
      .eq("id", body.lancamento_id).maybeSingle();
    if (!atual) return NextResponse.json({ ok: false, error: "Lançamento não encontrado" }, { status: 404 });

    const access = await validateFazendaAccess(atual.fazenda_id as string);
    if (!access.ok) return NextResponse.json({ ok: false, error: access.error }, { status: access.status });

    if (body.acao === "reabrir") {
      const { error } = await sb.from("empresa_lancamentos").update({
        status: "pendente", data_pagamento: null, valor_pago: null,
        valor_multa: null, valor_juros: null, valor_desconto: null, data_prorrogacao: null,
      }).eq("id", body.lancamento_id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, novo_status: "pendente" });
    }

    const cotacao    = (atual.cotacao_usd as number | null) ?? 5.12;
    const valorTotal = atual.moeda === "USD" ? (atual.valor ?? 0) * cotacao : (atual.valor ?? 0);
    const agora      = body.valor_pago_agora ?? 0;
    if (agora <= 0 && !(body.desconto_valor ?? 0)) {
      return NextResponse.json({ ok: false, error: "Informe o valor pago." }, { status: 400 });
    }
    const novoTotal  = ((atual.valor_pago as number | null) ?? 0) + agora;
    const descAcum   = ((atual.valor_desconto as number | null) ?? 0) + (body.desconto_valor ?? 0);
    const novoStatus = novoTotal + descAcum >= valorTotal - 0.01 ? "pago" : "parcial";

    const patch: Record<string, unknown> = {
      status: novoStatus,
      valor_pago: novoTotal,
      data_pagamento: body.data_baixa,
      conta_bancaria: body.conta_bancaria || null,
    };
    if (body.observacao)      patch.observacao = body.observacao;
    if (body.multa_valor)     patch.valor_multa = body.multa_valor;
    if (body.juros_valor)     patch.valor_juros = body.juros_valor;
    if (body.desconto_valor)  patch.valor_desconto = descAcum;
    if (novoStatus === "parcial" && body.nova_data_vencimento) {
      patch.data_vencimento = body.nova_data_vencimento;
      patch.data_prorrogacao = body.nova_data_vencimento;
    }
    const { error } = await sb.from("empresa_lancamentos").update(patch).eq("id", body.lancamento_id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, novo_status: novoStatus, novo_total: novoTotal });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
