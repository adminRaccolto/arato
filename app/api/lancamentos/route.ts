/**
 * POST /api/lancamentos
 * Insere lançamentos em lancamentos usando service_role_key — imune a JWT expirado e RLS.
 * Suporta inserção de um ou múltiplos lançamentos via array "rows".
 * Retorna { ok, ids } onde ids é array na mesma ordem dos rows.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    const sb = admin();
    const { data, error } = await sb
      .from("lancamentos")
      .insert(body.rows)
      .select("id");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ids: (data ?? []).map(r => r.id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
