import { NextResponse } from "next/server";
import { criarClienteCompleto } from "../../../../lib/criarClienteCompleto";

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

function autorizado(req: Request): boolean {
  const secret = process.env.ADMIN_ONBOARDING_SECRET;
  if (!secret) return false;
  return req.headers.get("x-admin-key") === secret;
}

export async function POST(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "Chave de acesso inválida" }, { status: 401, headers: corsHeaders(req) });
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

// Endpoint para validar apenas a chave (GET)
export async function GET(req: Request) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false }, { status: 401, headers: corsHeaders(req) });
  }
  return NextResponse.json({ ok: true }, { headers: corsHeaders(req) });
}
