/**
 * lib/cte/transmitter.ts
 * Transmite o CT-e assinado para os webservices da SEFAZ via SOAP 1.2 com mTLS.
 * MT usa SVRS (RS) como autorizador para CT-e.
 */

import https from "https";
import type { PemPair } from "../nfe/signer";

// ─── Endpoints ────────────────────────────────────────────────────────────────
// Produção: SVRS para MT e demais estados que usam SVRS.
// Homologação: SVC-AN (hom.cte.fazenda.gov.br) — o SVRS homologação foi descontinuado.
// O campo tpAmb no XML também deve refletir o ambiente correto.
const ENDPOINT_PROD: Record<string, string> = {
  SP:    "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeAutorizacao4.asmx",
  MG:    "https://cte.fazenda.mg.gov.br/cte/services/CTeAutorizacao4",
  _svrs: "https://cte.svrs.rs.gov.br/ws/CTeAutorizacao/CTeAutorizacao4.asmx",
};

const ENDPOINT_HOM: Record<string, string> = {
  _svcAN: "https://hom.cte.fazenda.gov.br/CTeAutorizacao4/CTeAutorizacao4.asmx",
};

function endpoint(uf: string, ambiente: "producao" | "homologacao"): string {
  if (ambiente === "homologacao") {
    return ENDPOINT_HOM[uf] ?? ENDPOINT_HOM["_svcAN"];
  }
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
          // SOAP 1.2: action fica no Content-Type
          "Content-Type": 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/cte/wsdl/CTeAutorizacao4/cteDadosMsg"',
          "Content-Length": Buffer.byteLength(body, "utf8"),
        },
        cert: pem.cert,
        key:  pem.key,
        // Domínios *.gov.br usam ICP-Brasil não incluída no bundle Node.js.
        // A autenticação é feita pelo assinatura digital no XML.
        rejectUnauthorized: !u.hostname.endsWith(".gov.br"),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          console.log(`[CT-e SOAP] ${u.hostname} → HTTP ${status}`);
          if (status !== 200) {
            console.log("[CT-e SOAP body]", data.slice(0, 500));
            // Converte erro HTTP em mensagem legível
            resolve(`__HTTP_${status}__${data.slice(0, 300)}`);
          } else {
            resolve(data);
          }
        });
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
  // Remove a declaração XML <?xml...?> que não pode aparecer dentro de um elemento SOAP
  const cteXmlBody = cteXml.replace(/^<\?xml[^?]*\?>\s*/i, "");
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
        ${cteXmlBody}
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
  // Sentinela injetada pelo soapPost quando HTTP ≠ 200
  const httpErr = soapResp.match(/^__HTTP_(\d+)__([\s\S]*)/);
  if (httpErr) {
    const httpStatus = httpErr[1];
    const body = httpErr[2];
    if (httpStatus === "403") {
      return {
        cStat: "403",
        xMotivo: "Acesso negado pelo servidor SEFAZ (HTTP 403 Forbidden). " +
                 "Possíveis causas: (1) IP fora do Brasil — ative a região GRU1 no Vercel; " +
                 "(2) Certificado A1 inválido ou não-ICP-Brasil; " +
                 "(3) CNPJ não habilitado no ambiente escolhido.",
      };
    }
    if (httpStatus === "404") {
      return { cStat: "404", xMotivo: `Endpoint SEFAZ não encontrado (HTTP 404). Verifique a URL do webservice: ${body.slice(0, 200)}` };
    }
    return { cStat: httpStatus, xMotivo: `HTTP ${httpStatus} da SEFAZ: ${body.slice(0, 300)}` };
  }

  // Log para debug em Vercel Functions
  console.log("[CT-e SOAP response]", soapResp.slice(0, 2000));

  // SOAP Fault — extrai faultstring e retorna como xMotivo
  const faultMatch = soapResp.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) {
    return { cStat: "500", xMotivo: `SOAP Fault: ${faultMatch[1].trim()}` };
  }

  const cStat   = tagVal(soapResp, "cStat");
  const xMotivo = tagVal(soapResp, "xMotivo");
  const protocolo = tagVal(soapResp, "nProt");
  const dhRecbto  = tagVal(soapResp, "dhRecbto");
  const chave     = tagVal(soapResp, "chCTe");
  const xmlProtMatch = soapResp.match(/<cteProc[\s\S]*?<\/cteProc>/);
  const xmlProt = xmlProtMatch ? xmlProtMatch[0] : undefined;

  // Se não achou cStat, devolve trecho da resposta para diagnóstico
  if (!cStat) {
    return { cStat: "???", xMotivo: `Resposta inesperada da SEFAZ: ${soapResp.slice(0, 500)}` };
  }

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
