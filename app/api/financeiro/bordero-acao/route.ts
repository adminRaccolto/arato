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

// valor_pago aqui é o PESO do item (valor cheio da NF/lançamento gravado na
// criação do borderô) — usado só pra ratear o valor/juros/multa/desconto do
// título entre os itens na confirmação. Não é mais editável por item.
type ItemLote = {
  lancamento_id: string;
  origem_tabela: "lancamentos" | "empresa_lancamentos";
  valor_pago: number;
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
      // O borderô É o título (ex: boleto mensal que agrega várias NFs) — um
      // valor só de pago/juros/multa/desconto pro título inteiro, nunca por
      // NF/item. Ratear entre os itens é responsabilidade do servidor.
      titulo?: { valor_pago?: number; valor_juros?: number; valor_multa?: number; valor_desconto?: number; numero_titulo?: string };
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

    // ── CONFIRMAR — define data/conta e baixa o TÍTULO (o borderô inteiro) ──
    if (acao === "confirmar") {
      const { data_pagamento, conta_bancaria } = body;
      if (!data_pagamento || !conta_bancaria) {
        return NextResponse.json({ ok: false, error: "Data de pagamento e conta bancária são obrigatórios" }, { status: 400 });
      }

      const { data: itensRaw, error: ie } = await sb.from("pagamento_lote_itens")
        .select("lancamento_id, origem_tabela, valor_pago")
        .eq("lote_id", lote_id);
      if (ie) return NextResponse.json({ ok: false, error: ie.message }, { status: 500 });
      const itens = (itensRaw ?? []) as ItemLote[];
      if (!itens.length) return NextResponse.json({ ok: false, error: "Borderô sem itens" }, { status: 400 });

      // item.valor_pago aqui é o PESO (valor cheio da NF/lançamento gravado
      // na criação) — usado só pra ratear proporcionalmente o valor/juros/
      // multa/desconto do título entre os itens. Pagamento parcial do
      // título inteiro é suportado; parcial por NF individual, não — é o
      // título que foi pago a menor, e isso se reflete proporcionalmente em
      // cada NF/lançamento por trás.
      const somaPesos = itens.reduce((s, i) => s + (i.valor_pago || 0), 0) || 1;
      const titulo = body.titulo ?? {};
      const valorPagoTitulo = Math.max(0, Number(titulo.valor_pago ?? somaPesos) || 0);
      const jurosTitulo     = Math.max(0, Number(titulo.valor_juros) || 0);
      const multaTitulo     = Math.max(0, Number(titulo.valor_multa) || 0);
      const descontoTitulo  = Math.max(0, Number(titulo.valor_desconto) || 0);

      const lotePatch: Record<string, unknown> = {
        status: "pago", data_pagamento, conta_bancaria,
        valor_pago: valorPagoTitulo, valor_juros: jurosTitulo, valor_multa: multaTitulo, valor_desconto: descontoTitulo,
      };
      if (titulo.numero_titulo !== undefined) lotePatch.numero_titulo = titulo.numero_titulo || null;
      const { error: le } = await sb.from("pagamento_lotes").update(lotePatch).eq("id", lote_id);
      if (le) return NextResponse.json({ ok: false, error: le.message }, { status: 500 });

      const itensProd = itens.filter(i => (i.origem_tabela ?? "lancamentos") === "lancamentos");
      const itensEmp  = itens.filter(i => i.origem_tabela === "empresa_lancamentos");

      // Acumula sobre o valor_pago já existente (NF que já tinha algo pago
      // antes de entrar no borderô não perde isso) e decide baixado/parcial
      // com a mesma regra da baixa individual.
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

        // Fração deste item dentro do título, pelo peso (valor cheio) dele
        const fracao = (item.valor_pago || 0) / somaPesos;
        const principalCaixa = Math.max(0, (valorPagoTitulo - descontoTitulo) * fracao);
        const juros    = jurosTitulo * fracao;
        const multa    = multaTitulo * fracao;
        const desconto = descontoTitulo * fracao;

        const jaPago     = (at?.valor_pago as number | null) ?? 0;
        const jaJuros    = (at?.valor_juros as number | null) ?? 0;
        const jaMulta    = (at?.valor_multa as number | null) ?? 0;
        const jaDesc     = (at?.valor_desconto as number | null) ?? 0;
        const principalAcum = (jaPago - jaJuros - jaMulta) + principalCaixa;
        const novoTotal      = jaPago + principalCaixa + juros + multa;
        const statusBaixado = origem === "lancamentos" ? "baixado" : "pago";
        const novoStatus = principalAcum + jaDesc + desconto >= valorTotal - 0.01 ? statusBaixado : "parcial";
        const campoData = origem === "lancamentos" ? "data_baixa" : "data_pagamento";
        const { error: be } = await sb
          .from(origem)
          .update({
            status: novoStatus, valor_pago: novoTotal, [campoData]: data_pagamento, conta_bancaria, lote_id,
            valor_juros: (jaJuros + juros) || null, valor_multa: (jaMulta + multa) || null, valor_desconto: (jaDesc + desconto) || null,
          })
          .eq("id", item.lancamento_id);
        if (be) return NextResponse.json({ ok: false, error: be.message }, { status: 500 });

        // Guarda o rateio final no próprio item do lote, pra "Ver Itens do
        // Borderô" mostrar o valor real alocado a cada NF, não só o peso
        // original usado pro cálculo.
        await sb.from("pagamento_lote_itens").update({
          valor_pago: Math.round((principalCaixa + juros + multa) * 100) / 100,
          valor_juros: Math.round(juros * 100) / 100 || null,
          valor_multa: Math.round(multa * 100) / 100 || null,
          valor_desconto: Math.round(desconto * 100) / 100 || null,
        }).eq("lote_id", lote_id).eq("lancamento_id", item.lancamento_id);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Ação inválida" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
