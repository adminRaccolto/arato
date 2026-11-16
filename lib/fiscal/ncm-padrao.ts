// Padrões do agro na Tributação NCM (Parâmetros do Sistema), 16/11/2026. Antes o botão só trazia os 7 NCMs de grão de MT;
// NCM de semente, insumo, peça ou animal tinha de ser digitado um a um, e a NF-e (recusa, devolução, remessa) travava
// quando o emitente é contribuinte de IBS/CBS e o NCM não estava na tabela. Agora é um catálogo do setor, por grupo:
//  · Grãos (venda): tributação completa de MT — ICMS diferido/base reduzida, PIS/COFINS zero, IBS/CBS 200/200036.
//  · Produção animal e outros produtos in natura: IBS/CBS 200/200036 (redução de 60%).
//  · Insumos do Anexo IX da LC 214/2025 (art. 138) — sementes, fertilizantes, corretivos, defensivos, inoculantes,
//    vacinas veterinárias, rações, reprodutores: IBS/CBS 200/200038 (redução de 60%).
//  · Peças, pneus e máquinas: IBS/CBS de tributação integral 000/000001.
// Fora dos grãos, o catálogo NÃO define ICMS, PIS nem COFINS (CST em branco): isso depende da operação (Conv. ICMS
// 100/97 prorrogado até 31/12/2027 pelo Conv. 79/2025, isenção interna do art. 115 do Anexo IV do RICMS/MT, devolução
// que repete a nota de origem…) e quem decide é a operação fiscal (lib/fiscal/tributacao-nfe.ts). Combustíveis ficam de
// fora: IBS/CBS monofásico (CST 620), que a emissão ainda não monta. Códigos NCM conferidos nas notas reais de
// fornecedores; alíquotas de IBS/CBS de 2026 (0,10% / 0,90%), como a matriz da Costa Assessoria.

export type NcmCadastro = {
  ncm: string; descricao: string;
  icms_cst_interno: string; icms_cst_externo: string; icms_aliq: number; icms_base_reduzida_pct: number;
  pis_cst: string; pis_aliq: number; cofins_cst: string; cofins_aliq: number;
  cfop_dentro: string; cfop_fora: string;
  ibs_estadual_aliq: number; ibs_municipal_aliq: number; cbs_aliq: number; ibs_cbs_reducao_pct: number;
  ibs_cbs_cst: string; ibs_cbs_cclasstrib: string; inf_cpl: string;
};

