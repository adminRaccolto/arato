/**
 * lib/cte/transmitter.ts
 * Transmite o CT-e assinado para os webservices da SEFAZ via SOAP 1.2 com mTLS.
 * MT usa SVRS (RS) como autorizador para CT-e.
 */

import https from "https";
import type { PemPair } from "../nfe/signer";

// ─── Endpoints ────────────────────────────────────────────────────────────────
const ENDPOINT_PROD: Record<string, string> = {
  SP: "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeAutorizacao4.asmx",
  MG: "https://cte.fazenda.mg.gov.br/cte/services/CTeAutorizacao4",
  _svrs: "https://cte.svrs.rs.gov.br/ws/CteAutorizacao/CteAutorizacao4.asmx",
};

const ENDPOINT_HOM = "https://homologacao.cte.svrs.rs.gov.br/ws/CteAutorizacao/CteAutorizacao4.asmx";

function endpoint(uf: string, ambiente: "producao" | "homologacao"): string {
  if (ambiente === "homologacao") return ENDPOINT_HOM;
  return ENDPOINT_PROD[uf] ?? ENDPOINT_PROD["_svrs"];
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

// ─── CUF por UF ───────────────────────────────────────────────────────────────
const CUF_MAP: Record<string, string> = {
  AC:"12",AL:"27",AM:"13",AP:"16",BA:"29",CE:"23",DF:"53",ES:"32",
  GO:"52",MA:"21",MG:"31",MS:"50",MT:"51",PA:"15",PB:"25",PE:"26",
  PI:"22",PR:"41",RJ:"33",RN:"24",RO:"11",RR:"14",RS:"43",SC:"42",
  SE:"28",SP:"35",TO:"17",
};

// ─── Envelope SOAP — CTeAutorizacao4 ─────────────────────────────────────────
function envelopeCTe(cteXml: string, cuf: string, tpAmb: "1" | "2"): string {
  const idLote = Date.now().toString().slice(-15);
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <cteCabecMsg xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeAutorizacao4">
      <cUF>${cuf}</cUF>
      <versaoDados>3.00</versaoDados>
    </cteCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <cteDadosMsg xmlns="http://www.portalfiscal.inf.br/cte/wsdl/CTeAutorizacao4">
      <enviCTe versao="3.00" xmlns="http://www.portalfiscal.inf.br/cte">
        <idLote>${idLote}</idLote>
        <indSinc>1</indSinc>
        ${cteXml}
      </enviCTe>
    </cteDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

// ─── Parser de resposta ───────────────────────────────────────────────────────
function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
  return m ? m[1] : "";
}

export interface RespostaCTe {
  cStat:     string;
  xMotivo:   string;
  protocolo?: string;
  dhRecbto?:  string;
  chave?:     string;
  xmlProt?:   string;
}

function parseResposta(soapResp: string): RespostaCTe {
  const cStat   = tagVal(soapResp, "cStat");
  const xMotivo = tagVal(soapResp, "xMotivo");
  const protocolo = tagVal(soapResp, "nProt");
  const dhRecbto  = tagVal(soapResp, "dhRecbto");
  const chave     = tagVal(soapResp, "chCTe");
  const xmlProtMatch = soapResp.match(/<cteProc[\s\S]*?<\/cteProc>/);
  const xmlProt = xmlProtMatch ? xmlProtMatch[0] : undefined;
  return { cStat, xMotivo, protocolo: protocolo || undefined, dhRecbto: dhRecbto || undefined, chave: chave || undefined, xmlProt };
}

// ─── Transmissão ─────────────────────────────────────────────────────────────
export async function transmitirCTe(
  cteXmlAssinado: string,
  pem:            PemPair,
  uf:             string,
  ambiente:       "producao" | "homologacao"
): Promise<RespostaCTe> {
  const ep    = endpoint(uf, ambiente);
  const cuf   = CUF_MAP[uf] ?? "51";
  const tpAmb = ambiente === "producao" ? "1" : "2";

  const soapBody = envelopeCTe(cteXmlAssinado, cuf, tpAmb as "1" | "2");
  const resp     = await soapPost(ep, soapBody, pem);
  return parseResposta(resp);
}
