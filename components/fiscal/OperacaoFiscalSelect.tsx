"use client";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { supabase } from "../../lib/supabase";
import { lerPaginas } from "../../lib/paginar";
import SelectField from "../SelectField";

type Op={id:string;nome:string;fazenda_id:string;cfop_interno:string;cfop_externo:string;inf_cpl_template?:string;vigencia_inicio?:string;vigencia_fim?:string};
type Props={cfop:string;data:string;value:string;onChange:(id:string)=>void;variaveis:Record<string,string>;onVariaveis:(v:Record<string,string>)=>void;nfReferencia?:string};
export default function OperacaoFiscalSelect({cfop,data,value,onChange,variaveis,onVariaveis,nfReferencia}:Props) {
  const {fazendaId,fazendaIds}=useAuth();const [ops,setOps]=useState<Op[]>([]);const [erro,setErro]=useState("");
  const ids=fazendaIds?.length?fazendaIds:fazendaId?[fazendaId]:[];
  const cod=cfop.replace(/\D/g,"");const internas=["1","5"].includes(cod[0]);
  const aplica=(o:Op)=>(internas?o.cfop_interno:o.cfop_externo)?.replace(/\D/g,"")===cod&&(!o.vigencia_inicio||o.vigencia_inicio<=data)&&(!o.vigencia_fim||o.vigencia_fim>=data);
  useEffect(()=>{
    let ativo=true;setOps([]);setErro("");if(!ids.length)return;
    lerPaginas<Op>((a,b)=>supabase.from("operacoes_fiscais").select("id,nome,fazenda_id,cfop_interno,cfop_externo,inf_cpl_template,vigencia_inicio,vigencia_fim").in("fazenda_id",ids).eq("ativa",true).order("nome").order("id").range(a,b))
      .then(rows=>{
        if(!ativo)return;setOps(rows);
        const candidatas=rows.filter(aplica);
        if(value&&!candidatas.some(o=>o.id===value))onChange("");
        else if(!value&&candidatas.length===1)onChange(candidatas[0].id);
      }).catch(e=>{if(ativo)setErro(e.message);});
    return ()=>{ativo=false;};
  },[ids.join(","),cfop,data]); // eslint-disable-line react-hooks/exhaustive-deps
  const aplicaveis=ops.filter(aplica);
  const op=ops.find(o=>o.id===value);
  const campos=[...new Set((op?.inf_cpl_template?.match(/\[([A-Z_]+)\]/g) ?? []).map(v=>v.slice(1,-1)))].filter(v=>v!=="NF_ORIGEM"||!nfReferencia);
  return <div style={{margin:"12px 0",gridColumn:"1/-1"}}>
    <label style={{display:"block",fontSize:12,marginBottom:4}}>Operação fiscal cadastrada</label>
    <SelectField value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",padding:8,border:"1px solid var(--border-table)",borderRadius:6,background:"var(--bg-card)",color:"var(--text-1)"}}>
      <option value="">Automática pelo CFOP/NCM</option>
      {aplicaveis.map(o=><option key={o.id} value={o.id}>{o.nome}{o.fazenda_id===fazendaId?"":" — outra fazenda do cliente"}</option>)}
    </SelectField>
    {!!campos.length&&<div data-arato-fields="true" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginTop:10}}>
      {campos.map(nome=><label key={nome} style={{fontSize:12}}>{nome.replaceAll("_"," ")}<input value={variaveis[nome] ?? ""} onChange={e=>onVariaveis({...variaveis,[nome]:e.target.value})} style={{display:"block",width:"100%",padding:8,border:"1px solid var(--border-table)",borderRadius:6,background:"var(--bg-card)",color:"var(--text-1)"}}/></label>)}
    </div>}
    {erro&&<span role="alert" style={{color:"#b42318"}}>{erro}</span>}
  </div>;
}
