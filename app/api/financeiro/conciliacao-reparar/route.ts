/**
 * POST /api/financeiro/conciliacao-reparar   { fazenda_id, aplicar?: boolean }
 *
 * Auditoria + reparo das divergências entre o que o extrato (extrato_transacoes) diz estar
 * conciliado e o que o Contas a Pagar/Receber (lancamentos / empresa_lancamentos) diz.
 * Regra: o VÍNCULO da linha do extrato é a fonte da verdade; o flag "conciliado" do título é derivado.
 *
 *  1. Linha conciliada apontando para título que não existe mais  → tira o vínculo morto; sem nenhum
 *     título restante a linha volta a Pendente.
 *  2. Linha conciliada, título já baixado/parcial mas conciliado=false → acende conciliado no título.
 *  3. Linha conciliada, título AINDA EM ABERTO (a baixa nunca gravou) → se o saldo dos títulos bate
 *     com o valor da linha, baixa os títulos (data e conta da linha) e concilia; senão a linha volta a Pendente.
 *  4. Título conciliado=true que nenhuma linha referencia → conciliado=false.
 * Sem "aplicar" só devolve o relatório (nada é gravado).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequestUser, validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs";
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } });

async function todas<T>(sb: SupabaseClient, tab: string, cols: string, fazIds: string[]): Promise<T[]> {
  let out: T[] = []; let from = 0;
  while (true) {
    const { data, error } = await sb.from(tab).select(cols).in("fazenda_id", fazIds).range(from, from + 999);
    if (error) throw new Error(`${tab}: ${error.message}`);
    out = out.concat((data ?? []) as T[]);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  return out;
}

type Trans = { id: string; fazenda_id: string; conta_bancaria_id: string; data: string; descricao: string; valor: number; conciliado: boolean; lancamento_id: string | null; lancamento_ids: string[] | null };
type Tit = { id: string; fazenda_id: string; conciliado: boolean | null; status: string; valor: number; valor_pago: number | null; descricao: string | null; emp?: boolean };
const BAIXADOS = new Set(["baixado", "parcial", "pago"]);
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { fazenda_id: string; aplicar?: boolean };
    if (!body.fazenda_id) return NextResponse.json({ ok: false, error: "fazenda_id obrigatório" }, { status: 400 });
    const user = await getRequestUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    const acesso = await validateFazendaAccess(body.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ ok: false, error: acesso.error }, { status: acesso.status });

    const sb = admin();
    const { data: faz } = await sb.from("fazendas").select("conta_id").eq("id", body.fazenda_id).maybeSingle();
    let fazIds = [body.fazenda_id];
    if (faz?.conta_id) {
      const { data: fzs } = await sb.from("fazendas").select("id").eq("conta_id", faz.conta_id);
      if (fzs?.length) fazIds = fzs.map(f => f.id as string);
    }

    const [trans, lanc, emp, extratos] = await Promise.all([
      todas<Trans>(sb, "extrato_transacoes", "id,fazenda_id,conta_bancaria_id,data,descricao,valor,conciliado,lancamento_id,lancamento_ids", fazIds),
      todas<Tit>(sb, "lancamentos", "id,fazenda_id,conciliado,status,valor,valor_pago,descricao", fazIds),
      todas<Tit>(sb, "empresa_lancamentos", "id,fazenda_id,conciliado,status,valor,valor_pago,descricao", fazIds),
      todas<{ linhas: { conciliado?: boolean; lancamento_id?: string; lancamento_ids?: string[] }[] | null }>(sb, "extratos_bancarios", "linhas", fazIds),
    ]);
    const tit = new Map<string, Tit>();
    for (const l of lanc) tit.set(l.id, l);
    for (const e of emp) tit.set(e.id, { ...e, emp: true });

    const refsDe = (t: { lancamento_id: string | null; lancamento_ids: string[] | null }) =>
      t.lancamento_ids?.length ? t.lancamento_ids : t.lancamento_id ? [t.lancamento_id] : [];

    // Conjunto de títulos referenciados por QUALQUER linha conciliada (extrato ativo + extratos antigos)
    const referenciados = new Set<string>();
    for (const t of trans) if (t.conciliado) refsDe(t).forEach(id => referenciados.add(id));
    for (const ex of extratos) for (const l of ex.linhas ?? []) {
      if (!l.conciliado) continue;
      (l.lancamento_ids?.length ? l.lancamento_ids : l.lancamento_id ? [l.lancamento_id] : []).forEach(id => referenciados.add(id));
    }

    const rel = { vinculosMortos: [] as unknown[], acenderTitulo: [] as unknown[], baixarETitulo: [] as unknown[], linhaVoltaPendente: [] as unknown[], apagarFlagTitulo: [] as unknown[] };
    type Acao =
      | { k: "unlink"; t: Trans; manter: string[] }
      | { k: "acender"; ids: string[] }
      | { k: "baixar"; t: Trans; ids: string[] }
      | { k: "apagar"; ids: string[] };
    const acoes: Acao[] = [];

    for (const t of trans) {
      if (!t.conciliado) continue;
      const refs = refsDe(t);
      if (!refs.length) continue;           // conciliada sem título (transferência/tesouraria): não mexe
      const existentes = refs.filter(id => tit.has(id));
      if (existentes.length < refs.length) {
        rel.vinculosMortos.push({ data: t.data, desc: t.descricao.slice(0, 40), valor: t.valor, removidos: refs.length - existentes.length });
        acoes.push({ k: "unlink", t, manter: existentes });
        if (!existentes.length) continue;
      }
      const alvo = existentes.map(id => tit.get(id)!);
      const abertos = alvo.filter(x => !BAIXADOS.has(x.status));
      if (abertos.length) {
        const saldo = r2(abertos.reduce((s, x) => s + (x.valor - (x.valor_pago ?? 0)), 0));
        const jaPagoBaixados = r2(alvo.filter(x => BAIXADOS.has(x.status)).reduce((s, x) => s + (x.valor_pago ?? x.valor), 0));
        if (Math.abs(saldo + jaPagoBaixados - Math.abs(t.valor)) <= 0.01 || Math.abs(saldo - Math.abs(t.valor)) <= 0.01) {
          rel.baixarETitulo.push({ data: t.data, desc: t.descricao.slice(0, 40), valor: t.valor, titulos: abertos.map(x => (x.descricao ?? "").slice(0, 30)) });
          acoes.push({ k: "baixar", t, ids: existentes });
        } else {
          rel.linhaVoltaPendente.push({ data: t.data, desc: t.descricao.slice(0, 40), valor: t.valor, motivo: "título em aberto e valor não bate", titulos: abertos.map(x => (x.descricao ?? "").slice(0, 30)) });
          acoes.push({ k: "unlink", t, manter: [] });
        }
        continue;
      }
      const apagados = alvo.filter(x => !x.conciliado);
      if (apagados.length) {
        rel.acenderTitulo.push({ data: t.data, desc: t.descricao.slice(0, 40), valor: t.valor, titulos: apagados.length });
        acoes.push({ k: "acender", ids: apagados.map(x => x.id) });
      }
    }
    const orfaos = [...tit.values()].filter(x => x.conciliado && !referenciados.has(x.id));
    for (const x of orfaos) rel.apagarFlagTitulo.push({ desc: (x.descricao ?? "").slice(0, 40), valor: x.valor, status: x.status, empresa: !!x.emp });
    if (orfaos.length) acoes.push({ k: "apagar", ids: orfaos.map(x => x.id) });

    const resumo = {
      vinculosMortos: rel.vinculosMortos.length, tituloSemFlag: rel.acenderTitulo.length,
      baixaPendente: rel.baixarETitulo.length, linhasVoltamPendente: rel.linhaVoltaPendente.length, tituloComFlagSemLinha: rel.apagarFlagTitulo.length,
    };
    const total = Object.values(resumo).reduce((a, b) => a + b, 0);
    const amostra = (a: unknown[]) => a.slice(0, 8);
    const relatorio = { vinculosMortos: amostra(rel.vinculosMortos), acenderTitulo: amostra(rel.acenderTitulo), baixarETitulo: amostra(rel.baixarETitulo), linhaVoltaPendente: amostra(rel.linhaVoltaPendente), apagarFlagTitulo: amostra(rel.apagarFlagTitulo) };
    if (!body.aplicar || total === 0) return NextResponse.json({ ok: true, aplicado: false, resumo, total, relatorio });

    // ── aplicar ──
    const falhas: string[] = [];
    const setConc = async (ids: string[], valor: boolean) => {
      for (let i = 0; i < ids.length; i += 200) {
        const parte = ids.slice(i, i + 200);
        const a = await sb.from("lancamentos").update({ conciliado: valor }).in("id", parte);
        if (a.error) falhas.push(`lancamentos: ${a.error.message}`);
        const b = await sb.from("empresa_lancamentos").update({ conciliado: valor }).in("id", parte);
        if (b.error) falhas.push(`empresa_lancamentos: ${b.error.message}`);
      }
    };
    for (const a of acoes) {
      if (a.k === "unlink") {
        const patch = a.manter.length
          ? { lancamento_ids: a.manter, lancamento_id: a.manter[0] }
          : { conciliado: false, lancamento_ids: null, lancamento_id: null, lancamento_desc: null, lancamento_valor: null, origem_vinculo: null, confianca: null, regra_id: null };
        const r = await sb.from("extrato_transacoes").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", a.t.id);
        if (r.error) falhas.push(`linha ${a.t.id}: ${r.error.message}`);
      } else if (a.k === "baixar") {
        for (const id of a.ids) {
          const x = tit.get(id)!;
          if (BAIXADOS.has(x.status) && x.status !== "parcial") continue;
          if (x.emp) {
            const r = await sb.from("empresa_lancamentos").update({ status: "pago", data_pagamento: a.t.data, valor_pago: x.valor }).eq("id", id);
            if (r.error) falhas.push(`baixa empresa ${id}: ${r.error.message}`);
          } else {
            const r = await sb.from("lancamentos").update({ status: "baixado", data_baixa: a.t.data, valor_pago: x.valor, conta_bancaria: a.t.conta_bancaria_id }).eq("id", id);
            if (r.error) falhas.push(`baixa ${id}: ${r.error.message}`);
            else await sb.from("parcelas_pagamento").update({ status: "pago", data_pagamento: a.t.data }).eq("lancamento_id", id);
          }
        }
        await setConc(a.ids, true);
      } else if (a.k === "acender") await setConc(a.ids, true);
      else await setConc(a.ids, false);
    }
    if (falhas.length) return NextResponse.json({ ok: false, error: falhas.slice(0, 5).join(" | "), resumo, total }, { status: 500 });
    return NextResponse.json({ ok: true, aplicado: true, resumo, total, relatorio });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
