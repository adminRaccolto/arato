import type { SupabaseClient } from "@supabase/supabase-js";
import { numeroNF } from "./cp-grid";

type TituloNF = { id: string; origem_tabela: string; nfe_numero: string | null };
/** Atualiza números fiscais sem depender do espelho de rel_lancamentos. */
export async function carregarNumerosNF<T extends TituloNF>(db: SupabaseClient, titulos: T[]): Promise<T[]> {
  const resultado = titulos.map(t => ({ ...t }));
  for (const origem of ["lancamentos", "empresa_lancamentos"] as const) {
    const linhas = resultado.filter(t => t.origem_tabela === origem);
    for (let inicio = 0; inicio < linhas.length; inicio += 200) {
      const bloco = linhas.slice(inicio, inicio + 200);
      const campos = origem === "lancamentos" ? "id, nf_entrada_id, nfe_numero" : "id, nf_entrada_id, numero_documento";
      const { data: originais, error } = await db.from(origem).select(campos).in("id", bloco.map(t => t.id));
      if (error) throw error;
      const idsNF = [...new Set((originais ?? []).map(o => o.nf_entrada_id).filter(Boolean))];
      const notas = idsNF.length ? await db.from("nf_entradas").select("id, numero").in("id", idsNF) : { data: [], error: null };
      if (notas.error) throw notas.error;
      const numeros = new Map((notas.data ?? []).map(n => [n.id, n.numero]));
      for (const titulo of bloco) {
        const original = originais?.find(o => o.id === titulo.id);
        titulo.nfe_numero = numeroNF(original ?? {}, numeros.get(original?.nf_entrada_id), origem, titulo.nfe_numero);
      }
    }
  }
  return resultado;
}
