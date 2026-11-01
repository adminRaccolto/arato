'use client';
import {createContext,useContext,useSyncExternalStore,useState,type ReactNode} from 'react';
export type LayoutChoice='original'|'operational';
export const layoutChoiceEvent='arato-layout-choice-v2-change';
export const layoutChoiceKey=(identity:string)=>'arato-layout-choice-v2:'+identity.trim().toLowerCase();
const memory=new Map<string,LayoutChoice>();
const ChoiceContext=createContext<{available:boolean;choice:LayoutChoice;choose:(value:LayoutChoice)=>void}>({available:false,choice:'original',choose:()=>{}});
export function LayoutChoiceProvider({identity,children}:{identity:string;children:ReactNode}){
 const key=layoutChoiceKey(identity);
 const read=():LayoutChoice=>{if(memory.has(key))return memory.get(key)!;try{return localStorage.getItem(key)==='operational'?'operational':'original';}catch{return 'original';}};
 const subscribe=(listener:()=>void)=>{const storage=(event:StorageEvent)=>{if(event.key!==null&&event.key!==key)return;memory.delete(key);listener();};window.addEventListener(layoutChoiceEvent,listener);window.addEventListener('storage',storage);return()=>{window.removeEventListener(layoutChoiceEvent,listener);window.removeEventListener('storage',storage);};};
 const choice=useSyncExternalStore(subscribe,read,()=> 'original' as LayoutChoice);
 const choose=(value:LayoutChoice)=>{memory.set(key,value);try{localStorage.setItem(key,value);}catch{/* The choice remains active in this tab. */}window.dispatchEvent(new Event(layoutChoiceEvent));requestAnimationFrame(()=>document.getElementById('arato-content')?.focus({preventScroll:true}));};
 return <ChoiceContext.Provider value={{available:Boolean(identity),choice,choose}}>{children}</ChoiceContext.Provider>;
}
export const useLayoutChoice=()=>useContext(ChoiceContext);
export function LayoutChoiceControl(){
 const {available,choice,choose}=useLayoutChoice(),[notice,setNotice]=useState('');if(!available)return null;
 return <section className="arato-layout-choice" aria-label="Layout da interface"><div><b>Novo layout</b><small>{choice==='operational'?'Novo layout ativo':'Layout original ativo'}</small></div><button type="button" role="switch" aria-label="Usar novo layout" aria-checked={choice==='operational'} onClick={()=>{if(document.querySelector('#arato-content [data-arato-dialog],#arato-content form')){setNotice('Conclua ou feche a janela da rotina antes de trocar o layout.');return;}setNotice('');choose(choice==='operational'?'original':'operational');}}><span aria-hidden="true"/><strong>{choice==='operational'?'Ativado':'Desativado'}</strong></button>{notice&&<p role="status">{notice}</p>}</section>;
}
