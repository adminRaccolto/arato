/**
 * POST /api/admin/liberar-onboarding
 * Desativa onboarding_ativo = false para TODAS as contas (ou uma conta específica).
 * Restrito a usuários raccotlo.
 *
 * Body: { conta_id?: string }   → omitir para liberar todas
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function isRaccotlo(): Promise<boolean> {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return false;
  if ((user.email ?? "").toLowerCase() === "gino@raccolto.com.br") return true;
  const db = adminDb();
  const { data } = await db.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
  return (data as { role?: string } | null)?.role === "raccotlo";
}

export async function POST(req: Request) {
  if (!(await isRaccotlo())) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const db = adminDb();
  let contaId: string | undefined;
  try { const body = await req.json(); contaId = body.conta_id; } catch { /* sem body */ }

  // Busca quais contas estão com onboarding ativo antes de atualizar
  const selectQ = db.from("contas").select("id, nome").eq("onboarding_ativo", true);
  const { data: antes } = contaId
    ? await selectQ.eq("id", contaId)
    : await selectQ;

  if (!antes || antes.length === 0) {
    return NextResponse.json({ ok: true, liberadas: 0, contas: [], msg: "Nenhuma conta com onboarding ativo." });
  }

  const ids = (antes as { id: string; nome: string }[]).map(c => c.id);

  const { error } = await db
    .from("contas")
    .update({ onboarding_ativo: false })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    liberadas: ids.length,
    contas: (antes as { id: string; nome: string }[]).map(c => c.nome),
  });
}
