/**
 * POST /api/lancamentos-cp
 * Insere lançamentos (CP/CR) usando service_role_key — imune a JWT expirado e RLS.
 * Chamado por processarNfEntrada para criar Contas a Pagar de NFs.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase-servidor";
import { exigirAcessoFazendas } from "../../../lib/api-auth";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      rows: Record<string, unknown>[];
    };
    if (!body.rows || body.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "rows vazio" }, { status: 400 });
    }
    const negado = await exigirAcessoFazendas(req, body.rows.map(r => r.fazenda_id as string | undefined));
    if (negado) return negado;
    const sb = admin();
    const { data, error } = await sb
      .from("lancamentos")
      .insert(body.rows)
      .select("id");
    // 23505 = o banco recusou um 2º título da mesma NF/parcela (Seção 401): outro processamento simultâneo já criou
    if (error) return NextResponse.json({ ok: false, error: error.message, duplicado: error.code === "23505" }, { status: error.code === "23505" ? 409 : 500 });
    return NextResponse.json({ ok: true, ids: (data ?? []).map(r => r.id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
