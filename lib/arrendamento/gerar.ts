// Gerar por Safra (Contratos de Arrendamento) — regras puras.
//
// Achado de 06/11/2026 (Habio): depois de uma limpeza parcial que apagou contratos e títulos e manteve as parcelas,
// o Gerar por Safra não refazia nada. Ele só criava contrato de grãos para parcela NOVA e, em parcela existente, só
// atualizava valores. Agora ele concilia: a parcela existe → atualiza; o contrato de grãos (pagamento em sacas) e o
// título no Contas a Pagar (pagamento em R$) que faltarem são criados de novo.

export type ParcelaArr = {
  id?: string;
  ano_safra_id?: string | null;
  commodity?: string | null;
  data_vencimento: string;
  sacas_previstas?: number | null;
  status?: string | null;
};
export type ContratoArr = { id: string; arrendamento_id?: string | null; ano_safra_id?: string | null; produto?: string | null; entregue_sc?: number | null; quantidade_sc?: number | null; data_entrega?: string | null };

const ano = (d?: string | null) => String(d ?? "").slice(0, 4);

/**
 * Parcela já gravada que corresponde à nova: mesma commodity e mesma safra; parcela antiga sem safra (a safra não
 * existia no cadastro) casa pelo ano do vencimento, e passa a ter a safra.
 */
export function parcelaExistente<T extends ParcelaArr>(existentes: T[], nova: ParcelaArr): T | undefined {
  const mesmaCommodity = (p: T) => (p.commodity ?? "") === (nova.commodity ?? "");
  return existentes.find(p => mesmaCommodity(p) && !!nova.ano_safra_id && p.ano_safra_id === nova.ano_safra_id)
    ?? existentes.find(p => mesmaCommodity(p) && !p.ano_safra_id && ano(p.data_vencimento) === ano(nova.data_vencimento));
}

/** Produto do contrato de grãos da parcela; parcela em R$ ("Soja ref.") ou sem commodity não gera contrato. */
export function produtoDoContrato(commodity?: string | null): "Soja" | "Milho" | null {
  return commodity === "Soja" ? "Soja" : commodity === "Milho" ? "Milho" : null;
}

/**
 * Contratos de grãos que faltam (criar) e os que mudaram e ainda não tiveram entrega (atualizar), um por parcela em
 * sacas ainda não paga. Parcela sem safra fica de fora: o contrato é por safra.
 */
export function conciliarContratos(parcelas: ParcelaArr[], contratos: ContratoArr[]) {
  const criar: ParcelaArr[] = [];
  const atualizar: { id: string; quantidade_sc: number; data_entrega: string }[] = [];
  for (const p of parcelas) {
    const produto = produtoDoContrato(p.commodity);
    if (!produto || !p.ano_safra_id || !(Number(p.sacas_previstas) > 0)) continue;
    if (p.status === "pago" || p.status === "cancelado") continue;
    const c = contratos.find(x => x.ano_safra_id === p.ano_safra_id && x.produto === produto);
    if (!c) { criar.push(p); continue; }
    const qtd = Number(p.sacas_previstas);
    if (!(Number(c.entregue_sc) > 0) && (Math.abs(Number(c.quantidade_sc ?? 0) - qtd) > 0.0001 || c.data_entrega !== p.data_vencimento))
      atualizar.push({ id: c.id, quantidade_sc: qtd, data_entrega: p.data_vencimento });
  }
  return { criar, atualizar };
}

/**
 * Datas de uma safra nova (anos_safra exige data_inicio — sem ela a criação falhava e a parcela ficava sem safra):
 * repete o dia e o mês da safra mais recente do cliente; sem nenhuma, 01/07 a 30/06.
 */
export function datasSafraNova(anoFim: number, existentes: { data_inicio?: string | null; data_fim?: string | null }[]) {
  const ref = [...existentes].filter(a => a.data_inicio && a.data_fim).sort((a, b) => String(b.data_inicio).localeCompare(String(a.data_inicio)))[0];
  const mdIni = ref ? String(ref.data_inicio).slice(5, 10) : "07-01";
  const mdFim = ref ? String(ref.data_fim).slice(5, 10) : "06-30";
  const fimNoAnoSeguinte = !ref || String(ref.data_fim).slice(0, 4) > String(ref.data_inicio).slice(0, 4);
  return { data_inicio: `${fimNoAnoSeguinte ? anoFim - 1 : anoFim}-${mdIni}`, data_fim: `${anoFim}-${mdFim}` };
}
