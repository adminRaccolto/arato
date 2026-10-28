/**
 * POST /api/financeiro/baixar
 * Baixa (ou reabre) um lançamento CP/CR usando service_role_key
 * — imune a JWT expirado e RLS.
 *
 * Ação "baixar":  salva data_baixa, valor_pago, status e sincroniza parcelas_pagamento.
 * Ação "reabrir": reseta data_baixa, valor_pago, status para em_aberto/vencido.
 */
import { hojeLocal } from "../../../../lib/data-local";
import { NextRequest, NextResponse } from "next/server";
import { excedeLimiteBaixa, mensagemExcesso } from "../../../../lib/financeiro/baixa";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistros, exigirAcessoRegistro } from "../../../../lib/api-auth";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

/** Tira os títulos informados das linhas de extrato conciliadas e limpa o flag conciliado deles. */
async function desvincularExtrato(sb: ReturnType<typeof admin>, ids: string[]) {
  for (const id of ids) {
    const { data: linhas } = await sb.from("extrato_transacoes").select("id, lancamento_id, lancamento_ids")
      .or(`lancamento_id.eq.${id},lancamento_ids.cs.{${id}}`);
    for (const t of linhas ?? []) {
      const todos: string[] = (t.lancamento_ids?.length ? t.lancamento_ids : t.lancamento_id ? [t.lancamento_id] : []) as string[];
      const resto = todos.filter(x => x !== id);
      await sb.from("extrato_transacoes").update(resto.length
        ? { lancamento_ids: resto, lancamento_id: resto[0], updated_at: new Date().toISOString() }
        : { conciliado: false, lancamento_ids: null, lancamento_id: null, lancamento_desc: null, lancamento_valor: null, origem_vinculo: null, confianca: null, regra_id: null, updated_at: new Date().toISOString() }
      ).eq("id", t.id);
    }
    await sb.from("lancamentos").update({ conciliado: false }).eq("id", id);
  }
}

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
      const { data: l } = await sb.from("lancamentos").select("data_vencimento").eq("id", id).single();
      const hoje = hojeLocal();
      const novoStatus = l?.data_vencimento && l.data_vencimento < hoje ? "vencido" : "em_aberto";
      const { error } = await sb.from("lancamentos")
        .update({ status: novoStatus, data_baixa: null, valor_pago: null, lote_id: null })
        .eq("id", id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      // Título reaberto não pode continuar "conciliado" nem ligado a uma linha do extrato: antes a
      // linha seguia verde no extrato com o título em aberto no CP (divergência extrato × CP).
      await desvincularExtrato(sb, [id]);
      return NextResponse.json({ ok: true, novo_status: novoStatus });
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
      // Adiantamento a fornecedor só quita CP do MESMO fornecedor (mesmo cadastro ou mesmo CPF/CNPJ). Antes só a tela
      // filtrava; o servidor aceitava qualquer combinação. Pagar conta de outro com adiantamento: só o de funcionário.
      const { data: cpPessoa } = await sb.from("lancamentos").select("pessoa_id").eq("id", id).maybeSingle();
      if (!adiant.pessoa_id || !cpPessoa?.pessoa_id) {
        return NextResponse.json({ ok: false, error: "Adiantamento e título precisam ter o fornecedor informado." }, { status: 400 });
      }
      if (adiant.pessoa_id !== cpPessoa.pessoa_id) {
        const { data: ps } = await sb.from("pessoas").select("id, cpf_cnpj").in("id", [adiant.pessoa_id, cpPessoa.pessoa_id]);
        const docs = new Set((ps ?? []).map(x => String(x.cpf_cnpj ?? "").replace(/\D/g, "")));
        if ((ps ?? []).length !== 2 || docs.size !== 1 || docs.has("")) {
          return NextResponse.json({ ok: false, error: "O adiantamento é de outro fornecedor. Adiantamento a fornecedor só quita título do mesmo fornecedor." }, { status: 400 });
        }
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
      .select("valor, cotacao_usd, moeda, valor_pago, contrato_financeiro_id, data_vencimento, valor_multa, valor_juros, valor_desconto")
      .eq("id", id).single();

    const cotacao    = (atual?.cotacao_usd as number | null) ?? 5.12;
    const valorTotal = atual?.moeda === "USD" ? (atual.valor ?? 0) * cotacao : (atual?.valor ?? 0);
    const jaRPago    = (atual?.valor_pago as number | null) ?? 0;
    const agora      = body.valor_pago_agora ?? 0;
    const novoTotal  = jaRPago + agora;
    const desconto   = body.desconto_valor ?? 0;
    const novoStatus = novoTotal + desconto >= valorTotal - 0.01 ? "baixado" : "parcial";

    // Ninguém paga/recebe mais do que o título vale (juros e multa só contam se informados na baixa)
    const tetoTitulo = {
      valor: atual?.valor, moeda: atual?.moeda, cotacao_usd: atual?.cotacao_usd,
      valor_multa: body.multa_valor ?? (atual?.valor_multa as number | null),
      valor_juros: body.juros_valor ?? (atual?.valor_juros as number | null),
      valor_desconto: body.desconto_valor ?? (atual?.valor_desconto as number | null),
    };
    if (excedeLimiteBaixa(tetoTitulo, novoTotal)) {
      return NextResponse.json({ ok: false, error: mensagemExcesso(tetoTitulo, novoTotal) }, { status: 422 });
    }

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
    // Informado (inclusive 0) substitui o que estava gravado — achado real 28/10/2026: um desconto de R$ 40 que
    // ficou no título de uma tentativa anterior entrava no teto da baixa mesmo com 0 na tela, e barrava os juros.
    if (body.multa_valor !== undefined)    patch.valor_multa    = body.multa_valor || null;
    if (body.juros_valor !== undefined)    patch.valor_juros    = body.juros_valor || null;
    if (body.desconto_valor !== undefined) patch.valor_desconto = body.desconto_valor || null;

    // Pagamento parcial divide o título (Seção 375): esta parte fica baixada com o valor pago e o saldo vira um título
    // novo, com o vencimento informado (vencimento_saldo, na mesma gravação). Título parcial antigo (já tinha valor
    // pago) segue o jeito anterior: só reprograma o vencimento.
    const divide = novoStatus === "parcial" && !jaRPago;
    if (novoStatus === "parcial" && body.nova_data_vencimento && divide) patch.vencimento_saldo = body.nova_data_vencimento;
    let { error } = await sb.from("lancamentos").update(patch).eq("id", id);
    if (error && "vencimento_saldo" in patch && (error.code === "42703" || error.code === "PGRST204")) {
      delete patch.vencimento_saldo;   // Seção 375 ainda não rodada
      ({ error } = await sb.from("lancamentos").update(patch).eq("id", id));
      if (!error) await sb.from("lancamentos").update({ data_vencimento: body.nova_data_vencimento }).eq("id", id);
    }
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    // Parcial antigo: reprograma vencimento com a nova data
    if (novoStatus === "parcial" && body.nova_data_vencimento && !divide) {
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
