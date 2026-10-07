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
 *
 * Unificado 01/10/2026: pagamento_lote_itens agora tem origem_tabela
 * ('lancamentos' | 'empresa_lancamentos') — cada ação roteia a tabela certa
 * por item, em vez de bater só em `lancamentos` como antes. Produtor usa
 * status 'baixado'/'em_aberto' + campo data_baixa; Empresa usa 'pago'/
 * 'pendente' + campo data_pagamento (vocabulário próprio de cada tabela,
 * igual ao resto do sistema).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

type ItemLote = {
  lancamento_id: string;
  origem_tabela: "lancamentos" | "empresa_lancamentos";
  valor_pago: number;
  valor_multa: number | null;
  valor_juros: number | null;
  valor_desconto: number | null;
};

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
      // Juros, multa, desconto e (opcional) valor principal ajustado na
      // confirmação, por título do borderô
      ajustes?: { lancamento_id: string; valor_juros?: number; valor_multa?: number; valor_desconto?: number; valor_pago?: number }[];
    };
    const { acao, lote_id } = body;
    if (!lote_id) return NextResponse.json({ ok: false, error: "lote_id obrigatório" }, { status: 400 });

    const sb = admin();

    // ── CANCELAR — borderô pendente, ainda não baixou nenhum lançamento ──────
    if (acao === "cancelar") {
      const [ue1, ue2] = await Promise.all([
        sb.from("lancamentos").update({ lote_id: null }).eq("lote_id", lote_id),
        sb.from("empresa_lancamentos").update({ lote_id: null }).eq("lote_id", lote_id),
      ]);
      if (ue1.error) return NextResponse.json({ ok: false, error: ue1.error.message }, { status: 500 });
      if (ue2.error) return NextResponse.json({ ok: false, error: ue2.error.message }, { status: 500 });
      const res = await excluirLote(sb, lote_id);
      if (!res.ok) return NextResponse.json(res, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    // ── ESTORNAR — borderô já pago; reverte os lançamentos pra em_aberto/pendente ─
    if (acao === "estornar") {
      const [ue1, ue2] = await Promise.all([
        sb.from("lancamentos")
          .update({ status: "em_aberto", lote_id: null, valor_pago: null, data_baixa: null, conta_bancaria: null, valor_juros: null, valor_multa: null, valor_desconto: null })
          .eq("lote_id", lote_id).eq("status", "baixado"),
        sb.from("empresa_lancamentos")
          .update({ status: "pendente", lote_id: null, valor_pago: null, data_pagamento: null, conta_bancaria: null, valor_juros: null, valor_multa: null, valor_desconto: null })
          .eq("lote_id", lote_id).eq("status", "pago"),
      ]);
      if (ue1.error) return NextResponse.json({ ok: false, error: ue1.error.message }, { status: 500 });
      if (ue2.error) return NextResponse.json({ ok: false, error: ue2.error.message }, { status: 500 });
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

      // Ajustes de juros/multa/desconto — e, agora, do próprio valor principal
      // (valor_pago) — da tela de confirmação: gravados no item antes de
      // baixar. valor_pago opcional porque o item já tem um valor definido
      // desde a criação do borderô (que também pode já ter sido parcial) —
      // só sobrescreve quando a tela manda um valor explícito.
      for (const aj of body.ajustes ?? []) {
        const patch: Record<string, number> = {
          valor_juros: Math.max(0, Number(aj.valor_juros) || 0),
          valor_multa: Math.max(0, Number(aj.valor_multa) || 0),
          valor_desconto: Math.max(0, Number(aj.valor_desconto) || 0),
        };
        if (aj.valor_pago !== undefined && aj.valor_pago !== null) {
          patch.valor_pago = Math.max(0, Number(aj.valor_pago) || 0);
        }
        const { error: ae } = await sb.from("pagamento_lote_itens").update(patch)
          .eq("lote_id", lote_id).eq("lancamento_id", aj.lancamento_id);
        if (ae) return NextResponse.json({ ok: false, error: ae.message }, { status: 500 });
      }

      const { data: itensRaw, error: ie } = await sb.from("pagamento_lote_itens")
        .select("lancamento_id, origem_tabela, valor_pago, valor_multa, valor_juros, valor_desconto")
        .eq("lote_id", lote_id);
      if (ie) return NextResponse.json({ ok: false, error: ie.message }, { status: 500 });
      const itens = (itensRaw ?? []) as ItemLote[];
      // Dinheiro que sai da conta: principal menos desconto + juros + multa
      const totalCaixa = itens.reduce((s, i) => s + Math.max(0, i.valor_pago - (i.valor_desconto ?? 0)) + (i.valor_juros ?? 0) + (i.valor_multa ?? 0), 0);

      const { error: le } = await sb.from("pagamento_lotes")
        .update({ status: "pago", data_pagamento, conta_bancaria, valor_total: Math.round(totalCaixa * 100) / 100 })
        .eq("id", lote_id);
      if (le) return NextResponse.json({ ok: false, error: le.message }, { status: 500 });

      const itensProd = itens.filter(i => (i.origem_tabela ?? "lancamentos") === "lancamentos");
      const itensEmp  = itens.filter(i => i.origem_tabela === "empresa_lancamentos");

      // Acumula sobre o valor_pago já existente (título parcial não perde o
      // que já tinha sido pago) e decide baixado/parcial com a mesma regra
      // da baixa individual — mesmo fix aplicado em criarPagamentoLote.
      const [atuaisProd, atuaisEmp] = await Promise.all([
        itensProd.length ? sb.from("lancamentos").select("id, valor, cotacao_usd, moeda, valor_pago, valor_juros, valor_multa, valor_desconto").in("id", itensProd.map(i => i.lancamento_id)) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
        itensEmp.length  ? sb.from("empresa_lancamentos").select("id, valor, cotacao_usd, moeda, valor_pago, valor_juros, valor_multa, valor_desconto").in("id", itensEmp.map(i => i.lancamento_id)) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ]);
      const mapaProd = new Map((atuaisProd.data ?? []).map(l => [l.id as string, l]));
      const mapaEmp  = new Map((atuaisEmp.data ?? []).map(l => [l.id as string, l]));

      for (const item of itens) {
        const origem = item.origem_tabela ?? "lancamentos";
        const at        = (origem === "lancamentos" ? mapaProd : mapaEmp).get(item.lancamento_id);
        const cotacao    = (at?.cotacao_usd as number | null) ?? 5.12;
        const valorTotal = at?.moeda === "USD" ? ((at?.valor as number | null) ?? 0) * cotacao : ((at?.valor as number | null) ?? 0);
        // valor_pago do título = caixa acumulado (principal + juros + multa). O desconto NÃO sai da
        // conta: quita o principal junto com o caixa. Juros, multa e desconto são acumulados em colunas próprias.
        const jaPago     = (at?.valor_pago as number | null) ?? 0;
        const jaJuros    = (at?.valor_juros as number | null) ?? 0;
        const jaMulta    = (at?.valor_multa as number | null) ?? 0;
        const jaDesc     = (at?.valor_desconto as number | null) ?? 0;
        const juros      = Math.max(0, item.valor_juros ?? 0);
        const multa      = Math.max(0, item.valor_multa ?? 0);
        const desconto   = Math.max(0, item.valor_desconto ?? 0);
        const principalCaixa = Math.max(0, item.valor_pago - desconto);
        const principalAcum  = (jaPago - jaJuros - jaMulta) + principalCaixa;
        const novoTotal      = jaPago + principalCaixa + juros + multa;
        const statusBaixado = origem === "lancamentos" ? "baixado" : "pago";
        const novoStatus = principalAcum + jaDesc + desconto >= valorTotal - 0.01 ? statusBaixado : "parcial";
        const campoData = origem === "lancamentos" ? "data_baixa" : "data_pagamento";
        const { error: be } = await sb
          .from(origem)
          .update({
            status: novoStatus, valor_pago: novoTotal, [campoData]: data_pagamento, conta_bancaria, lote_id,
            valor_juros: jaJuros + juros || null, valor_multa: jaMulta + multa || null, valor_desconto: jaDesc + desconto || null,
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
