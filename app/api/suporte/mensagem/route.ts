import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const msg = await req.json() as {
      conversa_id: string;
      fazenda_id: string;
      role: "user" | "assistant";
      content: string;
    };

    const db = admin();

    const { data, error } = await db
      .from("suporte_mensagens")
      .insert(msg)
      .select()
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    // Atualiza updated_at da conversa
    await db
      .from("suporte_conversas")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", msg.conversa_id);

    return NextResponse.json({ ok: true, mensagem: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
