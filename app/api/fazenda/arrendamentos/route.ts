import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const fazenda_id = req.nextUrl.searchParams.get("fazenda_id");
  if (!fazenda_id) {
    return NextResponse.json({ ok: false, error: "fazenda_id obrigatório" }, { status: 400 });
  }

  const acesso = await validateFazendaAccess(fazenda_id, req.headers.get("authorization") ?? undefined);
  if (!acesso.ok) {
    return NextResponse.json({ ok: false, error: acesso.error }, { status: acesso.status });
  }

  const { data, error } = await admin()
    .from("arrendamentos")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .order("created_at");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, arrendamentos: data ?? [] });
}
