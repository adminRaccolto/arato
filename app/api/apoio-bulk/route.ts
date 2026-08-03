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

  // Para raccotlo: usa admin sem restrição de conta (já autenticado como admin)
  // Para usuário normal: verifica que os registros pertencem à conta dele
  let idsPermitidos: string[] = ids;

  if (perfil.role !== "raccotlo") {
    const contaAlvo = perfil.conta_id;
    if (!contaAlvo) return NextResponse.json({ error: "Sem conta associada" }, { status: 403 });

    // Buscar fazendas da conta do usuário
    const { data: fazendas } = await admin
      .from("fazendas")
      .select("id")
      .eq("conta_id", contaAlvo);
    const fazendaSet = new Set((fazendas ?? []).map((f: { id: string }) => f.id));

    // Verificar que os IDs pertencem às fazendas da conta — em lotes de 100
    const BATCH = 100;
    const registrosFazenda: { id: string; fazenda_id: string }[] = [];
    for (let s = 0; s < ids.length; s += BATCH) {
      const chunk = ids.slice(s, s + BATCH);
      const { data } = await admin
        .from("apoio_lancamentos")
        .select("id, fazenda_id")
        .in("id", chunk);
      if (data) registrosFazenda.push(...data);
    }

    idsPermitidos = registrosFazenda
      .filter(r => fazendaSet.has(r.fazenda_id))
      .map(r => r.id);

    if (!idsPermitidos.length) return NextResponse.json({ error: "Sem acesso aos registros" }, { status: 403 });
  }

  // Executar ação em lotes de 100 (evita limite de URL do PostgREST)
  const BATCH = 100;
  let ok = 0;

  if (action === "delete") {
    for (let s = 0; s < idsPermitidos.length; s += BATCH) {
      const chunk = idsPermitidos.slice(s, s + BATCH);
      const { error } = await admin.from("apoio_lancamentos").delete().in("id", chunk);
      if (!error) ok += chunk.length;
    }
    return NextResponse.json({ ok });
  }

  if (action === "baixar") {
    const data_baixa = payload?.data_baixa ?? new Date().toISOString().slice(0, 10);
    for (let s = 0; s < idsPermitidos.length; s += BATCH) {
      const chunk = idsPermitidos.slice(s, s + BATCH);
      const { error } = await admin
        .from("apoio_lancamentos")
        .update({ baixado: true, data_baixa })
        .in("id", chunk);
      if (!error) ok += chunk.length;
    }
    return NextResponse.json({ ok });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
