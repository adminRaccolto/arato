import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const { fazenda_ids } = await request.json() as { fazenda_ids: string[] };

    if (!fazenda_ids || fazenda_ids.length === 0) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const orFilter = fazenda_ids
      .map(id => `fazenda_origem_id.eq.${id},fazenda_destino_id.eq.${id}`)
      .join(",");

    const { data, error } = await supabaseAdmin
      .from("transferencias_estoque")
      .select("*, transferencias_estoque_itens(*)")
      .or(orFilter)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
