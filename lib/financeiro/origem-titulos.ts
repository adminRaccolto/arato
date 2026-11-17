// Nº do documento e observação de origem dos títulos do CP (17/11/2026). Antes a coluna era "Nº NF" (só número fiscal)
// e a Observação só trazia o que foi digitado no próprio título. Agora cada título lê a tela que o criou:
//   NF de produtos / NFS-e / CT-e → número da nota e a observação dela (sem o texto automático do SIEG)
//   contrato financeiro, consórcio, seguro → o nº do documento gravado no título + a observação do contrato/cota/apólice
//   compra de terra → o número do contrato, da escritura ou do registro (o título guardava o identificador interno)
//   pedido de compra → nº do pedido + observação do pedido; previsão de gastos → observação da previsão
import type { SupabaseClient } from "@supabase/supabase-js";

type Linha = Record<string, unknown>;
const v = (x: unknown) => (x == null ? "" : String(x).trim());
const ehUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Tira da observação o texto que o sistema grava sozinho na importação (SIEG, IE, tomador). Fica o que alguém escreveu. */
export function observacaoDigitada(texto: unknown): string {
  return v(texto)
    .replace(/(Re-)?importado via Sieg( DFe)? em \d{2}\/\d{2}\/\d{4}/gi, "")
    .replace(/\s*[—-]\s*IE:\s*(\d+|ISENTO)/gi, "")
    .replace(/\s*[—-]\s*Tomador:\s*\d+/gi, "")
    .replace(/\s*·\s*IE tomador:\s*\d+/gi, "")
    .replace(/^[\s|·—-]+/, "")
    .replace(/\s+$/, "");
}

/** Observação exibida: a do título e a da origem, sem repetir. */
export function juntarObservacoes(doTitulo: unknown, daOrigem: unknown): string | null {
  const a = v(doTitulo), b = observacaoDigitada(daOrigem);
  if (!a) return b || null;
  if (!b || a.includes(b)) return a;
  if (b.includes(a)) return b;
  return `${a} · ${b}`;
}

/** Nº do documento do título: número fiscal; senão o número da origem (pedido, contrato de terra); senão o gravado no título. */
export function documentoDoTitulo(p: { nfNumero?: unknown; numeroOrigem?: unknown; numeroDocumento?: unknown }): string | null {
  const nf = v(p.nfNumero), origem = v(p.numeroOrigem), doc = v(p.numeroDocumento);
  return nf || origem || (doc && !ehUuid(doc) ? doc : "") || null;
}

/**
 * Parcela do título ("3/10"): campos de parcela do título; senão "Parcela n/t" da descrição (consórcio, seguro); senão
 * "Parcela n" da descrição com o total do cronograma (contrato financeiro). Sem parcela, null.
 */
export function parcelaDoTitulo(p: { num?: unknown; total?: unknown; descricao?: unknown; totalCronograma?: number | null }): string | null {
  const n = Number(p.num), t = Number(p.total);
  if (n > 0 && t > 0) return `${n}/${t}`;
  const d = v(p.descricao);
  const nt = /\bParcela\s+(\d+)\s*\/\s*(\d+)/i.exec(d);
  if (nt) return `${Number(nt[1])}/${Number(nt[2])}`;
  const so = /—\s*Parcela\s+(\d+)\b/i.exec(d) ?? /^Parcela\s+(\d+)\b/i.exec(d);
  if (so) return p.totalCronograma ? `${Number(so[1])}/${p.totalCronograma}` : String(Number(so[1]));
  if (n > 0) return String(n);
  return null;
}

/** Descrição sem o trecho padrão de parcela ("— Parcela 6/12", "Parcela 4/7 — ", "— Parcela 3"), que vai para a coluna Parcela. */
export function descricaoSemParcela(descricao: unknown): string {
  return v(descricao)
    .replace(/^Parcela\s+\d+(\s*\/\s*\d+)?\s*—\s*/i, "")
    .replace(/\s*—\s*Parcela\s+\d+(\s*\/\s*\d+)?(?=\s*—|\s*$)/i, "")
    .trim();
}

export type DadosOrigem = { documento: string | null; observacao_origem: string | null; parcela: string | null };

async function porIds(db: SupabaseClient, tabela: string, campos: string, coluna: string, ids: unknown[]): Promise<Linha[]> {
  const lista = [...new Set(ids.filter(Boolean).map(String))];
  const out: Linha[] = [];
  for (let i = 0; i < lista.length; i += 200) {
    const { data, error } = await db.from(tabela).select(campos).in(coluna, lista.slice(i, i + 200));
    if (error) throw error;
    out.push(...((data ?? []) as unknown as Linha[]));
  }
  return out;
}

