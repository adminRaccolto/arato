import { recuperarEventoFiscal } from "../../../../lib/fiscal/recuperar-evento";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { exigirAcessoFazendas, exigirAcessoRegistro } from "../../../../lib/api-auth";
import { createClient } from "../../../../lib/supabase-servidor";
import { lerPaginas } from "../../../../lib/paginar";
import { carregarCertificadoEmitente } from "../../../../lib/nfe/certificado-emitente";
import { consultarSituacaoNFe } from "../../../../lib/sefaz-consulta";
import { consultarSituacaoCTe } from "../../../../lib/cte/transmitter";
import { consultarSituacaoMDFe } from "../../../../lib/mdfe/transmitter";
import { montarProcAutorizado } from "../../../../lib/fiscal/documento-autorizado";
import { registrarRetornoFiscal, type OperacaoFiscal } from "../../../../lib/fiscal/operacao";
import { sincronizarDocumentoFiscal } from "../../../../lib/fiscal/persistencia";

export const runtime="nodejs";
export const preferredRegion=["gru1"];
export const maxDuration=60;
const admin=()=>createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req:Request) {
  try {
    const ids=(new URL(req.url).searchParams.get("fazendas") ?? "").split(",").filter(Boolean);
    if(!ids.length)return NextResponse.json({ok:false,error:"Escolha um cliente/fazenda."},{status:400});
    const negado=await exigirAcessoFazendas(req,ids);if(negado)return negado;
    const db=admin();
    const historico=new URL(req.url).searchParams.get("historico")==="1";
    const linhas=await lerPaginas((a,b)=>db.from("fiscal_operacoes").select("id,modelo,numero,serie,ambiente,documento,estado,chave,registro_id,created_at,updated_at,motivo:retorno->>xMotivo")
      .in("fazenda_id",ids).in("estado",historico?["reservada","enviada","pendente","autorizada","rejeitada","cancelada_pre_envio","sincronizada","cancelada"]:["reservada","enviada","pendente","autorizada"]).order("created_at",{ascending:false}).order("id").range(a,b));
    const eventos=await lerPaginas((a,b)=>db.from("fiscal_eventos_operacoes").select("id,acao,sequencia,estado,motivo,created_at,nota:notas_fiscais(numero,serie,chave_acesso,dados_nf_json)")
      .in("fazenda_id",ids).in("estado",["enviada","pendente","confirmada"]).order("created_at",{ascending:false}).order("id").range(a,b));
    return NextResponse.json({ok:true,linhas:[...linhas,...eventos.map(e=>{const n=(Array.isArray(e.nota)?e.nota[0]:e.nota) as {numero:string;serie:string;chave_acesso:string;dados_nf_json?:Record<string,unknown>}|null;return {id:e.id,natureza:"evento",modelo:55,numero:n?.numero,serie:n?.serie,chave:n?.chave_acesso,documento:n?.dados_nf_json?.emit_cnpj ?? "",ambiente:n?.dados_nf_json?.ambiente ?? "Conferir consulta",estado:"evento_pendente",motivo:(e.acao==="cancelar"?"Cancelamento":"CC-e "+e.sequencia)+": "+(e.motivo || "Consultar situação do evento"),created_at:e.created_at};})]});
  }catch(e){return NextResponse.json({ok:false,error:(e as {message?:string}).message ?? String(e)},{status:500});}
}

