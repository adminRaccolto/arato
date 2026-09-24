/**
 * POST /api/financeiro/consorcios/lance
 * Registra os lances de uma contemplação e aplica os efeitos:
 *  - dinheiro  → cria CP (em aberto) na conta informada — aparece na Conciliação Bancária
 *  - embutido  → só registro (o CR de crédito já sai líquido, feito pela tela)
 *  - terceiros → só registro (FGTS / outro consórcio / etc.)
 *  - efeito nas parcelas ainda não pagas: reduz o valor de cada uma (proporcional) OU encurta o
 *    prazo (remove as últimas parcelas; a sobra reduz a próxima). CPs de cada parcela (inclusive
 *    as divididas por rateio de ciclo) acompanham.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const r2 = (n: number) => Math.round(n * 100) / 100;

interface LanceIn { tipo: "dinheiro" | "embutido" | "terceiros"; valor: number; data: string; conta_bancaria_id?: string; origem?: string }

export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as { consorcio_id: string; fazenda_id: string; lances: LanceIn[]; efeito: "reduz_parcela" | "reduz_prazo" | "nenhum" };
    if (!b.consorcio_id || !b.fazenda_id) return NextResponse.json({ error: "consorcio_id e fazenda_id obrigatórios" }, { status: 400 });
    const lances = (b.lances ?? []).filter(l => Number(l.valor) > 0);
    if (lances.length === 0) return NextResponse.json({ ok: true, lance_total: 0 });
    for (const l of lances) {
      if (!["dinheiro", "embutido", "terceiros"].includes(l.tipo)) return NextResponse.json({ error: "Tipo de lance inválido" }, { status: 400 });
      if (l.tipo === "dinheiro" && !l.conta_bancaria_id) return NextResponse.json({ error: "Lance em dinheiro precisa da conta bancária de pagamento." }, { status: 400 });
    }
    const sb = admin();
    const { data: c } = await sb.from("consorcios").select("*").eq("id", b.consorcio_id).maybeSingle();
    if (!c) return NextResponse.json({ error: "Consórcio não encontrado" }, { status: 404 });

    const { data: og } = await sb.from("operacoes_gerenciais").select("id").eq("fazenda_id", b.fazenda_id).eq("classificacao", "2.03.01.007").maybeSingle();

    // 1. Registra cada lance (+ CP pros em dinheiro)
    for (const l of lances) {
      let lancamentoId: string | null = null;
      if (l.tipo === "dinheiro") {
        const { data: cp, error } = await sb.from("lancamentos").insert({
          fazenda_id: b.fazenda_id, tipo: "pagar", moeda: "BRL",
          descricao: `Lance — ${c.administradora} Cota ${c.numero_cota}`,
          categoria: "Lance de Consórcio",
          data_lancamento: l.data, data_vencimento: l.data,
          valor: r2(l.valor), status: "em_aberto", auto: true,
          conta_bancaria: l.conta_bancaria_id, consorcio_id: b.consorcio_id,
          origem_lancamento: "consorcio", operacao_gerencial_id: og?.id ?? null,
          numero_documento: "LANCE", pessoa_id: c.administradora_pessoa_id ?? null,
        }).select("id").single();
        if (error) return NextResponse.json({ error: `CP do lance: ${error.message}` }, { status: 400 });
        lancamentoId = cp.id as string;
      }
      const { error: eL } = await sb.from("consorcio_lances").insert({
        consorcio_id: b.consorcio_id, fazenda_id: b.fazenda_id, tipo: l.tipo, valor: r2(l.valor), data: l.data,
        conta_bancaria_id: l.conta_bancaria_id ?? null, origem: l.origem ?? null, lancamento_id: lancamentoId,
      });
      if (eL) return NextResponse.json({ error: `Registro do lance: ${eL.message}` }, { status: 400 });
    }
    const total = r2(lances.reduce((s, l) => s + Number(l.valor), 0));
    const embutido = r2(lances.filter(l => l.tipo === "embutido").reduce((s, l) => s + Number(l.valor), 0));

    // 2. Efeito nas parcelas não pagas
    let removidas = 0, fator = 1;
    if (b.efeito !== "nenhum") {
      const { data: parc } = await sb.from("parcelas_consorcio").select("id, numero_parcela, valor, pago")
        .eq("consorcio_id", b.consorcio_id).eq("pago", false).order("numero_parcela", { ascending: true });
      const abertas = (parc ?? []) as { id: string; numero_parcela: number; valor: number }[];
      const escalarCPs = async (numero: number, f: number) => {
        const { data: cps } = await sb.from("lancamentos").select("id, valor")
          .eq("consorcio_id", b.consorcio_id).eq("tipo", "pagar").eq("numero_documento", String(numero)).neq("status", "pago");
        for (const cp of cps ?? []) await sb.from("lancamentos").update({ valor: r2(Number(cp.valor) * f) }).eq("id", cp.id);
      };
      const saldo = r2(abertas.reduce((s, p) => s + Number(p.valor), 0));
      if (saldo > 0) {
        if (b.efeito === "reduz_parcela") {
          fator = Math.max(0, (saldo - total) / saldo);
          for (const p of abertas) {
            await sb.from("parcelas_consorcio").update({ valor: r2(Number(p.valor) * fator) }).eq("id", p.id);
            await escalarCPs(p.numero_parcela, fator);
          }
        } else {
          let resto = total;
          for (const p of [...abertas].reverse()) {
            if (resto <= 0.005) break;
            if (Number(p.valor) <= resto + 0.005) {
              await sb.from("parcelas_consorcio").delete().eq("id", p.id);
              await sb.from("lancamentos").delete().eq("consorcio_id", b.consorcio_id).eq("tipo", "pagar")
                .eq("numero_documento", String(p.numero_parcela)).neq("status", "pago");
              resto = r2(resto - Number(p.valor)); removidas++;
            } else {
              const f = (Number(p.valor) - resto) / Number(p.valor);
              await sb.from("parcelas_consorcio").update({ valor: r2(Number(p.valor) - resto) }).eq("id", p.id);
              await escalarCPs(p.numero_parcela, f);
              resto = 0;
            }
          }
        }
      }
    }

    await sb.from("consorcios").update({
      valor_lance: total, valor_lance_embutido: embutido || null, efeito_lance: b.efeito,
      ...(removidas > 0 ? { total_parcelas: Math.max(0, Number(c.total_parcelas) - removidas) } : {}),
    }).eq("id", b.consorcio_id);

    return NextResponse.json({ ok: true, lance_total: total, embutido, parcelas_removidas: removidas, fator: r2(fator * 10000) / 10000 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
