// Contrato de venda com recebimento POR CARGA (29/10/2026): o contrato gera um CR "guarda-chuva" com o valor total,
// vencendo na data limite de pagamento. Cada NF-e de venda faturada contra o contrato abate desse CR o valor da carga
// (sacas da NF × preço do contrato, na moeda do contrato — funciona para contrato em US$) e vira um CR próprio, pelo
// valor da NF, vencendo na data da NF + prazo do contrato. Cancelar/desvincular a NF devolve o valor ao guarda-chuva.

export type ItemNf = { unidade?: string | null; quantidade?: number | string | null; valor_total?: number | string | null };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Kg por saca do produto (algodão é negociado em arroba de 15 kg). */
export const kgSacaDoProduto = (produto?: string | null) => /algod/i.test(produto ?? "") ? 15 : 60;

/** Sacas faturadas na NF, pelas unidades dos itens (KG, SC/SACA, T/TON, @/ARROBA). null se nenhuma unidade conhecida. */
export function sacasDaNf(itens: ItemNf[] | null | undefined, kgSaca = 60): number | null {
  let total = 0, achou = false;
  for (const i of itens ?? []) {
    const q = Number(String(i.quantidade ?? 0).replace(",", ".")) || 0;
    const u = String(i.unidade ?? "").trim().toUpperCase();
    let kg: number | null = null;
    if (u === "KG" || u === "KGS") kg = q;
    else if (u === "T" || u === "TON" || u === "TONELADA") kg = q * 1000;
    else if (u === "SC" || u === "SACA" || u === "SACAS" || u === "SC60") { total += q; achou = true; continue; }
    else if (u === "@" || u === "ARROBA" || u === "AR") kg = q * 15;
    if (kg == null) continue;
    total += kg / kgSaca; achou = true;
  }
  return achou ? r4(total) : null;
}

/**
 * Quanto a carga abate do CR guarda-chuva, na moeda do contrato. Pelas sacas × preço; sem unidade reconhecível,
 * contrato em R$ usa o valor da NF e contrato em US$ não tem como converter (null = pede valor manual).
 */
export function valorAbatimento(c: { preco: number | null; moeda?: string | null }, sacas: number | null, valorNf: number): number | null {
  if (sacas != null && Number(c.preco) > 0) return r2(sacas * Number(c.preco));
  if ((c.moeda ?? "BRL") !== "USD") return r2(valorNf);
  return null;
}

/** Vencimento do CR da carga: data da NF + prazo (dias) do contrato. */
export function vencimentoCarga(dataNf: string, prazoDias?: number | null): string {
  const d = new Date(`${dataNf.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + Math.max(0, Math.round(Number(prazoDias) || 0)));
  return d.toISOString().slice(0, 10);
}

/** Novo valor do guarda-chuva depois de abater (ou devolver, com valor negativo) uma carga. */
export function saldoGuardaChuva(valorAtual: number, abatido: number): { valor: number; status: "em_aberto" | "cancelado"; excedente: number } {
  const v = r2(valorAtual - abatido);
  if (v <= 0.005) return { valor: 0, status: "cancelado", excedente: r2(-v) };
  return { valor: v, status: "em_aberto", excedente: 0 };
}
