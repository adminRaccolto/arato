// Conserva a identificação enquanto a resposta ou a gravação local ainda não foi confirmada.
type Pendente={id:string;chave?:string};
const pendentes=new Map<string,Pendente>();
const prefixo="arato:fiscal:requisicao:";
const armazenamento=()=>{try{return typeof window!=="undefined"?window.sessionStorage:null;}catch{return null;}};
export async function identificarRequisicaoFiscal(url:string,init:RequestInit):Promise<{init:RequestInit;assinatura?:string}> {
  const path=url.split("?")[0];
  if(!/^\/api\/fiscal\/emitir-(nfe|cte|mdfe)$/.test(path)||String(init.method ?? "GET").toUpperCase()!=="POST"||typeof init.body!=="string")return {init};
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(path+"|"+init.body));
  const assinatura=prefixo+Array.from(new Uint8Array(bytes)).map(v=>v.toString(16).padStart(2,"0")).join("");
  let item=pendentes.get(assinatura);
  if(!item){try{item=JSON.parse(armazenamento()?.getItem(assinatura) || "null") ?? undefined;}catch{}}
  const headers=new Headers(init.headers);
  item ??= {id:headers.get("x-arato-requisicao") || crypto.randomUUID()};
  headers.set("x-arato-requisicao",item.id);pendentes.set(assinatura,item);
  try{armazenamento()?.setItem(assinatura,JSON.stringify(item));}catch{}
  return {init:{...init,headers},assinatura};
}
export async function registrarRespostaFiscal(response:Response,assinatura?:string) {
  if(!assinatura)return;
  try {
    const result=await response.clone().json();const item=pendentes.get(assinatura);if(!item)return;
    if(result.chave)item.chave=result.chave;
    if(!result.pendente&&!result.sincronizacao_pendente&&(!response.ok||result.sucesso===false)){pendentes.delete(assinatura);try{armazenamento()?.removeItem(assinatura);}catch{}return;}
    try{armazenamento()?.setItem(assinatura,JSON.stringify(item));}catch{}
  }catch{ /* Resposta interrompida: o reenvio deve consultar a mesma operação. */ }
}
export function confirmarEmissaoPersistida(chave?:string|null) {
  if(!chave)return;
  const local=armazenamento();
  try{if(local)for(let i=local.length-1;i>=0;i--){const k=local.key(i);if(k?.startsWith(prefixo)&&JSON.parse(local.getItem(k)||"null")?.chave===chave){local.removeItem(k);pendentes.delete(k);}}}catch{}
  for(const [k,v] of pendentes)if(v.chave===chave){pendentes.delete(k);try{local?.removeItem(k);}catch{}}
}
export function encerrarRequisicaoFiscal(id:string) {
  const local=armazenamento();
  try{if(local)for(let i=local.length-1;i>=0;i--){const k=local.key(i);if(k?.startsWith(prefixo)&&JSON.parse(local.getItem(k)||"null")?.id===id){local.removeItem(k);pendentes.delete(k);}}}catch{}
  for(const [k,v]of pendentes)if(v.id===id){pendentes.delete(k);try{local?.removeItem(k);}catch{}}
}
