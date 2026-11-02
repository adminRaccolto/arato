'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';

export default function NativeRecordPanel({children,label,routine,onClose}:{children:ReactNode;label:string;routine:string;onClose:()=>void}){
 const panel=useRef<HTMLDialogElement>(null),heading=useId();
 useEffect(()=>{const dialog=panel.current,previous=document.activeElement instanceof HTMLElement?document.activeElement:null;if(dialog&&!dialog.open)dialog.showModal();return()=>{if(dialog?.open)dialog.close();requestAnimationFrame(()=>{if(previous?.isConnected&&document.activeElement===document.body&&!document.querySelector('dialog[open],[data-arato-dialog]'))previous.focus({preventScroll:true});});};},[]);
 return <dialog ref={panel} className="native-record-panel" aria-label={label} aria-describedby={heading} onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}} onClick={event=>{if(event.target!==event.currentTarget)return;const rect=event.currentTarget.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)onClose();}}>
  <header className="native-record-panel-heading"><div><span>{routine}</span><h2 id={heading}>{label==='Borderô em foco'?'Detalhes do borderô':'Detalhes do lançamento'}</h2></div><button type="button" aria-label="Fechar detalhes" onClick={onClose}>×</button></header>
  <div className="native-record-panel-content" onClick={event=>{if((event.target as HTMLElement).closest('.native-record-actions button:not(:disabled)'))onClose();}}>{children}</div>
 </dialog>;
}
