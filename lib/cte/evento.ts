/** Cancelamento oficial de CT-e (evento 110111). */
import { assinarXmlPorId, type PemPair } from "../nfe/signer";
import { gerarDhEmi } from "../nfe/builder";
import { consultarSituacaoCTe, transmitirEventoCTe } from "./transmitter";

export interface CancelamentoCTeInput {
  chave: string;
  protocolo: string;
  cpfCnpjEmitente: string;
  uf: string;
  ambiente: "producao" | "homologacao";
  justificativa: string;
}

export interface ResultadoEventoCTe {
  sucesso: boolean;
  cStat: string | null;
  xMotivo: string;
  protocolo?: string;
  dataRegistro?: string;
}

const CUF: Record<string, string> = {
  AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23", DF: "53", ES: "32", GO: "52", MA: "21",
  MG: "31", MS: "50", MT: "51", PA: "15", PB: "25", PE: "26", PI: "22", PR: "41", RJ: "33", RN: "24",
  RO: "11", RR: "14", RS: "43", SC: "42", SE: "28", SP: "35", TO: "17",
};

const digits = (value: string) => value.replace(/\D/g, "");
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function montarEventoCancelamentoCTe(input: CancelamentoCTeInput): { xml: string; id: string } {
  const chave = digits(input.chave);
  const protocolo = digits(input.protocolo);
  const emitente = digits(input.cpfCnpjEmitente);
  const justificativa = input.justificativa.trim();
  if (chave.length !== 44) throw new Error("Chave de acesso inválida para cancelamento");
  if (protocolo.length !== 15) throw new Error("Protocolo de autorização inválido ou ausente");
  if (emitente.length !== 11 && emitente.length !== 14) throw new Error("CPF/CNPJ do emitente inválido");
  if (justificativa.length < 15) throw new Error("A justificativa deve conter pelo menos 15 caracteres");

  const tpAmb = input.ambiente === "producao" ? "1" : "2";
  const tpEvento = "110111";
  const nSeqEvento = "1";
  const id = `ID${tpEvento}${chave}001`;
  const tagDoc = emitente.length === 14 ? "CNPJ" : "CPF";
  const cOrgao = CUF[input.uf.trim().toUpperCase()] ?? chave.slice(0, 2);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<eventoCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">` +
      `<infEvento Id="${id}"><cOrgao>${cOrgao}</cOrgao><tpAmb>${tpAmb}</tpAmb><${tagDoc}>${emitente}</${tagDoc}>` +
      `<chCTe>${chave}</chCTe><dhEvento>${gerarDhEmi(input.uf)}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${nSeqEvento}</nSeqEvento>` +
      `<detEvento versaoEvento="4.00"><evCancCTe><descEvento>Cancelamento</descEvento><nProt>${protocolo}</nProt><xJust>${esc(justificativa.slice(0, 255))}</xJust></evCancCTe></detEvento>` +
      `</infEvento></eventoCTe>`;
  return { xml, id };
}

