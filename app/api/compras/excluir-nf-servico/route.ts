import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// POST /api/compras/excluir-nf-servico
// Exclui uma NFS-e e seu CP vinculado.
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const { nf_id, fazenda_id } = (await req.json()) as { nf_id: string; fazenda_id: string };
    if (!nf_id || !fazenda_id) {
      return NextResponse.json({ error: "nf_id e fazenda_id obrigatórios" }, { status: 400 });
    }

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

    // 3. Remove a NFS-e
    const { error } = await sb
      .from("nf_servicos")
      .delete()
      .eq("id", nf_id)
      .eq("fazenda_id", fazenda_id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
