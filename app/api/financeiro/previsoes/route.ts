/**
 * POST /api/financeiro/previsoes — Previsão de Gastos (Seção 352). service_role, escopo por conta (conta_id da fazenda).
 *
 * Body: { operacao, fazenda_id, ... }
 *   listar                  → previsões da conta com OG, fornecedor, ciclo e consumos
 *   abertas                 → previsões em aberto (seletor do CP / NF): { lado?: "produtor" | "empresa" }
 *   criar                   → { linha, recorrencia?: { qtd, freq } }
 *   editar / cancelar       → { id, campos? }
 *   consumir                → { previsao_id, valor, lancamento_id?, emp_lancamento_id?, origem }
 *   consumir_nf             → { previsao_id, nf_entrada_id } (soma os títulos gerados pela NF)
 *   decidir                 → { id, decisao: "efetivada" | "saldo" }
 *   vencida                 → { id, acao: "nova_data" | "efetivar", data? }
 *   config / salvar_config  → tolerância
 *   relatorio               → { de, ate, leitura } Previsto × Realizado por OG e mês
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { getRequestUser, validateFazendaAccess } from "../../../../lib/api-auth";
import { datasRecorrencia, previstoRealizado, type LeituraRealizado, type TituloRealAgg } from "../../../../lib/financeiro/previsoes";
import {
  criarPrevisoes, editarPrevisao, cancelarPrevisao, consumirPrevisao, decidirPrevisao, tratarVencida,
  toleranciaDaConta, tabelaPrevisoesAusente, type NovaPrevisao,
} from "../../../../lib/financeiro/previsoes-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/* eslint-disable @typescript-eslint/no-explicit-any */
async function todas(q: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q().range(de, de + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, any>;
    const { operacao, fazenda_id } = body as { operacao: string; fazenda_id: string };
    if (!operacao || !fazenda_id) return NextResponse.json({ ok: false, error: "Parâmetros inválidos" }, { status: 400 });
    const auth = req.headers.get("authorization") ?? undefined;
    const user = await getRequestUser(auth);
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    const acesso = await validateFazendaAccess(fazenda_id, auth);
    if (!acesso.ok) return NextResponse.json({ ok: false, error: acesso.error }, { status: acesso.status });

    const sb = admin();
    const { data: faz } = await sb.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
    const conta_id = faz?.conta_id as string | undefined;
    if (!conta_id) return NextResponse.json({ ok: false, error: "Fazenda sem conta" }, { status: 400 });
    const { data: fzs } = await sb.from("fazendas").select("id, nome").eq("conta_id", conta_id);
    const fazIds = (fzs ?? []).map(f => f.id as string);

    // Toda operação por id confere que a previsão é desta conta
    const daConta = async (id: string) => {
      const { data } = await sb.from("previsoes_gasto").select("id, conta_id").eq("id", id).maybeSingle();
      if (!data || data.conta_id !== conta_id) throw new Error("Previsão não encontrada nesta conta.");
    };

    if (operacao === "listar" || operacao === "abertas") {
      const prevs = await todas(() => {
        let q = sb.from("previsoes_gasto").select("*").eq("conta_id", conta_id);
        if (operacao === "abertas") q = q.eq("status", "aberta").gt("saldo", 0);
        if (operacao === "abertas" && body.lado === "empresa") q = q.not("empresa_id", "is", null);
        if (operacao === "abertas" && body.lado === "produtor") q = q.is("empresa_id", null);
        return q.order("data_vencimento").order("id");
      });
      const ogIds = [...new Set(prevs.map(p => p.operacao_gerencial_id))];
      const pesIds = [...new Set(prevs.map(p => p.pessoa_id).filter(Boolean))];
      const cicIds = [...new Set(prevs.map(p => p.ciclo_id).filter(Boolean))];
      const nomes = async (tab: string, ids: string[], campo: string) => {
        const m: Record<string, string> = {};
        for (let i = 0; i < ids.length; i += 200) {
          const { data } = await sb.from(tab).select(`id, ${campo}`).in("id", ids.slice(i, i + 200));
          for (const r of (data ?? []) as any[]) m[r.id] = r[campo];
        }
        return m;
      };
      const [ogNome, pesNome, cicNome] = await Promise.all([nomes("operacoes_gerenciais", ogIds, "descricao"), nomes("pessoas", pesIds, "nome"), nomes("ciclos", cicIds, "descricao")]);
      const consumos: Record<string, { valor: number; qtd: number }> = {};
      if (operacao === "listar" && prevs.length) {
        const ids = prevs.map(p => p.id);
        for (let i = 0; i < ids.length; i += 200) {
          const { data } = await sb.from("previsoes_gasto_consumos").select("previsao_id, valor").in("previsao_id", ids.slice(i, i + 200));
          for (const c of data ?? []) {
            const k = c.previsao_id as string;
            consumos[k] = { valor: Math.round(((consumos[k]?.valor ?? 0) + Number(c.valor)) * 100) / 100, qtd: (consumos[k]?.qtd ?? 0) + 1 };
          }
        }
      }
      const fazNome: Record<string, string> = Object.fromEntries((fzs ?? []).map(f => [f.id, f.nome]));
      return NextResponse.json({
        ok: true,
        previsoes: prevs.map(p => ({
          ...p, valor: Number(p.valor), saldo: Number(p.saldo), diferenca: p.diferenca == null ? null : Number(p.diferenca),
          og_nome: ogNome[p.operacao_gerencial_id] ?? "", pessoa_nome: p.pessoa_id ? pesNome[p.pessoa_id] ?? "" : "",
          ciclo_nome: p.ciclo_id ? cicNome[p.ciclo_id] ?? "" : "", fazenda_nome: fazNome[p.fazenda_id] ?? "",
          consumido: consumos[p.id]?.valor ?? 0, consumos: consumos[p.id]?.qtd ?? 0,
        })),
      });
    }

    if (operacao === "criar") {
      const linha = body.linha as NovaPrevisao;
      if (!linha?.operacao_gerencial_id || !(Number(linha.valor) > 0) || !linha.data_vencimento) {
        return NextResponse.json({ ok: false, error: "Informe OG, valor e vencimento." }, { status: 400 });
      }
      if (!fazIds.includes(linha.fazenda_id)) return NextResponse.json({ ok: false, error: "Fazenda fora da conta." }, { status: 403 });
      const rec = body.recorrencia as { qtd?: number; freq?: number } | undefined;
      const datas = rec && Number(rec.qtd) > 1 ? datasRecorrencia(linha.data_vencimento, Math.min(120, Number(rec.qtd)), Number(rec.freq) || 1) : [linha.data_vencimento];
      const grupo = datas.length > 1 ? crypto.randomUUID() : null;
      const linhas: NovaPrevisao[] = datas.map(d => ({
        ...linha, conta_id, valor: Number(linha.valor), data_vencimento: d,
        origem: datas.length > 1 ? "recorrencia" : (linha.origem === "importacao" ? "importacao" : "manual"),
        recorrencia_grupo: grupo, folha_id: null,
      }));
      const criadas = await criarPrevisoes(sb, linhas, user.id);
      return NextResponse.json({ ok: true, criadas: criadas.length });
    }

    if (operacao === "editar") { await daConta(body.id); await editarPrevisao(sb, body.id, body.campos ?? {}); return NextResponse.json({ ok: true }); }
    if (operacao === "cancelar") { await daConta(body.id); await cancelarPrevisao(sb, body.id); return NextResponse.json({ ok: true }); }

    if (operacao === "consumir") {
      await daConta(body.previsao_id);
      const r = await consumirPrevisao(sb, {
        previsao_id: body.previsao_id, valor: Number(body.valor), lancamento_id: body.lancamento_id ?? null,
        emp_lancamento_id: body.emp_lancamento_id ?? null, origem: body.origem ?? "cp_manual", userId: user.id,
      });
      return NextResponse.json({ ok: true, ...r });
    }

    if (operacao === "consumir_nf") {
      await daConta(body.previsao_id);
      const nfId = body.nf_entrada_id as string;
      const [{ data: lp }, { data: le }] = await Promise.all([
        sb.from("lancamentos").select("id, valor").eq("nf_entrada_id", nfId).eq("tipo", "pagar").neq("status", "cancelado").in("fazenda_id", fazIds).order("data_vencimento"),
        sb.from("empresa_lancamentos").select("id, valor").eq("nf_entrada_id", nfId).eq("tipo", "pagar").neq("status", "cancelado").in("fazenda_id", fazIds).order("data_vencimento"),
      ]);
      const total = [...(lp ?? []), ...(le ?? [])].reduce((s, l) => s + Number(l.valor ?? 0), 0);
      if (!(total > 0)) return NextResponse.json({ ok: false, error: "A NF ainda não gerou títulos no Contas a Pagar." }, { status: 400 });
      const r = await consumirPrevisao(sb, {
        previsao_id: body.previsao_id, valor: total, origem: "nf_entrada", nf_entrada_id: nfId, userId: user.id,
        lancamento_id: lp?.[0]?.id ?? null, emp_lancamento_id: lp?.[0] ? null : le?.[0]?.id ?? null,
      });
      return NextResponse.json({ ok: true, ...r, valor: total });
    }

    if (operacao === "decidir") { await daConta(body.id); await decidirPrevisao(sb, body.id, body.decisao, user.id); return NextResponse.json({ ok: true }); }
    if (operacao === "vencida") {
      await daConta(body.id);
      await tratarVencida(sb, body.id, body.acao === "nova_data" ? { tipo: "nova_data", data: String(body.data ?? "") } : { tipo: "efetivar" }, user.id);
      return NextResponse.json({ ok: true });
    }

    if (operacao === "config") return NextResponse.json({ ok: true, tolerancia: await toleranciaDaConta(sb, conta_id) });
    if (operacao === "salvar_config") {
      const pct = Math.max(0, Number(body.tolerancia_pct) || 0), valor = Math.max(0, Number(body.tolerancia_valor) || 0);
      const { error } = await sb.from("previsoes_config").upsert({ conta_id, tolerancia_pct: pct, tolerancia_valor: valor, updated_at: new Date().toISOString() });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (operacao === "relatorio") {
      const de = String(body.de ?? ""), ate = String(body.ate ?? "");
      const leitura = (["vencimento", "competencia", "caixa"].includes(body.leitura) ? body.leitura : "vencimento") as LeituraRealizado;
      const fazFiltro: string[] = Array.isArray(body.fazenda_ids) && body.fazenda_ids.length ? body.fazenda_ids.filter((f: string) => fazIds.includes(f)) : fazIds;
      const prevs = await todas(() => {
        let q = sb.from("previsoes_gasto").select("og_classificacao, data_vencimento, valor, status, fazenda_id, ciclo_id").eq("conta_id", conta_id).in("fazenda_id", fazFiltro);
        if (de) q = q.gte("data_vencimento", de);
        if (ate) q = q.lte("data_vencimento", ate);
        if (body.ciclo_id) q = q.eq("ciclo_id", body.ciclo_id);
        return q.order("id");
      });
      const colData = leitura === "caixa" ? "data_baixa" : leitura === "competencia" ? "data_lancamento" : "data_vencimento";
      const titulosP = await todas(() => {
        let q = sb.from("lancamentos").select("operacao_gerencial_id, valor, valor_pago, moeda, cotacao_usd, data_vencimento, data_lancamento, data_baixa, status, natureza")
          .eq("tipo", "pagar").in("fazenda_id", fazFiltro).neq("status", "cancelado").or("natureza.is.null,natureza.eq.real");
        if (de) q = q.gte(colData, de);
        if (ate) q = q.lte(colData, ate);
        if (body.ciclo_id) q = q.eq("ciclo_id", body.ciclo_id);
        return q.order("id");
      });
      const colEmp = leitura === "caixa" ? "data_pagamento" : "data_vencimento";
      const titulosE = await todas(() => {
        let q = sb.from("empresa_lancamentos").select("operacao_gerencial_id, valor, valor_pago, data_vencimento, data_pagamento, status, created_at")
          .eq("tipo", "pagar").in("fazenda_id", fazFiltro).neq("status", "cancelado");
        if (de) q = q.gte(colEmp, de);
        if (ate) q = q.lte(colEmp, ate);
        if (body.ciclo_id) q = q.eq("ciclo_id", body.ciclo_id);
        return q.order("id");
      });
      const ogIds = [...new Set([...titulosP, ...titulosE].map(t => t.operacao_gerencial_id).filter(Boolean))] as string[];
      const ogClasse: Record<string, string> = {};
      for (let i = 0; i < ogIds.length; i += 200) {
        const { data } = await sb.from("operacoes_gerenciais").select("id, classificacao").in("id", ogIds.slice(i, i + 200));
        for (const o of data ?? []) ogClasse[o.id as string] = o.classificacao as string;
      }
      const titulos: TituloRealAgg[] = [
        ...titulosP.filter(t => t.moeda !== "barter").map(t => {
          const brl = t.moeda === "USD" ? Number(t.valor) * Number(t.cotacao_usd || 0) : Number(t.valor);
          return { og_classificacao: ogClasse[t.operacao_gerencial_id] ?? null, valor: Math.round(brl * 100) / 100, data_vencimento: t.data_vencimento, data_lancamento: t.data_lancamento, data_baixa: t.status === "baixado" || t.status === "parcial" ? t.data_baixa : null, valor_pago: t.valor_pago };
        }),
        ...titulosE.map(t => ({ og_classificacao: ogClasse[t.operacao_gerencial_id] ?? null, valor: Number(t.valor), data_vencimento: t.data_vencimento, data_lancamento: String(t.created_at ?? "").slice(0, 10) || t.data_vencimento, data_baixa: t.status === "pago" ? t.data_pagamento : null, valor_pago: t.valor_pago })),
      ];
      const linhas = previstoRealizado(
        prevs.map(p => ({ og_classificacao: p.og_classificacao, data_vencimento: p.data_vencimento, valor: Number(p.valor), status: p.status })),
        titulos, leitura,
      ).filter(l => (!de || l.mes >= de.slice(0, 7)) && (!ate || l.mes <= ate.slice(0, 7)));
      // Nome de cada classificação (qualquer OG da conta com aquela classificação)
      const classes = [...new Set(linhas.map(l => l.og))];
      const nomeClasse: Record<string, string> = {};
      for (let i = 0; i < classes.length; i += 200) {
        const { data } = await sb.from("operacoes_gerenciais").select("classificacao, descricao").in("classificacao", classes.slice(i, i + 200))
          .or(`fazenda_id.in.(${fazIds.join(",")}),conta_id.eq.${conta_id},and(fazenda_id.is.null,conta_id.is.null)`);
        for (const o of data ?? []) if (!nomeClasse[o.classificacao as string]) nomeClasse[o.classificacao as string] = o.descricao as string;
      }
      return NextResponse.json({ ok: true, linhas, og_nome: nomeClasse });
    }

    return NextResponse.json({ ok: false, error: "operacao inválida" }, { status: 400 });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    if (tabelaPrevisoesAusente(err)) {
      return NextResponse.json({ ok: false, error: "Previsão de Gastos ainda não instalada: execute a Seção 352 do supabase_migrations.sql no Supabase." }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: err?.message ?? String(e) }, { status: 500 });
  }
}
