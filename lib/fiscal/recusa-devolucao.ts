// Devolução de compra RECUSADA pelo fornecedor (13/11/2026). A NF-e de devolução foi autorizada, mas o fornecedor não
// aceitou a mercadoria. Dois caminhos, conforme o prazo:
//   • até 24 h da autorização (e a mercadoria não saiu): cancela a NF-e — o cancelamento já desfaz estoque e financeiro;
//   • depois disso (ou a mercadoria saiu e voltou): a fazenda emite uma NF-e de ENTRADA própria, referenciando a chave
//     da devolução, com os mesmos itens, valores, desconto e ICMS — a mercadoria volta ao estoque, os títulos da compra
//     voltam como estavam e o saldo da NF de compra fica livre para uma devolução nova.
// Regras puras aqui (testadas em recusa-devolucao.test.ts); banco e SEFAZ em app/api/fiscal/devolucao-recusada.

export type DestinatarioRetorno = {
  nome: string; cpf_cnpj?: string; ie?: string; logradouro?: string; numero?: string; bairro?: string;
  municipio_ibge?: string; municipio_nome?: string; uf?: string; cep?: string;
};
export type ItemDevolucaoXml = {
  descricao: string; ncm: string; cfop: string; unidade: string; quantidade: number; valor_unitario: number;
  valor_desconto: number; valor_produto: number; cst: string | null; pICMS: number | null; pRedBC: number | null;
};
export type ItemRetorno = {
  descricao: string; ncm: string; cfop: string; unidade: string; quantidade: number; valor_unitario: number;
  valor_desconto?: number; cst_icms?: string; pICMS?: number; pRedBC?: number;
};

export const PRAZO_CANCELAMENTO_HORAS = 24;
export const NATUREZA_RETORNO = "Retorno de mercadoria recusada pelo destinatario";

