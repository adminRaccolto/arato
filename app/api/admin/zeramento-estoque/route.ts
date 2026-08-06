import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function verificarRaccotlo(): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: perfil } = await supabase.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
  return perfil?.role === "raccotlo" || perfil?.role === "raccotlo_gestor";
}

export async function POST(req: Request) {
  if (!(await verificarRaccotlo())) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
  }

  const { fazenda_ids } = await req.json() as { fazenda_ids: string[] };
  if (!Array.isArray(fazenda_ids) || fazenda_ids.length === 0) {
    return NextResponse.json({ error: "fazenda_ids obrigatório" }, { status: 400 });
  }

  const sb = serviceRole();
  const erros: string[] = [];
  let total = 0;

  // 1. Zerar insumos.estoque (insumos regulares e itens gerais)
  for (const fId of fazenda_ids) {
    const { error, count } = await sb
      .from("insumos")
      .update({ estoque: 0 }, { count: "exact" })
      .eq("fazenda_id", fId);
    if (error) erros.push(`insumos (${fId}): ${error.message}`);
    else total += count ?? 0;
  }

  // 2. Zerar pa_saldos.saldo_atual (Princípio Ativo)
  for (const fId of fazenda_ids) {
    const { error, count } = await sb
      .from("pa_saldos")
      .update({ saldo_atual: 0 }, { count: "exact" })
      .eq("fazenda_id", fId);
    if (error && !error.message.includes("does not exist")) erros.push(`pa_saldos (${fId}): ${error.message}`);
    else total += count ?? 0;
  }

  return NextResponse.json({ ok: erros.length === 0, total, erros });
}
