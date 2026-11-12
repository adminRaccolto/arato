import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OperacaoFiscal {
  id:string;numero:number;executar:boolean;estado:string;chave?:string;xml_assinado?:string;
  retorno?:Record<string,unknown>;registro_id?:string;
  fazenda_id:string;modelo:55|57|58;documento:string;serie:number;ambiente:"producao"|"homologacao";modulo:string;
  dados:Record<string,unknown>;tributacao_itens?:unknown[];xml_processo?:string;resposta?:Record<string,unknown>;
}
export async function abrirOperacaoFiscal(db:SupabaseClient,p:{id?:string;fazenda:string;modelo:55|57|58;documento:string;serie:string;ambiente:string;dados:unknown;modulo:string;proximo?:string;registro?:string|null}):Promise<OperacaoFiscal> {
  if(!Number.isSafeInteger(Number(p.proximo || 1))||Number(p.proximo || 1)<1)throw new Error("Confira o próximo número fiscal nos parâmetros do emitente.");
  const {data,error}=await db.rpc("fiscal_reservar_emissao",{p_id:p.id || randomUUID(),p_fazenda:p.fazenda,p_modelo:p.modelo,
    p_documento:p.documento.replace(/\D/g,""),p_serie:Number(p.serie),p_ambiente:p.ambiente,p_dados:p.dados,
    p_modulo:p.modulo,p_proximo:Number(p.proximo || 1),p_registro:p.registro || null});
  if(error)throw new Error("Não foi possível reservar a operação fiscal: "+error.message);
  if(!data?.id||!Number.isSafeInteger(Number(data.numero)))throw new Error("Reserva fiscal não confirmada pelo banco.");
  return {...data,numero:Number(data.numero)};
}
export function retornoOperacaoExistente(op:OperacaoFiscal):Record<string,unknown> & {sucesso:boolean;cStat:string;xMotivo:string} {
  if(op.retorno)return {...op.retorno,sucesso:op.retorno.sucesso===true,cStat:String(op.retorno.cStat ?? "PENDENTE"),xMotivo:String(op.retorno.xMotivo ?? "Consulte a operação fiscal."),operacao_id:op.id,repetido:true};
  return {sucesso:false,cStat:"PROCESSAMENTO_PENDENTE",xMotivo:"Esta operação já foi iniciada. Consulte Emissões em conferência antes de reenviar.",operacao_id:op.id,pendente:true,chave:op.chave,numero:String(op.numero)};
}
export async function prepararEnvioFiscal(db:SupabaseClient,op:OperacaoFiscal,xml:string,chave:string,tributacao:unknown[]=[]) {
  const {error}=await db.rpc("fiscal_preparar_envio",{p_id:op.id,p_xml:xml,p_chave:chave,p_tributacao:tributacao});
  if(error)throw new Error("O envio não foi confirmado no banco: "+error.message);
}
export async function registrarRetornoFiscal(db:SupabaseClient,op:OperacaoFiscal,estado:string,resposta:unknown,retorno:unknown,xml?:string) {
  const {error}=await db.rpc("fiscal_registrar_retorno",{p_id:op.id,p_estado:estado,p_resposta:resposta ?? null,p_retorno:retorno,p_xml:xml ?? null});
  if(error)throw new Error("Não foi possível guardar o retorno fiscal: "+error.message);
}
