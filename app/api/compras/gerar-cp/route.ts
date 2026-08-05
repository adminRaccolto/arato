import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// POST /api/compras/gerar-cp
// Gera (ou atualiza) o lançamento CP de um pedido de compra aprovado.
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      pedido_id: string;
      fazenda_id: string;
      nr_pedido?: string;
      fornecedor_nome: string;
      fornecedor_id?: string;
      moeda: "BRL" | "USD";
      cotacao_usd?: number;
      valor_total: number;
      data_registro: string;
      data_vencimento?: string;
      ano_safra_id?: string;
      ciclo_id?: string;
      produtor_id?: string;
    };

    const sb = admin();

    // ── Verifica se já existe lançamento para este pedido ─────────────────────
    const { data: pedido } = await sb
      .from("pedidos_compra")
      .select("id, lancamento_id, status")
      .eq("id", body.pedido_id)
      .single();

    if (!pedido) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
    if (pedido.status !== "aprovado") return NextResponse.json({ error: "Pedido não está aprovado" }, { status: 400 });
    if (pedido.lancamento_id) {
      // Já tem lançamento — atualiza valores
      await sb.from("lancamentos").update({
        valor:       body.valor_total,
        moeda:       body.moeda,
        cotacao_usd: body.cotacao_usd ?? null,
        descricao:   `Pedido de Compra nº ${body.nr_pedido ?? body.pedido_id.slice(0, 8)} — ${body.fornecedor_nome}`,
        data_vencimento: body.data_vencimento || body.data_registro,
        pessoa_id:   body.fornecedor_id ?? null,
      }).eq("id", pedido.lancamento_id);
      return NextResponse.json({ ok: true, lancamento_id: pedido.lancamento_id, atualizado: true });
    }

    // ── Cria novo lançamento CP ───────────────────────────────────────────────
    const payload: Record<string, unknown> = {
      fazenda_id:        body.fazenda_id,
      tipo:              "pagar",
      moeda:             body.moeda,
      cotacao_usd:       body.cotacao_usd ?? null,
      descricao:         `Pedido de Compra nº ${body.nr_pedido ?? body.pedido_id.slice(0, 8)} — ${body.fornecedor_nome}`,
      categoria:         "Insumos",
      data_lancamento:   body.data_registro,
      data_vencimento:   body.data_vencimento || body.data_registro,
      valor:             body.valor_total,
      status:            "em_aberto",
      auto:              true,
      pessoa_id:         body.fornecedor_id ?? null,
      origem_lancamento: "pedido_compra",
      pedido_compra_id:  body.pedido_id,
    };
    if (body.ano_safra_id) payload.ano_safra_id = body.ano_safra_id;
    if (body.ciclo_id)     payload.ciclo_id     = body.ciclo_id;
    if (body.produtor_id)  payload.produtor_id  = body.produtor_id;

    const { data: lanc, error } = await sb
      .from("lancamentos")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error("[compras/gerar-cp] insert error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Vincula lançamento ao pedido
    await sb.from("pedidos_compra").update({ lancamento_id: lanc.id }).eq("id", body.pedido_id);

    return NextResponse.json({ ok: true, lancamento_id: lanc.id, criado: true });
  } catch (e) {
    console.error("[compras/gerar-cp] erro:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
