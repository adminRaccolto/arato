import { exigirAcessoRegistro,getRequestUser } from "../../../../lib/api-auth";
import { createClient } from "../../../../lib/supabase-servidor";
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
    const negado = await exigirAcessoRegistro(request, "nf_entradas", body.nf_id);
    if (negado) return negado;
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

    const usuario=await getRequestUser(request.headers.get("authorization"));if(!usuario)return NextResponse.json({ok:false,error:"Não autenticado"},{status:401});
    const { data, error } = await adm.rpc("fiscal_reclassificar_nf", {
      p_usuario:usuario.id,p_nf: body.nf_id, p_fazenda: nf.fazenda_id,
      p_og: body.operacao_gerencial_id || null, p_centro: body.centro_custo_id || null,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 422 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
