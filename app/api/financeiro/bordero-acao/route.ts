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
import { estornarBorderoComSaldo } from "../../../../lib/financeiro/estornar-bordero";
import { confirmarBorderoComSaldo } from "../../../../lib/financeiro/confirmar-bordero";
import { resumoBordero } from "../../../../lib/financeiro/saldo-bordero";
import type { PagamentoLote } from "../../../../lib/supabase";

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
      // O borderô É o título (ex: boleto mensal que agrega várias NFs) — um
      // valor só de pago/juros/multa/desconto pro título inteiro, nunca por
      // NF/item. Ratear entre os itens é responsabilidade do servidor.
      titulo?: { valor_pago?: number; valor_juros?: number; valor_multa?: number; valor_desconto?: number; numero_titulo?: string; principal_anterior?: number };
    };
    const { acao, lote_id } = body;
    if (!lote_id) return NextResponse.json({ ok: false, error: "lote_id obrigatório" }, { status: 400 });

    const sb = admin();

    // ── CANCELAR — borderô pendente, ainda não baixou nenhum lançamento ──────
    if (acao === "cancelar") {
      const lote = await sb.from("pagamento_lotes").select("*").eq("id", lote_id).single();
      if (lote.error) throw lote.error;
      if (resumoBordero(lote.data as PagamentoLote).liquidado > 0)
        return NextResponse.json({ ok: false, error: "Este borderô já recebeu pagamentos. Use estornar para desfazer a baixa." }, { status: 409 });
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
      await estornarBorderoComSaldo(sb, lote_id);
      return NextResponse.json({ ok: true });
    }

    // ── CONFIRMAR — define data/conta e baixa o TÍTULO (o borderô inteiro) ──
    if (acao === "confirmar") {
      const { data_pagamento, conta_bancaria } = body;
      if (!data_pagamento || !conta_bancaria) {
        return NextResponse.json({ ok: false, error: "Data de pagamento e conta bancária são obrigatórios" }, { status: 400 });
      }

      await confirmarBorderoComSaldo(sb, lote_id, data_pagamento, conta_bancaria, body.titulo);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
