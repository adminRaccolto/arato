/**
 * POST /api/admin/sincronizar-padroes
 * Sincroniza templates de operacoes_gerenciais (fazenda_id IS NULL)
 * para as fazendas selecionadas — modo Merge.
 *
 * Body: { fazenda_ids: string[], modulo: "operacoes_gerenciais" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const serviceSupabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

const CAMPOS_SYNC = [
  "descricao", "tipo", "tipo_lcdpr", "inativo", "informa_complemento",
  "permite_notas_fiscais", "permite_cp_cr", "permite_adiantamentos",
  "permite_tesouraria", "permite_baixas", "permite_custo_produto",
  "permite_contrato_financeiro", "permite_estoque", "permite_pedidos_venda",
  "permite_manutencao", "marcar_fiscal_padrao", "permite_energia_eletrica",
  "operacao_estoque", "tipo_item_estoque", "tipo_custo_estoque",
  "obs_legal", "natureza_receita", "impostos",
  "gerar_financeiro", "gerar_financeiro_gerencial", "valida_propriedade",
  "custo_absorcao", "custo_abc", "atualizar_custo_estoque",
  "manutencao_reparos", "gerar_depreciacao",
  "tipo_formula", "modelo_contabil", "conta_debito", "conta_credito",
] as const;

const CHUNK = 250;

async function chunkUpsert(
  sb: ReturnType<typeof serviceSupabase>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { fazenda_ids?: string[]; modulo?: string };
    const { fazenda_ids = [], modulo = "operacoes_gerenciais" } = body;

    if (modulo !== "operacoes_gerenciais") {
      return NextResponse.json({ erro: `Módulo "${modulo}" ainda não suportado.` }, { status: 400 });
    }

    const sb = serviceSupabase();

    // 1. Carregar templates (fazenda_id IS NULL)
    const { data: templates, error: errTmpl } = await sb
      .from("operacoes_gerenciais")
      .select("*")
      .is("fazenda_id", null)
      .order("classificacao");

    if (errTmpl) throw errTmpl;
    if (!templates?.length) {
      return NextResponse.json({ aviso: "Nenhum template encontrado." });
    }

    // Mapa: template_id → classificacao (para resolver parent_id depois)
    const tmplClassif = new Map<string, string>(
      templates.map((t: { id: string; classificacao: string }) => [t.id, t.classificacao])
    );

    // 2. Fazendas alvo
    let fazendas: { id: string; nome: string }[];
    if (fazenda_ids.length > 0) {
      const { data, error } = await sb.from("fazendas").select("id, nome").in("id", fazenda_ids);
      if (error) throw error;
      fazendas = data ?? [];
    } else {
      const { data, error } = await sb.from("fazendas").select("id, nome").order("nome");
      if (error) throw error;
      fazendas = data ?? [];
    }

    if (!fazendas.length) {
      return NextResponse.json({ aviso: "Nenhuma fazenda encontrada." });
    }

    // 3. Sincronizar — 3 passes por fazenda em vez de N queries individuais
    const resultados: Array<{
      fazenda_id: string; fazenda_nome: string;
      inseridos: number; atualizados: number;
    }> = [];

    for (const fazenda of fazendas) {
      // Pass A: buscar existentes desta fazenda (1 query)
      const { data: existentes } = await sb
        .from("operacoes_gerenciais")
        .select("id, classificacao")
        .eq("fazenda_id", fazenda.id);

      const classifParaId = new Map<string, string>(
        (existentes ?? []).map((r: { id: string; classificacao: string }) => [r.classificacao, r.id])
      );

      const toInsert: Record<string, unknown>[] = [];
      const toUpdate: Record<string, unknown>[] = [];

      for (const tmpl of templates) {
        const campos: Record<string, unknown> = { fazenda_id: fazenda.id, classificacao: tmpl.classificacao, parent_id: null };
        for (const c of CAMPOS_SYNC) campos[c] = tmpl[c as keyof typeof tmpl] ?? null;

        const existenteId = classifParaId.get(tmpl.classificacao);
        if (existenteId) {
          toUpdate.push({ id: existenteId, ...campos });
        } else {
          toInsert.push(campos);
        }
      }

      // Pass B: INSERT novos em lote, UPDATE existentes em lote (parent_id = null por ora)
      let inseridos = 0;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const { data: novos, error } = await sb
          .from("operacoes_gerenciais")
          .insert(toInsert.slice(i, i + CHUNK))
          .select("id, classificacao");
        if (error) throw error;
        for (const n of novos ?? []) classifParaId.set(n.classificacao, n.id);
        inseridos += (novos ?? []).length;
      }

      // UPDATE existentes via upsert por id
      if (toUpdate.length) {
        await chunkUpsert(sb, "operacoes_gerenciais", toUpdate, "id");
      }

      // Pass C: resolver parent_ids agora que todos os IDs estão disponíveis
      const parentUpdates: { id: string; parent_id: string }[] = [];
      for (const tmpl of templates) {
        if (!tmpl.parent_id) continue;
        const parentClassif = tmplClassif.get(tmpl.parent_id);
        if (!parentClassif) continue;
        const parentIdFazenda = classifParaId.get(parentClassif);
        const childId = classifParaId.get(tmpl.classificacao);
        if (childId && parentIdFazenda) {
          parentUpdates.push({ id: childId, parent_id: parentIdFazenda });
        }
      }

      if (parentUpdates.length) {
        await chunkUpsert(sb, "operacoes_gerenciais", parentUpdates, "id");
      }

      resultados.push({
        fazenda_id: fazenda.id,
        fazenda_nome: fazenda.nome,
        inseridos,
        atualizados: toUpdate.length,
      });
    }

    return NextResponse.json({ ok: true, resultados, total_templates: templates.length });
  } catch (err) {
    console.error("[sincronizar-padroes]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
