/**
 * Regras puras da gravação do extrato conciliado (extrato_transacoes), extraídas da rota
 * /api/financeiro/sync-extrato-transacoes para terem teste automático.
 */

export type LinhaVinculo = {
  lancamento_id?: string | null;
  lancamento_ids?: string[] | null;
};

/**
 * `lancamento_id` tem chave estrangeira para `lancamentos` (títulos do produtor). Título de EMPRESA fica em
 * `empresa_lancamentos` e quebrava a gravação inteira. Para ids que não existem em `lancamentos`, o vínculo
 * passa só para `lancamento_ids` (sem FK) e `lancamento_id` fica nulo. Altera as linhas no lugar.
 */
export function ajustarVinculosParaFk<T extends LinhaVinculo>(rows: T[], existentesEmLancamentos: ReadonlySet<string>): T[] {
  for (const r of rows) {
    if (r.lancamento_id && !existentesEmLancamentos.has(r.lancamento_id)) {
      r.lancamento_ids = r.lancamento_ids?.length ? r.lancamento_ids : [r.lancamento_id];
      r.lancamento_id = null;
    }
  }
  return rows;
}

type Existente = {
  valor: number; conciliado: boolean; lancamento_id: string | null; lancamento_ids: string[] | null;
  lancamento_desc: string | null; lancamento_valor: number | null; origem_vinculo?: string | null; confianca?: string | null;
};
type Nova = LinhaVinculo & {
  valor: number; conciliado: boolean; lancamento_desc?: string | null; lancamento_valor?: number | null;
  origem_vinculo?: string | null; confianca?: string | null;
};

const mesmoArr = (x: string[] | null | undefined, y: string[] | null | undefined) =>
  JSON.stringify([...(x ?? [])].sort()) === JSON.stringify([...(y ?? [])].sort());

/** A linha precisa ser regravada? (nova, ou algum campo do vínculo/valor mudou). */
export function linhaMudou(ex: Existente | undefined, r: Nova, colunasNovas: boolean): boolean {
  if (!ex) return true;
  return ex.conciliado !== r.conciliado
    || (ex.lancamento_id ?? null) !== (r.lancamento_id ?? null)
    || !mesmoArr(ex.lancamento_ids, r.lancamento_ids)
    || (ex.lancamento_desc ?? null) !== (r.lancamento_desc ?? null)
    || Number(ex.lancamento_valor ?? 0) !== Number(r.lancamento_valor ?? 0)
    || Math.abs(ex.valor - r.valor) >= 0.01
    || (colunasNovas && ((ex.origem_vinculo ?? null) !== (r.origem_vinculo ?? null) || (ex.confianca ?? null) !== (r.confianca ?? null)));
}
