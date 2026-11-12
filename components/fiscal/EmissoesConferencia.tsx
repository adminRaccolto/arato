"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { OperationalButton, OperationalGrid } from "../OperationalUI";
import { confirmarEmissaoPersistida, encerrarRequisicaoFiscal } from "../../lib/fiscal/requisicao";

type Linha={natureza?:string;id:string;modelo:number;numero:number;serie:number;documento:string;ambiente:string;estado:string;chave?:string;motivo?:string;created_at:string};
const rotulos:Record<string,string>={cancelada:"Cancelada",rejeitada:"Tentativa rejeitada — conferir número",cancelada_pre_envio:"Preparação encerrada — conferir número",sincronizada:"Autorizada e gravada",evento_pendente:"Evento em conferência",reservada:"Preparação iniciada",enviada:"Resultado a consultar",pendente:"Resultado a consultar",autorizada:"Autorizada — sincronização pendente"};
export default function EmissoesConferencia() {
  const {fazendaId,fazendaIds}=useAuth();
  const ids=fazendaIds?.length?fazendaIds:fazendaId?[fazendaId]:[];
  const [historico,setHistorico]=useState(false);
  const [aberta,setAberta]=useState(false);const [linhas,setLinhas]=useState<Linha[]>([]);const [erro,setErro]=useState("");const [ocupada,setOcupada]=useState("");const [versao,setVersao]=useState(0);
  const seq=useRef(0);
  useEffect(()=>{
    const atual=++seq.current;setLinhas([]);setErro("");
    if(!aberta||!ids.length)return;
    setOcupada("carga");
    fetch("/api/fiscal/operacoes?fazendas="+encodeURIComponent(ids.join(","))+"&historico="+(historico?"1":"0")).then(async r=>{const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error ?? "Não foi possível carregar as operações.");if(seq.current===atual)setLinhas(j.linhas);})
      .catch(e=>{if(seq.current===atual)setErro(e.message);}).finally(()=>{if(seq.current===atual)setOcupada("");});
    return ()=>{++seq.current;};
  },[aberta,ids.join(","),versao,historico]); // eslint-disable-line react-hooks/exhaustive-deps
  const agir=async(l:Linha,acao:string)=>{
    if(acao==="encerrar_preparacao"&&!confirm("Encerrar esta preparação que não chegou ao envio? O número continuará registrado para conferência fiscal."))return;
    const atual=seq.current;setOcupada(l.id);setErro("");
    try{
      const r=await fetch("/api/fiscal/operacoes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:l.id,acao,natureza:l.natureza})});
      const j=await r.json();if(!r.ok||!j.ok||j.sincronizacao_pendente)throw new Error(j.aviso ?? j.error ?? "A operação ainda precisa de conferência.");
      if(acao==="encerrar_preparacao")encerrarRequisicaoFiscal(l.id);
      else confirmarEmissaoPersistida(l.chave);
      if(seq.current===atual)setVersao(v=>v+1);
    }catch(e){if(seq.current===atual)setErro((e as Error).message);}finally{if(seq.current===atual)setOcupada("");}
  };
  return <>
    <OperationalButton data-arato-button="secondary" onClick={()=>setAberta(true)} disabled={!ids.length}>Emissões em conferência</OperationalButton>
    {aberta&&<div data-arato-overlay="true" style={{position:"fixed",inset:0,zIndex:1500,background:"rgba(0,0,0,.45)",display:"grid",placeItems:"center",padding:16}}>
      <div data-arato-dialog="form" style={{width:"min(1100px,96vw)",maxHeight:"90vh",overflow:"auto",background:"var(--bg-card)",color:"var(--text-1)",borderRadius:12,padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12}}><h2>Emissões em conferência</h2><OperationalButton data-arato-button="secondary" onClick={()=>setAberta(false)}>Fechar</OperationalButton></div>
        <p>Recupere o resultado da mesma chave e conclua a gravação local. A recuperação não emite outro documento.</p>
        <label style={{display:"block",marginBottom:12}}><input type="checkbox" checked={historico} onChange={e=>setHistorico(e.target.checked)}/> Mostrar histórico de tentativas e reservas de numeração</label>
        {erro&&<p role="alert" style={{color:"#b42318"}}>{erro}</p>}
        {ocupada==="carga"?<p>Carregando…</p>:!linhas.length&&!erro?<p>Nenhuma emissão pendente encontrada.</p>:<div style={{overflowX:"auto"}}>
          <OperationalGrid><thead><tr>{["Documento","Emitente","Ambiente","Situação","Informação","Ação"].map(h=><th key={h}>{h}</th>)}</tr></thead>
            <tbody>{linhas.map(l=><tr key={l.id}>
              <td>{l.modelo===55?"NF-e":l.modelo===57?"CT-e":"MDF-e"} {l.numero}/{l.serie}</td><td>{l.documento}</td><td>{l.ambiente}</td><td>{rotulos[l.estado] ?? l.estado}</td><td>{l.motivo || l.chave || "Preparação sem envio confirmado"}</td>
              <td>{["rejeitada","cancelada_pre_envio","sincronizada","cancelada"].includes(l.estado)?"Histórico":<OperationalButton data-arato-button="primary" disabled={!!ocupada} onClick={()=>agir(l,l.estado==="reservada"&&!l.chave?"encerrar_preparacao":"recuperar")}>{ocupada===l.id?"Aguarde…":l.estado==="reservada"&&!l.chave?"Encerrar preparação":"Consultar e recuperar"}</OperationalButton>}</td>
            </tr>)}</tbody>
          </OperationalGrid>
        </div>}
      </div>
    </div>}
  </>;
}
