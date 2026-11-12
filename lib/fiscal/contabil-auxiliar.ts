export interface EventoContabil {
  id:string; origem:string; fazenda_id:string; produtor_id?:string|null; empresa_id?:string|null;
  data_baixa?:string|null; data_pagamento?:string|null; data_lancamento?:string|null;
  status:string; natureza?:string|null; tipo:string; descricao?:string; valor:number; valor_pago?:number|null;
  moeda?:string|null; cotacao_usd?:number|null; pagamento_parcial?:boolean|null;
  operacao_gerencial_id?:string|null; vinculo_atividade?:string|null; numero_documento?:string|null;
  forma_pagamento?:string|null;
}
export interface OgContabil {id:string;descricao:string;conta_debito?:string|null;conta_credito?:string|null;ids_equivalentes?:string[]}
export function prepararContabilAuxiliar(eventos:EventoContabil[],ogs:OgContabil[],ano:string) {
  if(!/^20\d{2}$/.test(ano))throw new Error("Informe o exercício com quatro dígitos.");
  const mapa=new Map(ogs.flatMap(o=>(o.ids_equivalentes ?? [o.id]).map(id=>[id,o] as const)));
  return eventos.filter(e=>["baixado","pago","parcial"].includes(e.status)&&e.natureza!=="previsao")
    .map(e=>{
      const data=e.data_baixa || e.data_pagamento || "";
      if(data&&!data.startsWith(ano+"-"))return null;
      const op=mapa.get(e.operacao_gerencial_id ?? "");const pendencias:string[]=[];
      if(!data)pendencias.push("Baixa sem data: exercício a conferir");
      if(e.status==="parcial"&&!e.pagamento_parcial)pendencias.push("Pagamento parcial acumulado: conferir eventos e datas");
      if(!op)pendencias.push("Operação gerencial não localizada");
      else if(!op.conta_debito||!op.conta_credito)pendencias.push("Contas de débito/crédito não configuradas");
      if(e.valor_pago==null&&e.moeda==="USD"&&!(Number(e.cotacao_usd)>0))pendencias.push("Cotação histórica não informada");
      const valor=e.valor_pago ?? Number(e.valor)*(e.moeda==="USD"?Number(e.cotacao_usd):1);
      if(!Number.isFinite(valor)||valor<0)pendencias.push("Valor inválido");
      if(e.forma_pagamento?.startsWith("Compensação"))pendencias.push("Compensação: conferir contrapartida contábil; não representa saída bancária");
      return {...e,data,valor_caixa:Number.isFinite(valor)?valor:null,conta_debito:op?.conta_debito ?? "",conta_credito:op?.conta_credito ?? "",operacao:op?.descricao ?? "",pendencias};
    }).filter(e=>e!==null).sort((a,b)=>a.data.localeCompare(b.data)||a.origem.localeCompare(b.origem)||a.id.localeCompare(b.id));
}
export function csvContabilAuxiliar(linhas:ReturnType<typeof prepararContabilAuxiliar>):string {
  // Campos citados e fórmulas neutralizadas: o arquivo é aberto por planilhas.
  const cel=(v:unknown)=>'"'+String(v ?? "").replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
  const cab=["Fonte","ID","Fazenda ID","Produtor ID","Empresa ID","Data do evento","Tipo","Descrição","Documento","Valor BRL","Operação gerencial","Débito sugerido","Crédito sugerido","Vínculo","Conferência"];
  return "\uFEFF"+[cab,...linhas.map(l=>[l.origem,l.id,l.fazenda_id,l.produtor_id,l.empresa_id,l.data,l.tipo,l.descricao,l.numero_documento,l.valor_caixa?.toFixed(2).replace(".",","),l.operacao,l.conta_debito,l.conta_credito,l.vinculo_atividade,l.pendencias.join("; ")])].map(r=>r.map(cel).join(";")).join("\r\n")+"\r\n";
}
