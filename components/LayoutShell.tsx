'use client';
import {useEffect,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {useAuth} from './AuthProvider';
import OriginalLayoutShell from './LayoutShellOriginal';
import {hasClientWorkspace} from '../lib/layout-preferences';
import {NAV,NAV_MODULE_MAP} from '../lib/navigation';
import {operationalMenu,type Item} from './arato-layout/navigation-policy';
import OperationalChrome from './arato-layout/OperationalChrome';
import OperationalContext from './OperationalContext';
import NativeSurfaceAdapter from './arato-layout/NativeSurfaceAdapter';
import {OperationalPresentation} from './arato-layout/presentation-mode';
import {LayoutChoiceProvider,useLayoutChoice} from './arato-layout/layout-choice';
export default function LayoutShell({children}:{children:ReactNode}){
 const auth=useAuth(),pathname=usePathname(),workspace=hasClientWorkspace(pathname,auth.emailUsuario,auth.contaId,auth.fazendaId);
 if(!workspace)return <OriginalLayoutShell>{children}</OriginalLayoutShell>;
 return <LayoutChoiceProvider identity={auth.emailUsuario??''}><WorkspacePresentation>{children}</WorkspacePresentation></LayoutChoiceProvider>;
}
function WorkspacePresentation({children}:{children:ReactNode}){
 const auth=useAuth(),pathname=usePathname(),{choice}=useLayoutChoice(),active=choice==='operational';
 useEffect(()=>{document.documentElement.dataset.aratoOperational=String(active);return()=>{delete document.documentElement.dataset.aratoOperational;};},[active]);
 return <OperationalPresentation active={active}>{active?<OperationalChrome modules={operationalMenu(NAV as Item[],NAV_MODULE_MAP,auth)} pathname={pathname} contextPanel={<OperationalContext/>} context={{client:auth.contaNome??'',farm:auth.nomeFazendaSelecionada??'',producer:auth.nomeProdutor??'',season:auth.anoSafraVigenteDesc??'',user:auth.nomeUsuario??''}}><NativeSurfaceAdapter><OriginalLayoutShell>{children}</OriginalLayoutShell></NativeSurfaceAdapter></OperationalChrome>:<OriginalLayoutShell>{children}</OriginalLayoutShell>}</OperationalPresentation>;
}
