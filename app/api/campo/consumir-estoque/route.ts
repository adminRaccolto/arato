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

interface Payload {
  itens: ConsumoItem[];
  // Campos top-level obrigatórios para o lançamento (evita depender de itens[0])
  fazenda_id: string;
  data_operacao: string;           // data do lançamento financeiro
  // Dados para gerar o lançamento CP obrigatório
  ciclo_id?: string;
  descricao_lancamento: string;   // ex: "Pulverização — Herbicida"
  categoria_lancamento: string;   // ex: "Insumos — Defensivos"
}

// POST /api/campo/consumir-estoque
// Registra saída de estoque + cria lançamento CP para operações do campo app.
// Usa service_role_key — imune a JWT expirado e RLS.
// O lançamento CP é SEMPRE criado (mesmo sem itens de estoque).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Payload;
    const { itens, ciclo_id, descricao_lancamento, categoria_lancamento } = body;
    // fazenda_id e data podem vir no top-level (preferência) ou derivado do primeiro item
    const fazenda_id  = body.fazenda_id  || itens?.[0]?.fazenda_id;
    const data        = body.data_operacao || itens?.[0]?.data;
    if (!fazenda_id || !data) return NextResponse.json({ erro: "fazenda_id e data são obrigatórios" }, { status: 400 });

    const supabase = sb();

    let baixados = 0;
    let custoTotal = 0;
    const erros: string[] = [];

    for (const item of (itens ?? [])) {
      if (!item.insumo_id || item.quantidade <= 0) continue;

      // Busca estoque e custo atual
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
      const custoItem = custoUnit * item.quantidade;
      custoTotal += custoItem;

      // Atualiza estoque
      await supabase
        .from("insumos")
        .update({ estoque: novoEstoque })
        .eq("id", item.insumo_id);

      // Registra movimentação de saída
      const { error: movErr } = await supabase.from("movimentacoes_estoque").insert({
        insumo_id:               item.insumo_id,
        fazenda_id:              item.fazenda_id,
        tipo:                    "saida",
        motivo:                  "baixa_uso",
        quantidade:              item.quantidade,
        custo_unitario_na_baixa: custoUnit,
        data:                    item.data,
        operacao:                item.operacao,
        talhao:                  item.talhao_nome ?? null,
        safra:                   item.safra_descricao ?? null,
        ciclo_id:                ciclo_id ?? null,
        observacao:              item.observacao ?? null,
        auto:                    true,
      });

      if (movErr) {
        erros.push(`estoque ${item.insumo_id}: ${movErr.message}`);
      } else {
        baixados++;
      }
    }

    // Lançamento CP obrigatório — criado independente do custo calculado
    // (mesmo sem custo_medio/valor_unitario, registra o lançamento com valor 0
    //  para que o operador preencha o valor correto no financeiro)
    const { error: lancErr } = await supabase.from("lancamentos").insert({
      fazenda_id,
      tipo:            "pagar",
      moeda:           "BRL",
      descricao:       descricao_lancamento,
      categoria:       categoria_lancamento,
      data_lancamento: new Date().toISOString().slice(0, 10),
      data_vencimento: data,
      valor:           custoTotal,
      ciclo_id:        ciclo_id ?? null,
      status:          "em_aberto",
      auto:            true,
    });

    if (lancErr) erros.push(`lançamento: ${lancErr.message}`);

    return NextResponse.json({ ok: true, baixados, custo_total: custoTotal, erros });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
