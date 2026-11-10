// Tela de venda da produção (/comercial/faturamento) aberta pelo menu Documentos Fiscais → Saídas:
// "Venda por Contrato" (?modo=contrato), "Venda Avulsa" (?modo=avulsa) ou, a partir da tela Remessas, a remessa de
// grãos e o retorno de armazém geral (?modo=remessa). Cada modo mostra só as suas notas e já abre a emissão certa.

export type ModoFaturamento = "contrato" | "avulsa" | "remessa";

export const MODOS_FATURAMENTO: Record<ModoFaturamento, { titulo: string; subtitulo: string; botao: string }> = {
  contrato: { titulo: "Venda de Produção — Por Contrato", subtitulo: "NF-e de venda de grãos ligada a um contrato de venda", botao: "+ Nova NF-e por Contrato" },
  avulsa:   { titulo: "Venda de Produção — Avulsa", subtitulo: "NF-e de venda de produção agrícola sem contrato", botao: "+ Nova NF-e Avulsa" },
  remessa:  { titulo: "Remessa de Grãos e Retorno de Armazém", subtitulo: "Depósito em armazém geral, entrega futura, venda à ordem e retorno de armazém geral", botao: "+ Nova Remessa / Retorno" },
};

export function lerModoFaturamento(v: string | null | undefined): ModoFaturamento | null {
  return v === "contrato" || v === "avulsa" || v === "remessa" ? v : null;
}

const so = (cfop: string | null | undefined) => String(cfop ?? "").replace(/\D/g, "").slice(0, 4);
// Remessa/retorno: toda 59xx/69xx (armazém, simbólica, outras saídas) + faturamento antecipado e venda à ordem
const REMESSA_EXTRA = new Set(["5117", "6117", "5119", "6119"]);
/** Em qual modo da tela uma NF de saída aparece. Devolução (ex.: 5.555 de máquina de terceiro) é emitida pela
 *  Venda Avulsa até ganhar tela própria, então aparece lá. */
export function modoDaNota(n: { cfop?: string | null; dados_nf_json?: unknown }): ModoFaturamento | null {
  const c = so(n.cfop);
  if (!c) return null;
  if (c[1] === "9" || REMESSA_EXTRA.has(c)) return "remessa";
  const dj = (n.dados_nf_json ?? {}) as { contrato_id?: string | null };
  return dj.contrato_id ? "contrato" : "avulsa";
}
