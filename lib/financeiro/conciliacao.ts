/**
 * Regras puras da gravação do extrato conciliado (extrato_transacoes), extraídas da rota
 * /api/financeiro/sync-extrato-transacoes para terem teste automático.
 */

export type LinhaVinculo = {
  lancamento_id?: string | null;
  lancamento_ids?: string[] | null;
  sugestao_lancamento_id?: string | null;
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
    // sugestao_lancamento_id também tem FK para lancamentos: sugestão de título de Empresa derrubava a importação inteira
    // do OFX ("Não foi possível gravar as transações do extrato"). A sugestão é recalculada na tela, então pode ficar nula.
    if (r.sugestao_lancamento_id && !existentesEmLancamentos.has(r.sugestao_lancamento_id)) {
      r.sugestao_lancamento_id = null;
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

const centavos = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Quanto saiu (ou sai) do banco num borderô — o valor que a linha do extrato tem que ter. Pago: principal liquidado +
 * juros + multa − desconto (a soma dos títulos não serve: com juros/desconto nunca batia com o extrato). Pendente: o
 * saldo em aberto, que a confirmação pela conciliação paga inteiro. Legado sem valor_pago foi quitado integralmente.
 */
export function caixaDoBordero(b: { status?: string | null; valor_total: number; valor_pago?: number | null; valor_juros?: number | null; valor_multa?: number | null; valor_desconto?: number | null }): number {
  const liquidado = Number(b.valor_pago ?? (b.status === "pago" ? b.valor_total : 0));
  if (b.status !== "pago") return centavos(Math.max(0, Number(b.valor_total) - liquidado));
  return centavos(liquidado + Number(b.valor_juros ?? 0) + Number(b.valor_multa ?? 0) - Number(b.valor_desconto ?? 0));
}

/**
 * Parte do valor já pago de um título que ainda não tem linha do extrato. O CP guarda só o total pago (dois parciais de
 * 4.000 e 6.000 viram "pago 10.000"), então cada linha do banco cobre um pedaço: o título aceita linhas até cobrir o que
 * foi pago, sem somar pagamento de novo. Linha ligada a vários títulos (borderô, boleto agrupado) cobre o título inteiro.
 */
export function pagoSemExtrato(valorPago: number, linhasVinculadas: { valor: number; titulos: number }[]): number {
  let coberto = 0;
  for (const l of linhasVinculadas) {
    if (l.titulos > 1) return 0;
    coberto += Math.abs(l.valor);
  }
  return centavos(Math.max(0, valorPago - coberto));
}

type TransacaoExtrato = { data: string; valor: number; descricao: string | null; tipo?: string | null };
const chaveConteudo = (t: TransacaoExtrato) =>
  [t.data.slice(0, 10), Math.round(Math.abs(Number(t.valor)) * 100), (t.tipo ?? "").toLowerCase(),
    (t.descricao ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()].join("|");

/**
 * Reimportação de OFX com FITID novo (Cresol e outros bancos geram um código diferente a cada exportação): a linha do
 * arquivo que já existe na conta com a mesma data, valor, tipo e descrição é a MESMA transação e não entra de novo.
 * Casamento por contagem — dois PIX iguais no mesmo dia no arquivo e dois no banco casam os dois; dois no arquivo e um
 * no banco deixam um entrar. Devolve os ids das linhas novas que já existem.
 */
export function linhasJaImportadas<N extends TransacaoExtrato & { id: string }>(novas: N[], existentes: TransacaoExtrato[]): Set<string> {
  const saldo = new Map<string, number>();
  for (const e of existentes) saldo.set(chaveConteudo(e), (saldo.get(chaveConteudo(e)) ?? 0) + 1);
  const repetidas = new Set<string>();
  for (const n of novas) {
    const k = chaveConteudo(n);
    const resto = saldo.get(k) ?? 0;
    if (resto > 0) { repetidas.add(n.id); saldo.set(k, resto - 1); }
  }
  return repetidas;
}

/**
 * Linha informativa de SALDO do extrato (Itaú manda "SALDO TOTAL DISPONÍVEL DIA" e "SALDO ANTERIOR" como transações no
 * OFX): não é entrada nem saída de dinheiro e não pode virar título nem ser conciliada. Achado 30/10/2026: 74 títulos
 * de "recebimento" (R$ 19,5 mi) num cliente criados a partir dessas linhas.
 */
export function ehLinhaSaldo(descricao: string | null | undefined): boolean {
  return /^\s*(SALDO\s+(TOTAL|ANTERIOR|DO\s+DIA|DISPON|FINAL|INICIAL|BLOQUEADO|EM\s+C)|SDO\s+(CTA|ANT|DIA))/i.test(descricao ?? "");
}
