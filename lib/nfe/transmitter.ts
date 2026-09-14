/**
 * lib/nfe/transmitter.ts
 * Transmite a NF-e assinada para os webservices da SEFAZ via SOAP 1.2 com mTLS.
 */

import https from "https";
import type { PemPair } from "./signer";

interface UFEndpoints {
  autorizacao: string;
  retAutorizacao: string;
  statusServico: string;
  recepcaoEvento: string;
}

// ─── Endpoints por UF e ambiente ─────────────────────────────────────────────

const _svrs_prod: UFEndpoints = {
  autorizacao:    "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  retAutorizacao: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  statusServico:  "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  recepcaoEvento: "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
};

const _svrs_hom: UFEndpoints = {
  autorizacao:    "https://homologacao.nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  retAutorizacao: "https://homologacao.nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  statusServico:  "https://homologacao.nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
  recepcaoEvento: "https://homologacao.nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
};

const _svan_prod: UFEndpoints = {
  autorizacao:    "https://www.nfe.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
  retAutorizacao: "https://www.nfe.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
  statusServico:  "https://www.nfe.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx",
  recepcaoEvento: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
};

interface UFEntry { prod: UFEndpoints; hom: UFEndpoints }

// MT tem autorizador próprio — não usa SVAN nem SVRS.
// cStat 114 ("SVC não habilitado") confirma que UFs com infra própria não aceitam SVRS/SVAN.
const UF_ENDPOINTS: Record<string, UFEntry> = {
  MT: {
    prod: {
      autorizacao:    "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4",
      retAutorizacao: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4",
      statusServico:  "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4",
      recepcaoEvento: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeRecepcaoEvento4",
    },
    hom: {
      autorizacao:    "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4",
      retAutorizacao: "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4",
      statusServico:  "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeStatusServico4",
      recepcaoEvento: "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeRecepcaoEvento4",
    },
  },
  SP: {
    prod: {
      autorizacao:    "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      retAutorizacao: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
      statusServico:  "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx",
      recepcaoEvento: "https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx",
    },
    hom: _svrs_hom,
  },
  MG: {
    prod: {
      autorizacao:    "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
      retAutorizacao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
      statusServico:  "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeStatusServico4",
      recepcaoEvento: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4",
    },
    hom: _svrs_hom,
  },
  RS: {
    prod: {
      autorizacao:    "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      retAutorizacao: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
      statusServico:  "https://nfe.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
      recepcaoEvento: "https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
    },
    hom: _svrs_hom,
  },
  PR: {
    prod: {
      autorizacao:    "https://nfe.encat.org/nfe/services/NFeAutorizacao4",
      retAutorizacao: "https://nfe.encat.org/nfe/services/NFeRetAutorizacao4",
      statusServico:  "https://nfe.encat.org/nfe/services/NFeStatusServico4",
      recepcaoEvento: "https://nfe.encat.org/nfe/services/NFeRecepcaoEvento4",
    },
    hom: _svrs_hom,
  },
  BA: {
    prod: {
      autorizacao:    "https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
      retAutorizacao: "https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
      statusServico:  "https://nfe.sefaz.ba.gov.br/webservices/NFeStatusServico4/NFeStatusServico4.asmx",
      recepcaoEvento: "https://nfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
    },
    hom: _svrs_hom,
  },
  PE: {
    prod: {
      autorizacao:    "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4",
      retAutorizacao: "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4",
      statusServico:  "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeStatusServico4",
      recepcaoEvento: "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4",
    },
    hom: _svrs_hom,
  },
  AM: {
    prod: {
      autorizacao:    "https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4",
      retAutorizacao: "https://nfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4",
      statusServico:  "https://nfe.sefaz.am.gov.br/services2/services/NfeStatusServico4",
      recepcaoEvento: "https://nfe.sefaz.am.gov.br/services2/services/NfeRecepcaoEvento4",
    },
    hom: _svrs_hom,
  },
  // SVAN — Ambiente Nacional (AC, MA, PA, PI)
  AC: { prod: _svan_prod, hom: _svrs_hom },
  MA: { prod: _svan_prod, hom: _svrs_hom },
  PA: { prod: _svan_prod, hom: _svrs_hom },
  PI: { prod: _svan_prod, hom: _svrs_hom },
};

function endpoints(uf: string, ambiente: "producao" | "homologacao"): UFEndpoints {
  const entry = UF_ENDPOINTS[uf];
  if (ambiente === "producao") return entry?.prod ?? _svrs_prod;
  return entry?.hom ?? _svrs_hom;
}

