'use client';
import OriginalTopNav from './TopNavOriginal';
import {useOperationalPresentation} from './arato-layout/presentation-mode';
export default function TopNav(props:{automacoesAtivas?:number}){const active=useOperationalPresentation();if(active)return null;return <OriginalTopNav {...props}/>;}