function tagVal(xml: string, tag: string): string {
  return xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([^<]*)<\\/(?:[^:>]+:)?${tag}>`))?.[1] ?? "";
}

export async function cancelarCTe(pem: PemPair, input: CancelamentoCTeInput): Promise<ResultadoEventoCTe> {
  const { xml, id } = montarEventoCancelamentoCTe(input);
  const assinado = assinarXmlPorId(xml, pem, id);
  const resposta = await transmitirEventoCTe(assinado, pem, input.uf, input.ambiente);
  // 135 registra e vincula o evento. Para 218 a SEFAZ confirma que já está
  // cancelado. Já 631 só informa duplicidade: consultamos a situação oficial
  // antes de refletir qualquer alteração no banco local.
  if (resposta.cStat === "631") {
    const situacao = await consultarSituacaoCTe(input.chave, pem, input.uf, input.ambiente);
    if (situacao.cStat !== "101") {
      return {
        sucesso: false,
        cStat: resposta.cStat,
        xMotivo: `${resposta.xMotivo} A consulta posterior confirmou cStat ${situacao.cStat ?? "—"}: ${situacao.xMotivo}.`,
      };
    }
    const protocoloDuplicado = resposta.xMotivo.match(/\[nProt:\s*(\d{15})\]/i)?.[1];
    const dataDuplicada = resposta.xMotivo.match(/\[dhRegEvento:\s*([^\]]+)\]/i)?.[1];
    return {
      sucesso: true,
      cStat: resposta.cStat,
      xMotivo: "Evento de cancelamento já registrado e CT-e confirmado como cancelado na SEFAZ.",
      protocolo: protocoloDuplicado,
      dataRegistro: dataDuplicada,
    };
  }
  const sucesso = resposta.cStat === "135" || resposta.cStat === "218";
  return {
    sucesso,
    cStat: resposta.cStat,
    xMotivo: resposta.xMotivo,
    protocolo: resposta.protocolo,
    dataRegistro: resposta.dhRecbto || tagVal(resposta.xmlProt ?? "", "dhRegEvento") || undefined,
  };
}

// ─── Carta de Correção do CT-e (evento 110110 — CC-e) ───────────────────────
export interface CorrecaoCTeItem {
  grupo: string;   // grupoAlterado — ex.: "compl"
  campo: string;   // campoAlterado — ex.: "xObs"
  valor: string;   // valorAlterado — novo conteúdo
  item?: string;   // nroItemAlterado — só quando o grupo se repete (ex.: infNFe)
}

export interface CartaCorrecaoCTeInput {
  chave: string;
  cpfCnpjEmitente: string;
  uf: string;
  ambiente: "producao" | "homologacao";
  nSeqEvento: number;           // 1 a 20 — cada carta nova incrementa
  correcoes: CorrecaoCTeItem[]; // 1 a 20 itens por carta
}

export const COND_USO_CCE_CTE =
  "A Carta de Correção é disciplinada pelo Convênio SINIEF 01/2006 e pode ser utilizada para regularização de erro ocorrido na emissão de documento fiscal, desde que o erro não esteja relacionado com: I - as variáveis que determinam o valor do imposto tais como: base de cálculo, alíquota, diferença de preço, quantidade, valor da prestação;II - a correção de dados cadastrais que implique mudança do emitente, tomador, remetente ou do destinatário;III - a data de emissão ou de saída.";

export function montarEventoCCeCTe(input: CartaCorrecaoCTeInput): { xml: string; id: string } {
  const chave = digits(input.chave);
  const emitente = digits(input.cpfCnpjEmitente);
  if (chave.length !== 44) throw new Error("Chave de acesso inválida para carta de correção");
  if (emitente.length !== 11 && emitente.length !== 14) throw new Error("CPF/CNPJ do emitente inválido");
  if (!Number.isInteger(input.nSeqEvento) || input.nSeqEvento < 1 || input.nSeqEvento > 20)
    throw new Error("Limite de 20 cartas de correção por CT-e atingido");
  if (input.correcoes.length < 1 || input.correcoes.length > 20) throw new Error("Informe de 1 a 20 correções por carta");
  for (const c of input.correcoes) {
    if (!c.grupo.trim() || !c.campo.trim()) throw new Error("Informe o grupo e o campo corrigidos");
    if (c.valor.trim().length < 1 || c.valor.length > 500) throw new Error("O novo valor deve ter de 1 a 500 caracteres");
    if (c.item && !/^\d{1,2}$/.test(c.item.trim())) throw new Error("O número do item deve ter 1 ou 2 dígitos");
  }

  const tpAmb = input.ambiente === "producao" ? "1" : "2";
  const tpEvento = "110110";
  const nSeq = String(input.nSeqEvento);
  const id = `ID${tpEvento}${chave}${nSeq.padStart(3, "0")}`;
  const tagDoc = emitente.length === 14 ? "CNPJ" : "CPF";
  const cOrgao = CUF[input.uf.trim().toUpperCase()] ?? chave.slice(0, 2);
  const infCorrecao = input.correcoes.map(c =>
    `<infCorrecao><grupoAlterado>${esc(c.grupo.trim())}</grupoAlterado><campoAlterado>${esc(c.campo.trim())}</campoAlterado>` +
    `<valorAlterado>${esc(c.valor.trim())}</valorAlterado>${c.item ? `<nroItemAlterado>${c.item.trim()}</nroItemAlterado>` : ""}</infCorrecao>`
  ).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<eventoCTe xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">` +
      `<infEvento Id="${id}"><cOrgao>${cOrgao}</cOrgao><tpAmb>${tpAmb}</tpAmb><${tagDoc}>${emitente}</${tagDoc}>` +
      `<chCTe>${chave}</chCTe><dhEvento>${gerarDhEmi(input.uf)}</dhEvento><tpEvento>${tpEvento}</tpEvento><nSeqEvento>${nSeq}</nSeqEvento>` +
      `<detEvento versaoEvento="4.00"><evCCeCTe><descEvento>Carta de Correcao</descEvento>${infCorrecao}` +
      `<xCondUso>${esc(COND_USO_CCE_CTE)}</xCondUso></evCCeCTe></detEvento>` +
      `</infEvento></eventoCTe>`;
  return { xml, id };
}

export async function enviarCartaCorrecaoCTe(pem: PemPair, input: CartaCorrecaoCTeInput): Promise<ResultadoEventoCTe & { xmlEvento?: string }> {
  const { xml, id } = montarEventoCCeCTe(input);
  const assinado = assinarXmlPorId(xml, pem, id);
  const resposta = await transmitirEventoCTe(assinado, pem, input.uf, input.ambiente);
  return {
    sucesso: resposta.cStat === "135",
    cStat: resposta.cStat,
    xMotivo: resposta.xMotivo,
    protocolo: resposta.protocolo,
    dataRegistro: resposta.dhRecbto || tagVal(resposta.xmlProt ?? "", "dhRegEvento") || undefined,
    xmlEvento: assinado,
  };
}
