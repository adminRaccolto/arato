import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { seedOperacoesGerenciais } from "../../../../lib/seedOperacoesGerenciais";

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ["https://app.raccolto.com.br", "https://raccolto.com.br"];
  return {
    "Access-Control-Allow-Origin":  allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-key",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function autorizado(req: Request): boolean {
  const secret = process.env.ADMIN_ONBOARDING_SECRET;
  if (!secret) return false;
  const key = req.headers.get("x-admin-key");
  return key === secret;
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Chave de acesso inválida" }, { status: 401, headers: corsHeaders(req) });
  }

  try {
    const body = await req.json();
    const {
      tipo,               // "pf" | "pj"
      nome,
      cpf_cnpj,
      email_cliente,
      telefone,
      municipio_cliente,
      estado_cliente,
      fazenda_nome,
      fazenda_municipio,
      fazenda_estado,
      fazenda_area,
      user_nome,
      user_email,
      user_senha,
    } = body;

    const supabase = adminClient();

    // ── 1. Criar fazenda (sem FK de produtor ainda) ──
    const { data: fazenda, error: fazErr } = await supabase
      .from("fazendas")
      .insert({
        nome:          fazenda_nome,
        municipio:     fazenda_municipio,
        estado:        fazenda_estado,
        area_total_ha: parseFloat(fazenda_area) || 0,
      })
      .select("id")
      .single();
    if (fazErr) throw new Error("Fazenda: " + fazErr.message);
    const fazendaId = fazenda.id;

    // ── 2. Criar produtor vinculado à fazenda ──
    const { data: produtor, error: prodErr } = await supabase
      .from("produtores")
      .insert({
        fazenda_id: fazendaId,
        nome,
        tipo:       tipo === "pf" ? "pf" : "pj",
        cpf_cnpj:   cpf_cnpj   || null,
        email:      email_cliente || null,
        telefone:   telefone   || null,
        municipio:  municipio_cliente || null,
        estado:     estado_cliente    || null,
      })
      .select("id")
      .single();
    if (prodErr) throw new Error("Produtor: " + prodErr.message);

    // ── 3. Atualizar fazenda com produtor_id ──
    await supabase
      .from("fazendas")
      .update({ produtor_id: produtor.id })
      .eq("id", fazendaId);

    // ── 4. Criar usuário no Supabase Auth ──
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email:         user_email,
      password:      user_senha,
      email_confirm: true,
      user_metadata: { must_change_password: true, nome: user_nome },
    });
    if (authErr) throw new Error("Auth: " + authErr.message);
    const authUserId = authData.user.id;

    // ── 5. Criar perfil (auth → fazenda) ──
    const { error: perfErr } = await supabase.from("perfis").insert({
      user_id:    authUserId,
      fazenda_id: fazendaId,
      nome:       user_nome,
      role:       "client",
    });
    if (perfErr) throw new Error("Perfil: " + perfErr.message);

    // ── 5b. Vincular owner_user_id na fazenda ao usuário criado ──
    await supabase.from("fazendas")
      .update({ owner_user_id: authUserId })
      .eq("id", fazendaId);

    // ── 6. Buscar grupo "Gerente" ──
    const { data: grupo } = await supabase
      .from("grupos_usuarios")
      .select("id")
      .ilike("nome", "gerente")
      .single();

    // ── 7. Criar registro de usuário ──
    await supabase.from("usuarios").insert({
      fazenda_id:   fazendaId,
      auth_user_id: authUserId,
      nome:         user_nome,
      email:        user_email,
      ativo:        true,
      grupo_id:     grupo?.id ?? null,
    });

    // ── 8. Semear operações gerenciais padrão ──
    try {
      await seedOperacoesGerenciais(fazendaId, supabase);
    } catch {
      // Não bloqueia o onboarding — cliente pode importar manualmente
    }

    return NextResponse.json({ ok: true, fazenda_id: fazendaId, user_email }, { headers: corsHeaders(req) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400, headers: corsHeaders(req) });
  }
}

// Endpoint para validar apenas a chave (GET)
export async function GET(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false }, { status: 401, headers: corsHeaders(req) });
  }
  return NextResponse.json({ ok: true }, { headers: corsHeaders(req) });
}
