// Textos fiscais que o emitente configura (ICMS diferido, base reduzida, Funrural) são de VENDA. Em remessa, retorno,
// transferência ou devolução eles afirmavam na nota o que não aconteceu (NF de devolução saiu com Convênio 100/97 e Funrural).
const dig = (c?: string | null) => String(c ?? "").replace(/\D/g, "").slice(0, 4);
const TRANSFERENCIA = new Set(["5151", "5152", "6151", "6152"]);
const VENDA_FORA_DO_GRUPO = new Set(["5501", "5502", "6501", "6502", "5922", "6922"]);

export function cfopDeVenda(cfop?: string | null): boolean {
  const c = dig(cfop);
  if (!/^[56]\d{3}$/.test(c) || TRANSFERENCIA.has(c)) return false;
  return /^[56](1|4)/.test(c) || VENDA_FORA_DO_GRUPO.has(c);
}

// Complementar de venda (finNFe 2) segue a regra do CFOP; NF de devolução (finNFe 4) nunca leva esses textos.
export function usaTextosDeVenda(cfops: (string | null | undefined)[], finNFe?: string | null): boolean {
  return finNFe !== "4" && cfops.some(cfopDeVenda);
}
