import { NextResponse } from "next/server";
import { validateFazendaAccess } from "../../../lib/api-auth";
import { createClient } from "../../../lib/supabase-servidor";
import { carregarCertificadoEmitente } from "../../../lib/nfe/certificado-emitente";
export const runtime="nodejs";
export async function POST(req:Request) {
  try {
    const {fazenda_id,cpf_cnpj}=await req.json();
    if(!fazenda_id || typeof cpf_cnpj!=='string') return NextResponse.json({ok:false,error:'Informe fazenda e CPF/CNPJ do titular.'},{status:400});
    const acesso=await validateFazendaAccess(fazenda_id,req.headers.get('authorization') ?? undefined);
    if(!acesso.ok) return NextResponse.json({ok:false,error:acesso.error},{status:acesso.status});
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const cert=await carregarCertificadoEmitente(db,fazenda_id,cpf_cnpj);
    return NextResponse.json({ok:true,documento:cert.documento,valido_ate:cert.validoAte,origem:cert.origem,verificado_em:new Date().toISOString(),
      mensagem:'Arquivo, senha, chave privada, titular e validade conferidos. A autorização depende do retorno da SEFAZ.'});
  } catch(e){return NextResponse.json({ok:false,error:e instanceof Error ? e.message : 'Não foi possível verificar o certificado A1.'},{status:422});}
}
