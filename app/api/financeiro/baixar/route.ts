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
      acao:          "baixar" | "reabrir" | "aplicar_adiantamento";
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
      multa_valor?:      number;
      juros_valor?:      number;
      desconto_valor?:   number;
      nova_data_vencimento?: string;
      // aplicar_adiantamento
      adiantamento_id?:  string;
      valor_aplicado?:   number;
      data_aplicacao?:   string;
      descricao?:        string;
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

    // ── APLICAR ADIANTAMENTO ──────────────────────────────────────────────────
    // Abate o saldo de um adiantamento a fornecedor diretamente na baixa do CP
    // (parcial ou total) — sem conta bancária, é crédito já pago antes.
    if (body.acao === "aplicar_adiantamento") {
      const adiantamentoId = body.adiantamento_id;
      const valorAplicado  = body.valor_aplicado ?? 0;
      if (!adiantamentoId || valorAplicado <= 0) {
        return NextResponse.json({ ok: false, error: "Adiantamento e valor a aplicar são obrigatórios" }, { status: 400 });
      }

      const { data: adiant } = await sb.from("adiantamentos_fornecedor").select("*").eq("id", adiantamentoId).single();
      if (!adiant) return NextResponse.json({ ok: false, error: "Adiantamento não encontrado" }, { status: 404 });
      if (adiant.lancamento_id === id) {
        return NextResponse.json({ ok: false, error: "Não é possível aplicar um adiantamento no próprio lançamento que ele gerou." }, { status: 400 });
      }
      const saldoAdiantamento = adiant.valor - (adiant.valor_aplicado ?? 0);
      if (valorAplicado > saldoAdiantamento + 0.01) {
        return NextResponse.json({ ok: false, error: `Valor maior que o saldo do adiantamento (${saldoAdiantamento.toFixed(2)})` }, { status: 400 });
      }

      const { data: cp } = await sb.from("lancamentos").select("valor, valor_pago, cotacao_usd, moeda, contrato_financeiro_id, data_vencimento").eq("id", id).single();
      if (!cp) return NextResponse.json({ ok: false, error: "Lançamento (CP) não encontrado" }, { status: 404 });
      const cotacaoCp    = (cp.cotacao_usd as number | null) ?? 5.12;
      const valorTotalCp = cp.moeda === "USD" ? (cp.valor ?? 0) * cotacaoCp : (cp.valor ?? 0);
      const jaPagoCp     = (cp.valor_pago as number | null) ?? 0;
      const saldoCp      = valorTotalCp - jaPagoCp;
      if (valorAplicado > saldoCp + 0.01) {
        return NextResponse.json({ ok: false, error: `Valor maior que o saldo devedor do CP (${saldoCp.toFixed(2)})` }, { status: 400 });
      }

      // 1. Registra a aplicação, ligada a este CP
      const { error: eApl } = await sb.from("adiantamentos_aplicacoes").insert({
        adiantamento_id: adiantamentoId,
        fazenda_id:      adiant.fazenda_id,
        descricao:       body.descricao || "Aplicado na baixa de CP",
        valor_aplicado:  valorAplicado,
        data_aplicacao:  body.data_aplicacao,
        lancamento_id:   id,
      });
      if (eApl) return NextResponse.json({ ok: false, error: eApl.message }, { status: 400 });

      // 2. Reduz o saldo do adiantamento
      const novoTotalAdiantamento  = (adiant.valor_aplicado ?? 0) + valorAplicado;
      const novoStatusAdiantamento = novoTotalAdiantamento >= adiant.valor - 0.01 ? "aplicado" : "parcial";
      const { error: eAdiant } = await sb.from("adiantamentos_fornecedor")
        .update({ valor_aplicado: novoTotalAdiantamento, status: novoStatusAdiantamento })
        .eq("id", adiantamentoId);
      if (eAdiant) return NextResponse.json({ ok: false, error: eAdiant.message }, { status: 400 });

      // 3. Abate o CP — mesma lógica de "baixar", sem tocar conta_bancaria
      // (nenhum dinheiro saiu de banco nesta parte, foi crédito já pago antes)
      const novoTotalCp  = jaPagoCp + valorAplicado;
      const novoStatusCp = novoTotalCp >= valorTotalCp - 0.01 ? "baixado" : "parcial";
      const { error: eCp } = await sb.from("lancamentos")
        .update({ status: novoStatusCp, valor_pago: novoTotalCp, data_baixa: body.data_aplicacao })
        .eq("id", id);
      if (eCp) return NextResponse.json({ ok: false, error: eCp.message }, { status: 400 });

      await sb.from("parcelas_pagamento")
        .update({ status: novoStatusCp === "baixado" ? "pago" : "parcial", data_pagamento: body.data_aplicacao })
        .eq("lancamento_id", id);

      return NextResponse.json({
        ok: true,
        novo_status_cp: novoStatusCp,
        novo_total_cp: novoTotalCp,
        novo_saldo_adiantamento: adiant.valor - novoTotalAdiantamento,
      });
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
    // Detalhamento de encargos — só informativo/relatório, não entra no
    // cálculo de status (o valor_pago_agora já vem com tudo embutido,
    // calculado na tela antes de chegar aqui).
    if (body.multa_valor)            patch.valor_multa            = body.multa_valor;
    if (body.juros_valor)            patch.valor_juros            = body.juros_valor;
    if (body.desconto_valor)         patch.valor_desconto         = body.desconto_valor;

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
