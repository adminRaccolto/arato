/**
 * POST /api/admin/sincronizar-padroes
 * Acrescenta ao plano de contas dos clientes escolhidos os códigos do modelo do sistema que ainda faltam.
 * O modelo é a operação sem fazenda e sem cliente. O que o cliente já tem nunca é alterado.
 *
 * Body: { conta_ids: string[], aplicar: boolean }  (aplicar=false só mostra o que seria acrescentado)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirRaccoltoAdmin } from "../../../../lib/api-auth";
import { ligacoesDePai, operacoesFaltando, type OperacaoModelo } from "../../../../lib/padroes/sincronizar";

export const runtime = "nodejs";

const serviceSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

const LOTE = 250;

export async function POST(req: NextRequest) {
  const negado = await exigirRaccoltoAdmin(req);
  if (negado) return negado;
  try {
    const { conta_ids = [], aplicar = false } = await req.json() as { conta_ids?: string[]; aplicar?: boolean };
    if (!Array.isArray(conta_ids) || conta_ids.length === 0) {
      return NextResponse.json({ erro: "Escolha pelo menos um cliente." }, { status: 400 });
    }

    const sb = serviceSupabase();
    const { data: modelosRaw, error: errModelo } = await sb.from("operacoes_gerenciais").select("*")
      .is("fazenda_id", null).is("conta_id", null).order("classificacao").order("id");
    if (errModelo) throw errModelo;
    const modelos = (modelosRaw ?? []) as (OperacaoModelo & Record<string, unknown>)[];
    if (!modelos.length) return NextResponse.json({ erro: "O modelo do sistema está vazio." }, { status: 400 });

    const { data: contas, error: errContas } = await sb.from("contas").select("id, nome").in("id", conta_ids);
    if (errContas) throw errContas;

    const resultados: { conta_id: string; conta_nome: string; faltando: number; codigos: string[]; inseridos: number }[] = [];
    for (const conta of contas ?? []) {
      const doCliente: { id: string; classificacao: string }[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from("operacoes_gerenciais").select("id, classificacao")
          .eq("conta_id", conta.id).order("id").range(de, de + 999);
        if (error) throw error;
        doCliente.push(...(data ?? []) as typeof doCliente);
        if (!data || data.length < 1000) break;
      }
      const faltando = operacoesFaltando(modelos, doCliente.map(o => o.classificacao));
      let inseridos = 0;
      if (aplicar && faltando.length) {
        const idPorCodigo = new Map(doCliente.map(o => [o.classificacao, o.id]));
        for (let i = 0; i < faltando.length; i += LOTE) {
          const linhas = faltando.slice(i, i + LOTE).map(m => {
            const copia: Record<string, unknown> = { ...m, conta_id: conta.id, fazenda_id: null, parent_id: null };
            delete copia.id;
            delete copia.created_at;
            return copia;
          });
          const { data: novos, error } = await sb.from("operacoes_gerenciais").insert(linhas).select("id, classificacao");
          if (error) throw error;
          for (const n of novos ?? []) idPorCodigo.set(n.classificacao as string, n.id as string);
          inseridos += novos?.length ?? 0;
        }
        for (const { id, parent_id } of ligacoesDePai(faltando, modelos, idPorCodigo)) {
          const { error } = await sb.from("operacoes_gerenciais").update({ parent_id }).eq("id", id);
          if (error) throw error;
        }
      }
      resultados.push({ conta_id: conta.id, conta_nome: conta.nome, faltando: faltando.length, codigos: faltando.slice(0, 8).map(m => m.classificacao), inseridos });
    }
    return NextResponse.json({ ok: true, aplicado: aplicar, total_modelos: modelos.length, resultados });
  } catch (err) {
    console.error("[sincronizar-padroes]", err);
    const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
