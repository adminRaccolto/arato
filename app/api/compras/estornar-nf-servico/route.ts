import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/compras/estornar-nf-servico
// Reverte uma NFS-e processada: cancela o CP e retorna para "pendente".
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const { nf_id } = (await req.json()) as { nf_id: string };
    if (!nf_id) return NextResponse.json({ error: "nf_id obrigatório" }, { status: 400 });

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1. Busca lancamento_id
    const { data: nfRow } = await sb
      .from("nf_servicos")
      .select("lancamento_id")
      .eq("id", nf_id)
      .single();

    // 2. Remove CP (se existir)
    if (nfRow?.lancamento_id) {
      await sb.from("lancamentos").delete().eq("id", nfRow.lancamento_id);
    }

    // 3. Retorna NFS-e para "pendente"
    const { error } = await sb
      .from("nf_servicos")
      .update({ status: "pendente", lancamento_id: null })
      .eq("id", nf_id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
