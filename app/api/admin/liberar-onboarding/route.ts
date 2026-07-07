/**
 * POST /api/admin/liberar-onboarding
 * Libera o acesso de uma conta (ou todas):
 *  1. Remove o ban dos usuários no Supabase Auth (ban_duration: "none")
 *  2. Desativa onboarding_ativo na conta
 *  3. Se status = "cancelado", restaura para "pro_bono"
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

  // Busca as contas-alvo (sempre pelo conta_id se fornecido, senão todas)
  let contasAlvo: { id: string; nome: string; status?: string }[] = [];
  if (contaId) {
    const { data } = await db.from("contas").select("id, nome, status").eq("id", contaId);
    contasAlvo = (data ?? []) as { id: string; nome: string; status?: string }[];
  } else {
    const { data } = await db.from("contas").select("id, nome, status").order("nome");
    contasAlvo = (data ?? []) as { id: string; nome: string; status?: string }[];
  }

  if (contasAlvo.length === 0) {
    return NextResponse.json({ ok: true, liberadas: 0, contas: [], users_desbloqueados: 0 });
  }

  const contaIds = contasAlvo.map(c => c.id);
  let usersDesbloqueados = 0;

  // ── 1. Busca todos os user_ids dos perfis dessas contas ──
  const { data: perfis } = await db
    .from("perfis")
    .select("user_id")
    .in("conta_id", contaIds);

  const userIds = [...new Set((perfis ?? []).map((p: { user_id: string }) => p.user_id))];

  // ── 2. Remove o ban de todos os usuários ──
  await Promise.all(
    userIds.map(uid =>
      db.auth.admin.updateUserById(uid, { ban_duration: "none" })
    )
  );
  usersDesbloqueados = userIds.length;

  // ── 3. Desativa onboarding + restaura status se cancelado ──
  await db
    .from("contas")
    .update({ onboarding_ativo: false })
    .in("id", contaIds);

  // Reativa contas canceladas → pro_bono
  const canceladas = contasAlvo.filter(c => c.status === "cancelado").map(c => c.id);
  if (canceladas.length > 0) {
    await db
      .from("contas")
      .update({ status: "pro_bono" })
      .in("id", canceladas);
    // Restaura acesso raccotlo nas fazendas dessas contas
    await db
      .from("fazendas")
      .update({ raccolto_acesso: true })
      .in("conta_id", canceladas);
  }

  return NextResponse.json({
    ok: true,
    liberadas: contasAlvo.length,
    contas: contasAlvo.map(c => c.nome),
    users_desbloqueados: usersDesbloqueados,
    reativadas: canceladas.length,
  });
}
