import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function autenticarRaccotlo(req: Request) {
  const supabase = sb();
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  const isRaccoltoEmail = (user.email ?? "").toLowerCase().endsWith("@raccolto.com.br");
  if (isRaccoltoEmail) return user;
  const { data: perfil } = await supabase.from("perfis").select("role").eq("user_id", user.id).single();
  const raccotloRoles = ["raccotlo", "raccotlo_gestor", "raccotlo_seletor", "raccotlo_operacional"];
  if (!raccotloRoles.includes(perfil?.role ?? "")) return null;
  return user;
}

// GET /api/admin/raccotlo-clientes?user_id=xxx
// Retorna conta_ids permitidos para o usuário raccoltо.
// Lista vazia = sem restrição (vê todos).
export async function GET(req: Request) {
  const caller = await autenticarRaccotlo(req);
  if (!caller) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });

  const supabase = sb();
  const { data, error } = await supabase
    .from("raccotlo_usuario_contas")
    .select("conta_id")
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ conta_ids: (data ?? []).map(r => r.conta_id) });
}

// POST /api/admin/raccotlo-clientes
// Body: { user_id, conta_ids: string[] }
// Substitui as contas permitidas do usuário (delete + insert).
// conta_ids vazio = remove restrições (acesso total).
export async function POST(req: Request) {
  const caller = await autenticarRaccotlo(req);
  if (!caller) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const { user_id, conta_ids } = body as { user_id: string; conta_ids: string[] };
  if (!user_id) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });

  const supabase = sb();

  // Remove todas as permissões atuais do usuário
  const { error: delErr } = await supabase
    .from("raccotlo_usuario_contas")
    .delete()
    .eq("user_id", user_id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Insere as novas (se houver)
  if (conta_ids && conta_ids.length > 0) {
    const rows = conta_ids.map(cid => ({ user_id, conta_id: cid }));
    const { error: insErr } = await supabase.from("raccotlo_usuario_contas").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
