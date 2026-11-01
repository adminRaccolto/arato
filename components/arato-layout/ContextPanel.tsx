'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import SessionMandala,{type SessionAction} from './SessionMandala';
import {contextClient,contextSeason} from './context-display';
export type ContextAction={id:string;label:string;detail?:string;href?:string;onClick?:()=>void};
export type ContextPanelProps={
 client:string;producer:string;farm:string;season:string;user:string;role:string|null;
 pending:number;transfers:number;outdated:boolean;actions:ContextAction[];
 onBack:()=>void;onSignOut:()=>void;onApp:()=>void;onAppearance:()=>void;onNotifications:()=>void;
 panel:'notifications'|'appearance'|'app'|null;onClose:()=>void;
 notifications:ReactNode;appearance:ReactNode;app:ReactNode;
};
function ContextDialog({panel,onClose,children}:{panel:ContextPanelProps['panel'];onClose:()=>void;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null),title=useId(),previous=useRef<HTMLElement|null>(null);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(panel){previous.current=document.activeElement as HTMLElement;dialog.showModal();}else if(dialog.open){dialog.close();previous.current?.focus();}},[panel]);
 return <dialog ref={ref} className="native-context-dialog" aria-labelledby={title} onCancel={onClose} onClose={()=>{if(panel)onClose();}}><header><div><small>SEU ESPAÇO DE TRABALHO</small><h2 id={title}>{panel==='notifications'?'Notificações':panel==='appearance'?'Aparência e densidade':'App Campo'}</h2></div><button type="button" aria-label="Fechar painel de contexto" onClick={onClose}>×</button></header><div className="native-context-dialog-content">{children}</div></dialog>;
}
export default function ContextPanel(p:ContextPanelProps){
 const count=p.transfers+(p.outdated?1:0),client=contextClient(p.client,p.producer),season=contextSeason(p.season);
 const dimensions=[['Cliente',client],['Produtor / empresa',p.producer],['Fazenda',p.farm],['Ano-safra',season]];
 const commands:SessionAction[]=[{id:'back',label:'Voltar',onClick:p.onBack},{id:'notifications',label:'Notificações',badge:count,onClick:p.onNotifications},{id:'appearance',label:'Aparência e densidade',onClick:p.onAppearance},{id:'app',label:'App Campo',onClick:p.onApp},{id:'updates',label:'Atualizações',href:'/atualizacoes'},...(p.pending>0?[{id:'pending',label:'Pendências',badge:p.pending,href:'/pendencias/operacionais'}]:[]),{id:'signout',label:'Sair da conta',onClick:p.onSignOut}];
 return <section className="native-context-area" aria-label="Contexto e sessão"><details open data-native-context className="native-context-panel"><summary><span className="native-context-symbol" aria-hidden="true">◎</span><b className="native-context-caption">Contexto de trabalho</b><span className="native-context-client">Cliente: <strong>{client}</strong></span><span className="native-context-season">Ano-safra: <strong>{season}</strong></span><span className="native-context-expand">{count>0&&<strong className="native-context-badge" aria-label={`${count} aviso(s)`}>{count>9?'9+':count}</strong>}<i aria-hidden="true">⌄</i></span></summary><div className="native-context-body"><dl className="native-context-dimensions">{dimensions.map(([label,value])=><div key={label}><dt>{label}:</dt><dd title={value||undefined}>{value||'Não informado no contexto'}</dd></div>)}</dl><div className="native-context-identity"><SessionMandala user={p.user} accesses={p.actions} commands={commands} badge={count}/><span><b>{p.user||'Usuário conectado'}</b><small>Sessão atual</small></span></div></div></details><ContextDialog panel={p.panel} onClose={p.onClose}>{p.panel==='notifications'?p.notifications:p.panel==='appearance'?p.appearance:p.panel==='app'?p.app:null}</ContextDialog></section>;
}
