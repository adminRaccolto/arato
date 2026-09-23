/**
 * lib/mdfe/transmitter.ts
 * Transmite o MDF-e assinado para o webservice da SEFAZ via SOAP 1.2 com mTLS.
 *
 * Diferente do CT-e/NF-e, o MDF-e (modelo 58) usa UM ÚNICO autorizador nacional pra
 * praticamente todas as UFs — SVRS (Sefaz Virtual RS) — confirmado contra a tabela oficial
 * de autorizadores (nfephp-org/sped-mdfe, storage/autorizadores.json: toda UF, incluindo MT,
 * mapeia pra "RS" no modelo 58). Não existe roteamento por UF aqui, ao contrário do CT-e.
 */

import https from "https";
import { gunzipSync, gzipSync } from "node:zlib";
import type { PemPair } from "../nfe/signer";
import { ICP_BRASIL_CA_BUNDLE } from "../cte/transmitter";

type Ambiente = "producao" | "homologacao";

const ENDPOINT: Record<Ambiente, string> = {
  producao:    "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
  homologacao: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
};

const EVENT_ENDPOINT: Record<Ambiente, string> = {
  producao:    "https://mdfe.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
  homologacao: "https://mdfe-homologacao.svrs.rs.gov.br/ws/MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
};

const SOAP_NS     = "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoSinc";
const SOAP_ACTION = `${SOAP_NS}/mdfeRecepcao`;
const EVENT_SOAP_NS     = "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento";
const EVENT_SOAP_ACTION = `${EVENT_SOAP_NS}/mdfeRecepcaoEvento`;

function compactarMDFeBase64(xmlAssinado: string): string {
  const raiz = xmlAssinado.replace(/^﻿/, "").replace(/^<\?xml[^?]*\?>\s*/i, "").trim();
  if (!raiz.startsWith("<MDFe")) {
    throw new Error(`Área de dados inválida: deveria começar com <MDFe, mas começa com: ${raiz.slice(0, 80)}`);
  }
  const bytesUtf8 = Buffer.from(raiz, "utf8");
  return gzipSync(bytesUtf8, { level: 9 }).toString("base64");
}

function envelopeMDFe(xmlAssinado: string): string {
  const dadosBase64 = compactarMDFeBase64(xmlAssinado);
  return `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Body><mdfeDadosMsg xmlns="${SOAP_NS}">${dadosBase64}</mdfeDadosMsg></soap12:Body>` +
    `</soap12:Envelope>`;
}

function soapPost(url: string, body: string, pem: PemPair, soapAction: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuffer = Buffer.from(body, "utf8");
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: "POST",
      headers: {
        "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"`,
        "SOAPAction": `"${soapAction}"`,
        "Content-Length": bodyBuffer.length,
      },
      cert: pem.certChain ?? pem.cert,
      key: pem.key,
      ca: ICP_BRASIL_CA_BUNDLE,
      rejectUnauthorized: true,
    }, (res) => {
      const status = res.statusCode ?? 0;
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        console.log(`[MDF-e SOAP] ${u.hostname} → HTTP ${status}`);
        if (status !== 200) console.log("[MDF-e SOAP body]", data.slice(0, 500));
        resolve(status !== 200 ? `__HTTP_${status}__${data.slice(0, 300)}` : data);
      });
    });
    req.on("error", (err: NodeJS.ErrnoException) => reject(new Error(String(err))));
    req.end(bodyBuffer);
  });
}

function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([^<]*)<\/(?:[^:>]+:)?${tag}>`));
  return m ? m[1] : "";
}

export interface RespostaMDFe {
  sucesso:    boolean;
  cStat:      string | null;
  xMotivo:    string;
  errorCode?: string;
  httpStatus?: number;
  protocolo?: string;
  dhRecbto?:  string;
  chave?:     string;
  xmlProt?:   string;
}