// ─── Presets NCM — Mato Grosso ────────────────────────────────────────────────
// ICMS: diferido (CST 051) nas operações internas; base reduzida 61,11% (CST 020) nas interestaduais
// Fundamento: RICMS/MT + Convênio ICMS 100/97
// PIS/COFINS: CST 06 (alíquota zero) — Lei 10.925/2004 para grãos
// IBS/CBS: CST 200 / cClassTrib 200036, redução de 60% — produto agropecuário in natura (LC 214/2025,
// art. 137), conforme tabela trazida pelo dono em 13/11/2026. Só vale para emitente marcado como
// contribuinte de IBS/CBS em Parâmetros → Fiscal; não contribuinte emite sem IBS/CBS.
export const NCM_PRESETS_MT: NcmCadastro[] = [
  {
    ncm: "12019000", descricao: "Soja em grão",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 0.1, ibs_municipal_aliq: 0, cbs_aliq: 0.9,
    ibs_cbs_reducao_pct: 60,
    ibs_cbs_cst: '200', ibs_cbs_cclasstrib: '200036',
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT (Dec. 2.993/2010). Nas saídas interestaduais, base de cálculo reduzida a 61,11% (alíquota efetiva: 7,33%) — Conv. ICMS 100/97. PIS/COFINS: alíquota zero — Art. 1º, I da Lei 10.925/2004.",
  },
  {
    ncm: "10059010", descricao: "Milho em grão",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 0.1, ibs_municipal_aliq: 0, cbs_aliq: 0.9,
    ibs_cbs_reducao_pct: 60,
    ibs_cbs_cst: '200', ibs_cbs_cclasstrib: '200036',
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT (Dec. 2.993/2010). Nas saídas interestaduais, base de cálculo reduzida a 61,11% (alíquota efetiva: 7,33%) — Conv. ICMS 100/97. PIS/COFINS: alíquota zero — Art. 1º, I da Lei 10.925/2004.",
  },
  {
    ncm: "52010020", descricao: "Algodão em pluma",
    icms_cst_interno: "041", icms_cst_externo: "041",
    icms_aliq: 0, icms_base_reduzida_pct: 100,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 0.1, ibs_municipal_aliq: 0, cbs_aliq: 0.9,
    ibs_cbs_reducao_pct: 60,
    ibs_cbs_cst: '200', ibs_cbs_cclasstrib: '200036',
    inf_cpl: "Operação não tributada pelo ICMS conforme RICMS/MT. PIS/COFINS: alíquota zero — Lei 10.925/2004.",
  },
  {
    ncm: "12072900", descricao: "Caroço de algodão (exceto semeadura)",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 0.1, ibs_municipal_aliq: 0, cbs_aliq: 0.9,
    ibs_cbs_reducao_pct: 60,
    ibs_cbs_cst: '200', ibs_cbs_cclasstrib: '200036',
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT. Base de cálculo reduzida a 61,11% nas interestaduais — Conv. ICMS 100/97. PIS/COFINS: alíquota zero.",
  },
  {
    ncm: "10079000", descricao: "Sorgo em grão",
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 0.1, ibs_municipal_aliq: 0, cbs_aliq: 0.9,
    ibs_cbs_reducao_pct: 60,
    ibs_cbs_cst: '200', ibs_cbs_cclasstrib: '200036',
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT. Base de cálculo reduzida a 61,11% nas interestaduais — Conv. ICMS 100/97. PIS/COFINS: alíquota zero.",
  },
  {
    ncm: "10019900", descricao: "Trigo comum em grão (exceto semeadura)",
    // Interno: diferido no MT (RICMS/MT). Externo: base reduzida Conv. ICMS 100/97 — trigo listado explicitamente na Cláusula 1ª §2°
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 0.1, ibs_municipal_aliq: 0, cbs_aliq: 0.9,
    ibs_cbs_reducao_pct: 60,
    ibs_cbs_cst: '200', ibs_cbs_cclasstrib: '200036',
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT. Nas saídas interestaduais, base de cálculo reduzida a 61,11% (alíquota efetiva: 7,33%) — Conv. ICMS 100/97 (trigo em grão incluído na Cláusula 1ª, §2°). PIS/COFINS: alíquota zero — Lei 10.925/2004.",
  },
  {
    ncm: "10011900", descricao: "Trigo duro em grão (exceto semeadura)",
    // Trigo duro (1001.19.00) — não é semente: semente de trigo comum é 1001.91.00. ICMS igual ao trigo em grão.
    icms_cst_interno: "051", icms_cst_externo: "020",
    icms_aliq: 12, icms_base_reduzida_pct: 61.11,
    pis_cst: "06", pis_aliq: 0,
    cofins_cst: "06", cofins_aliq: 0,
    cfop_dentro: "5101", cfop_fora: "6101",
    ibs_estadual_aliq: 0.1, ibs_municipal_aliq: 0, cbs_aliq: 0.9,
    ibs_cbs_reducao_pct: 60,
    ibs_cbs_cst: '200', ibs_cbs_cclasstrib: '200036',
    inf_cpl: "ICMS diferido nas operações internas — RICMS/MT. Nas saídas interestaduais, base de cálculo reduzida a 61,11% (alíquota efetiva: 7,33%) — Conv. ICMS 100/97. PIS/COFINS: alíquota zero — Lei 10.925/2004.",
  },
];

/** Fora dos grãos: sem ICMS/PIS/COFINS próprios (a operação fiscal decide) e com o IBS/CBS do grupo. */
function semIcms(ncm: string, descricao: string, ibs: "integral" | "in_natura" | "anexo_ix"): NcmCadastro {
  const r = ibs === "integral" ? { cst: "000", classe: "000001", red: 0, txt: "" }
    : ibs === "in_natura" ? { cst: "200", classe: "200036", red: 60, txt: "IBS/CBS com redução de 60% - produto agropecuário in natura (LC 214/2025)." }
    : { cst: "200", classe: "200038", red: 60, txt: "IBS/CBS com redução de 60% - insumo agropecuário (LC 214/2025, art. 138 e Anexo IX)." };
  return {
    ncm, descricao,
    icms_cst_interno: "", icms_cst_externo: "", icms_aliq: 0, icms_base_reduzida_pct: 100,
    pis_cst: "", pis_aliq: 0, cofins_cst: "", cofins_aliq: 0,
    cfop_dentro: "", cfop_fora: "",
    ibs_estadual_aliq: 0.1, ibs_municipal_aliq: 0, cbs_aliq: 0.9, ibs_cbs_reducao_pct: r.red,
    ibs_cbs_cst: r.cst, ibs_cbs_cclasstrib: r.classe, inf_cpl: r.txt,
  };
}

export type GrupoNcm = { grupo: string; itens: NcmCadastro[] };

