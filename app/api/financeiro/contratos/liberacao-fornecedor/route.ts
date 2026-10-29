// POST /api/financeiro/contratos/liberacao-fornecedor — financiamento liberado DIRETO AO FORNECEDOR (29/10/2026)
//   { acao: "liberar", contrato_id, data, conta_transitoria_id?, itens: [{ lancamento_id, valor }], maquinas?: string[] }
//     → quita os CPs (sem caixa, conta transitória), cria a captação do contrato (CR já baixado no mesmo valor) e a
//       parcela de liberação tipo "fornecedor"; máquinas escolhidas ficam alienadas ao banco (garantia + financiada).
//   { acao: "desfazer", parcela_id } → devolve tudo: CPs voltam a dever, CR e garantias apagados, máquinas como antes.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase-servidor";
import { exigirAcessoRegistro, exigirAcessoRegistros } from "../../../../../lib/api-auth";
import { hojeLocal } from "../../../../../lib/data-local";
import { desfazerQuitacao, quitarCp, type CpQuitavel } from "../../../../../lib/financeiro/liberacao-fornecedor";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
const r2 = (n: number) => Math.round(n * 100) / 100;
const OG_CAPTACAO_CLASS = "1.03.01.01.003";
const CAT_CAPTACAO: Record<string, string> = {
  custeio: "Captação de Custeio", investimento: "Captação de Financiamento", securitizacao: "Captação de Securitização",
  cpr: "Captação de CPR", egf: "Captação de EGF", outros: "Captação de Empréstimos",
};

