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

async function autorizado(req: Request): Promise<boolean> {
  // Opção 1 — chave estática (integrações externas)
  const secret = process.env.ADMIN_ONBOARDING_SECRET;
  if (secret && req.headers.get("x-admin-key") === secret) return true;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Opção 2 — sessão via cookie (painel interno, mais confiável que Bearer token)
  try {
    const cookieStore = await cookies();
    const supabaseCookie = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabaseCookie.auth.getUser();
    if (user) {
      const { data: perfil } = await supabaseAdmin
        .from("perfis").select("role").eq("user_id", user.id).single();
      if (perfil?.role === "raccotlo") return true;
    }
  } catch { /* ignora — tenta Bearer abaixo */ }

  // Opção 3 — Bearer token (fallback, pode expirar)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return false;

  const { data: perfil } = await supabaseAdmin
    .from("perfis").select("role").eq("user_id", user.id).single();

  return perfil?.role === "raccotlo";
}

export async function POST(req: Request) {
  if (!(await autorizado(req))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 401, headers: corsHeaders(req) });
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
  if (!(await autorizado(req))) {
    return NextResponse.json({ ok: false }, { status: 401, headers: corsHeaders(req) });
  }
  return NextResponse.json({ ok: true }, { headers: corsHeaders(req) });
}