// ─── SOAP request com mTLS ────────────────────────────────────────────────────
//
// Os webservices da SEFAZ usam certificados ICP-Brasil que não estão no bundle
// Mozilla/Node.js. A segurança fiscal é garantida pelo XMLDSIG (assinatura do
// certificado A1 no próprio XML). Para domínios *.gov.br, rejectUnauthorized=false
// é o padrão adotado por ACBr e demais bibliotecas fiscais brasileiras.
// Para qualquer outro host rejectUnauthorized permanece true.
function isSefazHost(hostname: string): boolean {
  return /\.gov\.br$/.test(hostname);
}

// soapAction opcional: alguns webservices Axis2 (ex: CadConsultaCadastro4 de
// MT) exigem a Action do SOAP 1.2 explícita — sem ela, respondem "The endpoint
// reference (EPR) for the Operation not found ... WSA Action = null". Em SOAP
// 1.2 essa Action vai como parâmetro do Content-Type, não como header separado
// (isso é coisa de SOAP 1.1). Omitido, o comportamento é idêntico ao anterior
// — NFeAutorizacao4/NFeRetAutorizacao4 nunca precisaram disso.
export function soapPost(url: string, body: string, pem: PemPair, soapAction?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const contentType = soapAction
      ? `application/soap+xml; charset=utf-8; action="${soapAction}"`
      : "application/soap+xml; charset=utf-8";
    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Length": Buffer.byteLength(body, "utf8"),
        },
        cert: pem.cert,
        key:  pem.key,
        rejectUnauthorized: !isSefazHost(u.hostname),
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          // Rejeitar respostas HTTP não-2xx — são erros de infraestrutura,
          // não retornos fiscais. Sem essa verificação, HTML de erro ou 404
          // chegavam ao parser como se fossem retorno SEFAZ.
          if (status < 200 || status >= 300) {
            return reject(new Error(
              `SEFAZ HTTP ${status} em ${url} — resposta:\n${data.slice(0, 800)}`
            ));
          }
          if (!data.trim()) {
            return reject(new Error(`SEFAZ retornou resposta vazia em ${url}`));
          }
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── SOAP envelopes ───────────────────────────────────────────────────────────

function envelopeAutorizacao(nfeXml: string, cuf: string, tpAmb: "1" | "2"): string {
  const idLote = Date.now().toString().slice(-15);
  // Remove a declaração XML e o xmlns redundante do <NFe>.
  // <enviNFe> já declara xmlns="http://www.portalfiscal.inf.br/nfe", portanto <NFe>
  // herdaria o namespace sem precisar redeclará-lo. Alguns validadores de chave do
  // SEFAZ (em especial MT) têm comportamento divergente entre o path de verificação
  // de assinatura (que trata corretamente namespaces herdados) e o path de recomputa
  // de chave (que pode confundir com a redeclaração). Removemos o xmlns redundante
  // para eliminar essa ambiguidade sem afetar a validade da assinatura: o DigestValue
  // é calculado sobre <infNFe> cujo namespace em escopo continua sendo o correto.
  const nfeBody = nfeXml
    .replace(/^<\?xml[^?]*\?>\s*/i, "")
    .replace(/^<NFe xmlns="http:\/\/www\.portalfiscal\.inf\.br\/nfe">/, "<NFe>")
    .trim();
  // SEFAZ rejeita (cStat 588) whitespace entre tags — envelope e conteúdo devem ser compactos.
  // O NF-e body já chega minificado do builder (minifyXml rodou antes da assinatura).
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
      ` xmlns:xsd="http://www.w3.org/2001/XMLSchema"` +
      ` xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Header>` +
      `<nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
        `<cUF>${cuf}</cUF>` +
        `<versaoDados>4.00</versaoDados>` +
      `</nfeCabecMsg>` +
    `</soap12:Header>` +
    `<soap12:Body>` +
      `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
        `<enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
          `<idLote>${idLote}</idLote>` +
          `<indSinc>1</indSinc>` +
          nfeBody +
        `</enviNFe>` +
      `</nfeDadosMsg>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

function envelopeRetAutorizacao(recibo: string, cuf: string, tpAmb: "1" | "2"): string {
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
        <tpAmb>${tpAmb}</tpAmb>
        <nRec>${recibo}</nRec>
      </consReciNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

// Envelope de recepção de evento (cancelamento, carta de correção, etc.) —
// mesmo padrão SOAP 1.2 da autorização, mas com wsdl/versaoDados próprios do
// serviço NFeRecepcaoEvento4 (versaoDados do evento é "1.00", não "4.00").
function envelopeRecepcaoEvento(eventoXmlAssinado: string, cuf: string): string {
  const body = eventoXmlAssinado.replace(/^<\?xml[^?]*\?>\s*/i, "").trim();
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
      ` xmlns:xsd="http://www.w3.org/2001/XMLSchema"` +
      ` xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Header>` +
      `<nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">` +
        `<cUF>${cuf}</cUF>` +
        `<versaoDados>1.00</versaoDados>` +
      `</nfeCabecMsg>` +
    `</soap12:Header>` +
    `<soap12:Body>` +
      `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">` +
        body +
      `</nfeDadosMsg>` +
    `</soap12:Body>` +
    `</soap12:Envelope>`
  );
}

// ─── Parser de resposta ───────────────────────────────────────────────────────

// tagVal: extrai texto de uma tag simples, aceita prefixo de namespace
function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([^<]*)<\\/(?:[^:>]+:)?${tag}>`));
  return m ? m[1] : "";
}

// blocoTag: extrai o primeiro bloco completo de uma tag (com conteúdo aninhado)
function blocoTag(xml: string, tag: string): string {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:[^:>]+:)?${tag}>`);
  return xml.match(re)?.[0] ?? "";
}

