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
export async function GET(req: NextRequest) {
  const talhao_id = req.nextUrl.searchParams.get("talhao_id");
  if (!talhao_id) return NextResponse.json({ ids: [] });
  const { data } = await admin()
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
