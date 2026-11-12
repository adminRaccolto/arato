import { ufPorCodigo } from "../nfe/endpoints";

export function contextoEventoNFe(chave:string,documento:string,ambienteDocumento?:string,ambienteConfigurado?:string):{cpfCnpjEmit:string;uf:string;ambiente:"producao"|"homologacao"} {
  const doc=documento.replace(/\D/g,"");
  if(!/^\d{44}$/.test(chave)||![11,14].includes(doc.length)||chave.slice(6,20)!==doc.padStart(14,"0"))
    throw new Error("O titular do evento não corresponde à chave da nota.");
  const uf=ufPorCodigo[chave.slice(0,2)];
  if(!uf)throw new Error("UF inválida na chave da NF-e.");
  const ambiente=ambienteDocumento || ambienteConfigurado;
  if(ambiente!=="producao"&&ambiente!=="homologacao")throw new Error("Confira o ambiente original da NF-e antes de enviar o evento.");
  return {cpfCnpjEmit:doc,uf,ambiente};
}

export function interpretarConsultaEvento(xml:string,chave:string,acao:"cancelar"|"carta_correcao",sequencia:number) {
  const limpo=xml.replace(/(<\/?)[\w-]+:/g,"$1");
  const tag=(s:string,n:string)=>s.match(new RegExp("<"+n+"(?:\\s[^>]*)?>([^<]*)</"+n+">"))?.[1] ?? "";
  const blocos=limpo.match(/<procEventoNFe\b[^>]*>[\s\S]*?<\/procEventoNFe>/g) ?? [];
  for(const bloco of blocos){
    if(tag(bloco,"chNFe")!==chave||tag(bloco,"tpEvento")!==(acao==="cancelar"?"110111":"110110")||Number(tag(bloco,"nSeqEvento"))!==sequencia)continue;
    const ret=bloco.match(/<retEvento\b[^>]*>[\s\S]*?<\/retEvento>/)?.[0] ?? "";
    if((acao==="cancelar"?["135","155"]:["135"]).includes(tag(ret,"cStat"))&&tag(ret,"nProt"))return {sucesso:true,cStat:tag(ret,"cStat"),xMotivo:tag(ret,"xMotivo"),protocoloEvento:tag(ret,"nProt"),confirmado_consulta:true,xmlConsulta:xml};
  }
  const ret=limpo.match(/<retConsSitNFe\b[^>]*>[\s\S]*?<\/retConsSitNFe>/)?.[0] ?? "";
  if(acao==="cancelar"&&["101","151"].includes(tag(ret,"cStat"))&&tag(ret,"chNFe")===chave)
    return {sucesso:true,cStat:tag(ret,"cStat"),xMotivo:tag(ret,"xMotivo"),confirmado_consulta:true,xmlConsulta:xml};
  return {sucesso:false,cStat:tag(ret,"cStat")||"PENDENTE",xMotivo:"O evento ainda não foi comprovado pela consulta. A tentativa permanece em conferência."};
}
