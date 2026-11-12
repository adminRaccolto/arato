import { exigirAcessoRegistro } from "../../../../lib/api-auth";
import { createClient } from "../../../../lib/supabase-servidor";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cancelarNFeEmitida, corrigirNFeEmitida } from "../../../../lib/nfe/index";
import { resolverModuloPorChave } from "../../../../lib/nfe/resolver-emitente";

export const maxDuration=60;
export const runtime = "nodejs"; // lib/nfe usa node-forge, precisa de Node
export const dynamic = "force-dynamic";

export async function POST(request:NextRequest){
  const adm=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
  try{
    const body=await request.json();const negado=await exigirAcessoRegistro(request,"notas_fiscais",body.nota_id);if(negado)return negado;
    if(!["cancelar","carta_correcao"].includes(body.acao))return NextResponse.json({ok:false,error:"Ação inválida."},{status:400});
    const {data:nota,error}=await adm.from("notas_fiscais").select("*").eq("id",body.nota_id).single();if(error)throw error;
    const texto=String(body.acao==="cancelar"?body.justificativa:body.correcao).trim();
    if(texto.length<15||texto.length>(body.acao==="cancelar"?255:1000))return NextResponse.json({ok:false,error:"Confira o texto do evento (mínimo 15 caracteres)."},{status:400});
    const dj=nota.dados_nf_json ?? {};
    const modulo=await resolverModuloPorChave(nota.fazenda_id,nota.chave_acesso ?? "",adm);
    if(body.acao==="cancelar"&&!dj.protocolo_autorizacao)throw new Error("O cancelamento exige o protocolo original de autorização.");
    const reserva=await adm.rpc("fiscal_reservar_evento",{p_nota:nota.id,p_acao:body.acao,p_dados:{modulo,ambiente:dj.ambiente ?? null,justificativa:body.justificativa ?? null,correcao:body.correcao ?? null}});if(reserva.error)throw reserva.error;
    const evento=reserva.data;
    if(!evento.executar)return NextResponse.json({ok:false,pendente:true,evento_id:evento.id,xMotivo:"Este evento já foi iniciado. Consulte Emissões em conferência antes de reenviar."},{status:202});
    const resultado=body.acao==="cancelar"?await cancelarNFeEmitida(nota.fazenda_id,modulo,nota.chave_acesso,dj.protocolo_autorizacao,texto,dj.ambiente):await corrigirNFeEmitida(nota.fazenda_id,modulo,nota.chave_acesso,texto,evento.sequencia,dj.ambiente);
    if(resultado.sucesso){
      const r=await adm.rpc("fiscal_concluir_evento",{p_id:evento.id,p_resposta:resultado});
      if(r.error)return NextResponse.json({ok:true,sincronizacao_pendente:true,evento_id:evento.id,aviso:"Evento aceito na SEFAZ; consulte Emissões em conferência para concluir a gravação local.",...resultado,protocolo:resultado.protocoloEvento},{status:202});
      return NextResponse.json({...resultado,...r.data,protocolo:resultado.protocoloEvento,sequencia:evento.sequencia});
    }
    const incerto=["103","105","108","109","136","999","505","502","573","580"].includes(resultado.cStat);
    const r=await adm.from("fiscal_eventos_operacoes").update({estado:incerto?"pendente":"rejeitada",resposta:resultado,motivo:resultado.xMotivo,updated_at:new Date().toISOString()}).eq("id",evento.id).select("id").single();
    if(r.error)throw new Error("Retorno do evento não gravado: consulte Emissões em conferência.");
    return NextResponse.json({ok:false,...resultado,pendente:incerto,evento_id:evento.id,sequencia:evento.sequencia},{status:incerto?202:422});
  }catch(e){return NextResponse.json({ok:false,error:(e as {message?:string}).message ?? String(e)},{status:409});}
}

// Histórico de CC-e's já emitidas pra uma NF-e (pra tela mostrar antes de emitir outra)
export async function GET(request: NextRequest) {
  const adm = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const notaId = request.nextUrl.searchParams.get("nota_id");
  if (!notaId) return NextResponse.json({ ok: false, error: "nota_id obrigatório" }, { status: 400 });
  { const negado = await exigirAcessoRegistro(request, "notas_fiscais", notaId); if (negado) return negado; }
  const { data, error } = await adm.from("nfe_cartas_correcao").select("*").eq("nota_id", notaId).order("sequencia", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, correcoes: data ?? [] });
}
