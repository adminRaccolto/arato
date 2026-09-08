import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

interface ConsumoItem {
  insumo_id: string;
  fazenda_id: string;
  quantidade: number;      // total a baixar (dose × área)
  data: string;
  operacao: string;        // "plantio" | "pulverizacao" | "adubacao"
  talhao_nome?: string;
  safra_descricao?: string;
  observacao?: string;
}

// POST /api/campo/consumir-estoque
// Registra saída de estoque para operações do campo app (plantio, pulv, adubação).
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const { itens } = await req.json() as { itens: ConsumoItem[] };
    if (!itens?.length) return NextResponse.json({ ok: true, baixados: 0 });

    const supabase = sb();

    let baixados = 0;
    const erros: string[] = [];

    for (const item of itens) {
      if (!item.insumo_id || item.quantidade <= 0) continue;

      // Busca estoque atual
      const { data: ins, error: insErr } = await supabase
        .from("insumos")
        .select("id, estoque, custo_medio, valor_unitario")
        .eq("id", item.insumo_id)
        .single();

      if (insErr || !ins) {
        erros.push(`insumo ${item.insumo_id}: não encontrado`);
        continue;
      }

      const estoqueAtual = ins.estoque ?? 0;
      const custoUnit = ins.custo_medio ?? ins.valor_unitario ?? 0;
      const novoEstoque = Math.max(0, estoqueAtual - item.quantidade);

      // Atualiza estoque (ou depende de trigger — faz os dois por segurança)
      await supabase
        .from("insumos")
        .update({ estoque: novoEstoque })
        .eq("id", item.insumo_id);

      // Registra movimentação
      const { error: movErr } = await supabase.from("movimentacoes_estoque").insert({
        insumo_id:              item.insumo_id,
        fazenda_id:             item.fazenda_id,
        tipo:                   "saida",
        motivo:                 "baixa_uso",
        quantidade:             item.quantidade,
        custo_unitario_na_baixa: custoUnit,
        data:                   item.data,
        operacao:               item.operacao,
        talhao:                 item.talhao_nome ?? null,
        safra:                  item.safra_descricao ?? null,
        observacao:             item.observacao ?? null,
        auto:                   true,
      });

      if (movErr) {
        erros.push(`insumo ${item.insumo_id}: ${movErr.message}`);
      } else {
        baixados++;
      }
    }

    return NextResponse.json({ ok: true, baixados, erros });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
