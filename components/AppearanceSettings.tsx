'use client';
import OriginalAppearanceSettings from './AppearanceSettingsOriginal';
import {LayoutChoiceControl} from './arato-layout/layout-choice';
export default function AppearanceSettings(props:{compact?:boolean}){return <><LayoutChoiceControl/><OriginalAppearanceSettings {...props}/></>;}
