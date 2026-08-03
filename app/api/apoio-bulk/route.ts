import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Verificar acesso do usuário
  const { data: perfil } = await admin
    .from("perfis")
    .select("conta_id, role")
    .eq("user_id", user.id)
    .single();
  if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 403 });

  const { action, ids, data: payload, conta_id } = await req.json() as {
    action: "delete" | "baixar";
    ids: string[];
    data?: { data_baixa?: string };
    conta_id: string;
  };

  if (!ids?.length) return NextResponse.json({ error: "Nenhum ID fornecido" }, { status: 400 });

  // Verificar que os IDs pertencem à conta do usuário
  const { data: registros } = await admin
    .from("apoio_lancamentos")
    .select("id, fazenda_id")
    .in("id", ids);

  if (!registros?.length) return NextResponse.json({ error: "Nenhum registro encontrado" }, { status: 404 });

  // Verificar que as fazendas pertencem à conta
  const fazendaIds = [...new Set(registros.map((r: { fazenda_id: string }) => r.fazenda_id))];
  const { data: fazendas } = await admin
    .from("fazendas")
    .select("id")
    .in("id", fazendaIds)
    .eq("conta_id", perfil.role === "raccotlo" ? conta_id : perfil.conta_id);

  const fazendaIdsPermitidos = new Set((fazendas ?? []).map((f: { id: string }) => f.id));
  const idsPermitidos = registros
    .filter((r: { id: string; fazenda_id: string }) => fazendaIdsPermitidos.has(r.fazenda_id))
    .map((r: { id: string }) => r.id);

  if (!idsPermitidos.length) return NextResponse.json({ error: "Sem acesso aos registros" }, { status: 403 });

  if (action === "delete") {
    const { error } = await admin
      .from("apoio_lancamentos")
      .delete()
      .in("id", idsPermitidos);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: idsPermitidos.length });
  }

  if (action === "baixar") {
    const data_baixa = payload?.data_baixa ?? new Date().toISOString().slice(0, 10);
    const { error } = await admin
      .from("apoio_lancamentos")
      .update({ baixado: true, data_baixa })
      .in("id", idsPermitidos);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: idsPermitidos.length });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
