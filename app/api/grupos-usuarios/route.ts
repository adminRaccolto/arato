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

  // Busca grupos da fazenda E grupos globais (fazenda_id = NULL, compartilhados entre clientes)
  const { data, error: dbErr } = await db
    .from("grupos_usuarios")
    .select("*")
    .or(`fazenda_id.eq.${fazenda_id},fazenda_id.is.null`)
    .order("nome");

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

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

  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  const fazenda_id = params.get("fazenda_id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const db = adminClient();

  // Verifica que o grupo pertence à fazenda do usuário (previne IDOR)
  if (fazenda_id) {
    const { validateFazendaAccess } = await import("../../../lib/api-auth");
    const access = await validateFazendaAccess(fazenda_id);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const { data: grupo } = await db.from("grupos_usuarios").select("fazenda_id").eq("id", id).maybeSingle();
    if (grupo && grupo.fazenda_id && grupo.fazenda_id !== fazenda_id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }
  }

  const { error: dbErr } = await db.from("grupos_usuarios").delete().eq("id", id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
