// POST /api/financeiro/contratos/refinanciamento — refinanciamento / consolidação 1→1 ou N→1 (30/10/2026)
//   { acao: "saldo", contrato_origem_id, data? } → saldo devedor sugerido da origem, conta de pagamento dela e quantos títulos serão baixados
//   { acao: "vincular", contrato_novo_id, contrato_origem_id, valor_liquidacao, conta_bancaria, data }
//     → o banco deposita a cédula nova e debita a liquidação de cada contrato antigo no mesmo dia: os títulos a pagar da
//       origem são BAIXADOS na conta indicada pelo valor debitado (amortizações e juros vencidos; a diferença paga os juros
//       do período; juros futuros não cobrados saem como desconto). A origem fica Refinanciado; o estado anterior de cada
//       título fica no vínculo.
//   { acao: "desvincular", id } → estorna as baixas (as que ninguém mexeu nem conciliou depois) e a origem volta a Ativo.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../../lib/api-auth";
import { hojeLocal } from "../../../../../lib/data-local";
import {
  notaRefinanciamento, planejarLiquidacao, podeRestaurar, saldoDevedorOrigem,
  type TituloAntes, type TituloOrigem,
} from "../../../../../lib/financeiro/refinanciamento";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const SECAO = "Aplique a Seção 398 do supabase_migrations.sql (refinanciamento guarda os títulos liquidados).";
const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Sb = ReturnType<typeof admin>;
async function titulosDaOrigem(sb: Sb, contratoId: string): Promise<TituloOrigem[]> {
  const { data, error } = await sb.from("lancamentos")
    .select("id, tipo, status, valor, valor_pago, data_vencimento, descricao, observacao, lote_id, moeda, cotacao_usd, data_baixa, conta_bancaria, valor_desconto, valor_juros")
    .eq("contrato_financeiro_id", contratoId).order("id");
  if (error) throw error;
  return (data ?? []) as TituloOrigem[];
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as { acao: "saldo" | "vincular" | "desvincular"; contrato_novo_id?: string; contrato_origem_id?: string;
      valor_liquidacao?: number | null; conta_bancaria?: string | null; data?: string; id?: string };
    const sb = admin();
    const data = b.data || hojeLocal();

    if (b.acao === "desvincular") {
      const negado = await exigirAcessoRegistro(req, "contratos_refinanciamento", b.id);
      if (negado) return negado;
      const { data: v, error: eV } = await sb.from("contratos_refinanciamento").select("*").eq("id", b.id!).maybeSingle();
      if (eV) return NextResponse.json({ ok: false, error: eV.message }, { status: 400 });
      if (!v) return NextResponse.json({ ok: false, error: "Vínculo não encontrado." }, { status: 404 });
      let devolvidos = 0, mantidos = 0;
      for (const antes of (v.titulos_encerrados ?? []) as TituloAntes[]) {
        const { data: atual } = await sb.from("lancamentos").select("status, valor, valor_pago, conciliado").eq("id", antes.id).maybeSingle();
        if (!atual || !podeRestaurar(atual, antes)) { mantidos++; continue; }
        const volta = antes.acao === "baixado"
          ? { status: antes.status, valor_pago: antes.valor_pago ?? null, data_baixa: antes.data_baixa ?? null, conta_bancaria: antes.conta_bancaria ?? null,
              valor_desconto: antes.valor_desconto ?? null, valor_juros: antes.valor_juros ?? null, observacao: antes.observacao }
          : { status: antes.status, valor: antes.valor, observacao: antes.observacao };
        const { error } = await sb.from("lancamentos").update(volta).eq("id", antes.id);
        if (error) throw error;
        if (antes.acao === "baixado") {
          await sb.from("parcelas_pagamento").update({ status: antes.status === "vencido" ? "vencido" : "em_aberto", data_pagamento: null }).eq("lancamento_id", antes.id);
        }
        devolvidos++;
      }
      await sb.from("contratos_refinanciamento").delete().eq("id", v.id);
      const { error: eAtivo } = await sb.from("contratos_financeiros").update({ status: "ativo", refinanciado_por_id: null }).eq("id", v.contrato_origem_id);
      if (eAtivo) throw eAtivo;
      return NextResponse.json({ ok: true, devolvidos, mantidos });
    }

    const negado = await exigirAcessoRegistro(req, "contratos_financeiros", b.contrato_origem_id);
    if (negado) return negado;
    const titulos = await titulosDaOrigem(sb, b.contrato_origem_id!);
    const saldo = saldoDevedorOrigem(titulos, data);

    if (b.acao === "saldo") {
      const { data: origem } = await sb.from("contratos_financeiros").select("conta_pagamento_id").eq("id", b.contrato_origem_id!).maybeSingle();
      const plano = planejarLiquidacao(titulos, saldo, data);
      return NextResponse.json({ ok: true, saldo, conta_pagamento_id: origem?.conta_pagamento_id ?? null, titulos: plano.itens.length, em_bordero: plano.emBordero.length });
    }
    if (b.acao !== "vincular") return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });

    const negadoNovo = await exigirAcessoRegistro(req, "contratos_financeiros", b.contrato_novo_id);
    if (negadoNovo) return negadoNovo;
    if (b.contrato_novo_id === b.contrato_origem_id) return NextResponse.json({ ok: false, error: "Um contrato não pode refinanciar ele mesmo." }, { status: 400 });
    const valor = Number(b.valor_liquidacao) || 0;
    if (valor <= 0) return NextResponse.json({ ok: false, error: "Informe o valor da liquidação (o débito do contrato antigo no extrato)." }, { status: 400 });
    if (!b.conta_bancaria) return NextResponse.json({ ok: false, error: "Informe a conta bancária em que o banco debitou a liquidação." }, { status: 400 });
    const plano = planejarLiquidacao(titulos, valor, data);
    if (plano.emBordero.length) {
      const v = plano.emBordero.reduce((s, t) => s + (Number(t.valor) || 0) - (Number(t.valor_pago) || 0), 0);
      return NextResponse.json({ ok: false, error: `${plano.emBordero.length} título(s) do contrato de origem (${fmtBRL(v)}) estão em borderô ainda não pago. Confirme ou estorne o borderô antes de refinanciar.` }, { status: 400 });
    }
    if (!plano.itens.length) return NextResponse.json({ ok: false, error: "O contrato de origem não tem títulos a pagar no Contas a Pagar." }, { status: 400 });
    const { data: novo } = await sb.from("contratos_financeiros").select("id, fazenda_id, numero_documento, descricao").eq("id", b.contrato_novo_id!).maybeSingle();
    if (!novo) return NextResponse.json({ ok: false, error: "Contrato novo não encontrado." }, { status: 404 });
    const cedula = novo.numero_documento || novo.descricao || novo.id.slice(0, 8);

    const antes: TituloAntes[] = plano.itens.map(({ titulo: t, pago }) => ({
      id: t.id, acao: "baixado", status: t.status, valor: t.valor, valor_pago: t.valor_pago, observacao: t.observacao ?? null,
      data_baixa: t.data_baixa ?? null, conta_bancaria: t.conta_bancaria ?? null, valor_desconto: t.valor_desconto ?? null,
      valor_juros: t.valor_juros ?? null, pago_depois: Math.round(((Number(t.valor_pago) || 0) + pago) * 100) / 100,
    }));
    const { data: vinculo, error: eIns } = await sb.from("contratos_refinanciamento")
      .insert({ contrato_novo_id: novo.id, contrato_origem_id: b.contrato_origem_id, fazenda_id: novo.fazenda_id, saldo_incorporado: valor, titulos_encerrados: antes })
      .select("*, contrato_origem:contratos_financeiros!contrato_origem_id(*)").single();
    if (eIns) return NextResponse.json({ ok: false, error: eIns.code === "42703" || eIns.code === "PGRST204" ? SECAO : eIns.message }, { status: 400 });

    // A origem vira Refinanciado antes de baixar os títulos: se o banco recusar (Seção 399 não rodada), nada é baixado
    const { error: eStatus } = await sb.from("contratos_financeiros").update({ status: "refinanciado", refinanciado_por_id: novo.id }).eq("id", b.contrato_origem_id!);
    if (eStatus) {
      await sb.from("contratos_refinanciamento").delete().eq("id", vinculo.id);
      return NextResponse.json({ ok: false, error: eStatus.code === "23514" ? "Aplique a Seção 399 do supabase_migrations.sql (status Refinanciado em contratos financeiros)." : eStatus.message }, { status: 400 });
    }
    for (const [i, it] of plano.itens.entries()) {
      const { error } = await sb.from("lancamentos").update({
        status: "baixado", valor_pago: antes[i].pago_depois, data_baixa: data,
        // título só com desconto (juros futuros não cobrados) não movimenta a conta
        conta_bancaria: it.pago > 0.009 ? b.conta_bancaria : (it.titulo.conta_bancaria ?? null),
        valor_desconto: it.desconto > 0.009 ? it.desconto : null,
        valor_juros: it.juros > 0.009 ? it.juros : (it.titulo.valor_juros ?? null),
        observacao: notaRefinanciamento(it.titulo.observacao, cedula),
      }).eq("id", it.titulo.id);
      if (error) throw error;
      await sb.from("parcelas_pagamento").update({ status: "pago", data_pagamento: data }).eq("lancamento_id", it.titulo.id);
    }
    return NextResponse.json({ ok: true, vinculo, baixados: plano.itens.length, total: plano.total });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
