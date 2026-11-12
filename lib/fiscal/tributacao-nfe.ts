import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemNFe, NFeInput } from "../nfe/builder";
import { lerPaginas } from "../paginar";
import { validarReferenciasCliente } from "../api-referencias";

type Regra = {id:string;fazenda_id:string;ncm?:string;cfop_interno?:string;cfop_externo?:string;cfop_dentro?:string;cfop_fora?:string;
  icms_cst_interno?:string;icms_cst_externo?:string;icms_aliq?:number;icms_base_reduzida_pct?:number;pis_cst?:string;pis_aliq?:number;cofins_cst?:string;cofins_aliq?:number;
  ibs_cbs_imune?:boolean;ibs_cbs_cst?:string;ibs_cbs_cclasstrib?:string;ibs_cbs_reducao_pct?:number;ibs_estadual_aliq?:number;ibs_municipal_aliq?:number;cbs_aliq?:number;
  inf_cpl_template?:string;inf_cpl?:string;vigencia_inicio?:string|null;vigencia_fim?:string|null};
const dig = (s?:string)=>String(s ?? "").replace(/\D/g,"");
const assinatura=(r:Regra)=>JSON.stringify([r.icms_cst_interno,r.icms_cst_externo,r.icms_aliq,r.icms_base_reduzida_pct,r.pis_cst,r.pis_aliq,r.cofins_cst,r.cofins_aliq,r.ibs_cbs_imune,r.ibs_cbs_cst,r.ibs_cbs_cclasstrib,r.ibs_cbs_reducao_pct,r.ibs_estadual_aliq,r.ibs_municipal_aliq,r.cbs_aliq,r.inf_cpl_template,r.inf_cpl]);
function escolher(rows:Regra[],fazenda:string,rotulo:string):Regra|undefined {
  const locais=rows.filter(r=>r.fazenda_id===fazenda);const candidatos=locais.length?locais:rows;
  if(new Set(candidatos.map(assinatura)).size>1)throw new Error("Há regras tributárias divergentes para "+rotulo+". Confira os parâmetros ou selecione a operação fiscal.");
  return [...candidatos].sort((a,b)=>a.id.localeCompare(b.id))[0];
}

