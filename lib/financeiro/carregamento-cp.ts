import type { SupabaseClient } from "@supabase/supabase-js";

type TituloCP = { id: string; origem_tabela: string; fazenda_id?: string | null; origem_lancamento?: string | null; nf_entrada_id?: string | null };
type VinculoCP = { adiantamento_fornecedor?: boolean; nf_entrada_id?: string | null; pedido_compra_id?: string | null };

/** Classificação necessária antes de exibir o CP. Consulta famílias de adiantamentos, não cada lote do histórico inteiro. */
export async function carregarVinculosCP<T extends TituloCP>(db: SupabaseClient, titulos: T[]): Promise<(T & VinculoCP)[]> {
  const fazendas = [...new Set(titulos.filter(t => t.origem_tabela === "lancamentos").map(t => t.fazenda_id).filter((id): id is string => !!id))];
  const adiantamentos = new Set<string>();
  for (let i=0; i<fazendas.length; i+=100) {
    for (let de=0;;de+=1000) {
      const { data,error }=await db.from("adiantamentos_fornecedor").select("id,lancamento_id")
        .in("fazenda_id",fazendas.slice(i,i+100)).order("id").range(de,de+999);
      if (error) throw error;
      for (const a of data ?? []) if (a.lancamento_id) adiantamentos.add(a.lancamento_id);
      if (!data || data.length<1000) break;
    }
  }
  const vinculos = new Map<string,VinculoCP>();
  for (const id of adiantamentos) vinculos.set(id,{adiantamento_fornecedor:true});
  const tarefas: (()=>Promise<void>)[]=[];
  const raizes=[...adiantamentos];
  for (let i=0;i<raizes.length;i+=100) tarefas.push(async()=>{
    for(let de=0;;de+=1000){
      const {data,error}=await db.from("lancamentos").select("id")
        .in("titulo_origem_id",raizes.slice(i,i+100)).order("id").range(de,de+999);
      if(error)throw error;
      for(const p of data ?? [])vinculos.set(p.id,{adiantamento_fornecedor:true});
      if(!data || data.length<1000)break;
    }
  });
  // Pedidos antigos podem ter sido reaproveitados por uma NF: preserva a obrigação real.
  const pedidos=titulos.filter(t=>t.origem_tabela==="lancamentos" && t.origem_lancamento==="pedido_compra" && !t.nf_entrada_id);
  for(let i=0;i<pedidos.length;i+=150)tarefas.push(async()=>{
    const {data,error}=await db.from("lancamentos").select("id,nf_entrada_id,pedido_compra_id").in("id",pedidos.slice(i,i+150).map(t=>t.id));
    if(error)throw error;
    for(const p of data ?? [])vinculos.set(p.id,{...vinculos.get(p.id),nf_entrada_id:p.nf_entrada_id,pedido_compra_id:p.pedido_compra_id});
  });
  for(let i=0;i<tarefas.length;i+=6)await Promise.all(tarefas.slice(i,i+6).map(t=>t()));
  return titulos.map(t=>({...t,...(t.origem_tabela==="lancamentos"?vinculos.get(t.id):undefined)}));
}
