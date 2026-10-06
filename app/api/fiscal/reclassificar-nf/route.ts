import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Reclassifica uma NF de entrada já processada: troca Operação Gerencial e Centro de
// Custo da própria NF E dos lançamentos de CP gerados por ela (lancamentos.nf_entrada_id),
// pra classificação do CP e da NF não divergirem. Não mexe em estoque, valor, parcelas
// nem datas. Vale também para CP já baixado — quem decide é o usuário na tela.
export async function POST(request: NextRequest) {
  const adm = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  try {
    const body = await request.json() as {
      nf_id?: string;
      fazenda_id?: string;
      operacao_gerencial_id?: string | null;
      centro_custo_id?: string | null;
    };
    if (!body.nf_id || !body.fazenda_id) {
      return NextResponse.json({ ok: false, error: "nf_id e fazenda_id são obrigatórios" }, { status: 400 });
    }

    const { data: nf, error: nfErr } = await adm
      .from("nf_entradas")
      .select("id, fazenda_id, status")
      .eq("id", body.nf_id)
      .maybeSingle();
    if (nfErr) return NextResponse.json({ ok: false, error: nfErr.message }, { status: 500 });
    if (!nf) return NextResponse.json({ ok: false, error: "NF não encontrada" }, { status: 404 });
    if (nf.fazenda_id !== body.fazenda_id) {
      return NextResponse.json({ ok: false, error: "NF não pertence a esta fazenda" }, { status: 403 });
    }
    if (nf.status !== "processada") {
      return NextResponse.json({ ok: false, error: "Só NF processada pode ser reclassificada" }, { status: 422 });
    }

    const patch = {
      operacao_gerencial_id: body.operacao_gerencial_id || null,
      centro_custo_id:       body.centro_custo_id || null,
    };

    const { error: updNf } = await adm.from("nf_entradas").update(patch).eq("id", body.nf_id);
    if (updNf) return NextResponse.json({ ok: false, error: updNf.message }, { status: 500 });

    const { data: lancs, error: updLanc } = await adm
      .from("lancamentos")
      .update(patch)
      .eq("nf_entrada_id", body.nf_id)
      .select("id");
    if (updLanc) return NextResponse.json({ ok: false, error: updLanc.message }, { status: 500 });

    // Títulos de EMPRESA gerados pela mesma NF também recebem a nova OG / centro de custo
    const { data: empLancs, error: updEmp } = await adm
      .from("empresa_lancamentos")
      .update(patch)
      .eq("nf_entrada_id", body.nf_id)
      .select("id");
    if (updEmp) return NextResponse.json({ ok: false, error: updEmp.message }, { status: 500 });

    return NextResponse.json({ ok: true, lancamentos_atualizados: lancs?.length ?? 0, empresa_lancamentos_atualizados: empLancs?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
