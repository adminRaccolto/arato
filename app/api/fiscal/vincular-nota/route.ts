import { NextResponse } from "next/server";
import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { createClient } from "../../../../lib/supabase-servidor";

export async function POST(req:Request) {
  try {
    const {nota_id}=await req.json();const negado=await exigirAcessoRegistro(req,"notas_fiscais",nota_id);if(negado)return negado;
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const {error}=await db.rpc("fiscal_vincular_nota",{p_nota:nota_id});if(error)throw error;
    return NextResponse.json({ok:true});
  }catch(e){return NextResponse.json({ok:false,error:(e as {message?:string}).message ?? String(e)},{status:422});}
}