function parseResposta(soapResp: string): RespostaMDFe {
  const httpErr = soapResp.match(/^__HTTP_(\d+)__([\s\S]*)/);
  if (httpErr) {
    const httpStatus = parseInt(httpErr[1]);
    const body = httpErr[2];
    const motivoHttp: Record<number, string> = {
      400: "Requisição rejeitada pelo servidor (HTTP 400). Verifique o formato do envelope SOAP e os headers.",
      403: "Acesso negado (HTTP 403). IP fora do Brasil ou CNPJ não habilitado no ambiente.",
      404: "Endpoint não encontrado (HTTP 404). Verifique a URL do webservice.",
      500: "Erro interno no servidor SEFAZ (HTTP 500).",
    };
    return { sucesso: false, cStat: null, errorCode: "SEFAZ_HTTP_ERROR", httpStatus, xMotivo: motivoHttp[httpStatus] ?? `HTTP ${httpStatus}: ${body.slice(0, 200)}` };
  }

  console.log("[MDF-e SOAP response]", soapResp.slice(0, 2000));

  const faultMatch = soapResp.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) return { sucesso: false, cStat: null, errorCode: "SOAP_FAULT", xMotivo: `SOAP Fault: ${faultMatch[1].trim()}` };

  const cStat     = tagVal(soapResp, "cStat");
  const xMotivo   = tagVal(soapResp, "xMotivo");
  const protocolo = tagVal(soapResp, "nProt");
  const dhRecbto  = tagVal(soapResp, "dhRecbto") || tagVal(soapResp, "dhRegEvento");
  const chave     = tagVal(soapResp, "chMDFe");
  const xmlProtMatch = soapResp.match(/<mdfeProc[\s\S]*?<\/mdfeProc>/) ?? soapResp.match(/<protMDFe[\s\S]*?<\/protMDFe>/);
  const xmlProt = xmlProtMatch?.[0];

  if (!cStat) return { sucesso: false, cStat: null, errorCode: "SEFAZ_UNEXPECTED_RESPONSE", xMotivo: `Resposta inesperada: ${soapResp.slice(0, 500)}` };

  return { sucesso: cStat === "100", cStat, xMotivo, protocolo: protocolo || undefined, dhRecbto: dhRecbto || undefined, chave: chave || undefined, xmlProt };
}

export async function transmitirMDFe(mdfeXmlAssinado: string, pem: PemPair, ambiente: Ambiente): Promise<RespostaMDFe> {
  const resp = await soapPost(ENDPOINT[ambiente], envelopeMDFe(mdfeXmlAssinado), pem, SOAP_ACTION);
  return parseResposta(resp);
}

function envelopeEventoMDFe(eventoXmlAssinado: string, cuf: string): string {
  const body = eventoXmlAssinado.replace(/^<\?xml[^?]*\?>\s*/i, "").trim();
  return `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Header><mdfeCabecMsg xmlns="${EVENT_SOAP_NS}"><cUF>${cuf}</cUF><versaoDados>3.00</versaoDados></mdfeCabecMsg></soap12:Header>` +
      `<soap12:Body><mdfeDadosMsg xmlns="${EVENT_SOAP_NS}">${body}</mdfeDadosMsg></soap12:Body>` +
    `</soap12:Envelope>`;
}

function parseRespostaEvento(soapResp: string): RespostaMDFe {
  const infEvento = soapResp.match(/<(?:[^:>]+:)?infEvento\b[^>]*>[\s\S]*?<\/(?:[^:>]+:)?infEvento>/)?.[0];
  if (!infEvento) return parseResposta(soapResp);
  const cStat = tagVal(infEvento, "cStat");
  const xMotivo = tagVal(infEvento, "xMotivo");
  if (!cStat) return parseResposta(soapResp);
  return { sucesso: cStat === "135", cStat, xMotivo, protocolo: tagVal(infEvento, "nProt") || undefined, dhRecbto: tagVal(infEvento, "dhRegEvento") || undefined, chave: tagVal(infEvento, "chMDFe") || undefined };
}

/** Encerramento é registrado como um evento MDF-e (tpEvento 110112). */
export async function transmitirEventoMDFe(eventoXmlAssinado: string, pem: PemPair, uf: string, ambiente: Ambiente): Promise<RespostaMDFe> {
  const cuf = ({
    AC:"12",AL:"27",AM:"13",AP:"16",BA:"29",CE:"23",DF:"53",ES:"32",GO:"52",MA:"21",
    MG:"31",MS:"50",MT:"51",PA:"15",PB:"25",PE:"26",PI:"22",PR:"41",RJ:"33",RN:"24",
    RO:"11",RR:"14",RS:"43",SC:"42",SE:"28",SP:"35",TO:"17",
  }[uf.trim().toUpperCase()] ?? "51");
  const resp = await soapPost(EVENT_ENDPOINT[ambiente], envelopeEventoMDFe(eventoXmlAssinado, cuf), pem, EVENT_SOAP_ACTION);
  return parseRespostaEvento(resp);
}
