"use client";
import { useEffect, useRef, useState } from "react";
import { OperationalButton } from "../OperationalUI";
export default function VerificarCertificado({fazendaId,documento,versao}:{fazendaId:string|null;documento?:string|null;versao?:string|null}) {
  const chave=`${fazendaId}|${documento}|${versao ?? ""}`;
  const seq=useRef(0);
  const [resultado,setResultado]=useState<{chave?:string;carregando?:boolean;ok?:boolean;mensagem?:string}>({});
  useEffect(()=>()=>{seq.current++;},[chave]);
  const estado=resultado.chave===chave ? resultado : {};
  if(!fazendaId || !documento) return null;
  const verificar=async()=>{
    const requisicao=++seq.current;
    setResultado({chave,carregando:true});
    try {
      const r=await fetch('/api/cert-validar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fazenda_id:fazendaId,cpf_cnpj:documento})});
      const j=await r.json();
      if(requisicao!==seq.current) return;
      setResultado({chave,ok:r.ok&&j.ok,mensagem:j.ok ? `${j.mensagem} Vencimento: ${new Date(j.valido_ate).toLocaleDateString('pt-BR')}.` : j.error});
    } catch {if(requisicao===seq.current) setResultado({chave,ok:false,mensagem:'Não foi possível verificar agora. Tente novamente.'});}
  };
  return <div style={{marginTop:10}}>
    <OperationalButton data-arato-button="secondary" type="button" disabled={estado.carregando} onClick={verificar} style={{padding:'6px 10px',border:'1px solid #CBD5E1',borderRadius:6,cursor:'pointer',fontSize:12}}>{estado.carregando?'Verificando…':'Verificar certificado'}</OperationalButton>
    {estado.mensagem && <p role="status" style={{fontSize:12,color:estado.ok?'#166534':'#991B1B',margin:'6px 0'}}>{estado.mensagem}</p>}
  </div>;
}
