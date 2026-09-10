/**
 * /api/grupos-usuarios — CRUD via service_role_key (bypassa JWT expirado)
 * GET  ?fazenda_id=xxx       → lista grupos da fazenda
 * POST  { fazenda_id, nome, descricao, permissoes }  → cria grupo
 * PUT   { id, fazenda_id, nome, descricao, permissoes } → atualiza grupo
 * DELETE ?id=xxx             → remove grupo
 *
 * Todas as operações validam que o usuário autenticado tem acesso à fazenda
 * do grupo (via validateFazendaAccess) — nunca confiam apenas no fazenda_id
 * que o próprio cliente envia no corpo/query da requisição.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { validateFazendaAccess } from "../../../lib/api-auth";

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

// Grupos com fazenda_id = NULL são templates globais, compartilhados entre
// clientes — só a equipe Raccolto pode criar/editar/excluir esses.
async function callerIsRaccotlo(userId: string): Promise<boolean> {
  const { data: perfil } = await adminClient()
    .from("perfis")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return !!perfil?.role?.startsWith("raccotlo");
}

export async function GET(req: Request) {
  const { data: { user }, error } = await getUser();
  if (error || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const fazenda_id = new URL(req.url).searchParams.get("fazenda_id");
  if (!fazenda_id) return NextResponse.json({ error: "fazenda_id obrigatório" }, { status: 400 });

  const acesso = await validateFazendaAccess(fazenda_id);
  if (!acesso.ok) return NextResponse.json({ error: acesso.error }, { status: acesso.status });

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

  const acesso = await validateFazendaAccess(fazenda_id);
  if (!acesso.ok) return NextResponse.json({ error: acesso.error }, { status: acesso.status });

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

  const { data: grupoAtual } = await db.from("grupos_usuarios").select("fazenda_id").eq("id", id).maybeSingle();
  if (!grupoAtual) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  // Acesso ao grupo como ele está hoje
  if (grupoAtual.fazenda_id) {
    const acesso = await validateFazendaAccess(grupoAtual.fazenda_id);
    if (!acesso.ok) return NextResponse.json({ error: acesso.error }, { status: acesso.status });
  } else if (!(await callerIsRaccotlo(user.id))) {
    return NextResponse.json({ error: "Apenas a equipe Raccolto pode editar grupos globais" }, { status: 403 });
  }

  // Se o payload está movendo o grupo para outra fazenda, valida acesso à fazenda de destino também
  if (fazenda_id && fazenda_id !== grupoAtual.fazenda_id) {
    const acessoDestino = await validateFazendaAccess(fazenda_id);
    if (!acessoDestino.ok) return NextResponse.json({ error: acessoDestino.error }, { status: acessoDestino.status });
  }

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
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const db = adminClient();

  const { data: grupo } = await db.from("grupos_usuarios").select("fazenda_id").eq("id", id).maybeSingle();
  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  if (grupo.fazenda_id) {
    const acesso = await validateFazendaAccess(grupo.fazenda_id);
    if (!acesso.ok) return NextResponse.json({ error: acesso.error }, { status: acesso.status });
  } else if (!(await callerIsRaccotlo(user.id))) {
    return NextResponse.json({ error: "Apenas a equipe Raccolto pode excluir grupos globais" }, { status: 403 });
  }

  const { error: dbErr } = await db.from("grupos_usuarios").delete().eq("id", id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
