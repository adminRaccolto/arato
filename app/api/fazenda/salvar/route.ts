/**
 * POST /api/fazenda/salvar
 * Cria ou atualiza uma fazenda usando service_role_key (bypass RLS).
 * Protegido por autenticação via cookie.
 *
 * Body: { id?: string, ...campos_da_fazenda }
 * - Se id presente → UPDATE
 * - Se id ausente  → INSERT
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

export async function POST(req: Request) {
  const { data: { user }, error: authErr } = await getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const { id, ...campos } = body as { id?: string; [key: string]: unknown };

  const db = adminClient();

  if (id) {
    // UPDATE
    const { data, error } = await db
      .from("fazendas")
      .update(campos)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Fazenda não encontrada" }, { status: 404 });
    return NextResponse.json({ data });
  } else {
    // INSERT
    const { data, error } = await db
      .from("fazendas")
      .insert(campos)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Erro ao criar fazenda" }, { status: 500 });
    return NextResponse.json({ data });
  }
}
