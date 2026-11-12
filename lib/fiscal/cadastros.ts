import type { SupabaseClient } from "@supabase/supabase-js";

export async function salvarCadastroFiscal(db:SupabaseClient,tabela:"ncm_tributacoes"|"operacoes_fiscais",campos:Record<string,unknown>,fazenda:string) {
  const {id,versao,...payload}=campos;
  if(id&&!Number.isInteger(versao))throw new Error("Recarregue o cadastro fiscal antes de editar (versão ausente).");
  if(tabela==="ncm_tributacoes") {
    payload.ncm=String(payload.ncm ?? "").replace(/\D/g,"");
    if(!/^\d{8}$/.test(String(payload.ncm)))throw new Error("Informe um NCM com oito dígitos.");
  }else if(!String(payload.nome ?? "").trim())throw new Error("Informe o nome da operação fiscal.");
  for(const key of ["icms_aliq","icms_base_reduzida_pct","pis_aliq","cofins_aliq","ibs_estadual_aliq","ibs_municipal_aliq","cbs_aliq","ibs_cbs_reducao_pct"])
    if(payload[key]!=null&&(!Number.isFinite(Number(payload[key]))||Number(payload[key])<0||Number(payload[key])>100))throw new Error("Confira os percentuais da tributação (0 a 100%).");
  for(const key of ["cfop_interno","cfop_externo","cfop_dentro","cfop_fora"])
    if(payload[key] && !/^\d{4}$/.test(String(payload[key]).replace(/\D/g,"")))throw new Error("CFOP deve ter quatro dígitos.");
  if(payload.ibs_cbs_cst&&!/^\d{3}$/.test(String(payload.ibs_cbs_cst)))throw new Error("CST IBS/CBS deve ter três dígitos.");
  if(payload.ibs_cbs_cclasstrib&&(!/^\d{6}$/.test(String(payload.ibs_cbs_cclasstrib))||(payload.ibs_cbs_cst&&!String(payload.ibs_cbs_cclasstrib).startsWith(String(payload.ibs_cbs_cst)))))throw new Error("CST e classificação IBS/CBS incompatíveis.");
  if(payload.vigencia_inicio&&payload.vigencia_fim&&String(payload.vigencia_fim)<String(payload.vigencia_inicio))throw new Error("O fim da vigência deve ser igual ou posterior ao início.");
  for(const key of ["vigencia_inicio","vigencia_fim"])if(payload[key]==="")payload[key]=null;
  if(id){
    const atual=await db.from(tabela).select("id,fazenda_id").eq("id",id).single();if(atual.error)throw atual.error;
    if(!atual.data)throw new Error("O cadastro não foi encontrado.");
    payload.fazenda_id=atual.data.fazenda_id;
  }else payload.fazenda_id=fazenda;
  const result=id?await db.from(tabela).update(payload).eq("id",id).eq("versao",versao).select("id").single():await db.from(tabela).insert(payload).select("id").single();
  if(result.error){if(result.error.code==="PGRST116")throw new Error("O cadastro fiscal foi alterado por outra operação. Recarregue antes de salvar.");throw result.error;}if(!result.data)throw new Error("O cadastro fiscal não foi confirmado no banco.");
  return result.data;
}
