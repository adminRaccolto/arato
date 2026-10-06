/**
 * GET /api/preferencias-grid?grid=cp  → layout de colunas do usuário logado
 * PUT /api/preferencias-grid          → grava { grid, config } do usuário logado
 *
 * O layout é do LOGIN (auth.uid), não do navegador: qualquer pessoa que entre com o
 * próprio usuário vê o próprio layout, em qualquer aparelho.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestUser } from "../../../lib/api-auth";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const grid = req.nextUrl.searchParams.get("grid");
  if (!grid) return NextResponse.json({ error: "grid obrigatório" }, { status: 400 });

  const { data, error } = await admin()
    .from("preferencias_grid").select("config").eq("user_id", user.id).eq("grid", grid).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data?.config ?? null });
}

export async function PUT(req: NextRequest) {
  const user = await getRequestUser(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const body = await req.json() as { grid?: string; config?: Record<string, unknown> };
  if (!body.grid || !body.config) return NextResponse.json({ error: "grid e config obrigatórios" }, { status: 400 });

  const { error } = await admin().from("preferencias_grid").upsert(
    { user_id: user.id, grid: body.grid, config: body.config, updated_at: new Date().toISOString() },
    { onConflict: "user_id,grid" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
