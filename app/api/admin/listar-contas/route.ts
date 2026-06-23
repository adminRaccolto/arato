import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: Request) {
  const db = admin();
  // Valida que é raccotlo
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const isRaccoltoEmail = (user.email ?? "").toLowerCase().endsWith("@raccolto.com.br");
  if (!isRaccoltoEmail) {
    const { data: perfil } = await db.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
    if (perfil?.role !== "raccotlo") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const [contasRes, fazendasRes] = await Promise.all([
    db.from("contas").select("id, nome, tipo").order("nome"),
    db.from("fazendas").select("id, nome, municipio, estado, conta_id"),
  ]);

  return NextResponse.json({
    contas:   contasRes.data  ?? [],
    fazendas: fazendasRes.data ?? [],
  });
}
