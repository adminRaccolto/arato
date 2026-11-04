// NF aproximada × romaneio do recebedor: quem não tem balança embarca com NF de peso aproximado; o destino pesa e envia
// o romaneio. O peso do romaneio é o real: ele define o título e o consumo do contrato, e a diferença a mais vira NF complementar.
type RomaneioPeso = { peso_liquido_destino?: number | null; peso_classificado_kg?: number | null; peso_liquido_kg?: number | null };
type ItemNf = { unidade?: string | null; quantidade?: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

export const pesoRealDoRomaneio = (r: RomaneioPeso) =>
  Number(r.peso_liquido_destino) > 0 ? Number(r.peso_liquido_destino)
    : Number(r.peso_classificado_kg) > 0 ? Number(r.peso_classificado_kg) : Number(r.peso_liquido_kg) || 0;

export function pesoDaNota(itens: ItemNf[] | null | undefined, kgSaca = 60): number {
  return r2((itens ?? []).reduce((s, i) => {
    const q = Number(i.quantidade) || 0;
    const u = String(i.unidade ?? "").trim().toUpperCase();
    return s + (u === "T" || u === "TON" ? q * 1000 : u === "SC" || u === "SACA" ? q * kgSaca : q);
  }, 0));
}

export type Conferencia = { peso_nf_kg: number; peso_real_kg: number; diferenca_kg: number; valor_real: number; valor_diferenca: number; situacao: "complemento" | "a_menor" | "igual" };

export function conferirNfComRomaneio(pesoNf: number, pesoReal: number, valorNf: number): Conferencia {
  const precoKg = pesoNf > 0 ? valorNf / pesoNf : 0;
  const diferenca = r2(pesoReal - pesoNf);
  return {
    peso_nf_kg: pesoNf, peso_real_kg: pesoReal, diferenca_kg: diferenca,
    valor_real: r2(pesoReal * precoKg), valor_diferenca: r2(diferenca * precoKg),
    situacao: diferenca > 0 ? "complemento" : diferenca < 0 ? "a_menor" : "igual",
  };
}

// NF direta ainda sem romaneio: pode receber o romaneio do recebedor
export const notaAguardaRomaneio = (n: { status: string; dados_nf_json?: unknown }) => {
  const dj = (n.dados_nf_json ?? {}) as Record<string, unknown>;
  return n.status === "autorizada" && dj.faturamento_direto === true && !dj.romaneio_id;
};
