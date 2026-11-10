import type { SupabaseClient } from "@supabase/supabase-js";
import { chaveTitularCertificado } from "./identidade-certificado.ts";

/** Projeção pública: nenhuma senha ou chave privada sai do servidor. */
export async function metadadosAtivos(db:SupabaseClient,ids:string[]) {
  const faz=await db.from('fazendas').select('conta_id').in('id',ids);
  if(faz.error) throw new Error('Não foi possível consultar os certificados do cliente.');
  const contas=[...new Set((faz.data ?? []).map(f=>f.conta_id).filter(Boolean))];
  if(!contas.length) return [];
  if(contas.length>1) throw new Error("Selecione fazendas de um único cliente para consultar os certificados.");
  const r=await db.from('certificados_a1_versoes').select('id,documento,storage_path,arquivo_nome,valido_ate,fingerprint').in('conta_id',contas).eq('ativo',true);
  if(r.error && !['42P01','PGRST205'].includes(r.error.code)) throw new Error('Não foi possível consultar os certificados ativos.');
  return r.data ?? [];
}
export function metaDoDocumento<T extends {documento:string}>(ativos:T[],doc:string) {
  const d=doc.replace(/\D/g,'');return ativos.find(c=>c.documento.length===d.length && chaveTitularCertificado(c.documento)===chaveTitularCertificado(d));
}
