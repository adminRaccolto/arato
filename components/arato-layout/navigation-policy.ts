/** Display policy only. The original Arato remains responsible for authorization. */
export type Entry={id:string;label:string;path:string;moduleId?:string;planoModulo?:string;disabled?:boolean};
export type Child=Entry|{type:'divider';label:string}|{type:'subgroup';id:string;label:string;moduleId?:string;children:Entry[]};
export type Item=(Entry&{minStep?:number})|{type:'group';id:string;label:string;minStep?:number;children:Child[]};
export type Access={userRole:string|null;onboardingAtivo:boolean;stepsCompletos:number;podeAcessar:(id:string)=>boolean;podeAcessarPlano:(id:string)=>boolean};
export type FunctionEntry=Entry&{section:string;locked:boolean};
export type ModuleEntry={id:string;label:string;locked:boolean;functions:FunctionEntry[]};
export function operationalMenu(nav:Item[],map:Record<string,string[]>,access:Access):ModuleEntry[]{
 const staff=['raccotlo','raccotlo_gestor','raccotlo_seletor','raccotlo_operacional','bpo'].includes(access.userRole??'');
 const visible=(id?:string)=>!id||access.podeAcessar(id)&&access.podeAcessarPlano(id);
 return nav.flatMap(item=>{
  const permissions=map[item.id];if(permissions&&(!staff&&!permissions.some(access.podeAcessar)||!permissions.some(access.podeAcessarPlano)))return [];
  const locked=access.onboardingAtivo&&(item.minStep??0)>access.stepsCompletos,functions:FunctionEntry[]=[];let section='Rotinas';
  const add=(entry:Entry,label=section)=>{if(visible(entry.moduleId)&&(!entry.planoModulo||access.podeAcessarPlano(entry.planoModulo))&&safeLocalPath(entry.path))functions.push({...entry,section:label,locked:locked||Boolean(entry.disabled)});};
  if('children'in item){for(const child of item.children){if('type'in child&&child.type==='divider'){section=child.label;continue;}if('type'in child&&child.type==='subgroup'){if(visible(child.moduleId))for(const entry of child.children)add(entry,child.label);continue;}add(child as Entry);}}
  else add(item);
  return functions.length?[{id:item.id,label:item.label,locked,functions}]:[];
 });
}
export function safeLocalPath(value:unknown):value is string{return typeof value==='string'&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\\r\n\u0000]/.test(value)&&!/%(?:2f|5c|0[ad0])/i.test(value);}
