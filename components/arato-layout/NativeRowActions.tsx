'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import NativeActionOrbit from './NativeActionOrbit';
import {useOperationalPresentation} from './presentation-mode';
export default function NativeRowActions({children}:{children:ReactNode}){
 const active=useOperationalPresentation(),own=useRef<HTMLSpanElement>(null),[label,setLabel]=useState('Registro do cadastro');
 useEffect(()=>{const row=own.current?.closest('tr');if(!active||!row)return;const read=()=>{const values=Array.from(row.cells).filter(cell=>!cell.contains(own.current)).map(cell=>cell.textContent?.trim().replace(/\s+/g,' ')??'').filter(Boolean);setLabel(values.slice(0,3).join(' · ').slice(0,180)||'Registro do cadastro');};read();const observer=new MutationObserver(read);observer.observe(row,{subtree:true,characterData:true,childList:true});return()=>observer.disconnect();},[active]);
 if(!active)return <>{children}</>;
 return <span ref={own} className="native-cadastro-row-actions" onClick={event=>event.stopPropagation()}><NativeActionOrbit label={label}>{children}</NativeActionOrbit></span>;
}
