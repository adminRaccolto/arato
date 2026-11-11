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
      acao:          "baixar" | "reabrir" | "aplicar_adiantamento" | "aplicar_adiantamento_funcionario" | "desvincular_extrato";
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
      adiantamento_salario_id?: string;   // aplicar_adiantamento_funcionario
      valor_aplicado?:   number;
      data_aplicacao?:   string;
      descricao?:        string;
    };

    const sb = admin();
    const id  = body.lancamento_id;
    // Título do produtor ou da empresa (desvincular recebe ids dos dois); adiantamento também tem de ser do cliente.
    const negado = await exigirAcessoRegistros(req, ["lancamentos", "empresa_lancamentos"], body.acao === "desvincular_extrato" ? (body.ids ?? []) : [id, ...(body.ids ?? [])])
      ?? (body.adiantamento_id ? await exigirAcessoRegistro(req, "adiantamentos_fornecedor", body.adiantamento_id) : null)
      ?? (body.adiantamento_salario_id ? await exigirAcessoRegistro(req, "adiantamentos_salario", body.adiantamento_salario_id) : null);
    if (negado) return negado;

    if (body.acao === "desvincular_extrato") {
      await desvincularExtrato(sb, body.ids ?? []);
      return NextResponse.json({ ok: true });
    }

    if (body.acao === "reabrir") {
      return NextResponse.json(await comandoTitulo(sb, req, "lancamentos", id, "reabrir", body));
    }

    // ── APLICAR ADIANTAMENTO DE FUNCIONÁRIO ───────────────────────────────────
    // Exceção à regra do mesmo fornecedor: o adiantamento do funcionário (dinheiro que já saiu do caixa) pode quitar CP
    // em nome de qualquer produtor do mesmo cliente (ex.: conta da farmácia do funcionário com NF em nome do produtor).
    // Sem conta bancária (nenhum dinheiro sai de novo). O título passa para a OG Adiantamento para funcionário (sai da
    // despesa da fazenda) e o adiantamento segue pendente para o desconto na folha/gratificação.
    if (body.acao === "aplicar_adiantamento_funcionario") {
      const adiId = body.adiantamento_salario_id;
      const valorAplicado = Math.round(Number(body.valor_aplicado ?? 0) * 100) / 100;
      if (!adiId || valorAplicado <= 0 || !body.data_aplicacao) {
        return NextResponse.json({ ok: false, error: "Adiantamento, valor e data são obrigatórios" }, { status: 400 });
      }
      const { data: adi, error: eAdi } = await sb.from("adiantamentos_salario")
        .select("id, fazenda_id, funcionario_id, valor, status, tipo, lancamento_id, valor_aplicado_cp, funcionarios(nome)").eq("id", adiId).maybeSingle();
      if (eAdi) return NextResponse.json({ ok: false, error: eAdi.code === "42703" ? "Aplique a Seção 374 do supabase_migrations.sql." : eAdi.message }, { status: 400 });
      if (!adi || adi.status === "cancelado" || adi.tipo === "devolucao") return NextResponse.json({ ok: false, error: "Adiantamento de funcionário não disponível." }, { status: 400 });
      if (adi.lancamento_id === id) return NextResponse.json({ ok: false, error: "Não é possível aplicar o adiantamento no próprio título dele." }, { status: 400 });
      const saldoAdi = Math.round((Number(adi.valor) - Number(adi.valor_aplicado_cp ?? 0)) * 100) / 100;
      if (valorAplicado > saldoAdi + 0.01) return NextResponse.json({ ok: false, error: `Valor maior que o saldo do adiantamento (${saldoAdi.toFixed(2)})` }, { status: 400 });

      // Título: CP do produtor (lancamentos), real, em reais, do mesmo cliente do funcionário
      const { data: cp } = await sb.from("lancamentos")
        .select("id, fazenda_id, tipo, natureza, status, valor, valor_pago, moeda, operacao_gerencial_id, observacao").eq("id", id).maybeSingle();
      if (!cp) return NextResponse.json({ ok: false, error: "Só título do produtor pode ser quitado com adiantamento de funcionário." }, { status: 400 });
      if (cp.tipo !== "pagar" || cp.natureza === "previsao" || cp.status === "cancelado" || (cp.moeda ?? "BRL") !== "BRL") {
        return NextResponse.json({ ok: false, error: "Escolha um título a pagar real, em reais." }, { status: 400 });
      }
      const { data: fz } = await sb.from("fazendas").select("id, conta_id").in("id", [adi.fazenda_id, cp.fazenda_id]);
      const contas = new Set((fz ?? []).map(f => f.conta_id));
      if (contas.size !== 1 || contas.has(null)) return NextResponse.json({ ok: false, error: "O adiantamento é de outro cliente." }, { status: 400 });
      const saldoCp = Math.round((Number(cp.valor ?? 0) - Number(cp.valor_pago ?? 0)) * 100) / 100;
      if (valorAplicado > saldoCp + 0.01) return NextResponse.json({ ok: false, error: `Valor maior que o saldo devedor do CP (${saldoCp.toFixed(2)})` }, { status: 400 });

      const { data: fzCp } = await sb.from("fazendas").select("conta_id").eq("id", cp.fazenda_id).maybeSingle();
      const { data: og } = await sb.from("operacoes_gerenciais").select("id")
        .or([`and(fazenda_id.is.null,conta_id.is.null)`, ...(fzCp?.conta_id ? [`conta_id.eq.${fzCp.conta_id}`] : []), `fazenda_id.eq.${cp.fazenda_id}`].join(","))
        .eq("classificacao", "2.01.01.09.002").eq("inativo", false).limit(1).maybeSingle();
      const nomeFunc = (adi.funcionarios as { nome?: string } | null)?.nome ?? "funcionário";

      // 1. Registra a aplicação (com a OG anterior do título)
      const { error: eApl } = await sb.from("adiantamentos_aplicacoes").insert({
        adiantamento_id: null, adiantamento_salario_id: adiId, fazenda_id: adi.fazenda_id,
        descricao: body.descricao || `Adiantamento de ${nomeFunc} aplicado no CP`,
        valor_aplicado: valorAplicado, data_aplicacao: body.data_aplicacao, lancamento_id: id,
        og_anterior: cp.operacao_gerencial_id ?? null,
      });
      if (eApl) return NextResponse.json({ ok: false, error: eApl.code === "42703" || eApl.code === "PGRST204" ? "Aplique a Seção 374 do supabase_migrations.sql." : eApl.message }, { status: 400 });
      // 2. Consome o saldo do adiantamento (o status fica: o desconto na folha é outra rotina)
      const { error: eUpd } = await sb.from("adiantamentos_salario").update({ valor_aplicado_cp: Math.round((Number(adi.valor_aplicado_cp ?? 0) + valorAplicado) * 100) / 100 }).eq("id", adiId);
      if (eUpd) return NextResponse.json({ ok: false, error: eUpd.message }, { status: 400 });
      // 3. Abate o CP sem conta bancária e marca de quem foi o adiantamento
      const novoTotalCp = Math.round((Number(cp.valor_pago ?? 0) + valorAplicado) * 100) / 100;
      const novoStatusCp = novoTotalCp >= Number(cp.valor ?? 0) - 0.01 ? "baixado" : "parcial";
      const marca = `Pago com adiantamento de ${nomeFunc} (funcionário)`;
      const { error: eCp } = await sb.from("lancamentos").update({
        status: novoStatusCp, valor_pago: novoTotalCp, data_baixa: body.data_aplicacao,
        ...(og?.id ? { operacao_gerencial_id: og.id } : {}),
        observacao: (cp.observacao ?? "").includes(marca) ? cp.observacao : [cp.observacao, marca].filter(Boolean).join(" | "),
      }).eq("id", id);
      if (eCp) return NextResponse.json({ ok: false, error: eCp.message }, { status: 400 });
      await sb.from("parcelas_pagamento")
        .update({ status: novoStatusCp === "baixado" ? "pago" : "parcial", data_pagamento: body.data_aplicacao })
        .eq("lancamento_id", id);
      return NextResponse.json({ ok: true, novo_status_cp: novoStatusCp, novo_total_cp: novoTotalCp, novo_saldo_adiantamento: Math.round((saldoAdi - valorAplicado) * 100) / 100 });
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
