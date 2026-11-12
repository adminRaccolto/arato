import { dadosNotaRecuperada } from "./nota-recuperada";
import type { NFeInput } from "../nfe/builder";
import { totaisDoXmlNFe } from "../nfe/totais";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperacaoFiscal } from "./operacao";
import { lancarFinanceiroCte, cancelarFinanceiroCte } from "../cte/financeiro";

/** Pode ser repetida depois de autorização: sempre atualiza pelo registro/chave já existente. */
export async function sincronizarDocumentoFiscal(db:SupabaseClient,op:OperacaoFiscal,retorno:Record<string,unknown>,xml:string,criarNota=false) {
  if(!op.chave || !retorno.protocolo || !xml)throw new Error("Faltam chave, protocolo ou XML autorizado para sincronizar.");
  const modelo=op.modelo===55?"nfe":op.modelo===57?"cte":"mdfe";
  const pasta=modelo==="nfe"?"nfe_emitidas":modelo+"_emitidos";
  const path=op.fazenda_id+"/"+pasta+"/"+op.chave+".xml";
  const {error:erroXml}=await db.storage.from("arquivos").upload(path,new Blob([xml],{type:"application/xml"}),{upsert:true});if(erroXml)throw erroXml;
  const xmlUrl=db.storage.from("arquivos").getPublicUrl(path).data.publicUrl;
  let registroId=op.registro_id;
  if(op.modelo===55) {
    let q=db.from("notas_fiscais").select("id,dados_nf_json,status,chave_acesso").eq("fazenda_id",op.fazenda_id);
    q=registroId?q.eq("id",registroId):q.eq("chave_acesso",op.chave);
    const {data:existente,error}=await q.maybeSingle();if(error)throw error;
    if(existente?.status==="cancelada")throw new Error("NF-e cancelada: a recuperação não pode reabri-la.");
    if(existente?.chave_acesso&&existente.chave_acesso!==op.chave)throw new Error("A NF possui outra chave: confira a referência antes de recuperar.");
    const dados=op.dados as unknown as Omit<NFeInput,"emitente">;
    const recuperada=dadosNotaRecuperada(dados);
    const snapshot={...recuperada.cabecalho,...(existente?.dados_nf_json ?? {}),modulo_key:op.modulo,fiscal_operacao_id:op.id,operacao_fiscal_id:op.dados.operacao_fiscal_id ?? null,variaveis_fiscais:op.dados.variaveis_fiscais ?? {},protocolo_autorizacao:retorno.protocolo,
      ...Object.fromEntries(Object.entries(retorno).filter(([k])=>k.startsWith("emit_"))),tributacao_itens:retorno.tributacao_itens ?? op.tributacao_itens,totais:totaisDoXmlNFe(xml),...totaisDoXmlNFe(xml),ambiente:op.ambiente};
    if(existente) {
      const r=await db.from("notas_fiscais").update({numero:String(op.numero),serie:String(op.serie),status:"autorizada",chave_acesso:op.chave,xml_url:xmlUrl,dados_nf_json:snapshot})
        .eq("id",existente.id).eq("fazenda_id",op.fazenda_id).select("id").single();if(r.error)throw r.error;registroId=r.data.id;
    } else if(criarNota) {
      const valor=totaisDoXmlNFe(xml).valor_total;
      const r=await db.rpc("fiscal_gravar_nota",{p_dados:{fazenda_id:op.fazenda_id,numero:String(op.numero),serie:String(op.serie),tipo:dados.tipo==="0"?"entrada":"saida",
        status:"autorizada",chave_acesso:op.chave,xml_url:xmlUrl,cfop:dados.itens?.[0]?.cfop,natureza:dados.natureza,destinatario:dados.destinatario?.nome,
        cnpj_destinatario:dados.destinatario?.cpf_cnpj,valor_total:Math.round(valor*100)/100,data_emissao:op.xml_assinado?.match(/<dhEmi>([^<]+)/)?.[1].slice(0,10) || dados.data_emissao,
        itens_json:recuperada.itens,observacao:dados.infCpl ?? null,dados_nf_json:snapshot,auto:false}});if(r.error)throw r.error;registroId=r.data.id;
    }
  } else {
    if(!registroId)throw new Error("O documento fiscal não possui registro local vinculado.");
    const tabela=op.modelo===57?"ctes":"mdfes";
    const patch={status:"autorizado",chave_acesso:op.chave,protocolo_autorizacao:retorno.protocolo,xml_url:xmlUrl,serie:String(op.serie),[op.modelo===57?"numero_cte":"numero_mdfe"]:String(op.numero)};
    const r=await db.from(tabela).update(patch).eq("id",registroId).eq("fazenda_id",op.fazenda_id).not("status","in","(cancelado,encerrado,substituido)").select("id").maybeSingle();
    if(r.error)throw r.error;if(!r.data)throw new Error("O documento autorizado não foi atualizado no banco.");
    if(op.modelo===57) {
      const log=await lancarFinanceiroCte(registroId);
      if(log.some(l=>/falhou/i.test(l)))throw new Error(log.filter(l=>/falhou/i.test(l)).join("; "));
      const dados=op.dados as {input?:{tp_cte?:string;cte_substituido_chave?:string;ind_altera_toma?:boolean};substituido_id?:string};
      if(dados.input?.tp_cte==="3") {
        const p={tipo_cte:"substituto",cte_substituido_id:dados.substituido_id ?? null,cte_substituido_chave:dados.input.cte_substituido_chave ?? null,ind_altera_toma:!!dados.input.ind_altera_toma};
        const atual=await db.from("ctes").update(p).eq("id",registroId).eq("fazenda_id",op.fazenda_id);if(atual.error)throw atual.error;
        if(dados.substituido_id) {
          const orig=await db.from("ctes").update({status:"substituido",cte_substituto_id:registroId,cte_substituto_chave:op.chave}).eq("id",dados.substituido_id).eq("fazenda_id",op.fazenda_id).select("id").single();if(orig.error)throw orig.error;
          const fin=await cancelarFinanceiroCte(dados.substituido_id);
          if(fin.pendenteManual||fin.log.some(l=>/falhou/i.test(l)))throw new Error("CT-e substituído exige conferência financeira: "+fin.log.join("; "));
        }
      }
    }
  }
  if(registroId) {
    const {error}=await db.from("fiscal_operacoes").update({registro_id:registroId}).eq("id",op.id);if(error)throw error;
  }
  return {xmlUrl,registro_id:registroId};
}
