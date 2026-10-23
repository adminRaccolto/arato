import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { excluirTitulosDaNfse, titulosNfseBloqueiamEstorno } from "../../../../lib/financeiro/titulos-nfse";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";

// POST /api/compras/estornar-nf-servico
// Reverte uma NFS-e processada: cancela o CP e retorna para "pendente".
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const { nf_id } = (await req.json()) as { nf_id: string };

    const negado = await exigirAcessoRegistro(req, "nf_servicos", nf_id);
    if (negado) return negado;
    if (!nf_id) return NextResponse.json({ error: "nf_id obrigatório" }, { status: 400 });

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1. Título pago, conciliado ou em borderô (produtor ou Empresa) impede o estorno: desfazer a baixa antes
    const bloqueio = await titulosNfseBloqueiamEstorno(sb, nf_id);
    if (bloqueio) return NextResponse.json({ error: bloqueio }, { status: 409 });

    // 2. Remove todos os títulos da NFS-e (parcelas do produtor e CP da Empresa)
    await excluirTitulosDaNfse(sb, nf_id);

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