export interface RespostaSEFAZ {
  cStat: string;
  xMotivo: string;
  protocolo?: string;
  dhRecbto?: string;
  chave?: string;
  // bloco protNFe — montado em index.ts junto com o XML assinado para formar nfeProc
  xmlProt?: string;
  // número do recibo em autorização assíncrona (cStat 103)
  recibo?: string;
}

function parseResposta(soapResp: string): RespostaSEFAZ {
  // SOAP Fault — não é retorno fiscal, é falha de protocolo
  const fault = blocoTag(soapResp, "Fault");
  if (fault) {
    const motivo =
      tagVal(fault, "faultstring") ||
      tagVal(fault, "Text")        ||
      tagVal(fault, "Value")       ||
      "SOAP Fault sem descrição";
    console.error(`[NF-e] SOAP Fault: ${motivo}\n${soapResp.slice(0, 600)}`);
    return { cStat: "999", xMotivo: `SOAP Fault: ${motivo}` };
  }

  // Autorização síncrona retorna dois níveis de cStat:
  //   retEnviNFe/cStat    = 104  (lote processado — não é o resultado da nota)
  //   retEnviNFe/protNFe/infProt/cStat = 100  (nota autorizada — este é o correto)
  // Prioriza sempre o cStat dentro de infProt.
  const infProt = blocoTag(soapResp, "infProt");

  if (infProt) {
    const cStat     = tagVal(infProt, "cStat");
    const xMotivo   = tagVal(infProt, "xMotivo");
    const protocolo = tagVal(infProt, "nProt");
    const dhRecbto  = tagVal(infProt, "dhRecbto");
    const chave     = tagVal(infProt, "chNFe");
    const xmlProt   = blocoTag(soapResp, "protNFe"); // SEFAZ devolve protNFe, não nfeProc

    if (!cStat) {
      console.error(`[NF-e] cStat vazio em infProt — resposta (800 chars):\n${soapResp.slice(0, 800)}`);
    }

    return {
      cStat,
      xMotivo,
      protocolo: protocolo || undefined,
      dhRecbto:  dhRecbto  || undefined,
      chave:     chave     || undefined,
      xmlProt:   xmlProt   || undefined,
    };
  }

  // Sem infProt: resposta assíncrona (cStat 103 + recibo) ou erro de lote
  const cStat   = tagVal(soapResp, "cStat");
  const xMotivo = tagVal(soapResp, "xMotivo");
  const recibo  = tagVal(soapResp, "nRec");

  if (!cStat) {
    console.error(`[NF-e] cStat vazio (sem infProt) — resposta (800 chars):\n${soapResp.slice(0, 800)}`);
  }

  return { cStat, xMotivo, recibo: recibo || undefined };
}

// ─── CUF por UF ──────────────────────────────────────────────────────────────

export const CUF_MAP: Record<string, string> = {
  AC:"12",AL:"27",AM:"13",AP:"16",BA:"29",CE:"23",DF:"53",ES:"32",
  GO:"52",MA:"21",MG:"31",MS:"50",MT:"51",PA:"15",PB:"25",PE:"26",
  PI:"22",PR:"41",RJ:"33",RN:"24",RO:"11",RR:"14",RS:"43",SC:"42",
  SE:"28",SP:"35",TO:"17",
};

