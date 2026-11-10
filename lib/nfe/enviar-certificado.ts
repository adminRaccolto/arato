import type {SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {validarCertificadoA1} from './certificado-a1.ts';
type Dados={buffer:Buffer;nomeArquivo:string;senha:string;fazendaId:string;doc:string;produtorId:string|null;produtorNome:string|null};
const resposta=(body:Record<string,unknown>,opcoes?:{status:number})=>({body,status:opcoes?.status ?? 200});
export async function enviarCertificadoA1(db:SupabaseClient,{buffer,nomeArquivo,senha,fazendaId,doc,produtorId,produtorNome}:Dados) {
    let validado;
    try {validado=validarCertificadoA1(buffer,senha,{documento:doc});}
    catch(e){return resposta({error:(e as Error).message},{status:400});}
    // Detecta a migração antes de enviar um arquivo; nunca recorre a uma gravação parcial antiga.
    const pronto=await db.from('certificados_a1_versoes').select('id').limit(1);
    if(pronto.error) return resposta({error:pronto.error.code==='42P01'||pronto.error.code==='PGRST205'
      ?'Execute a Seção 431 das migrações para ativar a troca segura do certificado. O atual foi preservado.'
      :'Não foi possível verificar o cadastro de certificados. Tente novamente.'},{status:503});
    const path=`${fazendaId}/versoes/${randomUUID()}.pfx`;
    const bucket=await db.storage.createBucket('certificados',{public:false});
    if(bucket.error && !/already|duplicate/i.test(bucket.error.message)) return resposta({error:'Não foi possível acessar o armazenamento dos certificados.'},{status:503});
    const envio=await db.storage.from('certificados').upload(path,buffer,{upsert:false,contentType:'application/x-pkcs12'});
    if(envio.error) return resposta({error:'Não foi possível enviar o arquivo. O certificado atual foi preservado.'},{status:503});
    const leitura=await db.storage.from('certificados').download(path);
    if(leitura.error || !leitura.data) return resposta({error:'Não foi possível conferir o arquivo enviado. O certificado atual foi preservado.'},{status:503});
    let conferido;
    try {conferido=validarCertificadoA1(Buffer.from(await leitura.data.arrayBuffer()),senha,{documento:doc});}
    catch {return resposta({error:'O arquivo relido não corresponde a um A1 utilizável. O certificado atual foi preservado.'},{status:409});}
    if(conferido.fingerprint!==validado.fingerprint) return resposta({error:'O arquivo enviado diverge do certificado validado. O atual foi preservado.'},{status:409});
    const ativacao=await db.rpc('ativar_certificado_a1',{p:{fazenda_id:fazendaId,emitente:doc,documento:validado.documento,
      produtor_id:produtorId,produtor_nome:produtorNome,arquivo_nome:nomeArquivo,storage_path:path,senha,
      fingerprint:validado.fingerprint,serial:validado.serial,valido_de:validado.validoDe,valido_ate:validado.validoAte}});
    if(ativacao.error) return resposta({error:ativacao.error.code==='P0001' ? ativacao.error.message :
      'Não foi possível confirmar a ativação. Atualize o cadastro e verifique o certificado ativo antes de reenviar.'},{status:409});
    return resposta({ok:true,produtor_id:produtorId,produtor_nome:produtorNome ?? '',cpf_cnpj:doc,
      arquivo_nome:nomeArquivo,storage_path:path,data_vencimento:validado.vencimento,versao_id:ativacao.data.versao_id,validado:true});
}
