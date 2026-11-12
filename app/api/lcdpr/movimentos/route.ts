import { NextResponse } from "next/server";
import { exigirAcessoFazenda, exigirAcessoRegistro, getRequestUser } from "../../../../lib/api-auth";
import { createClient } from "../../../../lib/supabase-servidor";

export async function POST(req:Request) {
  try {
    const body=await req.json();
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
    if(body.acao==="incluir") {
      const negado=await exigirAcessoFazenda(req,body.fazenda_id);if(negado)return negado;
      const usuario=await getRequestUser(req.headers.get("authorization"));
      if(!usuario)return NextResponse.json({ok:false,error:"Não autenticado"},{status:401});
      const {data,error}=await db.rpc("lcdpr_incluir_movimentos",{p_fazenda:body.fazenda_id,p_linhas:body.linhas,p_requisicao:req.headers.get("x-arato-requisicao"),p_usuario:usuario.id});
      if(error)throw error;
      return NextResponse.json(data);
    }
    const negado=await exigirAcessoRegistro(req,"lcdpr_movimentos",body.id);if(negado)return negado;
    const usuario=await getRequestUser(req.headers.get("authorization"));if(!usuario)return NextResponse.json({ok:false,error:"Não autenticado"},{status:401});
    const {data,error}=await db.rpc("lcdpr_alterar_movimento",{p_id:body.id,p_acao:body.acao,p_tipo:body.tipoDoc ?? null,p_motivo:body.motivo ?? null,p_usuario:usuario.id,p_versao:body.atualizado_em ?? null});
    if(error)throw error;
    return NextResponse.json(data);
  } catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:(e as {message?:string}).message ?? String(e)},{status:422});}
}
