import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase-servidor";
import { validateFazendaAccess } from "../../../lib/api-auth";
import { enviarCertificadoA1 } from "../../../lib/nfe/enviar-certificado";

export const runtime="nodejs";

// Mantém o contrato das telas existentes. A ativação ocorre somente após validar e reler o arquivo novo.
export async function POST(req:Request) {
  try {
    const form=await req.formData();
    const file=form.get('file') as File|null;
    const senha=form.get('senha') as string|null;
    const fazendaId=form.get('fazenda_id') as string|null;
    const produtorId=form.get('produtor_id') as string|null;
    const produtorNome=form.get('produtor_nome') as string|null;
    const doc=String(form.get('cpf_cnpj') ?? '').replace(/\D/g,'');
    if(!file || !senha || !fazendaId || ![11,14].includes(doc.length)) return NextResponse.json({error:'Informe arquivo, senha e o titular com CPF/CNPJ cadastrado.'},{status:400});
    const access=await validateFazendaAccess(fazendaId,req.headers.get('authorization') ?? undefined);
    if(!access.ok) return NextResponse.json({error:access.error},{status:access.status});
    if(!/\.(pfx|p12)$/i.test(file.name)) return NextResponse.json({error:'Envie o arquivo A1 completo, no formato .pfx ou .p12.'},{status:400});
    if(file.size>10*1024*1024) return NextResponse.json({error:'O arquivo A1 excede o limite de 10 MB.'},{status:400});
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const resultado=await enviarCertificadoA1(db,{buffer:Buffer.from(await file.arrayBuffer()),nomeArquivo:file.name,senha,fazendaId,doc,produtorId,produtorNome});
    return NextResponse.json(resultado.body,{status:resultado.status});
  } catch {return NextResponse.json({error:'Não foi possível concluir o envio do certificado. Atualize o cadastro e confira o certificado ativo.'},{status:500});}
}