export const PADRAO_AGRO: GrupoNcm[] = [
  { grupo: "Grãos (venda)", itens: NCM_PRESETS_MT },
  { grupo: "Produção animal e outros produtos in natura", itens: [
    semIcms("01022990", "Bovinos vivos (exceto reprodutores de raça pura)", "in_natura"),
    semIcms("12074090", "Gergelim em grão", "in_natura"),
  ] },
  { grupo: "Sementes", itens: [
    semIcms("12011000", "Soja para semeadura", "anexo_ix"),
    semIcms("10051000", "Milho para semeadura", "anexo_ix"),
    semIcms("12072100", "Algodão (caroço) para semeadura", "anexo_ix"),
    semIcms("10019100", "Trigo para semeadura", "anexo_ix"),
    semIcms("10071000", "Sorgo para semeadura", "anexo_ix"),
    semIcms("12092900", "Sementes de plantas forrageiras", "anexo_ix"),
  ] },
  { grupo: "Fertilizantes e corretivos", itens: [
    semIcms("31010000", "Adubos orgânicos e biofertilizantes", "anexo_ix"),
    semIcms("31021010", "Ureia (N > 45%)", "anexo_ix"),
    semIcms("31022100", "Sulfato de amônio", "anexo_ix"),
    semIcms("31031100", "Superfosfato (P2O5 >= 35%) - triplo", "anexo_ix"),
    semIcms("31031900", "Superfosfato simples e outros superfosfatos", "anexo_ix"),
    semIcms("31042010", "Cloreto de potássio (K2O <= 60%)", "anexo_ix"),
    semIcms("31042090", "Cloreto de potássio - outros", "anexo_ix"),
    semIcms("31049090", "Outros adubos potássicos", "anexo_ix"),
    semIcms("31052000", "Adubos NPK (nitrogênio, fósforo e potássio)", "anexo_ix"),
    semIcms("31054000", "MAP - fosfato monoamônico", "anexo_ix"),
    semIcms("31059090", "Outros adubos e fertilizantes (foliares, micronutrientes)", "anexo_ix"),
    semIcms("25210000", "Calcário agrícola (castinas, pedras calcárias)", "anexo_ix"),
  ] },
  { grupo: "Defensivos e inoculantes", itens: [
    semIcms("38089199", "Inseticidas - outros", "anexo_ix"),
    semIcms("38086990", "Inseticidas e afins - outros (posição 38.08)", "anexo_ix"),
    semIcms("38089299", "Fungicidas - outros", "anexo_ix"),
    semIcms("38089324", "Herbicidas à base de glifosato", "anexo_ix"),
    semIcms("38089329", "Herbicidas - outros", "anexo_ix"),
    semIcms("38089999", "Outros defensivos (reguladores de crescimento etc.)", "anexo_ix"),
    semIcms("30024999", "Inoculantes e microrganismos agrícolas", "anexo_ix"),
    semIcms("30029000", "Inoculantes, meios de cultura e bioinsumos", "anexo_ix"),
  ] },
  { grupo: "Pecuária: vacinas, rações e reprodutores", itens: [
    semIcms("30024290", "Vacinas veterinárias", "anexo_ix"),
    semIcms("23099090", "Rações, suplementos e premix para produção animal", "anexo_ix"),
    semIcms("01022190", "Bovinos reprodutores de raça pura", "anexo_ix"),
  ] },
  { grupo: "Peças, pneus e máquinas", itens: [
    semIcms("84099999", "Outras partes de motores diesel ou semidiesel", "integral"),
    semIcms("84329000", "Partes de máquinas agrícolas de preparo do solo e plantio", "integral"),
    semIcms("84339090", "Partes de colheitadeiras e máquinas de colheita", "integral"),
    semIcms("84212300", "Filtros de óleo ou combustível para motores", "integral"),
    semIcms("84213100", "Filtros de ar para motores", "integral"),
    semIcms("84219999", "Partes de filtros e aparelhos de filtrar", "integral"),
    semIcms("84821010", "Rolamentos de esferas", "integral"),
    semIcms("84839000", "Partes de transmissões, eixos e engrenagens", "integral"),
    semIcms("40117090", "Pneus para máquinas agrícolas", "integral"),
    semIcms("40112090", "Pneus para ônibus e caminhões", "integral"),
    semIcms("40111000", "Pneus para automóveis", "integral"),
    semIcms("84323110", "Plantadeiras e semeadoras (plantio direto)", "integral"),
    semIcms("84335100", "Colheitadeiras combinadas", "integral"),
  ] },
];

/** NCMs do padrão do agro que ainda faltam na tabela do cliente, com a contagem por grupo. Nunca repete NCM cadastrado. */
export function ncmsDoPadraoAgro(cadastrados: string[]): { novos: NcmCadastro[]; porGrupo: { grupo: string; qtd: number }[] } {
  const tem = new Set(cadastrados.map(n => String(n ?? "").replace(/\D/g, "")));
  const novos: NcmCadastro[] = [];
  const porGrupo = PADRAO_AGRO.map(g => {
    const faltam = g.itens.filter(i => !tem.has(i.ncm));
    faltam.forEach(i => tem.add(i.ncm));
    novos.push(...faltam);
    return { grupo: g.grupo, qtd: faltam.length };
  });
  return { novos, porGrupo };
}

/** Grupo do catálogo de um NCM (para mostrar na tabela), ou "" se for um NCM incluído à mão. */
export function grupoDoNcm(ncm: string): string {
  return PADRAO_AGRO.find(g => g.itens.some(i => i.ncm === ncm))?.grupo ?? "";
}
