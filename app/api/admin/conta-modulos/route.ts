import { NextRequest, NextResponse } from "next/server";
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

async function verificarAcesso(): Promise<{ ok: boolean; status?: number }> {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user) return { ok: false, status: 401 };

  const admin = adminClient();
  const { data: perfil } = await admin.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
  const isGino = (user.email ?? "").toLowerCase() === "gino@raccolto.com.br";
  if (!isGino && perfil?.role !== "raccotlo" && perfil?.role !== "raccotlo_gestor") {
    return { ok: false, status: 403 };
  }
  return { ok: true };
}

// GET /api/admin/conta-modulos?conta_id=xxx
// Retorna os overrides de módulos da conta (service_role, ignora RLS)
export async function GET(req: NextRequest) {
  const acesso = await verificarAcesso();
  if (!acesso.ok) return NextResponse.json({ error: "Sem permissão" }, { status: acesso.status });

  const contaId = req.nextUrl.searchParams.get("conta_id");
  if (!contaId) return NextResponse.json({ error: "conta_id obrigatório" }, { status: 400 });

  const admin = adminClient();
  const { data, error } = await admin
    .from("conta_modulos")
    .select("modulo, habilitado")
    .eq("conta_id", contaId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/conta-modulos
// Body: { conta_id: string, modulos: { modulo: string, habilitado: boolean }[] }
// Faz upsert em lote (service_role, ignora RLS)
export async function POST(req: NextRequest) {
  const acesso = await verificarAcesso();
  if (!acesso.ok) return NextResponse.json({ error: "Sem permissão" }, { status: acesso.status });

  const body = await req.json() as { conta_id: string; modulos: { modulo: string; habilitado: boolean }[] };
  const { conta_id, modulos } = body;
  if (!conta_id || !Array.isArray(modulos)) {
    return NextResponse.json({ error: "conta_id e modulos são obrigatórios" }, { status: 400 });
  }

  const admin = adminClient();
  const upserts = modulos.map(m => ({ conta_id, modulo: m.modulo, habilitado: m.habilitado }));

  const { error } = await admin
    .from("conta_modulos")
    .upsert(upserts, { onConflict: "conta_id,modulo" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
