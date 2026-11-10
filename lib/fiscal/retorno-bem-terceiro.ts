// Devolução/retorno de bem de TERCEIRO que a fazenda recebeu (comodato, empréstimo para uso, demonstração, conserto).
// Regra única para o sistema todo: o CFOP da remessa recebida define o CFOP do retorno; esses retornos não geram
// Conta a Receber (não houve compra) e só a devolução de bem do ativo (5555/6555) é "CFOP de devolução" (finNFe 4).

/** CFOP da remessa recebida (como vem no XML do remetente, 5/6xxx, ou na escrituração de entrada, 1/2xxx) → retorno. */
export const RETORNO_DE_REMESSA: Record<string, string> = {
  "5908": "5909", "6908": "6909", "1908": "5909", "2908": "6909",   // comodato
  "5554": "5555", "6554": "6555", "1554": "5555", "2554": "6555",   // bem do ativo de terceiro, recebido para uso
  "5912": "5913", "6912": "6913", "1912": "5913", "2912": "6913",   // demonstração
  "5915": "5916", "6915": "6916", "1915": "5916", "2915": "6916",   // conserto ou reparo
};

export const CFOPS_RETORNO_BEM_TERCEIRO = new Set(["5909", "6909", "5555", "6555", "5913", "6913", "5916", "6916"]);

const NATUREZA: Record<string, string> = {
  "5909": "Retorno de bem recebido em comodato", "6909": "Retorno de bem recebido em comodato",
  "5555": "Devolução de bem do ativo de terceiro", "6555": "Devolução de bem do ativo de terceiro",
  "5913": "Retorno de mercadoria recebida para demonstração", "6913": "Retorno de mercadoria recebida para demonstração",
  "5916": "Retorno de mercadoria recebida para conserto", "6916": "Retorno de mercadoria recebida para conserto",
};

const p4 = (cfop?: string | null) => String(cfop ?? "").replace(/\D/g, "").slice(0, 4);

export const ehRetornoBemTerceiro = (cfop?: string | null) => CFOPS_RETORNO_BEM_TERCEIRO.has(p4(cfop));

/** Natureza da NF quando todos os itens são retorno de bem de terceiro; senão null (devolução de compra). */
export function naturezaDoRetorno(cfops: string[]): string | null {
  if (!cfops.length || !cfops.every(ehRetornoBemTerceiro)) return null;
  return NATUREZA[p4(cfops[0])] ?? null;
}

/** finNFe: 5555/6555 entram na lista de CFOP de devolução da SEFAZ (4); 5909/5913/5916 são NF normal (1). */
export function finalidadeDoRetorno(cfops: string[]): "1" | "4" {
  return cfops.length && cfops.every(c => ["5909", "6909", "5913", "6913", "5916", "6916"].includes(p4(c))) ? "1" : "4";
}
