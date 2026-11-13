/**
 * POST /api/financeiro/baixar
 * Baixa (ou reabre) um lançamento CP/CR usando service_role_key
 * — imune a JWT expirado e RLS.
 *
 * Ação "baixar":  salva data_baixa, valor_pago, status e sincroniza parcelas_pagamento.
 * Ação "reabrir": reseta data_baixa, valor_pago, status para em_aberto/vencido.
 */
import { desvincularExtrato } from "../../../../lib/financeiro/desvincular-extrato";
import { ajustarSaldoPedidoNoFC } from "../../../../lib/financeiro/saldo-pedido";
import { ptaxDoDiaQualquerLado } from "../../../../lib/financeiro/ptax";
import { comandoTitulo } from "../../../../lib/financeiro/comando-server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistros, exigirAcessoRegistro } from "../../../../lib/api-auth";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      acao:          "baixar" | "reabrir" | "aplicar_adiantamento" | "desvincular_extrato";
      ids?:          string[];
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
      forma_pagamento?: string;   // troca da forma de pagamento na baixa (ex.: NF dizia boleto, pagou por PIX)
      cotacao_usd?: number;       // título em dólar: cotação do dia do pagamento
      // aplicar_adiantamento
      adiantamento_id?:  string;
      valor_aplicado?:   number;
      data_aplicacao?:   string;
      descricao?:        string;
    };

    const sb = admin();
    const id  = body.lancamento_id;
    // Título do produtor ou da empresa (desvincular recebe ids dos dois); adiantamento também tem de ser do cliente.
    const negado = await exigirAcessoRegistros(req, ["lancamentos", "empresa_lancamentos"], body.acao === "desvincular_extrato" ? (body.ids ?? []) : [id, ...(body.ids ?? [])])
      ?? (body.adiantamento_id ? await exigirAcessoRegistro(req, "adiantamentos_fornecedor", body.adiantamento_id) : null);
    if (negado) return negado;

    if (body.acao === "desvincular_extrato") {
      await desvincularExtrato(sb, body.ids ?? []);
      return NextResponse.json({ ok: true });
    }

    if (body.acao === "reabrir") {
      return NextResponse.json(await comandoTitulo(sb, req, "lancamentos", id, "reabrir", body));
    }

    // ── APLICAR ADIANTAMENTO ──────────────────────────────────────────────────
    // Abate o saldo de um adiantamento a fornecedor diretamente na baixa do CP
    // (parcial ou total) — sem conta bancária, é crédito já pago antes.
    if (body.acao === "aplicar_adiantamento") {
      const { data, error } = await sb.rpc("aplicar_adiantamento_fornecedor_cp", {
        p_adi: body.adiantamento_id, p_cp: id, p_valor_brl: body.valor_aplicado,
        p_data: body.data_aplicacao, p_descricao: body.descricao ?? null, p_cotacao: body.cotacao_usd ?? null,
      });
      if (error) return NextResponse.json({ ok: false, error: error.code === "PGRST202"
        ? "Execute a Seção 421 do supabase_migrations.sql para aplicar o crédito com segurança." : error.message }, { status: 400 });
      let aviso: string | undefined;
      if (data.pedido_compra_id) {
        try { await ajustarSaldoPedidoNoFC(sb, data.pedido_compra_id, ptaxDoDiaQualquerLado); }
        catch (e) { console.error("[saldo-pedido]", e); aviso = "Crédito aplicado. Reabra o pedido para atualizar sua projeção no fluxo de caixa."; }
      }
      return NextResponse.json({ ...data, aviso });
    }

    if (body.acao !== "baixar") return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
    return NextResponse.json(await comandoTitulo(sb, req, "lancamentos", id, "baixar", body));

  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
