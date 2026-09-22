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
