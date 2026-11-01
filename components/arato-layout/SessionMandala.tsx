'use client';
import {useId,useRef,useState,type CSSProperties} from 'react';
import type {ContextAction} from './ContextPanel';
export type SessionAction=ContextAction&{badge?:number};
function SessionIcon({id}:{id:string}){
 const paths:Record<string,string>={
  'switch-client':'M4 7h14l-4-4 M20 17H6l4 4 M18 7v5 M6 17v-5',
  admin:'M4 21V7l8-4 8 4v14 M8 21v-5h8v5 M8 9h1 M15 9h1 M8 12h1 M15 12h1',
  bi:'M4 20h16 M7 16v-4 M12 16V6 M17 16V3',
  hub:'M4 4h6v6H4Z M14 4h6v6h-6Z M4 14h6v6H4Z M14 14h6v6h-6Z',
  back:'M19 12H5 M11 6l-6 6 6 6',
  notifications:'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Z M10 20h4',
  appearance:'M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h4a4 4 0 0 0 4-4c0-4-4-6-9-6Z M7 9h.01 M10 6h.01 M15 6h.01',
  app:'M7 2h10v20H7Z M11 18h2',
  updates:'M20 8a8 8 0 1 0 0 8 M20 3v5h-5',
  pending:'M5 3h14v18H5Z M9 8h6 M9 12h6 M9 16h3',
  signout:'M10 4H4v16h6 M10 12h11 M17 8l4 4-4 4',
 };
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id]??paths.hub}/></svg>;
}
export default function SessionMandala({user,accesses,commands,badge=0}:{user:string;accesses:SessionAction[];commands:SessionAction[];badge?:number}){
 const id=useId(),dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),[open,setOpen]=useState(false),[group,setGroup]=useState<'accesses'|'commands'>('accesses');
 const nodes=group==='accesses'&&accesses.length?accesses:commands;
 function close(restore=true){dialog.current?.close();setOpen(false);if(restore)trigger.current?.focus({preventScroll:true});}
 function show(){setGroup(accesses.length?'accesses':'commands');dialog.current?.showModal();setOpen(true);}
 return <><button ref={trigger} type="button" className="native-session-trigger" aria-label={`Opções da sessão de ${user||'usuário'}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} title="Abrir mandala da sessão" onClick={show}><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M16 5c8-8 16 0 8 8 8 8 0 16-8 8-8 8-16 0-8-8C0 5 8-3 16 5Z" transform="translate(0 3) scale(1 .85)"/><circle cx="16" cy="16" r="4"/></svg>{badge>0&&<strong className="native-session-trigger-badge">{badge>9?'9+':badge}</strong>}</button><dialog ref={dialog} id={id} className="native-session-dialog" aria-label={`Mandala da sessão de ${user||'usuário'}`} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}><header><div><small>CONTA E SESSÃO</small><h2>{user||'Usuário conectado'}</h2></div><button type="button" aria-label="Fechar mandala da sessão" onClick={()=>close()}>×</button></header>{accesses.length>0&&<div className="native-session-groups" role="group" aria-label="Grupos da sessão"><button type="button" aria-pressed={group==='accesses'} onClick={()=>setGroup('accesses')}>Cliente e gestão</button><button type="button" aria-pressed={group==='commands'} onClick={()=>setGroup('commands')}>Sessão e preferências</button></div>}<nav className="native-session-mandala" aria-label={group==='accesses'&&accesses.length?'Acessos do perfil':'Comandos da sessão'} onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;const options=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[data-session-node]'));const index=options.indexOf(document.activeElement as HTMLElement);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+options.length)%options.length;options[next]?.focus();}}><span className="native-session-core" aria-hidden="true"><span>◎</span><b>{user||'Sua sessão'}</b></span>{nodes.map((action,index)=>{const angle=(-90+index*360/nodes.length)*Math.PI/180,style={left:`${50+34*Math.cos(angle)}%`,top:`${50+34*Math.sin(angle)}%`} as CSSProperties;const content=<><SessionIcon id={action.id}/><b>{action.label}</b>{action.badge!==undefined&&action.badge>0&&<strong className="native-context-badge">{action.badge>9?'9+':action.badge}</strong>}</>;return action.href?<a key={action.id} data-session-node className="native-session-node" href={action.href} title={action.detail} style={style} onClick={()=>close(false)}>{content}</a>:<button key={action.id} data-session-node type="button" className="native-session-node" title={action.detail} style={style} onClick={()=>{close(false);action.onClick?.();}}>{content}</button>;})}</nav></dialog></>;
}