export async function POST(req:Request) {
  let liberar:(()=>Promise<void>)|undefined;
  try {
    const body=await req.json();
    if(body.natureza==="evento"){
      const negado=await exigirAcessoRegistro(req,"fiscal_eventos_operacoes",body.id);if(negado)return negado;
      if(body.acao!=="recuperar")throw new Error("Ação inválida para o evento.");
      const r=await recuperarEventoFiscal(admin(),body.id);
      return NextResponse.json(r,{status:r.ok&&!r.sincronizacao_pendente?200:202});
    }
    const negado=await exigirAcessoRegistro(req,"fiscal_operacoes",body.id);if(negado)return negado;
    const db=admin();const token=randomUUID();
    const lock=await db.rpc("fiscal_obter_recuperacao",{p_id:body.id,p_token:token});if(lock.error)throw lock.error;
    liberar=async()=>{await db.rpc("fiscal_liberar_recuperacao",{p_id:body.id,p_token:token});};
    const op=lock.data as OperacaoFiscal;
    if(body.acao==="encerrar_preparacao") {
      if(op.estado!=="reservada"||op.xml_assinado)throw new Error("Uma operação enviada não pode ser encerrada por esta ação. Consulte a situação fiscal.");
      await registrarRetornoFiscal(db,op,"cancelada_pre_envio",null,{sucesso:false,cStat:"PREPARACAO_ENCERRADA",xMotivo:"Tentativa encerrada antes do envio. O número permanece no histórico para conferência fiscal."});
      return NextResponse.json({ok:true,operacao_id:op.id});
    }
    if(["cancelada","sincronizada"].includes(op.estado))return NextResponse.json({ok:true,repetido:true});
    if(body.acao!=="recuperar")throw new Error("Ação inválida.");
    if(!op.chave||!op.xml_assinado)throw new Error("A preparação ainda não contém XML enviado. Aguarde ou encerre a tentativa sem envio.");
    let retorno={...(op.retorno ?? {}),chave:op.chave,numero:String(op.numero),serie:String(op.serie),operacao_id:op.id} as Record<string,unknown>;
    let proc=op.xml_processo;
    if(!proc || !retorno.protocolo) {
      const {pem}=await carregarCertificadoEmitente(db,op.fazenda_id,op.documento);
      const uf=op.xml_assinado.match(/<enderEmit>[\s\S]*?<UF>([^<]+)/)?.[1] || op.xml_assinado.match(/<UF>([^<]+)/)?.[1] || "MT";
      const consulta=op.modelo===55?await consultarSituacaoNFe(op.chave,pem,op.ambiente):op.modelo===57?await consultarSituacaoCTe(op.chave,pem,uf,op.ambiente):await consultarSituacaoMDFe(op.chave,pem,op.ambiente);
      if(!consulta.sucesso||!consulta.protocolo||!consulta.xmlProt) {
        retorno={...retorno,sucesso:false,pendente:true,cStat:consulta.cStat,xMotivo:consulta.xMotivo};
        await registrarRetornoFiscal(db,op,"pendente",consulta,retorno);
        return NextResponse.json({ok:false,pendente:true,error:"Situação ainda não recuperada: "+consulta.cStat+" — "+consulta.xMotivo},{status:202});
      }
      const modelo=op.modelo===55?"nfe":op.modelo===57?"cte":"mdfe";
      proc=montarProcAutorizado(modelo,op.xml_assinado,consulta.xmlProt,op.modelo===58?"3.00":"4.00");
      retorno={...retorno,sucesso:true,pendente:false,cStat:"100",xMotivo:consulta.xMotivo,protocolo:consulta.protocolo};
      const emit=op.xml_assinado.match(/<emit>[\s\S]*?<\/emit>/)?.[0] ?? "";
      for(const [nome,tag]of Object.entries({emit_razao:"xNome",emit_ie:"IE",emit_endereco:"xLgr",emit_numero:"nro",emit_bairro:"xBairro",emit_municipio:"xMun",emit_uf:"UF",emit_cep:"CEP",emit_fone:"fone"}))
        retorno[nome]=emit.match(new RegExp("<"+tag+">([^<]+)"))?.[1];
      retorno.emit_cnpj=op.documento;
      await registrarRetornoFiscal(db,op,"autorizada",consulta,retorno,proc);
    }
    const sync=await sincronizarDocumentoFiscal(db,op,retorno,proc,true);
    retorno={...retorno,...sync,tributacao_itens:op.tributacao_itens,sincronizacao_pendente:false,pendente:false,sucesso:true};
    await registrarRetornoFiscal(db,op,"sincronizada",op.resposta,retorno,proc);
    return NextResponse.json({ok:true,retorno});
  }catch(e){return NextResponse.json({ok:false,error:(e as {message?:string}).message ?? String(e)},{status:409});}
  finally{if(liberar)try{await liberar();}catch{ /* A concessão expira sem bloquear a próxima conferência. */ }}
}
