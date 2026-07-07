import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// GET /api/talhao-arrendamentos?talhao_id=xxx
//     /api/talhao-arrendamentos?fazenda_id=xxx[&exclude_talhao=yyy]
// O segundo formato retorna todos os arrendamento_ids já vinculados a qualquer
// talhão da fazenda (exceto o talhão informado em exclude_talhao, se houver).
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const talhao_id   = params.get("talhao_id");
  const fazenda_id  = params.get("fazenda_id");
  const exclude_id  = params.get("exclude_talhao");

  const db = admin();

  if (fazenda_id) {
    // Busca todos os talhões da fazenda
    const { data: tals } = await db
      .from("talhoes")
      .select("id")
      .eq("fazenda_id", fazenda_id);
    const talhaoIds = (tals ?? []).map((t: { id: string }) => t.id).filter(id => id !== exclude_id);
    if (talhaoIds.length === 0) return NextResponse.json({ ids: [] });
    const { data } = await db
      .from("talhao_arrendamentos")
      .select("arrendamento_id")
      .in("talhao_id", talhaoIds);
    return NextResponse.json({ ids: (data ?? []).map((r: { arrendamento_id: string }) => r.arrendamento_id) });
  }

  if (!talhao_id) return NextResponse.json({ ids: [] });
  const { data } = await db
    .from("talhao_arrendamentos")
    .select("arrendamento_id")
    .eq("talhao_id", talhao_id);
  return NextResponse.json({ ids: (data ?? []).map((r: { arrendamento_id: string }) => r.arrendamento_id) });
}

// POST /api/talhao-arrendamentos  body: { talhao_id, arrendamento_ids }
export async function POST(req: NextRequest) {
  const { talhao_id, arrendamento_ids } = await req.json() as { talhao_id: string; arrendamento_ids: string[] };
  if (!talhao_id) return NextResponse.json({ error: "talhao_id obrigatório" }, { status: 400 });

  const db = admin();
  await db.from("talhao_arrendamentos").delete().eq("talhao_id", talhao_id);

  if (arrendamento_ids?.length > 0) {
    const rows = arrendamento_ids.map(arrendamento_id => ({ talhao_id, arrendamento_id }));
    const { error } = await db.from("talhao_arrendamentos").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