type CpAntes = { lancamento_id: string; valor: number; conta_bancaria: string | null; conciliado: boolean | null; observacao: string | null; forma_pagamento: string | null; data_baixa: string | null };
type MaquinaAntes = { id: string; contrato_financiamento_id: string | null; status_financiamento: string | null };

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as { acao: "liberar" | "desfazer"; contrato_id?: string; parcela_id?: string; data?: string; conta_transitoria_id?: string | null;
      itens?: { lancamento_id: string; valor: number }[]; maquinas?: string[] };
    const sb = admin();

    if (b.acao === "desfazer") {
      const negado = await exigirAcessoRegistro(req, "parcelas_liberacao", b.parcela_id);
      if (negado) return negado;
      const { data: p } = await sb.from("parcelas_liberacao").select("*").eq("id", b.parcela_id!).maybeSingle();
      if (!p || p.tipo !== "fornecedor") return NextResponse.json({ ok: false, error: "Liberação direta ao fornecedor não encontrada." }, { status: 404 });
      const hoje = hojeLocal();
      for (const c of (p.cps_quitados ?? []) as CpAntes[]) {
        const { data: cp } = await sb.from("lancamentos").select("id, valor, valor_pago, status, data_vencimento").eq("id", c.lancamento_id).maybeSingle();
        if (!cp) continue;
        const d = desfazerQuitacao(cp as CpQuitavel, c.valor, hoje);
        const voltaAoAntes = d.valor_pago == null || Math.abs(Number(d.valor_pago) - Number((cp.valor_pago ?? 0) - c.valor)) < 0.01;
        await sb.from("lancamentos").update({
          valor_pago: d.valor_pago, status: d.status, ...(d.data_baixa_nula ? { data_baixa: null } : {}),
          ...(voltaAoAntes ? { conta_bancaria: c.conta_bancaria, conciliado: c.conciliado ?? false, observacao: c.observacao, forma_pagamento: c.forma_pagamento } : {}),
        }).eq("id", c.lancamento_id);
      }
      if (p.lancamento_id) await sb.from("lancamentos").delete().eq("id", p.lancamento_id);
      const gars = (p.garantias_criadas ?? []) as string[];
      if (gars.length) await sb.from("garantias_contrato").delete().in("id", gars);
      for (const m of (p.maquinas_antes ?? []) as MaquinaAntes[])
        await sb.from("maquinas").update({ contrato_financiamento_id: m.contrato_financiamento_id, status_financiamento: m.status_financiamento }).eq("id", m.id);
      await sb.from("parcelas_liberacao").delete().eq("id", p.id);
      return NextResponse.json({ ok: true });
    }

    if (b.acao !== "liberar") return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
    const itens = (b.itens ?? []).filter(i => i.lancamento_id && Number(i.valor) > 0);
    if (!b.contrato_id || !b.data || !itens.length) return NextResponse.json({ ok: false, error: "Informe a data e ao menos um título a quitar." }, { status: 400 });
    const negado = await exigirAcessoRegistro(req, "contratos_financeiros", b.contrato_id)
      ?? await exigirAcessoRegistros(req, "lancamentos", itens.map(i => i.lancamento_id))
      ?? (b.maquinas?.length ? await exigirAcessoRegistros(req, "maquinas", b.maquinas) : null);
    if (negado) return negado;

    const { data: c } = await sb.from("contratos_financeiros").select("*").eq("id", b.contrato_id).maybeSingle();
    if (!c) return NextResponse.json({ ok: false, error: "Contrato não encontrado." }, { status: 404 });
    const { data: cps } = await sb.from("lancamentos")
      .select("id, fazenda_id, tipo, natureza, status, valor, valor_pago, moeda, data_vencimento, conta_bancaria, conciliado, observacao, forma_pagamento, data_baixa, descricao")
      .in("id", itens.map(i => i.lancamento_id));
    // Valida tudo antes de gravar qualquer coisa
    const planos: { cp: NonNullable<typeof cps>[number]; valor: number; valor_pago: number; status: string }[] = [];
    for (const it of itens) {
      const cp = (cps ?? []).find(x => x.id === it.lancamento_id);
      if (!cp) return NextResponse.json({ ok: false, error: "Título não encontrado." }, { status: 404 });
      if (cp.tipo !== "pagar" || cp.natureza === "previsao" || ["cancelado", "cartao", "baixado"].includes(cp.status) || (cp.moeda ?? "BRL") !== "BRL")
        return NextResponse.json({ ok: false, error: `"${cp.descricao}": só título a pagar em aberto, em reais, pode ser quitado pelo financiamento.` }, { status: 400 });
      const q = quitarCp(cp as CpQuitavel, it.valor);
      if ("erro" in q) return NextResponse.json({ ok: false, error: `"${cp.descricao}": ${q.erro}` }, { status: 400 });
      planos.push({ cp, valor: r2(it.valor), ...q });
    }
    const totalBrl = r2(planos.reduce((t, p) => t + p.valor, 0));
    const cotacao = c.moeda === "USD" ? Number(c.valor_cotacao ?? 0) : 0;
    if (c.moeda === "USD" && !(cotacao > 0)) return NextResponse.json({ ok: false, error: "Contrato em US$ sem cotação: informe a cotação no contrato antes." }, { status: 400 });
    const valorContrato = c.moeda === "USD" ? r2(totalBrl / cotacao) : totalBrl;

    const { data: fz } = await sb.from("fazendas").select("conta_id").eq("id", c.fazenda_id).maybeSingle();
    const { data: og } = await sb.from("operacoes_gerenciais").select("id")
      .or([`and(fazenda_id.is.null,conta_id.is.null)`, ...(fz?.conta_id ? [`conta_id.eq.${fz.conta_id}`] : []), `fazenda_id.eq.${c.fazenda_id}`].join(","))
      .eq("classificacao", OG_CAPTACAO_CLASS).eq("inativo", false).limit(1).maybeSingle();
    const { data: maxN } = await sb.from("parcelas_liberacao").select("num_parcela").eq("contrato_id", c.id).order("num_parcela", { ascending: false }).limit(1);
    const conta = b.conta_transitoria_id || null;
    const fornecedores = [...new Set(planos.map(p => p.cp.descricao))].slice(0, 3).join("; ");

    // 1. Captação: dinheiro do banco que foi direto ao fornecedor — CR já baixado, sem passar pelo caixa
    const { data: cr, error: eCr } = await sb.from("lancamentos").insert({
      fazenda_id: c.fazenda_id, tipo: "receber", moeda: "BRL", valor: totalBrl, valor_pago: totalBrl,
      descricao: `${c.descricao} — Liberação direta ao fornecedor`, categoria: CAT_CAPTACAO[c.tipo] ?? "Captação de Empréstimos",
      operacao_gerencial_id: og?.id ?? null, pessoa_id: c.pessoa_id ?? null, produtor_id: c.produtor_id ?? null,
      data_lancamento: b.data, data_vencimento: b.data, data_baixa: b.data, status: "baixado", conciliado: true, conta_bancaria: conta,
      auto: true, origem_lancamento: "contrato_financeiro", contrato_financeiro_id: c.id,
      observacao: `Banco pagou direto ao fornecedor (${fornecedores})`.slice(0, 500),
    }).select("id").single();
    if (eCr) return NextResponse.json({ ok: false, error: `Captação não registrada: ${eCr.message}` }, { status: 400 });

    // 2. Parcela de liberação (guarda como estavam os CPs e as máquinas, para desfazer)
    const cpsAntes: CpAntes[] = planos.map(p => ({ lancamento_id: p.cp.id, valor: p.valor, conta_bancaria: p.cp.conta_bancaria, conciliado: p.cp.conciliado, observacao: p.cp.observacao, forma_pagamento: p.cp.forma_pagamento, data_baixa: p.cp.data_baixa }));
    const { data: maqs } = b.maquinas?.length ? await sb.from("maquinas").select("id, nome, valor_aquisicao, contrato_financiamento_id, status_financiamento").in("id", b.maquinas) : { data: [] };
    const { data: parc, error: eP } = await sb.from("parcelas_liberacao").insert({
      contrato_id: c.id, fazenda_id: c.fazenda_id, num_parcela: Number(maxN?.[0]?.num_parcela ?? 0) + 1, data_liberacao: b.data,
      valor_liberado: valorContrato, valor_liberado_brl: totalBrl, lancamento_id: cr.id, tipo: "fornecedor",
      cps_quitados: cpsAntes, maquinas_antes: (maqs ?? []).map(m => ({ id: m.id, contrato_financiamento_id: m.contrato_financiamento_id, status_financiamento: m.status_financiamento })),
    }).select("id").single();
    if (eP) {
      await sb.from("lancamentos").delete().eq("id", cr.id);
      return NextResponse.json({ ok: false, error: eP.code === "42703" || eP.code === "PGRST204" ? "Rode a Seção 392 do supabase_migrations.sql." : eP.message }, { status: 400 });
    }

    // 3. Quita os CPs (sem caixa)
    const marca = `Quitado pelo financiamento ${c.descricao}`;
    for (const p of planos) {
      await sb.from("lancamentos").update({
        valor_pago: p.valor_pago, status: p.status, data_baixa: b.data, conta_bancaria: conta, conciliado: true, forma_pagamento: "Financiamento",
        observacao: [p.cp.observacao, `${marca} (R$ ${p.valor.toFixed(2)})`].filter(Boolean).join(" | ").slice(0, 1000),
      }).eq("id", p.cp.id);
    }

    // 4. Máquinas alienadas ao banco: garantia no contrato + máquina financiada
    const garantias: string[] = [];
    for (const m of maqs ?? []) {
      const { data: g } = await sb.from("garantias_contrato").insert({
        contrato_id: c.id, fazenda_id: c.fazenda_id, tipo_garantia: "alienacao_fiduciaria", grau: "1_grau", tipo_bem: "maquina", maquina_id: m.id,
        descricao: `${m.nome} — alienação fiduciária`, valor_avaliacao: m.valor_aquisicao ?? null, percentual_bem: 100,
      }).select("id").single();
      if (g) garantias.push(g.id);
      await sb.from("maquinas").update({ contrato_financiamento_id: c.id, status_financiamento: "financiado" }).eq("id", m.id);
    }
    if (garantias.length) await sb.from("parcelas_liberacao").update({ garantias_criadas: garantias }).eq("id", parc.id);
    return NextResponse.json({ ok: true, parcela_id: parc.id, total: totalBrl, alienadas: garantias.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
