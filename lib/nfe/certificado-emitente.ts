import type { SupabaseClient } from "@supabase/supabase-js";
import { validarCertificadoA1 } from "./certificado-a1.ts";
import { chaveTitularCertificado } from "./identidade-certificado.ts";

type Config = Record<string,string>;
export type CandidatoA1 = {caminho:string;senha:string;documento?:string;fingerprint?:string;updatedAt?:string;canonico?:boolean};
const faltaTabela=(code?:string)=>code==='42P01'||code==='PGRST205';
export async function contextoCertificados(db:SupabaseClient,fazendaId:string) {
  const faz=await db.from('fazendas').select('conta_id').eq('id',fazendaId).single();
  if(faz.error) throw new Error('Não foi possível identificar o cliente do certificado.');
  const contaId=faz.data.conta_id as string|null;
  const fazendas=contaId ? await db.from('fazendas').select('id').eq('conta_id',contaId) : {data:[{id:fazendaId}],error:null};
  if(fazendas.error || !fazendas.data?.length) throw new Error('Não foi possível localizar as fazendas do cliente.');
  return {contaId,ids:fazendas.data.map(f=>f.id as string)};
}

export async function candidatosDoEmitente(db:SupabaseClient,fazendaId:string,documento?:string) {
  const {contaId,ids}=await contextoCertificados(db,fazendaId);
  const doc=documento?.replace(/\D/g,'');
  if(documento !== undefined && ![11,14].includes(doc?.length ?? 0)) throw new Error('Informe o CPF/CNPJ do emitente para selecionar o certificado A1.');
  let ativos:CandidatoA1[]=[];
  if(contaId) {
    let q=db.from('certificados_a1_versoes').select('storage_path,senha,documento,fingerprint,created_at').eq('conta_id',contaId).eq('ativo',true);
    if(doc) q=q.eq('chave_titular',chaveTitularCertificado(doc));
    const r=await q.order('created_at',{ascending:false});
    if(r.error && !faltaTabela(r.error.code)) throw new Error('Não foi possível consultar o certificado ativo. Tente novamente.');
    ativos=(r.data ?? []).map(r=>({caminho:r.storage_path,senha:r.senha,documento:r.documento,fingerprint:r.fingerprint,updatedAt:r.created_at,canonico:true}));
    if(doc && ativos.length) return {ids,candidatos:ativos}; // Não retorna silenciosamente a uma versão substituída.
  }
  const legados:{modulo:string;config:unknown;updated_at?:string}[]=[];
  for(let inicio=0;;inicio+=1000) {
    const r=await db.from('configuracoes_modulo').select('modulo,config,updated_at').in('fazenda_id',ids)
      .or('modulo.eq.fiscal,modulo.eq.cte,modulo.eq.mdfe,modulo.like.fiscal_pf_%,modulo.like.fiscal_emp_%,modulo.like.cte_emp_%,modulo.like.mdfe_emp_%')
      .not('modulo','like','%__ie_%').order('fazenda_id').order('modulo').range(inicio,inicio+999);
    if(r.error) throw new Error('Não foi possível consultar as configurações do certificado A1.');
    legados.push(...r.data);
    if(r.data.length<1000) break;
  }
  const candidatos:CandidatoA1[]=[...ativos];
  const protegidos=new Set(ativos.map(c=>chaveTitularCertificado(c.documento!)));
  for(const r of legados) {
    if(r.modulo.includes('__ie_')) continue;
    const c=(r.config ?? {}) as Config;
    const titular=r.modulo.match(/_(\d{11}|\d{14})$/)?.[1] || c.cpf_cnpj_emitente?.replace(/\D/g,'');
    if(!titular || ![11,14].includes(titular.length) || protegidos.has(chaveTitularCertificado(titular))) continue;
    if(doc && (titular.length!==doc.length || chaveTitularCertificado(titular)!==chaveTitularCertificado(doc))) continue;
    if(c.cert_a1_path && c.cert_a1_senha) candidatos.push({caminho:c.cert_a1_path,senha:c.cert_a1_senha,documento:titular,updatedAt:r.updated_at});
  }
  return {ids,candidatos:candidatos.sort((a,b)=>Number(!!b.canonico)-Number(!!a.canonico)||(b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))};
}

/** Download exato e restrito ao cliente. Não procura o primeiro PFX disponível no bucket. */
export async function baixarA1Exato(db:SupabaseClient,caminho:string,ids:string[]) {
  if(!ids.some(id=>caminho.startsWith(`${id}/`)) || !/\.(pfx|p12)$/i.test(caminho))
    throw new Error('O caminho do certificado A1 não corresponde a um arquivo deste cliente. Reenvie pelo cadastro do titular.');
  const r=await db.storage.from('certificados').download(caminho);
  if(r.error || !r.data) throw new Error('Não foi possível baixar o arquivo A1 cadastrado. Verifique o arquivo ou tente novamente; a senha não foi testada.');
  return Buffer.from(await r.data.arrayBuffer());
}

export async function carregarCertificadoEmitente(db:SupabaseClient,fazendaId:string,documento:string) {
  const {ids,candidatos}=await candidatosDoEmitente(db,fazendaId,documento);
  if(!candidatos.length) throw new Error('Certificado A1 e senha não encontrados para este titular. Configure em Parâmetros → Fiscal.');
  const vistos=new Set<string>();
  const validos=[];
  let erro:Error|undefined;
  for(const c of candidatos) {
    const par=JSON.stringify([c.caminho,c.senha]);if(vistos.has(par)) continue;vistos.add(par);
    try {
      const buffer=await baixarA1Exato(db,c.caminho,ids);
      const validado=validarCertificadoA1(buffer,c.senha,{documento:documento.replace(/\D/g,'')});
      if(c.fingerprint && c.fingerprint!==validado.fingerprint) throw new Error('O arquivo A1 foi alterado fora da rotina de certificados. Reenvie o certificado deste titular.');
      validos.push({...validado,buffer,caminho:c.caminho,origem:c.canonico?'ativo':'legado'});
      if(c.canonico) return validos[0];
    } catch(e) {erro ??= e instanceof Error ? e : new Error('Não foi possível validar o certificado A1.');}
  }
  // Compatibilidade: usa apenas pares completos do titular; em uma renovação prefere o certificado mais recente.
  validos.sort((a,b)=>b.validoDe.localeCompare(a.validoDe)||b.validoAte.localeCompare(a.validoAte));
  if(validos.length) return validos[0];
  throw erro ?? new Error('Nenhum certificado utilizável foi encontrado para este titular.');
}
