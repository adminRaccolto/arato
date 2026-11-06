import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPaginado } from "../buscar-paginado.ts";

export function periodoAbastecimentos(mes: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error("Selecione um mês válido para consultar os abastecimentos.");
  const [ano, numeroMes] = mes.split("-").map(Number);
  return { inicio: `${mes}-01`, fimExclusivo: `${numeroMes === 12 ? ano + 1 : ano}-${String(numeroMes === 12 ? 1 : numeroMes + 1).padStart(2, "0")}-01` };
}

/** Consulta o mês completo sem datas inexistentes e sem o corte padrão de mil registros. */
export async function buscarAbastecimentos<T>(sb: SupabaseClient, fazendas: string[], mes: string, bomba?: string) {
  const periodo = periodoAbastecimentos(mes);
  if (!fazendas.length) return [] as T[];
  return buscarPaginado<T>(async (de, ate) => {
    let q = sb.from("abastecimentos").select("*,bombas_combustivel(nome),maquinas(nome),funcionarios(nome),ciclos(descricao,cultura)")
      .in("fazenda_id", fazendas).gte("data", periodo.inicio).lt("data", periodo.fimExclusivo);
    if (bomba) q = q.eq("bomba_id", bomba);
    const { data, error } = await q.order("data", { ascending: false }).order("created_at", { ascending: false }).order("id").range(de, ate);
    return { data: data as unknown as T[] | null, error };
  });
}
