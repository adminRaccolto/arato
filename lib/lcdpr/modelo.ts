export interface ParticipanteLCDPR { cpf: string; nome: string; tipo: number; participacao: number }
export interface ImovelLCDPR {
  id: string; produtor_id?: string | null; cpf_cnpj_fiscal?: string | null;
  tipo_exploracao?: number | null; participacao_lcdpr?: number | null;
  lcdpr_participantes?: ParticipanteLCDPR[] | null;
}
export interface MovimentoLCDPR {
  id: string; data: string; fazendaId: string; produtorId?: string | null; produtorCpf?: string;
  receita: number; despesa: number; compartilhada?: boolean;
}
const digitos = (s?: string | null) => (s ?? "").replace(/\D/g, "");
const centavos = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** A quota só alcança o movimento bruto explicitamente compartilhado. */
export function selecionarMovimentos<T extends MovimentoLCDPR>(
  movimentos: T[], cpf: string, produtores: {id:string;cpf:string}[], imoveis: ImovelLCDPR[], ano: number, mes?: number,
): T[] {
  const cpfPorId = new Map(produtores.map(p => [p.id,digitos(p.cpf)]));
  const fazMap = new Map(imoveis.map(f=>[f.id,f]));
  return movimentos.flatMap(m=>{
    if(m.data.slice(0,4)!==String(ano) || (mes && Number(m.data.slice(5,7))!==mes)) return [];
    if(cpf==="todos") return [m];
    const f = fazMap.get(m.fazendaId);
    const titular = digitos(m.produtorCpf) || cpfPorId.get(m.produtorId ?? "") || digitos(f?.cpf_cnpj_fiscal) || cpfPorId.get(f?.produtor_id ?? "");
    if(!m.compartilhada) return titular===cpf ? [m] : [];
    const perc = titular===cpf ? Number(f?.participacao_lcdpr ?? 100) : Number(f?.lcdpr_participantes?.find(p=>digitos(p.cpf)===cpf)?.participacao ?? 0);
    if(!Number.isFinite(perc) || perc<=0 || perc>100) return [];
    return [{...m,receita:centavos(m.receita*perc/100),despesa:centavos(m.despesa*perc/100)}];
  });
}

export type MotivoLCDPR = "apoio_baixa" | "entidade_pj" | "titular_pj" | "categoria_interna" | "vinculo_nao_rural" | "previsao" | "data_ausente" | "compensacao" | "parcial_legado" | "valor_invalido" | "titular_ausente";
export function motivosMovimento(
  l: {id:string;status:string;entidade_contabil?:string|null;produtor_id?:string|null;fazenda_id:string;categoria?:string|null;vinculo_atividade?:string|null;
    natureza?:string|null;data_baixa?:string|null;forma_pagamento?:string|null;pagamento_parcial?:boolean|null;valor_pago?:number|null;valor?:number;moeda?:string|null;cotacao_usd?:number|null},
  apoio: Set<string>, titulares: Map<string,string>, pj: Set<string>,
): MotivoLCDPR[] {
  const r: MotivoLCDPR[]=[];
  if(!l.produtor_id&&!titulares.get(l.fazenda_id))r.push("titular_ausente");
  if(apoio.has(l.id)) r.push("apoio_baixa");
  if(l.entidade_contabil && l.entidade_contabil!=="pf") r.push("entidade_pj");
  if(pj.has(l.produtor_id ?? titulares.get(l.fazenda_id) ?? "")) r.push("titular_pj");
  if(["Mútuo entre Empresas","Transferência entre Contas"].includes(l.categoria ?? "")) r.push("categoria_interna");
  if(l.vinculo_atividade && l.vinculo_atividade!=="rural") r.push("vinculo_nao_rural");
  if(l.natureza==="previsao") r.push("previsao");
  if(!l.data_baixa) r.push("data_ausente");
  // Não representa um segundo desembolso: fica na conferência para o tratamento fiscal da origem.
  if(l.forma_pagamento==="Compensação de adiantamento a fornecedor") r.push("compensacao");
  if(l.status==="parcial" && !l.pagamento_parcial) r.push("parcial_legado");
  const valor = valorCaixa(l);
  if(!Number.isFinite(valor) || valor<=0) r.push("valor_invalido");
  return r;
}
export function valorCaixa(l: {valor_pago?:number|null;valor?:number;moeda?:string|null;cotacao_usd?:number|null}) {
  if(l.valor_pago!=null) return Number(l.valor_pago);
  return Number(l.valor ?? 0) * (l.moeda==="USD" ? Number(l.cotacao_usd) : 1);
}
export function textoLCDPR(v?:string|null) { return (v ?? "").replace(/[|\x00-\x1f\x7f]/g," ").trim(); }
export function numeroContaLCDPR(conta?:string|null,dv?:string|null) {
  const separado=(conta ?? "").split("-");
  const base=digitos(separado.length>1?separado.slice(0,-1).join(""):conta);const sufixo=digitos(dv || (separado.length>1?separado.at(-1):""));
  if(dv && !/^\d+$/.test(dv)) throw new Error("O dígito da conta deve estar no formato numérico exigido pelo LCDPR.");
  return base+sufixo;
}

export function validarParticipantes(f: ImovelLCDPR): string[] {
  const participantes=f.lcdpr_participantes ?? [];
  if((f.tipo_exploracao ?? 1)===1 && Number(f.participacao_lcdpr ?? 100)===100 && !participantes.length) return [];
  const erros:string[]=[];
  if(!participantes.length) erros.push("Informe os terceiros relacionados ao imóvel (registro 0045).");
  const vistos=new Set<string>();
  for(const p of participantes){
    const cpf=digitos(p.cpf);
    if(![11,14].includes(cpf.length) || !p.nome?.trim() || ![1,2,3,4,5].includes(p.tipo) || !Number.isFinite(p.participacao) || p.participacao<0 || p.participacao>100)
      erros.push("Confira documento, nome, tipo e participação dos terceiros.");
    if(vistos.has(cpf)) erros.push("Há terceiro repetido neste imóvel."); vistos.add(cpf);
  }
  const total=Number(f.participacao_lcdpr ?? 100)+participantes.reduce((s,p)=>s+Number(p.participacao),0);
  if(Math.abs(total-100)>0.005) erros.push("As participações do declarante e terceiros devem totalizar 100%.");
  return [...new Set(erros)];
}

export function htmlLCDPR(v:unknown){return String(v ?? "").replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