// ─── Transmissão principal ────────────────────────────────────────────────────

export async function transmitirNFe(
  nfeXmlAssinado: string,
  pem: PemPair,
  uf: string,
  ambiente: "producao" | "homologacao"
): Promise<RespostaSEFAZ> {
  const ep    = endpoints(uf, ambiente);
  const cuf   = CUF_MAP[uf] ?? "51";
  const tpAmb = ambiente === "producao" ? "1" : "2";

  const soapBody = envelopeAutorizacao(nfeXmlAssinado, cuf, tpAmb as "1" | "2");

  console.log("[NF-e SOAP] corpo enviado (primeiros 5000 chars):", soapBody.slice(0, 5000));

  // soapPost agora rejeita (throw) em HTTP não-2xx ou resposta vazia —
  // o chamador em index.ts captura e converte em cStat 504.
  const resp = await soapPost(ep.autorizacao, soapBody, pem);
  console.log("[NF-e SOAP] resposta SEFAZ (primeiros 3000 chars):", resp.slice(0, 3000));
  const result = parseResposta(resp);

  // Resposta assíncrona (cStat 103 = lote recebido) — consulta retAutorizacao
  if (result.cStat === "103" && result.recibo) {
    await new Promise((r) => setTimeout(r, 2000));
    const soapRet = envelopeRetAutorizacao(result.recibo, cuf, tpAmb as "1" | "2");
    const resp2   = await soapPost(ep.retAutorizacao, soapRet, pem);
    return parseResposta(resp2);
  }

  return result;
}

// ─── Parser de resposta de evento (cancelamento, CC-e, etc.) ─────────────────
// Estrutura difere da autorização: retorna <infEvento> em vez de <infProt>.
// cStat 135 = "Evento registrado e vinculado a NF-e" (sucesso do cancelamento).
function parseRespostaEvento(soapResp: string): RespostaSEFAZ {
  const fault = blocoTag(soapResp, "Fault");
  if (fault) {
    const motivo =
      tagVal(fault, "faultstring") ||
      tagVal(fault, "Text")        ||
      tagVal(fault, "Value")       ||
      "SOAP Fault sem descrição";
    console.error(`[NF-e evento] SOAP Fault: ${motivo}\n${soapResp.slice(0, 600)}`);
    return { cStat: "999", xMotivo: `SOAP Fault: ${motivo}` };
  }

  const infEvento = blocoTag(soapResp, "infEvento");
  if (infEvento) {
    const cStat        = tagVal(infEvento, "cStat");
    const xMotivo       = tagVal(infEvento, "xMotivo");
    const protocolo     = tagVal(infEvento, "nProt");
    const dhRegEvento   = tagVal(infEvento, "dhRegEvento");
    const chave         = tagVal(infEvento, "chNFe");
    if (!cStat) {
      console.error(`[NF-e evento] cStat vazio em infEvento — resposta (800 chars):\n${soapResp.slice(0, 800)}`);
    }
    return {
      cStat,
      xMotivo,
      protocolo: protocolo   || undefined,
      dhRecbto:  dhRegEvento || undefined,
      chave:     chave       || undefined,
    };
  }

  const cStat   = tagVal(soapResp, "cStat");
  const xMotivo = tagVal(soapResp, "xMotivo");
  if (!cStat) {
    console.error(`[NF-e evento] cStat vazio (sem infEvento) — resposta (800 chars):\n${soapResp.slice(0, 800)}`);
  }
  return { cStat, xMotivo };
}

// ─── Transmissão de evento (cancelamento, CC-e) ──────────────────────────────
export async function transmitirEvento(
  eventoXmlAssinado: string,
  pem: PemPair,
  uf: string,
  ambiente: "producao" | "homologacao"
): Promise<RespostaSEFAZ> {
  const ep  = endpoints(uf, ambiente);
  const cuf = CUF_MAP[uf] ?? "51";

  const soapBody = envelopeRecepcaoEvento(eventoXmlAssinado, cuf);
  console.log("[NF-e evento SOAP] corpo enviado (primeiros 3000 chars):", soapBody.slice(0, 3000));

  const resp = await soapPost(ep.recepcaoEvento, soapBody, pem);
  console.log("[NF-e evento SOAP] resposta SEFAZ (primeiros 2000 chars):", resp.slice(0, 2000));
  return parseRespostaEvento(resp);
}

export { endpoints };
