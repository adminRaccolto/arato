import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "@/lib/api-auth";
import { gerarEmailUnico, gerarPin } from "@/lib/campo-operador";

export const dynamic = "force-dynamic";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const PAPEIS_VALIDOS = ["gerente_campo", "operador"] as const;

// GET /api/campo/operador-conta?fazenda_id=xxx&usuario_vinculado_id=yyy
// Busca o perfil de campo (se existir) vinculado a um usuário do Arato Web
// — usado pela tela Configurações > Usuários pra saber, ao reabrir o
// cadastro de alguém, se essa pessoa já tem acesso ao App Campo (CLAUDE.md
// do App Campo, decisão 17/set/2026: gestão de operador virou self-service).
// Sem `usuario_vinculado_id`, retorna todos os operadores da conta.
export async function GET(req: NextRequest) {
  const fazendaId = req.nextUrl.searchParams.get("fazenda_id");
  const usuarioVinculadoId = req.nextUrl.searchParams.get("usuario_vinculado_id");
  if (!fazendaId) return NextResponse.json({ error: "fazenda_id obrigatório" }, { status: 400 });

  const acesso = await validateFazendaAccess(fazendaId);
  if (!acesso.ok) return NextResponse.json({ error: acesso.error }, { status: acesso.status });

  const admin = adminClient();

  if (usuarioVinculadoId) {
    const { data: perfil, error } = await admin
      .from("perfis")
      .select("id, user_id, nome, papel, whatsapp, fazendas_permitidas, fazenda_id")
      .eq("usuario_vinculado_id", usuarioVinculadoId)
      .eq("produto", "campo")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!perfil) return NextResponse.json(null);

    const { data: authUser } = await admin.auth.admin.getUserById(perfil.user_id);
    return NextResponse.json({
      ...perfil,
      email: authUser?.user?.email ?? "",
      ativo: perfil.fazendas_permitidas === null || (perfil.fazendas_permitidas?.length ?? 0) > 0,
    });
  }

  const { data: fazenda } = await admin.from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  if (!fazenda) return NextResponse.json({ error: "Fazenda não encontrada" }, { status: 404 });

  const { data: operadores, error: erroLista } = await admin
    .from("perfis")
    .select("id, user_id, nome, papel, whatsapp, fazendas_permitidas, fazenda_id, usuario_vinculado_id")
    .eq("conta_id", fazenda.conta_id)
    .eq("produto", "campo")
    .order("nome");
  if (erroLista) return NextResponse.json({ error: erroLista.message }, { status: 500 });

  const { data: listaUsuarios } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailPorUserId = new Map((listaUsuarios?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  return NextResponse.json(
    (operadores ?? []).map((p) => ({
      ...p,
      email: emailPorUserId.get(p.user_id) ?? "",
      ativo: p.fazendas_permitidas === null || (p.fazendas_permitidas?.length ?? 0) > 0,
    }))
  );
}

// POST /api/campo/operador-conta
// Body (criar):      { fazenda_id, nome, papel, whatsapp?, fazendas_permitidas?, usuario_vinculado_id? }
// Body (editar):      { fazenda_id, perfil_id, nome?, papel?, whatsapp?, fazendas_permitidas?, ativo? }
// Body (resetar PIN): { fazenda_id, perfil_id, resetar_pin: true }
//
// Self-service — chamada pelo próprio gestor da fazenda dentro do Arato Web
// (Configurações > Usuários), não pelo admin Raccolto. `fazenda_id` só serve
// pra autenticar o chamador (validateFazendaAccess) — conta_id é sempre
// derivado dela no servidor, nunca aceito direto do body. Exige
// conta_modulos.app_campo.habilitado=true: Admin Raccolto continua sendo
// quem decide se a conta tem o produto, essa rota só confere.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fazenda_id } = body;
  if (!fazenda_id) return NextResponse.json({ error: "fazenda_id obrigatório" }, { status: 400 });

  const acesso = await validateFazendaAccess(fazenda_id);
  if (!acesso.ok) return NextResponse.json({ error: acesso.error }, { status: acesso.status });

  const admin = adminClient();

  const { data: fazenda } = await admin.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
  if (!fazenda) return NextResponse.json({ error: "Fazenda não encontrada" }, { status: 404 });

  const { data: modulo } = await admin
    .from("conta_modulos")
    .select("habilitado")
    .eq("conta_id", fazenda.conta_id)
    .eq("modulo", "app_campo")
    .maybeSingle();
  if (!modulo?.habilitado) {
    return NextResponse.json({ error: "App Campo não está habilitado para esta conta" }, { status: 403 });
  }

  try {
    // ── Editar / resetar PIN ──
    if (body.perfil_id) {
      const { data: perfilAtual, error: erroBusca } = await admin
        .from("perfis")
        .select("id, user_id, conta_id")
        .eq("id", body.perfil_id)
        .eq("produto", "campo")
        .maybeSingle();
      if (erroBusca || !perfilAtual || perfilAtual.conta_id !== fazenda.conta_id) {
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
      // Desativar = fazendas_permitidas=[] (lista vazia explícita) — mesma
      // convenção já usada pelo AuthProvider do App Campo pra "bloqueado".
      if (body.ativo === false) atualizacoes.fazendas_permitidas = [];

      if (Object.keys(atualizacoes).length > 0) {
        const { error: erroUpdate } = await admin.from("perfis").update(atualizacoes).eq("id", body.perfil_id);
        if (erroUpdate) throw new Error("Perfil: " + erroUpdate.message);
      }

      return NextResponse.json({ ok: true, pin: novoPin });
    }

    // ── Criar novo ──
    const { nome, papel, fazendas_permitidas, whatsapp, usuario_vinculado_id } = body;
    if (!nome || !papel) return NextResponse.json({ error: "nome e papel são obrigatórios" }, { status: 400 });
    if (!PAPEIS_VALIDOS.includes(papel)) {
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
      conta_id: fazenda.conta_id,
      fazenda_id,
      nome,
      produto: "campo",
      papel,
      fazendas_permitidas: fazendas_permitidas ?? null,
      whatsapp: whatsapp || null,
      usuario_vinculado_id: usuario_vinculado_id ?? null,
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
