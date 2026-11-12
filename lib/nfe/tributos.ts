export const arredondarMoeda = (v:number) => Math.round((v+Number.EPSILON)*100)/100;
export function percentual(v:number,campo:string):number {
  if(!Number.isFinite(v)||v<0||v>100)throw new Error(campo+" deve estar entre 0 e 100%.");
  return v;
}
/** PIS/COFINS com base em valor; regimes por quantidade exigem dados próprios. */
export function contribuicao(nome:"PIS"|"COFINS",cst:string,aliquota:number,base:number):{xml:string;valor:number} {
  cst=String(cst).padStart(2,"0");
  const fmt=(v:number)=>v.toFixed(2);
  if(["04","05","06","07","08","09"].includes(cst))return {xml:`<${nome}><${nome}NT><CST>${cst}</CST></${nome}NT></${nome}>`,valor:0};
  if(cst==="03")throw new Error(nome+" CST 03 exige base e alíquota por quantidade; configure a operação antes de emitir.");
  if(!["01","02","49","50","51","52","53","54","55","56","60","61","62","63","64","65","66","67","70","71","72","73","74","75","98","99"].includes(cst))throw new Error("CST de "+nome+" inválido.");
  percentual(aliquota,nome);const valor=arredondarMoeda(base*aliquota/100);
  const grupo=["01","02"].includes(cst)?nome+"Aliq":nome+"Outr";
  return {xml:`<${nome}><${grupo}><CST>${cst}</CST><vBC>${fmt(base)}</vBC><p${nome}>${fmt(aliquota)}</p${nome}><v${nome}>${fmt(valor)}</v${nome}></${grupo}></${nome}>`,valor};
}