/** Resolve somente cadastros aplicáveis ao CFOP e à data. Erro de leitura nunca vira isenção. */
export async function resolverTributacaoNFe(db:SupabaseClient,fazendaId:string,input:Omit<NFeInput,"emitente">,config:Record<string,string>,crt:string):Promise<ItemNFe[]> {
  const {data:faz,error}=await db.from("fazendas").select("conta_id").eq("id",fazendaId).single();if(error)throw error;
  let ids=[fazendaId];
  if(faz.conta_id){const r=await db.from("fazendas").select("id").eq("conta_id",faz.conta_id);if(r.error)throw r.error;ids=r.data.map(f=>f.id);}
  const [ncms,ops]=await Promise.all([
    lerPaginas<Regra>((a,b)=>db.from("ncm_tributacoes").select("*").in("fazenda_id",ids).in("ncm",[...new Set(input.itens.map(i=>dig(i.ncm)))]).order("id").range(a,b)),
    lerPaginas<Regra>((a,b)=>db.from("operacoes_fiscais").select("*").in("fazenda_id",ids).eq("ativa",true).order("id").range(a,b)),
  ]);
  if(input.operacao_gerencial_id)await validarReferenciasCliente(db,fazendaId,[{tabela:"operacoes_gerenciais",id:input.operacao_gerencial_id,global:true}]);
  const data=input.data_emissao?.slice(0,10) ?? new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Cuiaba"}).format(new Date());
  const vigente=(r:Regra)=>(!r.vigencia_inicio||r.vigencia_inicio<=data)&&(!r.vigencia_fim||r.vigencia_fim>=data);
  return Promise.all(input.itens.map(async item=>{
    const cfop=dig(item.cfop);const interno=["1","5"].includes(cfop[0]);
    const candidatas=ops.filter(r=>vigente(r)&&dig(interno?r.cfop_interno:r.cfop_externo)===cfop);
    const op=input.operacao_fiscal_id?candidatas.find(r=>r.id===input.operacao_fiscal_id):escolher(candidatas,fazendaId,"CFOP "+cfop);
    if(input.operacao_fiscal_id&&!op)throw new Error("A operação fiscal selecionada não corresponde ao cliente, CFOP ou data da nota.");
    const ncm=escolher(ncms.filter(r=>vigente(r)&&dig(r.ncm)===dig(item.ncm)),fazendaId,"NCM "+item.ncm);
    const ncmAplica=ncm&&dig((interno?ncm.cfop_dentro:ncm.cfop_fora) || (interno?config.cfop_venda_dentro:config.cfop_venda_fora) || (interno?"5101":"6101"))===cfop?ncm:undefined;
    const regra=op ?? ncmAplica;
    let pisCfop:string|undefined;let cofinsCfop:string|undefined;
    if(input.operacao_gerencial_id){
      const r=await db.from("operacao_cfop_fiscal").select("cst_pis,cst_cofins,tipo_pessoa,ncm").eq("operacao_gerencial_id",input.operacao_gerencial_id).eq("cfop",cfop).eq("ativo",true);
      if(r.error)throw r.error;
      const pessoa=dig(input.destinatario.cpf_cnpj).length===11?"PF":"PJ";
      const linhas=(r.data ?? []).filter(v=>(!v.ncm||dig(v.ncm)===dig(item.ncm))&&(!v.tipo_pessoa||v.tipo_pessoa==="Indiferente"||v.tipo_pessoa===pessoa));
      if(new Set(linhas.map(v=>JSON.stringify([v.cst_pis,v.cst_cofins]))).size>1)throw new Error("Há vínculos OG/CFOP divergentes para este item.");
      pisCfop=linhas[0]?.cst_pis;cofinsCfop=linhas[0]?.cst_cofins;
    }
    const out:ItemNFe={...item,
      cst_icms:input.operacao_fiscal_id?(interno?op?.icms_cst_interno:op?.icms_cst_externo):item.cst_icms ?? (interno?regra?.icms_cst_interno:regra?.icms_cst_externo),
      csosn:item.csosn || config.csosn_padrao || undefined,
      pICMS:(input.operacao_fiscal_id?undefined:item.pICMS) ?? (regra?.icms_aliq!=null?Number(regra.icms_aliq):undefined),
      pRedBC:(input.operacao_fiscal_id?undefined:item.pRedBC) ?? (regra?.icms_base_reduzida_pct!=null?100-Number(regra.icms_base_reduzida_pct):undefined),
      pis_cst:item.pis_cst ?? pisCfop ?? regra?.pis_cst, pis_aliq:item.pis_aliq ?? (regra?.pis_aliq!=null?Number(regra.pis_aliq):undefined),
      cofins_cst:item.cofins_cst ?? cofinsCfop ?? regra?.cofins_cst,cofins_aliq:item.cofins_aliq ?? (regra?.cofins_aliq!=null?Number(regra.cofins_aliq):undefined),
      regra_fiscal:{data,operacao_id:op?.id ?? null,ncm_id:ncm?.id ?? null,og_id:input.operacao_gerencial_id ?? null,regra:regra ?? null,texto_legal:op?.inf_cpl_template || ncmAplica?.inf_cpl || null},
    };
    if(config.ibs_cbs_ativo==="sim") {
      if(!ncm)throw new Error("Cadastre a tributação IBS/CBS do NCM "+item.ncm+" antes de emitir.");
      const cst=op?.ibs_cbs_cst || (op?.ibs_cbs_imune?"410":ncm.ibs_cbs_cst);
      const classe=op?.ibs_cbs_cclasstrib || ncm.ibs_cbs_cclasstrib;
      if(!cst||!classe)throw new Error("Informe CST e classificação IBS/CBS do NCM "+item.ncm+".");
      if(!classe.startsWith(cst))throw new Error("CST e classificação IBS/CBS incompatíveis para o NCM "+item.ncm+".");
      const teste2026=data.startsWith("2026-");
      out.ibsCbs={cst,cclasstrib:classe,ibsEstadualAliq:teste2026?0.1:Number(ncm.ibs_estadual_aliq ?? 0),ibsMunicipalAliq:teste2026?0:Number(ncm.ibs_municipal_aliq ?? 0),cbsAliq:teste2026?0.9:Number(ncm.cbs_aliq ?? 0),reducaoPct:Number(op?.ibs_cbs_reducao_pct ?? ncm.ibs_cbs_reducao_pct ?? 0)};
      out.regra_fiscal={...out.regra_fiscal,calendario:teste2026?"RTC-2026":"cadastro-vigente",crt};
    }
    return out;
  }));
}
