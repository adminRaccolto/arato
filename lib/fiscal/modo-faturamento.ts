// Tela de venda da produção (/comercial/faturamento) aberta pelo menu Documentos Fiscais → Saídas:
// "Venda por Contrato" (?modo=contrato), "Venda Avulsa" (?modo=avulsa) ou, a partir da tela Remessas, a remessa de
// grãos e o retorno de armazém geral (?modo=remessa). Cada modo mostra só as suas notas e já abre a emissão certa.

export type ModoFaturamento = "contrato" | "avulsa" | "remessa" | "devolucao";

export const MODOS_FATURAMENTO: Record<ModoFaturamento, { titulo: string; subtitulo: string; botao: string }> = {
  contrato: { titulo: "Venda de Produção — Por Contrato", subtitulo: "NF-e de venda de grãos ligada a um contrato de venda", botao: "+ Nova NF-e por Contrato" },
  avulsa:   { titulo: "Venda de Produção — Avulsa", subtitulo: "NF-e de venda de produção agrícola sem contrato", botao: "+ Nova NF-e Avulsa" },
  remessa:  { titulo: "Remessa de Grãos e Retorno de Armazém", subtitulo: "Depósito em armazém geral, entrega futura, venda à ordem e retorno de armazém geral", botao: "+ Nova Remessa / Retorno" },
  devolucao: { titulo: "Devoluções", subtitulo: "Devolução de bem de terceiro recebido para uso, como máquina em comodato ou empréstimo (CFOP 5.555/6.555), referenciando a NF de remessa recebida", botao: "+ Nova Devolução" },
};

export function lerModoFaturamento(v: string | null | undefined): ModoFaturamento | null {
  return v === "contrato" || v === "avulsa" || v === "remessa" || v === "devolucao" ? v : null;
}

const so = (cfop: string | null | undefined) => String(cfop ?? "").replace(/\D/g, "").slice(0, 4);
// Remessa/retorno: toda 59xx/69xx (armazém, simbólica, outras saídas) + faturamento antecipado e venda à ordem
const REMESSA_EXTRA = new Set(["5117", "6117", "5119", "6119"]);
// Devolução emitida pela fazenda: de compra (52xx, 5410-5412, 5553, 5556) e de bem de terceiro recebido para uso (5555)
const DEVOLUCAO = /^[56](2\d\d|41[0-2]|55[356])$/;

/** Em qual modo da tela uma NF de saída aparece. */
export function modoDaNota(n: { cfop?: string | null; dados_nf_json?: unknown }): ModoFaturamento | null {
  const c = so(n.cfop);
  if (!c) return null;
  if (c[1] === "9" || REMESSA_EXTRA.has(c)) return "remessa";
  if (DEVOLUCAO.test(c)) return "devolucao";
  const dj = (n.dados_nf_json ?? {}) as { contrato_id?: string | null };
  return dj.contrato_id ? "contrato" : "avulsa";
}
