import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Lista fazendas com raccolto_acesso=true usando service role (ignora RLS)
export async function GET(req: Request) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Valida que o solicitante é raccotlo — checa perfis pelo JWT
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const isRaccoltoEmail = (user.email ?? "").toLowerCase().endsWith("@raccolto.com.br");
  if (!isRaccoltoEmail) {
    const { data: perfil } = await sb.from("perfis").select("role").eq("user_id", user.id).single();
    if (perfil?.role !== "raccotlo") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { data, error } = await sb
    .from("fazendas")
    .select("id, nome, municipio, estado, area_total_ha")
    .eq("raccolto_acesso", true)
    .order("nome");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fazendas: data ?? [] });
}