/** Para cada título (chave "origem_tabela:id"), o nº do documento e a observação da tela de origem. */
export async function carregarOrigemTitulos(db: SupabaseClient, titulos: { id: string; origem_tabela: string }[]): Promise<Map<string, DadosOrigem>> {
  const ids = (o: string) => titulos.filter(t => t.origem_tabela === o).map(t => t.id);
  const [lanc, emp] = await Promise.all([
    porIds(db, "lancamentos", "id, origem_lancamento, numero_documento, nfe_numero, nf_entrada_id, contrato_financeiro_id, consorcio_id, pedido_compra_id, previsao_gasto_id, descricao, num_parcela, total_parcelas", "id", ids("lancamentos")),
    porIds(db, "empresa_lancamentos", "id, numero_documento, nf_entrada_id, descricao, parcela_num, parcelas_total", "id", ids("empresa_lancamentos")),
  ]);
  const todos = [...lanc, ...emp];
  const docTerra = lanc.filter(l => l.origem_lancamento === "compra_terra" && ehUuid(v(l.numero_documento))).map(l => l.numero_documento);
  const apolices = lanc.filter(l => l.origem_lancamento === "seguro").map(l => l.numero_documento);
  const [nfs, nfse, ctes, contratos, consorcios, pedidos, previsoes, terras, apols, cronogramas] = await Promise.all([
    porIds(db, "nf_entradas", "id, numero, observacao", "id", todos.map(l => l.nf_entrada_id)),
    porIds(db, "nf_servicos", "id, numero_nf, observacao, lancamento_id", "lancamento_id", lanc.filter(l => l.origem_lancamento === "nf_servico").map(l => l.id)),
    porIds(db, "cte_entradas", "id, numero, observacao, lancamento_id", "lancamento_id", lanc.filter(l => l.origem_lancamento === "cte").map(l => l.id)),
    porIds(db, "contratos_financeiros", "id, observacao", "id", lanc.map(l => l.contrato_financeiro_id)),
    porIds(db, "consorcios", "id, observacao", "id", lanc.map(l => l.consorcio_id)),
    porIds(db, "pedidos_compra", "id, nr_pedido, numero, observacao", "id", lanc.map(l => l.pedido_compra_id)),
    porIds(db, "previsoes_gasto", "id, observacao", "id", lanc.map(l => l.previsao_gasto_id)),
    porIds(db, "contratos_compra_terra", "id, numero, escritura_numero, registro_numero, observacoes", "id", docTerra),
    porIds(db, "apolices_seguro", "numero_apolice, observacao", "numero_apolice", apolices),
    porIds(db, "parcelas_pagamento", "contrato_id, num_parcela", "contrato_id", lanc.filter(l => l.origem_lancamento === "contrato_financeiro").map(l => l.contrato_financeiro_id)),
  ]);
  const totalCronograma = new Map<string, number>();
  for (const c of cronogramas) totalCronograma.set(v(c.contrato_id), Math.max(totalCronograma.get(v(c.contrato_id)) ?? 0, Number(c.num_parcela) || 0));
  const ix = (rows: Linha[], k = "id") => new Map(rows.map(r => [v(r[k]), r]));
  const [mNf, mNfse, mCte, mCf, mCons, mPed, mPrev, mTerra, mApol] =
    [ix(nfs), ix(nfse, "lancamento_id"), ix(ctes, "lancamento_id"), ix(contratos), ix(consorcios), ix(pedidos), ix(previsoes), ix(terras), ix(apols, "numero_apolice")];

  const out = new Map<string, DadosOrigem>();
  const preencher = (tabela: string, l: Linha) => {
    const id = v(l.id);
    const nf = mNf.get(v(l.nf_entrada_id)), nfs1 = mNfse.get(id), cte = mCte.get(id);
    const ped = mPed.get(v(l.pedido_compra_id)), terra = mTerra.get(v(l.numero_documento));
    const origem = nf ?? nfs1 ?? cte ?? mCf.get(v(l.contrato_financeiro_id)) ?? mCons.get(v(l.consorcio_id)) ?? ped
      ?? mPrev.get(v(l.previsao_gasto_id)) ?? (l.origem_lancamento === "seguro" ? mApol.get(v(l.numero_documento)) : undefined);
    out.set(`${tabela}:${id}`, {
      documento: documentoDoTitulo({
        nfNumero: nf?.numero ?? nfs1?.numero_nf ?? cte?.numero ?? l.nfe_numero,
        numeroOrigem: (terra ? (terra.numero || terra.escritura_numero || terra.registro_numero) : null) ?? (ped ? (ped.nr_pedido || ped.numero) : null),
        numeroDocumento: l.numero_documento,
      }),
      observacao_origem: observacaoDigitada(origem?.observacao ?? terra?.observacoes) || null,
      parcela: parcelaDoTitulo({ num: l.num_parcela ?? l.parcela_num, total: l.total_parcelas ?? l.parcelas_total, descricao: l.descricao,
        totalCronograma: totalCronograma.get(v(l.contrato_financeiro_id)) ?? null }),
    });
  };
  for (const l of lanc) preencher("lancamentos", l);
  for (const l of emp) preencher("empresa_lancamentos", l);
  return out;
}
