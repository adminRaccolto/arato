/**
 * /api/usuarios-cliente — PUT e DELETE de usuários do ambiente cliente
 * Usa service_role_key para evitar bloqueio por JWT expirado no browser.
 * Apenas usuários autenticados podem chamar (verificado via cookie).
 *
 * PUT  { id, fazenda_id, nome, email, grupo_id, ativo, whatsapp }
 * DELETE ?id=xxx
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

export async function PUT(req: Request) {
  const { data: { user }, error } = await getUser();
  if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const { id, fazenda_id, nome, email, grupo_id, ativo, whatsapp } = body;
  if (!id || !fazenda_id) return NextResponse.json({ error: "id e fazenda_id obrigatórios" }, { status: 400 });

  const db = adminClient();

  // Verifica que o usuário alvo pertence à mesma fazenda (segurança cross-tenant)
  const { data: alvo } = await db.from("usuarios").select("fazenda_id").eq("id", id).maybeSingle();
  if (!alvo || alvo.fazenda_id !== fazenda_id) {
    return NextResponse.json({ error: "Usuário não encontrado nesta fazenda" }, { status: 403 });
  }

  const { error: dbErr } = await db.from("usuarios").update({
    nome,
    email,
    grupo_id: grupo_id || null,
    ativo,
    whatsapp: whatsapp || null,
    fazenda_id,
  }).eq("id", id);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { data: { user }, error } = await getUser();
  if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const fazenda_id = url.searchParams.get("fazenda_id");
  if (!id || !fazenda_id) return NextResponse.json({ error: "id e fazenda_id obrigatórios" }, { status: 400 });

  const db = adminClient();

  // Verifica que o registro pertence à fazenda antes de deletar
  const { data: alvo } = await db.from("usuarios").select("fazenda_id").eq("id", id).maybeSingle();
  if (!alvo || alvo.fazenda_id !== fazenda_id) {
    return NextResponse.json({ error: "Usuário não encontrado nesta fazenda" }, { status: 403 });
  }

  const { error: dbErr } = await db.from("usuarios").delete().eq("id", id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
