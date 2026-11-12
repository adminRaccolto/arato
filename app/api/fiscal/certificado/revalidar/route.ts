import { NextResponse } from "next/server";
import { exigirAcessoFazenda } from "../../../../../lib/api-auth";
import { createClient } from "../../../../../lib/supabase-servidor";
import { candidatosDoEmitente,baixarA1Exato } from "../../../../../lib/nfe/certificado-emitente";
import { enviarCertificadoA1 } from "../../../../../lib/nfe/enviar-certificado";
export const runtime="nodejs";
export async function POST(req:Request){
  try{
    const b=await req.json();const negado=await exigirAcessoFazenda(req,b.fazenda_id);if(negado)return negado;
    const doc=String(b.documento ?? "").replace(/\D/g,"");if(![11,14].includes(doc.length))throw new Error("Titular inválido.");
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const {ids,candidatos}=await candidatosDoEmitente(db,b.fazenda_id,doc);
    const par=candidatos.find(c=>c.caminho===b.caminho);
    if(!par)throw new Error("Arquivo e senha do titular não foram encontrados juntos. Reenvie o A1 pela rotina de certificado.");
    const buffer=await baixarA1Exato(db,par.caminho,ids);
    const resultado=await enviarCertificadoA1(db,{buffer,nomeArquivo:par.caminho.split("/").pop() || "certificado.pfx",senha:par.senha,fazendaId:b.fazenda_id,doc,produtorId:null,produtorNome:null});
    return NextResponse.json(resultado.body,{status:resultado.status});
  }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Não foi possível revalidar o vínculo do A1."},{status:409});}
}
