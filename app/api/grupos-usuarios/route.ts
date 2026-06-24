/**
 * /api/grupos-usuarios — CRUD via service_role_key (bypassa JWT expirado)
 * GET  ?fazenda_id=xxx       → lista grupos da fazenda
 * POST  { fazenda_id, nome, descricao, permissoes }  → cria grupo
 * PUT   { id, fazenda_id, nome, descricao, permissoes } → atualiza grupo
 * DELETE ?id=xxx             → remove grupo
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getUser() {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  return sb.auth.getUser();
}

export async function GET(req: Request) {
  const { data: { user }, error } = await getUser();
  if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const fazenda_id = new URL(req.url).searchParams.get("fazenda_id");
  if (!fazenda_id) return NextResponse.json({ error: "fazenda_id obrigatório" }, { status: 400 });

  const db = adminClient();

  // Busca grupos da fazenda
  let { data, error: dbErr } = await db
    .from("grupos_usuarios")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .order("nome");

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // Auto-backfill: se não há grupos com fazenda_id preenchido, procura grupos
  // com fazenda_id = NULL cujos membros pertencem a esta fazenda (migração pós-Bloco 24)
  if ((data ?? []).length === 0) {
    const { data: usersWithGroup } = await db
      .from("usuarios")
      .select("grupo_id")
      .eq("fazenda_id", fazenda_id)
      .not("grupo_id", "is", null);

    const grupoIds = [...new Set(
      (usersWithGroup ?? []).map((u: { grupo_id: string }) => u.grupo_id).filter(Boolean)
    )];

    if (grupoIds.length > 0) {
      await db.from("grupos_usuarios")
        .update({ fazenda_id })
        .in("id", grupoIds)
        .is("fazenda_id", null);

      const { data: refreshed } = await db
        .from("grupos_usuarios")
        .select("*")
        .eq("fazenda_id", fazenda_id)
        .order("nome");

      data = refreshed;
    }
  }

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const { data: { user }, error } = await getUser();
  if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { fazenda_id, nome, descricao, permissoes } = body;
  if (!fazenda_id || !nome) return NextResponse.json({ error: "fazenda_id e nome obrigatórios" }, { status: 400 });

  const db = adminClient();
  const { data, error: dbErr } = await db
    .from("grupos_usuarios")
    .insert({ fazenda_id, nome, descricao, permissoes })
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(req: Request) {
  const { data: { user }, error } = await getUser();
  if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { id, fazenda_id, nome, descricao, permissoes } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const db = adminClient();
  const { data, error: dbErr } = await db
    .from("grupos_usuarios")
    .update({ fazenda_id, nome, descricao, permissoes })
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(req: Request) {
  const { data: { user }, error } = await getUser();
  if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const db = adminClient();
  const { error: dbErr } = await db.from("grupos_usuarios").delete().eq("id", id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
