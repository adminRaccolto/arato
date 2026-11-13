import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarCertificadoEmitente } from "../nfe/certificado-emitente";
import { documentoDoModulo } from "../nfe/identidade-fiscal";
import { consultarEventoNFe } from "../sefaz-consulta";
import { prepararCancelamentoDevolucao } from "./devolucao-compensacao";

/** Repete apenas a consulta e a conclusão local. Não retransmite o evento. */
export async function recuperarEventoFiscal(db:SupabaseClient,id:string) {
  const {data:e,error}=await db.from("fiscal_eventos_operacoes").select("*").eq("id",id).single();if(error)throw error;
  if(e.estado==="concluida")return {ok:true,repetido:true};
  let resultado=e.resposta;
  if(!resultado?.sucesso){
    const nota=await db.from("notas_fiscais").select("chave_acesso,dados_nf_json").eq("id",e.nota_id).eq("fazenda_id",e.fazenda_id).single();if(nota.error)throw nota.error;
    const documento=documentoDoModulo(String(e.dados.modulo));
    if(!documento||documento.padStart(14,"0")!==nota.data.chave_acesso?.slice(6,20))throw new Error("O titular do evento não corresponde à chave da nota.");
    const {pem}=await carregarCertificadoEmitente(db,e.fazenda_id,documento);
    const ambiente=e.dados.ambiente ?? nota.data.dados_nf_json?.ambiente;
    const ambientes: ("producao"|"homologacao")[]=ambiente==="producao"||ambiente==="homologacao"?[ambiente]:["homologacao","producao"];
    for(const amb of ambientes){
      resultado=await consultarEventoNFe(nota.data.chave_acesso,pem,amb,e.acao,e.acao==="cancelar"?1:e.sequencia);
      if(resultado.sucesso)break;
    }
    if(!resultado?.sucesso)return {ok:false,pendente:true,error:resultado?.xMotivo ?? "Evento ainda sem confirmação externa."};
  }
  if(e.acao==="cancelar")await prepararCancelamentoDevolucao(db,e.nota_id);
  const r=await db.rpc("fiscal_concluir_evento",{p_id:id,p_resposta:resultado});if(r.error)throw r.error;
  return r.data;
}
