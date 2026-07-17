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
    const body = await request.json();
    const { transferencia, itens } = body as {
      transferencia: Record<string, unknown>;
      itens: Array<Record<string, unknown>>;
    };

    if (!transferencia.fazenda_origem_id || !transferencia.fazenda_destino_id) {
      return NextResponse.json({ ok: false, error: "Fazendas obrigatórias" }, { status: 400 });
    }
    if (!itens || itens.length === 0) {
      return NextResponse.json({ ok: false, error: "Itens obrigatórios" }, { status: 400 });
    }

    // Insere a transferência com service_role_key (ignora RLS)
    const { data: transf, error: tErr } = await supabaseAdmin
      .from("transferencias_estoque")
      .insert(transferencia)
      .select()
      .single();

    if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

    // Insere os itens
    const itensCom = itens.map(it => ({ ...it, transferencia_id: transf.id }));
    const { error: itErr } = await supabaseAdmin
      .from("transferencias_estoque_itens")
      .insert(itensCom);

    if (itErr) {
      await supabaseAdmin.from("transferencias_estoque").delete().eq("id", transf.id);
      return NextResponse.json({ ok: false, error: itErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: transf.id, numero: transf.numero });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
