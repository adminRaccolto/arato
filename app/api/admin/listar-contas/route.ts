import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/admin/listar-contas
// Lista todas as contas + contagem de fazendas (service_role, ignora RLS)
export async function GET() {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );

  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const admin = adminClient();
  const { data: perfil } = await admin.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
  const isGino = (user.email ?? "").toLowerCase() === "gino@raccolto.com.br";
  if (!isGino && perfil?.role !== "raccotlo" && perfil?.role !== "raccotlo_gestor") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  // Lê todas as contas com contagem de fazendas — service_role ignora RLS
  const { data: contas, error } = await admin
    .from("contas")
    .select("*, fazendas(id, nome, municipio, estado, conta_id)")
    .order("nome");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (contas ?? []).map((c: Record<string, unknown> & { fazendas?: { id: string; nome: string; municipio: string; estado: string; conta_id: string }[] }) => ({
    ...c,
    fazendas_count: Array.isArray(c.fazendas) ? c.fazendas.length : 0,
    // mantém fazendas no response para uso em admin/dados
  }));

  return NextResponse.json(result);
}
