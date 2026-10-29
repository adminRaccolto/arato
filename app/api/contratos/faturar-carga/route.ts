import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { desfazerCarga, faturarCarga } from "../../../../lib/contratos/recebimento-carga-server";

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// POST /api/contratos/faturar-carga — recebimento por carga do contrato de venda
//   { acao: "vincular", contrato_id, nota_fiscal_id, valor_abatido? } → CR da carga + abate o CR do contrato
//   { acao: "desvincular", nota_fiscal_id }                           → desfaz
export async function POST(req: NextRequest) {
  try {
    const b = await req.json() as { acao: "vincular" | "desvincular"; contrato_id?: string; nota_fiscal_id: string; valor_abatido?: number | null };
    const negado = await exigirAcessoRegistro(req, "notas_fiscais", b.nota_fiscal_id)
      ?? (b.contrato_id ? await exigirAcessoRegistro(req, "contratos", b.contrato_id) : null);
    if (negado) return negado;
    const sb = admin();
    if (b.acao === "vincular") {
      if (!b.contrato_id) return NextResponse.json({ ok: false, error: "Contrato não informado." }, { status: 400 });
      const r = await faturarCarga(sb, b.contrato_id, b.nota_fiscal_id, b.valor_abatido ?? null);
      return NextResponse.json(r, { status: r.ok ? 200 : 422 });
    }
    if (b.acao === "desvincular") {
      const r = await desfazerCarga(sb, b.nota_fiscal_id);
      return NextResponse.json(r, { status: r.ok ? 200 : 422 });
    }
    return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
