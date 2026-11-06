import { NextRequest, NextResponse } from "next/server";
import { exigirAcessoRegistro } from "../../../../../lib/api-auth";
import { createClient } from "../../../../../lib/supabase-servidor";

export async function POST(req: NextRequest) {
  try {
    const p=await req.json();
    if (!p.adiantamento_id || !p.lancamento_id || !p.requisicao_id || !p.conta_bancaria || !/^\d{4}-\d{2}-\d{2}$/.test(p.data ?? "") || !Number.isFinite(p.valor_pago) || p.valor_pago<=0) {
      return NextResponse.json({ok:false,error:"Informe adiantamento, parcela, valor positivo, data e conta bancária."},{status:400});
    }
    const negado=await exigirAcessoRegistro(req,"adiantamentos_fornecedor",p.adiantamento_id);
    if(negado) return negado;
    const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const {data,error}=await sb.rpc("baixar_adiantamento_fornecedor",{p_adi:p.adiantamento_id,p_cp:p.lancamento_id,p_valor_brl:p.valor_pago,p_data:p.data,p_conta:p.conta_bancaria,p_cotacao:p.cotacao ?? null,p_requisicao:p.requisicao_id});
    if(error) return NextResponse.json({ok:false,error:error.code==="PGRST202"?"Execute a Seção 423 do supabase_migrations.sql para baixar pela tela de adiantamentos.":error.message},{status:400});
    return NextResponse.json(data);
  }catch(e:unknown){return NextResponse.json({ok:false,error:e instanceof Error?e.message:"Erro ao baixar adiantamento."},{status:500});}
}
