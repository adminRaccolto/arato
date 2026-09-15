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

function normalizarParaEmail(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2) // primeiro + último nome, evita e-mails gigantes
    .join(".");
}

// Gera um e-mail sintético único pra esse operador (CLAUDE.md do App Campo,
// decisão 4.2 — nunca é uma caixa de entrada de verdade, só o identificador
// de login). Tenta "nome.sobrenome@campo.raccolto.app"; se já existir,
// acrescenta um sufixo numérico.
async function gerarEmailUnico(admin: ReturnType<typeof adminClient>, nome: string): Promise<string> {
  const base = normalizarParaEmail(nome) || "operador";
  const { data: existentes } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailsExistentes = new Set((existentes?.users ?? []).map((u) => (u.email ?? "").toLowerCase()));

  let candidato = `${base}@campo.raccolto.app`;
  let n = 2;
  while (emailsExistentes.has(candidato)) {
    candidato = `${base}${n}@campo.raccolto.app`;
    n++;
  }
  return candidato;
}

function gerarPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/admin/campo/operador
// Body (criar):   { conta_id, fazenda_id, nome, papel, fazendas_permitidas }
// Body (editar):  { perfil_id, nome?, papel?, fazendas_permitidas? }
// Body (reset PIN): { perfil_id, resetar_pin: true }
// Sempre service_role — perfis produto='campo' não têm RLS de escrita
// própria pra essa administração (CLAUDE.md do App Campo, decisão 4.5).
export async function POST(req: NextRequest) {
  const acesso = await verificarAcesso();
  if (!acesso.ok) return NextResponse.json({ error: "Sem permissão" }, { status: acesso.status });

  const admin = adminClient();
  const body = await req.json();

  try {
    // ── Editar operador existente (nome/papel/fazendas, ou resetar PIN) ──
    if (body.perfil_id) {
      const { data: perfilAtual, error: erroBusca } = await admin
        .from("perfis")
        .select("id, user_id, nome")
        .eq("id", body.perfil_id)
        .eq("produto", "campo")
        .maybeSingle();
      if (erroBusca || !perfilAtual) {
        return NextResponse.json({ error: "Operador não encontrado" }, { status: 404 });
      }

      let novoPin: string | null = null;
      if (body.resetar_pin) {
        novoPin = gerarPin();
        const { error: erroSenha } = await admin.auth.admin.updateUserById(perfilAtual.user_id, { password: novoPin });
        if (erroSenha) throw new Error("PIN: " + erroSenha.message);
      }

      const atualizacoes: Record<string, unknown> = {};
      if (body.nome !== undefined) atualizacoes.nome = body.nome;
      if (body.papel !== undefined) atualizacoes.papel = body.papel;
      if (body.whatsapp !== undefined) atualizacoes.whatsapp = body.whatsapp || null;
      if (body.fazendas_permitidas !== undefined) atualizacoes.fazendas_permitidas = body.fazendas_permitidas;
      // Desativar = fazendas_permitidas=[] (lista vazia explícita) — é assim
      // que o App Campo já trata "bloqueado" (AuthProvider, CLAUDE.md 4.2:
      // "[] explícito = nenhuma fazenda liberada"), não precisa de uma
      // coluna nova só pra isso. Ignora qualquer fazendas_permitidas
      // mandado junto quando `ativo:false` — desativar sempre zera a lista.
      if (body.ativo === false) atualizacoes.fazendas_permitidas = [];

      if (Object.keys(atualizacoes).length > 0) {
        const { error: erroUpdate } = await admin.from("perfis").update(atualizacoes).eq("id", body.perfil_id);
        if (erroUpdate) throw new Error("Perfil: " + erroUpdate.message);
      }

      return NextResponse.json({ ok: true, pin: novoPin });
    }

    // ── Criar operador novo ──
    const { conta_id, fazenda_id, nome, papel, fazendas_permitidas, whatsapp } = body;
    if (!conta_id || !nome || !papel) {
      return NextResponse.json({ error: "conta_id, nome e papel são obrigatórios" }, { status: 400 });
    }
    if (!["gerente_campo", "operador", "apontador"].includes(papel)) {
      return NextResponse.json({ error: "papel inválido" }, { status: 400 });
    }

    const email = await gerarEmailUnico(admin, nome);
    const pin = gerarPin();

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { nome, produto: "campo" },
    });
    if (authErr) throw new Error("Auth: " + authErr.message);

    const { error: perfilErr } = await admin.from("perfis").insert({
      user_id: authData.user.id,
      conta_id,
      fazenda_id: fazenda_id ?? null,
      nome,
      produto: "campo",
      papel,
      fazendas_permitidas: fazendas_permitidas ?? null,
      whatsapp: whatsapp || null,
    });
    if (perfilErr) {
      await admin.auth.admin.deleteUser(authData.user.id);
      throw new Error("Perfil: " + perfilErr.message);
    }

    return NextResponse.json({ ok: true, email, pin });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
