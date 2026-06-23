/**
 * POST /api/admin/seed-templates
 * Popula os templates de operações gerenciais (fazenda_id = NULL)
 * com o plano padrão do sistema.
 * Requer role=raccotlo.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { seedOperacoesGerenciaisTemplate } from "../../../../lib/seedOperacoesGerenciais";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Valida que é raccotlo via JWT
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const { data: perfil } = await admin
    .from("perfis")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const email = user.email ?? "";
  const isGino = email.toLowerCase() === "gino@raccolto.com.br";
  const isRaccolto = isGino || perfil?.role === "raccotlo" || perfil?.role === "raccotlo_gestor";

  if (!isRaccolto) return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  try {
    const result = await seedOperacoesGerenciaisTemplate(admin);
    return NextResponse.json({ ok: true, inseridos: result.inseridos });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
