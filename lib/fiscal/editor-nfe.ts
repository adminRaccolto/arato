/** Navegação compartilhada; as regras fiscais continuam nas rotinas de cada operação. */
export const ABAS_EMISSAO_NFE = [
  { id: "emitente", label: "Emitente" },
  { id: "destinatario", label: "Destinatário" },
  { id: "itens", label: "Itens e tributos" },
  { id: "transporte", label: "Transporte" },
  { id: "referencias", label: "Referências e observações" },
  { id: "origem", label: "Origem da operação" },
] as const;
export type AbaEmissaoNfe = (typeof ABAS_EMISSAO_NFE)[number]["id"];
export function moverAbaEmissao(
  atual: AbaEmissaoNfe,
  direcao: -1 | 1,
  circular = false,
): AbaEmissaoNfe {
  const i = ABAS_EMISSAO_NFE.findIndex((a) => a.id === atual) + direcao;
  const n = ABAS_EMISSAO_NFE.length;
  return ABAS_EMISSAO_NFE[
    circular ? (i + n) % n : Math.max(0, Math.min(n - 1, i))
  ].id;
}
