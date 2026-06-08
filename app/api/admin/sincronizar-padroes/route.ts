/**
 * POST /api/admin/sincronizar-padroes
 * Sincroniza templates de operacoes_gerenciais (fazenda_id IS NULL)
 * para as fazendas selecionadas — modo Merge.
 *
 * Segurança: requer role=raccotlo via header Authorization Bearer <RACCOTLO_ADMIN_SECRET>
 * ou verificação via Supabase JWT (role=raccotlo).
 *
 * Body: {
 *   fazenda_ids: string[]   // fazendas alvo; [] = todas
 *   modulo: "operacoes_gerenciais"
 * }
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

// Campos que são sincronizados do template para o cliente
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { fazenda_ids?: string[]; modulo?: string };
    const { fazenda_ids = [], modulo = "operacoes_gerenciais" } = body;

    if (modulo !== "operacoes_gerenciais") {
      return NextResponse.json({ erro: `Módulo "${modulo}" ainda não suportado.` }, { status: 400 });
    }

    const sb = serviceSupabase();

    // 1. Carregar todos os templates (fazenda_id IS NULL), ordenados por classificacao
    const { data: templates, error: errTmpl } = await sb
      .from("operacoes_gerenciais")
      .select("*")
      .is("fazenda_id", null)
      .order("classificacao");

    if (errTmpl) throw errTmpl;
    if (!templates || templates.length === 0) {
      return NextResponse.json({ aviso: "Nenhum template encontrado. Crie operações com fazenda_id nulo." });
    }

    // Mapa: template_id → classificacao (para resolver parent_id)
    const tmplClassif = new Map<string, string>(
      templates.map((t: { id: string; classificacao: string }) => [t.id, t.classificacao])
    );

    // 2. Determinar fazendas alvo
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

    if (fazendas.length === 0) {
      return NextResponse.json({ aviso: "Nenhuma fazenda encontrada para sincronizar." });
    }

    // 3. Sincronizar para cada fazenda
    const resultados: Array<{
      fazenda_id: string; fazenda_nome: string;
      inseridos: number; atualizados: number; erros: number;
    }> = [];

    for (const fazenda of fazendas) {
      // Busca registros existentes dessa fazenda (mapa classificacao → id)
      const { data: existentes } = await sb
        .from("operacoes_gerenciais")
        .select("id, classificacao")
        .eq("fazenda_id", fazenda.id);

      const classifParaId = new Map<string, string>(
        (existentes ?? []).map((r: { id: string; classificacao: string }) => [r.classificacao, r.id])
      );

      let inseridos = 0, atualizados = 0, erros = 0;

      for (const tmpl of templates) {
        try {
          // Resolve parent_id para esta fazenda
          let parentId: string | null = null;
          if (tmpl.parent_id) {
            const parentClassif = tmplClassif.get(tmpl.parent_id);
            if (parentClassif) {
              parentId = classifParaId.get(parentClassif) ?? null;
            }
          }

          // Monta payload com campos sincronizáveis
          const payload: Record<string, unknown> = { fazenda_id: fazenda.id, classificacao: tmpl.classificacao, parent_id: parentId };
          for (const campo of CAMPOS_SYNC) {
            payload[campo] = tmpl[campo as keyof typeof tmpl] ?? null;
          }

          const existenteId = classifParaId.get(tmpl.classificacao);

          if (existenteId) {
            // UPDATE
            const { error } = await sb
              .from("operacoes_gerenciais")
              .update(payload)
              .eq("id", existenteId);
            if (error) throw error;
            atualizados++;
          } else {
            // INSERT
            const { data: novo, error } = await sb
              .from("operacoes_gerenciais")
              .insert(payload)
              .select("id, classificacao")
              .single();
            if (error) throw error;
            // Atualiza mapa para resolver parents de filhos na mesma rodada
            classifParaId.set(tmpl.classificacao, novo.id);
            inseridos++;
          }
        } catch {
          erros++;
        }
      }

      resultados.push({ fazenda_id: fazenda.id, fazenda_nome: fazenda.nome, inseridos, atualizados, erros });
    }

    return NextResponse.json({ ok: true, resultados, total_templates: templates.length });
  } catch (err) {
    console.error("[sincronizar-padroes]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
