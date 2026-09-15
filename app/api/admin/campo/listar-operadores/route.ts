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

// GET /api/admin/campo/listar-operadores?conta_id=xxx
// Lista os perfis produto='campo' da conta, com e-mail sintético (vem do
// Auth, não fica em `perfis`) — service_role, ignora RLS.
export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const admin = adminClient();
  const { data: perfilLogado } = await admin.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
  const isGino = (user.email ?? "").toLowerCase() === "gino@raccolto.com.br";
  if (!isGino && perfilLogado?.role !== "raccotlo" && perfilLogado?.role !== "raccotlo_gestor") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const contaId = req.nextUrl.searchParams.get("conta_id");
  if (!contaId) return NextResponse.json({ error: "conta_id obrigatório" }, { status: 400 });

  const { data: operadores, error } = await admin
    .from("perfis")
    .select("id, user_id, nome, papel, fazendas_permitidas, fazenda_id")
    .eq("conta_id", contaId)
    .eq("produto", "campo")
    .order("nome");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: listaUsuarios } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailPorUserId = new Map((listaUsuarios?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  const resultado = (operadores ?? []).map((p) => ({
    ...p,
    email: emailPorUserId.get(p.user_id) ?? "",
    ativo: p.fazendas_permitidas === null || p.fazendas_permitidas.length > 0,
  }));

  return NextResponse.json(resultado);
}
