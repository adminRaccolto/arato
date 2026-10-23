import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { excluirTitulosDaNfse, titulosNfseBloqueiamEstorno } from "../../../../lib/financeiro/titulos-nfse";

// POST /api/compras/excluir-nf-servico
// Exclui uma NFS-e e seu CP vinculado.
// Usa service_role_key — imune a JWT expirado e RLS.
export async function POST(req: NextRequest) {
  try {
    const { nf_id, fazenda_id } = (await req.json()) as { nf_id: string; fazenda_id: string };

    const negado = await exigirAcessoRegistro(req, "nf_servicos", nf_id);
    if (negado) return negado;
    if (!nf_id || !fazenda_id) {
      return NextResponse.json({ error: "nf_id e fazenda_id obrigatórios" }, { status: 400 });
    }

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1. Título pago, conciliado ou em borderô impede a exclusão: desfazer a baixa antes
    const bloqueio = await titulosNfseBloqueiamEstorno(sb, nf_id);
    if (bloqueio) return NextResponse.json({ error: bloqueio.replace("desfazer a NFS-e", "excluir a NFS-e") }, { status: 409 });

    // 2. Remove todos os títulos da NFS-e (parcelas do produtor e CP da Empresa; antes só o 1º título do produtor)
    await excluirTitulosDaNfse(sb, nf_id);

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
