import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";

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
    const negado = await exigirAcessoRegistro(req, "pedidos_compra", body.pedido_id);
    if (negado) return negado;

    if (!Number.isFinite(body.valor_total) || body.valor_total <= 0) {
      return NextResponse.json({ ok: false, error: "Informe o valor positivo do pedido." }, { status: 422 });
    }
    const { data, error } = await admin().rpc("compras_gerar_financeiro_atomico", { p_pedido: body.pedido_id, p_dados: body });
    if (error) return NextResponse.json({ ok: false, error: error.code === "PGRST202"
      ? "Execute a Seção 434 do supabase_migrations.sql para gerar o financeiro com segurança." : error.message }, { status: 400 });
    if (!data?.ok) throw new Error("O financeiro do pedido não foi confirmado.");
    return NextResponse.json(data);

  } catch (e) {
    console.error("[compras/gerar-cp] erro:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
