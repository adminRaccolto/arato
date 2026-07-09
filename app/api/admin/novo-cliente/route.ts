import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { criarClienteCompleto } from "../../../../lib/criarClienteCompleto";

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ["https://app.raccolto.com.br", "https://raccolto.com.br"];
  return {
    "Access-Control-Allow-Origin":  allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-admin-key, Authorization",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

async function autorizado(req: Request): Promise<{ ok: boolean; motivo: string }> {
  // Opção 1 — chave estática (integrações externas)
  const secret = process.env.ADMIN_ONBOARDING_SECRET;
  if (secret && req.headers.get("x-admin-key") === secret) return { ok: true, motivo: "admin-key" };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { ok: false, motivo: "SUPABASE_SERVICE_ROLE_KEY ausente" };

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Opção 2 — sessão via cookie (painel interno)
  try {
    const cookieStore = await cookies();
    const supabaseCookie = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user }, error: uErr } = await supabaseCookie.auth.getUser();
    if (uErr) console.log("[admin-auth] cookie getUser error:", uErr.message);
    if (user) {
      const { data: perfil } = await supabaseAdmin
        .from("perfis").select("role").eq("user_id", user.id).single();
      console.log("[admin-auth] cookie user:", user.email, "role:", perfil?.role);
      if (perfil?.role === "raccotlo") return { ok: true, motivo: "cookie" };
      return { ok: false, motivo: `role='${perfil?.role}' não é raccotlo (cookie user: ${user.email})` };
    }
  } catch (e) { console.log("[admin-auth] cookie error:", String(e)); }

  // Opção 3 — Bearer token (fallback)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, motivo: "sem cookie e sem Bearer token" };

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return { ok: false, motivo: `Bearer inválido: ${error?.message}` };

  const { data: perfil } = await supabaseAdmin
    .from("perfis").select("role").eq("user_id", user.id).single();

  console.log("[admin-auth] bearer user:", user.email, "role:", perfil?.role);
  if (perfil?.role === "raccotlo") return { ok: true, motivo: "bearer" };
  return { ok: false, motivo: `role='${perfil?.role}' não é raccotlo (bearer user: ${user.email})` };
}

export async function POST(req: Request) {
  const auth = await autorizado(req);
  if (!auth.ok) {
    console.error("[novo-cliente] BLOQUEADO:", auth.motivo);
    return NextResponse.json({ error: "Sem permissão", detalhe: auth.motivo }, { status: 401, headers: corsHeaders(req) });
  }
  try {
    const body = await req.json();
    const result = await criarClienteCompleto(body);
    return NextResponse.json(result, { headers: corsHeaders(req) });
  } catch (err) {
    console.error("[novo-cliente] ERRO:", String(err));
    return NextResponse.json({ ok: false, error: String(err) }, { status: 400, headers: corsHeaders(req) });
  }
}

export async function GET(req: Request) {
  const auth = await autorizado(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, motivo: auth.motivo }, { status: 401, headers: corsHeaders(req) });
  }
  return NextResponse.json({ ok: true, motivo: auth.motivo }, { headers: corsHeaders(req) });
}
