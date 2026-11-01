'use client';
import {createContext,useContext,type ReactNode} from 'react';
const PresentationMode=createContext(false);
export function OperationalPresentation({active,children}:{active:boolean;children:ReactNode}){return <PresentationMode.Provider value={active}>{children}</PresentationMode.Provider>;}
export const useOperationalPresentation=()=>useContext(PresentationMode);
