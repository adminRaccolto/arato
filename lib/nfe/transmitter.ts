/**
 * lib/nfe/transmitter.ts
 * Transmite a NF-e assinada para os webservices da SEFAZ via SOAP 1.2 com mTLS.
 * Suporta: NFeAutorizacao4, NFeStatusServico4, NFeConsultaProtocolo4.
 */

import https from "https";
import type { PemPair } from "./signer";

// ─── Endpoints por UF ────────────────────────────────────────────────────────

interface UFEndpoints {
  autorizacao: string;
  retAutorizacao: string;
  statusServico: string;
}

// SVRS = RS / PR / SP (homologação) + demais UFs (MT, GO, MS, TO, RO, AC, RR, AP, AM, PA, MA, PI, CE, RN, PB, AL, SE)
// UFs com autorizador próprio: SP, MG, RS, PE, BA, DF
const ENDPOINTS_PROD: Record<string, UFEndpoints> = {
  SP: {
    autorizacao:    "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
    retAutorizacao: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    statusServico:  "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
  },
  MG: {
    autorizacao:    "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
    retAutorizacao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
    statusServico:  "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
  },
  RS: {
    autorizacao:    "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    retAutorizacao: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    statusServico:  "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  },
  _svrs: {
    autorizacao:    "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
    retAutorizacao: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    statusServico:  "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  },
};

const ENDPOINTS_HOM: UFEndpoints = {
  autorizacao:    "https://homologacao.nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  retAutorizacao: "https://homologacao.nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  statusServico:  "https://homologacao.nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
};

function endpoints(uf: string, ambiente: "producao" | "homologacao"): UFEndpoints {
  if (ambiente === "homologacao") return ENDPOINTS_HOM;
  return ENDPOINTS_PROD[uf] ?? ENDPOINTS_PROD["_svrs"];
}

// ─── SOAP request com mTLS ────────────────────────────────────────────────────
function soapPost(url: string, body: string, pem: PemPair): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          "Content-Length": Buffer.byteLength(body, "utf8"),
        },
        cert: pem.cert,
        key:  pem.key,
        rejectUnauthorized: true,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── SOAP envelopes ───────────────────────────────────────────────────────────

function envelopeAutorizacao(nfeXml: string, cuf: string, ambiente: "1" | "2"): string {
  // idLote: timestamp para unicidade
  const idLote = Date.now().toString().slice(-15);
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
      <cUF>${cuf}</cUF>
      <versaoDados>4.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
      <enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
        <idLote>${idLote}</idLote>
        <indSinc>1</indSinc>
        ${nfeXml}
      </enviNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

function envelopeRetAutorizacao(recibo: string, cuf: string, ambiente: "1" | "2"): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4">
      <cUF>${cuf}</cUF><versaoDados>4.00</versaoDados>
    </nfeCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRetAutorizacao4">
      <consReciNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
        <tpAmb>${ambiente}</tpAmb>
        <nRec>${recibo}</nRec>
      </consReciNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

// ─── Parser de resposta ───────────────────────────────────────────────────────

function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
  return m ? m[1] : "";
}

export interface RespostaSEFAZ {
  cStat: string;
  xMotivo: string;
  protocolo?: string;
  dhRecbto?: string;
  chave?: string;
  xmlProt?: string;     // XML de autorização completo (nfeProc)
  recibo?: string;      // Se assíncrono — número do recibo para consultar depois
}

function parseResposta(soapResp: string): RespostaSEFAZ {
  // Extrai bloco retEnviNFe ou retConsReciNFe
  const cStat  = tagVal(soapResp, "cStat");
  const xMotivo = tagVal(soapResp, "xMotivo");
  const recibo  = tagVal(soapResp, "nRec");

  // NF-e autorizada: cStat 100
  const protocolo = tagVal(soapResp, "nProt");
  const dhRecbto  = tagVal(soapResp, "dhRecbto");
  const chave     = tagVal(soapResp, "chNFe");

  // Extrai o XML de autorização (nfeProc) se presente
  const xmlProtMatch = soapResp.match(/<nfeProc[\s\S]*?<\/nfeProc>/);
  const xmlProt = xmlProtMatch ? xmlProtMatch[0] : undefined;

  return { cStat, xMotivo, protocolo: protocolo || undefined, dhRecbto: dhRecbto || undefined, chave: chave || undefined, xmlProt, recibo: recibo || undefined };
}

// ─── CUF por UF ──────────────────────────────────────────────────────────────
const CUF_MAP: Record<string, string> = {
  AC:"12",AL:"27",AM:"13",AP:"16",BA:"29",CE:"23",DF:"53",ES:"32",
  GO:"52",MA:"21",MG:"31",MS:"50",MT:"51",PA:"15",PB:"25",PE:"26",
  PI:"22",PR:"41",RJ:"33",RN:"24",RO:"11",RR:"14",RS:"43",SC:"42",
  SE:"28",SP:"35",TO:"17",
};

// ─── Função principal de transmissão ─────────────────────────────────────────

export async function transmitirNFe(
  nfeXmlAssinado: string,
  pem: PemPair,
  uf: string,
  ambiente: "producao" | "homologacao"
): Promise<RespostaSEFAZ> {
  const ep = endpoints(uf, ambiente);
  const cuf = CUF_MAP[uf] ?? "51";
  const tpAmb = ambiente === "producao" ? "1" : "2";

  const soapBody = envelopeAutorizacao(nfeXmlAssinado, cuf, tpAmb as "1" | "2");
  const resp = await soapPost(ep.autorizacao, soapBody, pem);
  const result = parseResposta(resp);

  // Se resposta assíncrona (cStat 103 = lote recebido), poll retAutorizacao
  if (result.cStat === "103" && result.recibo) {
    await new Promise((r) => setTimeout(r, 2000)); // aguarda 2s
    const soapRet = envelopeRetAutorizacao(result.recibo, cuf, tpAmb as "1" | "2");
    const resp2 = await soapPost(ep.retAutorizacao, soapRet, pem);
    return parseResposta(resp2);
  }

  return result;
}

export { endpoints };
