import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Verifica autenticação via cookies (igual a /api/fazenda/da-conta)
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const conta_id   = req.nextUrl.searchParams.get("conta_id");
  const fazenda_id = req.nextUrl.searchParams.get("fazenda_id");

  if (!conta_id && !fazenda_id) {
    return NextResponse.json({ error: "conta_id ou fazenda_id obrigatório" }, { status: 400 });
  }

  let q = admin.from("produtores").select("*").order("nome");

  if (conta_id && fazenda_id) {
    q = q.or(`conta_id.eq.${conta_id},fazenda_id.eq.${fazenda_id}`);
  } else if (conta_id) {
    q = q.eq("conta_id", conta_id);
  } else {
    q = q.eq("fazenda_id", fazenda_id!);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ produtores: data ?? [] });
}
