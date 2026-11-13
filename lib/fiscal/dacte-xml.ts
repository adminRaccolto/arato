// DACTE de CT-e recebido (Notas de Fornecedores): monta os dados do DACTE (lib/fiscal/dacte.ts) a partir do XML do CT-e
// (modelo 57, leiaute 4.00) ou, sem XML (CT-e lançado à mão), a partir do registro em cte_entradas.
import type { DadosDacte, TomadorTipo } from "./dacte";

const bloco = (xml: string, nome: string) => xml.match(new RegExp(`<${nome}\\b[^>]*>([\\s\\S]*?)</${nome}>`))?.[1] ?? "";
const tag = (xml: string, nome: string) => xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1]?.trim() ?? "";
const n = (v: string) => Number(v) || 0;
const fmtDoc = (d: string) => {
  const x = d.replace(/\D/g, "");
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
};

const TOMA: Record<string, TomadorTipo> = { "0": "remetente", "1": "expedidor", "2": "recebedor", "3": "destinatario", "4": "outros" };

/** Participante do XML (emit/rem/exped/receb/dest/toma4) nas colunas <pref>_nome, <pref>_cnpj... que o DACTE lê. */
function participante(xml: string, grupo: string, ender: string, pref: string): Record<string, string> {
  const b = bloco(xml, grupo);
  if (!b) return {};
  const e = bloco(b, ender);
  return {
    [`${pref}_nome`]: tag(b, "xNome"), [`${pref}_cnpj`]: fmtDoc(tag(b, "CNPJ") || tag(b, "CPF")), [`${pref}_ie`]: tag(b, "IE"),
    [`${pref}_logradouro`]: [tag(e, "xLgr"), tag(e, "xCpl")].filter(Boolean).join(" - "), [`${pref}_numero`]: tag(e, "nro"),
    [`${pref}_bairro`]: tag(e, "xBairro"), [`${pref}_cep`]: tag(e, "CEP"), [`${pref}_municipio`]: tag(e, "xMun"), [`${pref}_uf`]: tag(e, "UF"),
    [`${pref}_ibge`]: tag(e, "cMun"),
  };
}

/** ICMS do CT-e: o primeiro grupo dentro de <ICMS> (ICMS00, 20, 45, 60, 90, OutraUF, SN). */
function icms(xml: string) {
  const i = bloco(bloco(xml, "imp"), "ICMS");
  const cst = tag(i, "CST");
  const base = n(tag(i, "vBC") || tag(i, "vBCOutraUF") || tag(i, "vBCSTRet"));
  const aliq = n(tag(i, "pICMS") || tag(i, "pICMSOutraUF") || tag(i, "pICMSSTRet"));
  const valor = n(tag(i, "vICMS") || tag(i, "vICMSOutraUF") || tag(i, "vICMSSTRet"));
  const red = tag(i, "pRedBC") || tag(i, "pRedBCOutraUF");
  return { cst, base, aliq, valor, pRedBC: red ? n(red) : null };
}

/** Peso bruto em kg: a quantidade em KG (cUnid 01) ou em toneladas (cUnid 02). */
function pesoKg(xml: string): number {
  const qs = [...bloco(xml, "infCarga").matchAll(/<infQ>([\s\S]*?)<\/infQ>/g)].map(m => ({ un: tag(m[1], "cUnid"), q: n(tag(m[1], "qCarga")) }));
  const kg = qs.find(q => q.un === "01");
  if (kg) return kg.q;
  const t = qs.find(q => q.un === "02");
  return t ? t.q * 1000 : 0;
}

export type DacteDoXml = { dados: DadosDacte; rntrc: string | null };

