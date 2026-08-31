import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Valida que o solicitante é role=bpo com parceiro_id definido.
// Retorna { ok, parceiroId } ou um Response de erro.
async function autorizarBpoAdmin(req: Request): Promise<{ ok: true; parceiroId: string } | Response> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const { data: perfil } = await sb
    .from("perfis")
    .select("role, parceiro_id, bpo_nivel")
    .eq("user_id", user.id)
    .maybeSingle();

  if (perfil?.role !== "bpo")
    return NextResponse.json({ error: "Acesso restrito a parceiros BPO" }, { status: 403 });

  if (perfil.bpo_nivel !== "admin")
    return NextResponse.json({ error: "Apenas administradores BPO podem gerenciar usuários" }, { status: 403 });

  if (!perfil.parceiro_id)
    return NextResponse.json({ error: "Parceiro não identificado" }, { status: 403 });

  return { ok: true, parceiroId: perfil.parceiro_id };
}

// GET /api/bpo/usuarios — lista usuários do parceiro
export async function GET(req: Request) {
  const auth = await autorizarBpoAdmin(req);
  if (auth instanceof Response) return auth;

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: perfis, error } = await sb
    .from("perfis")
    .select("user_id, nome, bpo_nivel, conta_id")
    .eq("parceiro_id", auth.parceiroId)
    .eq("role", "bpo")
    .order("nome");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Busca metadados de cada usuário (email + banned) via admin API
  const userIds = (perfis ?? []).map(p => p.user_id);
  const usuariosComEmail: Array<{
    user_id: string; nome: string; bpo_nivel: string | null; conta_id: string | null;
    email: string; ativo: boolean;
  }> = [];

  for (const p of perfis ?? []) {
    const { data: userData } = await sb.auth.admin.getUserById(p.user_id);
    usuariosComEmail.push({
      user_id: p.user_id,
      nome: p.nome,
      bpo_nivel: p.bpo_nivel ?? "operacional",
      conta_id: p.conta_id ?? null,
      email: userData?.user?.email ?? "",
      ativo: !userData?.user?.banned_until,
    });
  }

  // Evita warning de variável não usada
  void userIds;

  return NextResponse.json({ usuarios: usuariosComEmail });
}

// POST /api/bpo/usuarios — cria novo usuário BPO
export async function POST(req: Request) {
  const auth = await autorizarBpoAdmin(req);
  if (auth instanceof Response) return auth;

  const body = await req.json() as {
    nome: string;
    email: string;
    senha: string;
    bpo_nivel: "admin" | "operacional" | "consultor";
  };

  if (!body.nome || !body.email || !body.senha)
    return NextResponse.json({ error: "nome, email e senha são obrigatórios" }, { status: 400 });

  if (!["admin", "operacional", "consultor"].includes(body.bpo_nivel))
    return NextResponse.json({ error: "bpo_nivel inválido" }, { status: 400 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Cria usuário no Auth
  const { data: created, error: authErr } = await sb.auth.admin.createUser({
    email: body.email,
    password: body.senha,
    email_confirm: true,
    user_metadata: { nome: body.nome },
  });

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

  const userId = created.user.id;

  // Insere perfil vinculado ao parceiro
  const { error: perfilErr } = await sb.from("perfis").insert({
    user_id: userId,
    nome: body.nome,
    role: "bpo",
    bpo_nivel: body.bpo_nivel,
    parceiro_id: auth.parceiroId,
    // fazenda_id e conta_id ficam NULL — usuário BPO não tem fazenda própria
  });

  if (perfilErr) {
    // Rollback: remove usuário do Auth se o perfil falhou
    await sb.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: perfilErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user_id: userId, email: body.email });
}

// PATCH /api/bpo/usuarios — ativa ou desativa usuário
export async function PATCH(req: Request) {
  const auth = await autorizarBpoAdmin(req);
  if (auth instanceof Response) return auth;

  const body = await req.json() as { user_id: string; ativo: boolean };

  if (!body.user_id) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Confirma que o usuário alvo pertence ao mesmo parceiro
  const { data: perfil } = await sb
    .from("perfis")
    .select("parceiro_id, bpo_nivel")
    .eq("user_id", body.user_id)
    .maybeSingle();

  if (perfil?.parceiro_id !== auth.parceiroId)
    return NextResponse.json({ error: "Usuário não pertence ao seu parceiro" }, { status: 403 });

  // Não permite que um admin se auto-desative
  if (!body.ativo && perfil?.bpo_nivel === "admin") {
    // Conta quantos admins ainda existiriam — impede desativar o último
    const { count } = await sb
      .from("perfis")
      .select("user_id", { count: "exact", head: true })
      .eq("parceiro_id", auth.parceiroId)
      .eq("bpo_nivel", "admin");
    if ((count ?? 0) <= 1)
      return NextResponse.json({ error: "Não é possível desativar o único administrador BPO" }, { status: 400 });
  }

  const banUntil = body.ativo ? null : new Date("2099-01-01").toISOString();
  const { error } = await sb.auth.admin.updateUserById(body.user_id, { ban_duration: body.ativo ? "none" : "87600h" });

  void banUntil;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
