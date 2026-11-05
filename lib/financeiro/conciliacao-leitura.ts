import type { SupabaseClient } from "@supabase/supabase-js";

export interface LancamentoConciliacao {
  id: string;
  tipo: "receber" | "pagar";
  descricao: string;
  valor: number;
  valor_pago?: number;
  data_vencimento: string;
  data_baixa?: string;
  status: string;
  categoria?: string;
  conta_bancaria?: string;
  produtor_id?: string | null;
  conciliado?: boolean;
  origem_tabela?: "lancamentos" | "empresa_lancamentos";
  moeda?: string;
  pessoa_id?: string | null;
  lote_id?: string | null;
}

/** Mesma leitura na abertura, atualização e importação: produtor e empresa entram juntos. */
export async function buscarLancamentosConciliacao(
  sb: SupabaseClient,
  fazendaIds: string[],
  periodo?: { de: string; ate: string },
): Promise<LancamentoConciliacao[]> {
  if (!fazendaIds.length) return [];
  const todos: LancamentoConciliacao[] = [];
  for (const tabela of ["lancamentos", "empresa_lancamentos"] as const) {
    const empresa = tabela === "empresa_lancamentos";
    const dataPagamento = empresa ? "data_pagamento" : "data_baixa";
    const campos = `id,tipo,descricao,valor,valor_pago,data_vencimento,${dataPagamento},status,categoria,conta_bancaria,conciliado,moeda,pessoa_id,lote_id${empresa ? "" : ",produtor_id"}`;
    for (let inicio = 0; ; inicio += 1000) {
      let q = sb.from(tabela).select(campos)
        .in("fazenda_id", fazendaIds).neq("status", "cancelado");
      // Vencimento antigo não pode esconder um pagamento feito no período do OFX.
      const intervalo = periodo
        ? `or(and(data_vencimento.gte.${periodo.de},data_vencimento.lte.${periodo.ate}),and(${dataPagamento}.gte.${periodo.de},${dataPagamento}.lte.${periodo.ate}))`
        : null;
      const natureza = empresa ? null : "or(natureza.is.null,natureza.neq.previsao)";
      const condicoes = [natureza, intervalo].filter(Boolean);
      if (condicoes.length) q = q.or(`and(${condicoes.join(",")})`);
      const { data, error } = await q.order("data_vencimento", { ascending: false })
        .order("id", { ascending: true }).range(inicio, inicio + 999);
      if (error) throw error;
      const linhas = (data ?? []) as unknown as Record<string, unknown>[];
      for (const linha of linhas) {
        todos.push({
          id: String(linha.id), tipo: linha.tipo as "pagar" | "receber",
          descricao: String(linha.descricao ?? ""), valor: Number(linha.valor ?? 0),
          valor_pago: linha.valor_pago == null ? undefined : Number(linha.valor_pago),
          data_vencimento: String(linha.data_vencimento),
          data_baixa: (linha[dataPagamento] as string | null) ?? undefined,
          status: empresa ? (linha.status === "pago" ? "baixado" : linha.status === "pendente" ? "em_aberto" : String(linha.status)) : String(linha.status),
          categoria: (linha.categoria as string | null) ?? undefined,
          conta_bancaria: (linha.conta_bancaria as string | null) ?? undefined,
          produtor_id: (linha.produtor_id as string | null) ?? null,
          conciliado: !!linha.conciliado, moeda: (linha.moeda as string | null) ?? "BRL",
          pessoa_id: (linha.pessoa_id as string | null) ?? null,
          lote_id: (linha.lote_id as string | null) ?? null, origem_tabela: tabela,
        });
      }
      if (linhas.length < 1000) break;
    }
  }
  return todos;
}