const tag = (bloco: string, nome: string) => bloco.match(new RegExp(`<${nome}>([^<]*)</${nome}>`))?.[1]?.trim() ?? "";
const bloco = (xml: string, nome: string) => xml.match(new RegExp(`<${nome}\\b[^>]*>([\\s\\S]*?)</${nome}>`))?.[1] ?? "";
const num = (v: string) => (v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Endereço genérico gravado quando o cadastro estava incompleto ("NAO INFORMADO", CEP zerado): conta como vazio. */
export function valorInformado(v: string | null | undefined): string | undefined {
  const s = String(v ?? "").trim();
  if (!s || /^n[aã]o informado$/i.test(s) || /^0+$/.test(s.replace(/\D/g, "")) && s.replace(/\D/g, "").length === s.length) return undefined;
  return s;
}

/** Lê do XML autorizado da devolução: o destinatário (fornecedor), os itens com o ICMS e a hora da autorização. */
export function lerXmlDevolucao(xml: string | null | undefined): { dest: DestinatarioRetorno | null; itens: ItemDevolucaoXml[]; autorizadaEm: string | null } {
  if (!xml) return { dest: null, itens: [], autorizadaEm: null };
  const d = bloco(xml, "dest");
  const end = bloco(d, "enderDest");
  const dest: DestinatarioRetorno | null = d ? {
    nome: tag(d, "xNome"),
    cpf_cnpj: tag(d, "CNPJ") || tag(d, "CPF") || undefined,
    ie: valorInformado(tag(d, "IE")),
    logradouro: valorInformado(tag(end, "xLgr")),
    numero: valorInformado(tag(end, "nro")),
    bairro: valorInformado(tag(end, "xBairro")),
    municipio_ibge: valorInformado(tag(end, "cMun")),
    // xMun igual à UF ("MT") é o preenchimento de quando faltava o município no cadastro
    municipio_nome: tag(end, "xMun") && tag(end, "xMun") !== tag(end, "UF") ? valorInformado(tag(end, "xMun")) : undefined,
    uf: valorInformado(tag(end, "UF")),
    cep: valorInformado(tag(end, "CEP")),
  } : null;
  const itens = [...xml.matchAll(/<det\b[^>]*>([\s\S]*?)<\/det>/g)].map(m => {
    const prod = bloco(m[1], "prod");
    const icms = bloco(m[1], "ICMS");
    return {
      descricao: tag(prod, "xProd"),
      ncm: tag(prod, "NCM"),
      cfop: tag(prod, "CFOP"),
      unidade: tag(prod, "uCom"),
      quantidade: Number(tag(prod, "qCom")) || 0,
      valor_unitario: Number(tag(prod, "vUnCom")) || 0,
      valor_desconto: Number(tag(prod, "vDesc")) || 0,
      valor_produto: Number(tag(prod, "vProd")) || 0,
      cst: tag(icms, "CST") || null,
      pICMS: num(tag(icms, "pICMS")),
      pRedBC: num(tag(icms, "pRedBC")),
    };
  });
  const prot = bloco(xml, "infProt");
  return { dest, itens, autorizadaEm: tag(prot, "dhRecbto") || null };
}

/** Prazo de cancelamento: 24 h da autorização. Sem a hora da autorização, considera fora do prazo. */
export function prazoCancelamento(autorizadaEm: string | null | undefined, agora = new Date()): { dentro: boolean; limite: Date | null } {
  const t = autorizadaEm ? new Date(autorizadaEm).getTime() : NaN;
  if (!Number.isFinite(t)) return { dentro: false, limite: null };
  const limite = new Date(t + PRAZO_CANCELAMENTO_HORAS * 3600_000);
  return { dentro: agora.getTime() < limite.getTime(), limite };
}

/** CFOP sugerido para a entrada de retorno: outra entrada não especificada, no mesmo âmbito da devolução. */
export function cfopRetornoSugerido(cfopDevolucao: string | null | undefined): string {
  const c = String(cfopDevolucao ?? "").replace(/\D/g, "");
  return c.startsWith("6") ? "2949" : c.startsWith("7") ? "3949" : "1949";
}

// CFOPs de entrada que a SEFAZ trata como devolução (exigem finNFe 4). Os demais (1949 etc.) vão como NF normal.
const CFOPS_ENTRADA_DEVOLUCAO = new Set([
  "1201", "1202", "1203", "1204", "1208", "1209", "1410", "1411", "1503", "1504", "1553", "1660", "1661", "1662", "1918", "1919",
  "2201", "2202", "2203", "2204", "2208", "2209", "2410", "2411", "2503", "2504", "2553", "2660", "2661", "2662", "2918", "2919",
  "3201", "3202", "3211", "3503", "3553",
]);
export const finalidadeRetorno = (cfop: string): "1" | "4" => (CFOPS_ENTRADA_DEVOLUCAO.has(cfop.replace(/\D/g, "")) ? "4" : "1");

// CSTs que a emissão sabe montar (lib/nfe/builder.ts icmsRulePorCst)
const CSTS_SUPORTADOS = new Set(["00", "20", "40", "41", "50", "51", "60"]);

/**
 * Itens da NF-e de entrada: os mesmos da devolução (descrição, NCM, unidade, quantidade, valor unitário cheio e desconto),
 * com o CFOP do retorno e o MESMO ICMS da devolução — o retorno anula o efeito dela. CST que a emissão não sabe montar
 * vira erro (sem ele, o padrão do CFOP poderia destacar imposto que a devolução não destacou).
 */
export function itensDoRetorno(itens: ItemDevolucaoXml[], cfop: string): { itens: ItemRetorno[]; erro: string | null } {
  const c = cfop.replace(/\D/g, "");
  const out: ItemRetorno[] = [];
  for (const i of itens) {
    const cst = (i.cst ?? "").slice(-2);
    if (!cst || !CSTS_SUPORTADOS.has(cst)) return { itens: [], erro: `O item "${i.descricao}" da devolução saiu com CST ${i.cst ?? "não identificado"} de ICMS, que esta emissão não monta. Fale com o suporte antes de emitir o retorno.` };
    out.push({
      descricao: i.descricao, ncm: i.ncm, cfop: c, unidade: i.unidade, quantidade: i.quantidade, valor_unitario: i.valor_unitario,
      ...(i.valor_desconto > 0 ? { valor_desconto: i.valor_desconto } : {}),
      cst_icms: cst,
      ...(["00", "20", "51"].includes(cst) && i.pICMS != null ? { pICMS: i.pICMS } : {}),
      ...(cst === "20" && i.pRedBC != null ? { pRedBC: i.pRedBC } : {}),
    });
  }
  return { itens: out, erro: out.length ? null : "O XML da devolução não tem itens." };
}

export function validarRecusa(p: { motivo: string; cfop: string }): string | null {
  if (p.motivo.trim().length < 10) return "Descreva o motivo da recusa (mínimo 10 caracteres).";
  const c = p.cfop.replace(/\D/g, "");
  if (!/^[123]\d{3}$/.test(c)) return "O CFOP do retorno é de entrada: começa com 1 (dentro do estado), 2 (outro estado) ou 3 (exterior).";
  return null;
}

/** Informações complementares da NF-e de entrada. */
export function infCplRetorno(p: { numero: string; serie: string; chave: string; motivo: string; destinatario: string }): string {
  return `Retorno de mercadoria da NF-e de devolucao ${p.numero}/${p.serie} (chave ${p.chave}), recusada por ${p.destinatario}. Motivo da recusa: ${p.motivo.trim()}`.slice(0, 2000);
}

/** Valor total da NF-e (Σ vProd − Σ vDesc), para o Monitor. */
export const totalDosItens = (itens: ItemDevolucaoXml[]) => Math.round(itens.reduce((s, i) => s + i.valor_produto - i.valor_desconto, 0) * 100) / 100;
