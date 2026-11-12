import { NextResponse } from "next/server";
import { exigirAcessoFazenda,getRequestUser } from "../../../../lib/api-auth";
import { createClient } from "../../../../lib/supabase-servidor";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const negado = await exigirAcessoFazenda(req, body.fazenda_id);
    if (negado) return negado;
    if (!body.modulo || typeof body.config !== "object" || !Array.isArray(body.base))
      return NextResponse.json({ ok: false, error: "Recarregue os parâmetros antes de salvar." }, { status: 400 });
    const usuario=await getRequestUser(req.headers.get("authorization"));if(!usuario)return NextResponse.json({ok:false,error:"Não autenticado"},{status:401});
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data, error } = await db.rpc("fiscal_salvar_config", {
      p_fazenda: body.fazenda_id, p_modulo: body.modulo, p_config: body.config, p_base:body.base,p_usuario:usuario.id,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