export function dacteDoXml(xml: string, status = "autorizado"): DacteDoXml | null {
  const inf = bloco(xml, "infCte");
  if (!inf) return null;
  const ide = bloco(inf, "ide");
  const tpToma = tag(bloco(ide, "toma4"), "toma") || tag(bloco(ide, "toma3"), "toma") || "0";
  const imposto = icms(inf);
  const chave = xml.match(/Id="CTe(\d{44})"/)?.[1] ?? tag(xml, "chCTe");
  const rem = participante(inf, "rem", "enderReme", "remetente");
  const dest = participante(inf, "dest", "enderDest", "destinatario");
  const emit = bloco(inf, "emit");
  const prot = bloco(xml, "infProt");
  const nfes = [...bloco(inf, "infDoc").matchAll(/<chave>(\d{44})<\/chave>/g)].map(m => m[1]);
  const vPrest = bloco(inf, "vPrest");
  const dados = {
    numero_cte: tag(ide, "nCT"), serie: tag(ide, "serie"), chave_acesso: chave || null,
    data_emissao: tag(ide, "dhEmi").slice(0, 10), status, tipo_cte: tag(ide, "tpCTe") === "3" ? "substituto" : "normal",
    cfop: tag(ide, "CFOP"), natureza_operacao: tag(ide, "natOp"), tomador_tipo: TOMA[tpToma] ?? "remetente",
    emitente_razao_social: tag(emit, "xNome"), emitente_cnpj: fmtDoc(tag(emit, "CNPJ") || tag(emit, "CPF")),
    remetente_nome: rem.remetente_nome ?? "", remetente_cnpj: rem.remetente_cnpj ?? null, remetente_ie: rem.remetente_ie ?? null,
    destinatario_nome: dest.destinatario_nome ?? "", destinatario_cnpj: dest.destinatario_cnpj ?? null, destinatario_ie: dest.destinatario_ie ?? null,
    municipio_origem: tag(ide, "xMunIni"), uf_origem: tag(ide, "UFIni"), municipio_destino: tag(ide, "xMunFim"), uf_destino: tag(ide, "UFFim"),
    produto_descricao: tag(bloco(inf, "infCarga"), "proPred"), ncm: null,
    peso_bruto_kg: pesoKg(inf), peso_liquido_kg: pesoKg(inf), valor_mercadoria: n(tag(bloco(inf, "infCarga"), "vCarga")),
    valor_frete: n(tag(vPrest, "vTPrest")), base_calc_icms: imposto.base, aliquota_icms: imposto.aliq, cst_icms: imposto.cst || null,
    pred_bc_icms: imposto.pRedBC, valor_icms: imposto.valor,
    nfe_chave: nfes.join(", ") || null, protocolo_autorizacao: tag(prot, "nProt") || null, observacao: tag(bloco(inf, "compl"), "xObs") || null,
    ...participante(inf, "exped", "enderExped", "expedidor"),
    ...participante(inf, "receb", "enderReceb", "recebedor"),
    ...participante(bloco(ide, "toma4") ? ide : "", "toma4", "enderToma", "tomador"),
  } as DadosDacte;
  return { dados, rntrc: tag(bloco(inf, "rodo"), "RNTRC") || null };
}

/** CT-e lançado à mão (sem XML): DACTE montado com o que foi cadastrado. */
export function dacteDoRegistro(r: Record<string, unknown>): DacteDoXml {
  const s = (k: string) => (r[k] == null ? "" : String(r[k]));
  const tom = s("tomador_tipo");
  return {
    rntrc: null,
    dados: {
      numero_cte: s("numero"), serie: s("serie"), chave_acesso: s("chave") || null, data_emissao: s("data_emissao").slice(0, 10),
      status: /^cancelad/.test(s("status")) ? "cancelado" : "autorizado", tipo_cte: "normal",
      cfop: s("cfop"), natureza_operacao: s("natureza_operacao"),
      tomador_tipo: (["remetente", "destinatario", "expedidor", "recebedor", "outros"].includes(tom) ? tom : "destinatario") as TomadorTipo,
      emitente_razao_social: s("emitente_nome"), emitente_cnpj: s("emitente_cnpj") ? fmtDoc(s("emitente_cnpj")) : null,
      remetente_nome: s("remetente_nome"), remetente_cnpj: s("remetente_cnpj") || null,
      destinatario_nome: s("destinatario_nome"), destinatario_cnpj: s("destinatario_cnpj") || null,
      municipio_origem: s("municipio_origem"), uf_origem: s("uf_origem"), municipio_destino: s("municipio_destino"), uf_destino: s("uf_destino"),
      produto_descricao: s("produto_descricao"), ncm: null, peso_bruto_kg: Number(r.peso_kg) || 0, peso_liquido_kg: Number(r.peso_kg) || 0,
      valor_mercadoria: Number(r.valor_mercadoria) || 0, valor_frete: Number(r.valor_prestacao) || 0,
      base_calc_icms: 0, aliquota_icms: 0, cst_icms: null, pred_bc_icms: null, valor_icms: Number(r.valor_icms) || 0,
      nfe_chave: Array.isArray(r.nfe_chaves) ? (r.nfe_chaves as string[]).join(", ") : null, protocolo_autorizacao: null,
      observacao: ["Impresso a partir dos dados lançados no Arato (CT-e sem XML).", s("observacao")].filter(Boolean).join(" "),
      tomador_nome: s("tomador_nome"), tomador_cnpj: s("tomador_cnpj"),
    } as DadosDacte,
  };
}
