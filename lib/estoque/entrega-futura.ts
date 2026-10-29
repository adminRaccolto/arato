// Compra para entrega futura: a NF de simples faturamento (VEF, CFOP 5922/6922) deixa o produto como saldo de terceiro
// (estoque_terceiros, em nome do fornecedor) e as NFs de remessa (5116/5117) baixam esse saldo e dão entrada no
// estoque. Esta regra decide QUANTO de QUAL faturamento cada item da remessa baixa: os faturamentos escolhidos (ou, sem
// escolha, todos do fornecedor), do mais antigo para o mais novo, passando ao próximo quando um acaba.

export type SaldoVef = { id: string; nf_entrada_id: string | null; insumo_id: string | null; quantidade_saldo: number; created_at?: string | null };
export type ItemRemessa = { item_id: string; insumo_id: string; quantidade: number };
export type Baixa = { estoque_terceiro_id: string; vef_nf_entrada_id: string | null; item_id: string; insumo_id: string; quantidade: number };

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function alocarRemessa(saldos: SaldoVef[], itens: ItemRemessa[], vefNfIds?: string[] | null): { baixas: Baixa[]; sobras: { item_id: string; insumo_id: string; quantidade: number }[] } {
  const disp = new Map(saldos.map(s => [s.id, Math.max(0, Number(s.quantidade_saldo) || 0)]));
  const ordem = [...saldos]
    .filter(s => !vefNfIds?.length || (s.nf_entrada_id && vefNfIds.includes(s.nf_entrada_id)))
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const baixas: Baixa[] = [], sobras: { item_id: string; insumo_id: string; quantidade: number }[] = [];
  for (const it of itens) {
    let falta = r4(it.quantidade);
    for (const s of ordem) {
      if (falta <= 0) break;
      if (s.insumo_id !== it.insumo_id) continue;
      const tem = disp.get(s.id) ?? 0;
      if (tem <= 0) continue;
      const q = r4(Math.min(tem, falta));
      baixas.push({ estoque_terceiro_id: s.id, vef_nf_entrada_id: s.nf_entrada_id, item_id: it.item_id, insumo_id: it.insumo_id, quantidade: q });
      disp.set(s.id, r4(tem - q));
      falta = r4(falta - q);
    }
    if (falta > 0.0001) sobras.push({ item_id: it.item_id, insumo_id: it.insumo_id, quantidade: falta });
  }
  return { baixas, sobras };
}

/** Status do saldo de terceiro depois da baixa (ou do estorno). */
export const statusSaldoVef = (original: number, saldo: number) => saldo <= 0.0001 ? "encerrado" : saldo >= original - 0.0001 ? "aberto" : "parcial";
