import { fetchComTimeout } from "../http";
/**
 * lib/cte/transmitter.ts
 * Transmite o CT-e assinado para os webservices da SEFAZ via SOAP 1.2 com mTLS.
 *
 * Roteamento: pela UF do emitente (não por uf_ini/uf_fim do transporte).
 * SOAP direto via Node.js https.request (preferredRegion: gru1 = São Paulo, Brasil).
 * CA bundle ICP-Brasil hardcoded para verificação dos servidores SEFAZ.
 */

import https from "https";
import { gunzipSync, gzipSync } from "node:zlib";
import type { PemPair } from "../nfe/signer";

// ─── CA Bundle ICP-Brasil para verificar servidores SEFAZ ────────────────────
// Contém: AC SOLUTI SSL EV G4 (usada pelo SEFAZ-MT) + AC Raiz v10 + AC Raiz v5
// Certificados públicos da ICP-Brasil — sem informações confidenciais.
export { ICP_BRASIL_CA_BUNDLE } from "../fiscal/ca-icp-brasil";
import { CA_FISCAL } from "../fiscal/ca-icp-brasil";

// ─── Autorizadores por UF ─────────────────────────────────────────────────────
type Ambiente    = "producao" | "homologacao";
type Autorizador = "MT" | "MS" | "MG" | "PR" | "RS" | "SP" | "SVRS" | "SVSP";

const AUTORIZADOR_POR_UF: Record<string, Autorizador> = {
  MT: "MT", MS: "MS", MG: "MG", PR: "PR", RS: "RS", SP: "SP",
  // SVRS
  AC: "SVRS", AL: "SVRS", AM: "SVRS", BA: "SVRS", CE: "SVRS", DF: "SVRS",
  ES: "SVRS", GO: "SVRS", MA: "SVRS", PA: "SVRS", PB: "SVRS", PI: "SVRS",
  RJ: "SVRS", RN: "SVRS", RO: "SVRS", SC: "SVRS", SE: "SVRS", TO: "SVRS",
  // SVSP
  AP: "SVSP", PE: "SVSP", RR: "SVSP",
};

const ENDPOINTS: Record<Ambiente, Record<Autorizador, string>> = {
  producao: {
    MT:   "https://cte.sefaz.mt.gov.br/ctews2/services/CTeRecepcaoSincV4",
    MS:   "https://producao.cte.ms.gov.br/ws/CTeRecepcaoSincV4",
    MG:   "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcaoSincV4",
    PR:   "https://cte.fazenda.pr.gov.br/cte4/CTeRecepcaoSincV4",
    RS:   "https://cte.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    SP:   "https://nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx",
    SVRS: "https://cte.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    SVSP: "https://nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx",
  },
  homologacao: {
    MT:   "https://homologacao.sefaz.mt.gov.br/ctews2/services/CTeRecepcaoSincV4",
    MS:   "https://homologacao.cte.ms.gov.br/ws/CTeRecepcaoSincV4",
    MG:   "https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcaoSincV4",
    PR:   "https://homologacao.cte.fazenda.pr.gov.br/cte4/CTeRecepcaoSincV4",
    RS:   "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    SP:   "https://homologacao.nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx",
    SVRS: "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
    SVSP: "https://homologacao.nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx",
  },
};

// Registro de eventos (cancelamento, CC-e, etc.) usa um serviço próprio e
// payload XML sem compactação. As UFs atendidas por SVRS/SVSP compartilham os
// mesmos endpoints dos respectivos autorizadores.
const EVENT_ENDPOINTS: Record<Ambiente, Record<Autorizador, string>> = {
  producao: {
    MT:   "https://cte.sefaz.mt.gov.br/ctews2/services/CTeRecepcaoEventoV4",
    MS:   "https://producao.cte.ms.gov.br/ws/CTeRecepcaoEventoV4",
    MG:   "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcaoEventoV4",
    PR:   "https://cte.fazenda.pr.gov.br/cte4/CTeRecepcaoEventoV4",
    RS:   "https://cte.svrs.rs.gov.br/ws/CTeRecepcaoEventoV4/CTeRecepcaoEventoV4.asmx",
    SP:   "https://nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoEventoV4.asmx",
    SVRS: "https://cte.svrs.rs.gov.br/ws/CTeRecepcaoEventoV4/CTeRecepcaoEventoV4.asmx",
    SVSP: "https://nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoEventoV4.asmx",
  },
  homologacao: {
    MT:   "https://homologacao.sefaz.mt.gov.br/ctews2/services/CTeRecepcaoEventoV4",
    MS:   "https://homologacao.cte.ms.gov.br/ws/CTeRecepcaoEventoV4",
    MG:   "https://hcte.fazenda.mg.gov.br/cte/services/CTeRecepcaoEventoV4",
    PR:   "https://homologacao.cte.fazenda.pr.gov.br/cte4/CTeRecepcaoEventoV4",
    RS:   "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRecepcaoEventoV4/CTeRecepcaoEventoV4.asmx",
    SP:   "https://homologacao.nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoEventoV4.asmx",
    SVRS: "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRecepcaoEventoV4/CTeRecepcaoEventoV4.asmx",
    SVSP: "https://homologacao.nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoEventoV4.asmx",
  },
};

function endpoint(ufEmitente: string, ambiente: Ambiente): string {
  const uf = ufEmitente.trim().toUpperCase();
  const autorizador = AUTORIZADOR_POR_UF[uf];
  if (!autorizador) throw new Error(`UF do emitente inválida ou não mapeada: "${uf}"`);
  const url = ENDPOINTS[ambiente][autorizador];
  console.log("[CT-e routing]", { ufEmitente: uf, ambiente, autorizador, endpoint: url });
  return url;
}

// ─── SOAP ─────────────────────────────────────────────────────────────────────
const SOAP_ACTION = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4/cteRecepcao";
const SOAP_NS     = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4";
const EVENT_SOAP_ACTION = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4/cteRecepcaoEvento";
const EVENT_SOAP_NS     = "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoEventoV4";
const CONSULTA_SOAP_ACTION = "http://www.portalfiscal.inf.br/cte/wsdl/CTeConsultaV4/cteConsultaCT";
const CONSULTA_SOAP_NS     = "http://www.portalfiscal.inf.br/cte/wsdl/CTeConsultaV4";


// ─── Compactação e envelope CT-e 4.00 ────────────────────────────────────────
// cteDadosMsg = GZip/Base64 do elemento <CTe> SEM declaração <?xml?> e SEM BOM.
// Textos devem ser normalizados para ASCII puro ANTES da assinatura.
// SEFAZ-MT CTeRecepcaoSincV4: sem soap:Header, sem cteCabecMsg.

function compactarCTeBase64(xmlAssinado: string): string {
  const raizCTe = xmlAssinado
    .replace(/^﻿/, "")
    .replace(/^<\?xml[^?]*\?>\s*/i, "")
    .trim();

  if (!raizCTe.startsWith("<CTe")) {
    throw new Error(
      `Área de dados inválida: deveria começar com <CTe, mas começa com: ${
        raizCTe.slice(0, 80)
      }`
    );
  }

  const caracteresNaoAscii = Array.from(
    raizCTe.matchAll(/[^\x09\x0A\x0D\x20-\x7E]/gu)
  ).slice(0, 20).map(resultado => ({
    caractere: resultado[0],
    codigo: `U+${resultado[0]
      .codePointAt(0)!
      .toString(16)
      .toUpperCase()
      .padStart(4, "0")}`,
    contexto: raizCTe.slice(
      Math.max(0, (resultado.index ?? 0) - 20),
      (resultado.index ?? 0) + 21
    ),
  }));

  console.log("[CT-e payload final v6]", {
    raiz: raizCTe.slice(0, 100),
    caracteresNaoAscii,
  });

  if (caracteresNaoAscii.length) {
    throw new Error(
      `O XML assinado ainda contém caracteres especiais: ${
        JSON.stringify(caracteresNaoAscii)
      }`
    );
  }

  const bytesUtf8 = Buffer.from(raizCTe, "utf8");
  new TextDecoder("utf-8", { fatal: true }).decode(bytesUtf8);

  return gzipSync(bytesUtf8, { level: 9 }).toString("base64");
}

function envelopeCTe(xmlAssinado: string): string {
  const dadosBase64 = compactarCTeBase64(xmlAssinado);

  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
      `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
      `xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Body>` +
        `<cteDadosMsg xmlns="${SOAP_NS}">` +
          dadosBase64 +
        `</cteDadosMsg>` +
      `</soap12:Body>` +
    `</soap12:Envelope>`;

  console.log("[CT-e SOAP check]", {
    hasCteCabecMsg: envelope.includes("cteCabecMsg"),
    hasSoapHeader:  envelope.includes("soap12:Header"),
  });

  return envelope;
}

// ─── Relay via Supabase Edge Function (IP brasileiro) ────────────────────────
async function soapPostViaEdge(url: string, body: string, pem: PemPair, soapAction = SOAP_ACTION): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_SEFAZ_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const edgeFnUrl   = `${supabaseUrl}/functions/v1/cte-transmit`;
  const edgeSecret  = process.env.EDGE_BEARER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const resp = await fetchComTimeout(edgeFnUrl, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${edgeSecret}`,
      "x-region":      "sa-east-1",
    },
    body: JSON.stringify({
      endpoint:    url,
      soapBody:    body,
      certPem:     pem.certChain ?? pem.cert,
      keyPem:      pem.key,
      soapAction,
      soapVersion: "1.2",
    }),
  }, 55_000);

  const contentType = resp.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 401 || text.toLowerCase().includes("unauthorized")) {
      throw new Error(
        "Edge Function: acesso negado (401). " +
        "Desabilite JWT verification no Supabase Dashboard → Edge Functions → cte-transmit → Settings " +
        "e configure EDGE_BEARER_SECRET nas Secrets da Edge Function e nas variáveis de ambiente da Vercel."
      );
    }
    throw new Error(`Edge Function retornou HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }

  const result = await resp.json() as {
    httpStatus?: number; body?: string; error?: string; errorCode?: string;
  };
  if (result.error) throw new Error(`Edge Function erro: ${result.error}`);

  const httpStatus = result.httpStatus ?? 0;
  const soapResp   = result.body ?? "";

  console.log(`[CT-e via Edge] → HTTP ${httpStatus}`);

  if (httpStatus === 0) {
    throw new Error("mTLS falhou na Edge Function (HTTP 0). Verifique os logs do Supabase.");
  }
  if (httpStatus !== 200) {
    console.log("[CT-e via Edge body]", soapResp.slice(0, 500));
    // Preserva status HTTP distinto de cStat para parseResposta discriminar
    return `__HTTP_${httpStatus}__${soapResp.slice(0, 300)}`;
  }
  return soapResp;
}

// ─── SOAP direto via https.request (Node.js, gru1 = São Paulo) ───────────────
// Usa CA bundle ICP-Brasil hardcoded para verificar o servidor SEFAZ.
// O IP de saída do Vercel gru1 é aceito pelo SEFAZ — sem bloqueio de firewall.
function soapPost(url: string, body: string, pem: PemPair, soapAction = SOAP_ACTION): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuffer = Buffer.from(body, "utf8");

    const req = https.request({
      hostname: u.hostname,
      port:     443,
      path:     u.pathname + u.search,
      method:   "POST",
      headers: {
        "Content-Type":   `application/soap+xml; charset=utf-8; action="${soapAction}"`,
        "SOAPAction":     `"${soapAction}"`,
        "Content-Length": bodyBuffer.length,
      },
      cert: pem.certChain ?? pem.cert,
      key:  pem.key,
      ca:   CA_FISCAL,
      signal: AbortSignal.timeout(45_000),
      rejectUnauthorized: true,
    }, (res) => {
      const status = res.statusCode ?? 0;
      let data = "";

      res.setEncoding("utf8");
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        console.log(`[CT-e SOAP] ${u.hostname} → HTTP ${status}`);
        if (status !== 200) console.log("[CT-e SOAP body]", data.slice(0, 500));
        resolve(status !== 200 ? `__HTTP_${status}__${data.slice(0, 300)}` : data);
      });
    });

    req.on("error", (err: NodeJS.ErrnoException) => reject(new Error(String(err))));
    req.end(bodyBuffer);
  });
}

// ─── Parser de resposta ───────────────────────────────────────────────────────
function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([^<]*)<\/(?:[^:>]+:)?${tag}>`));
  return m ? m[1] : "";
}

export interface RespostaCTe {
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

function parseResposta(soapResp: string): RespostaCTe {
  // Sentinela __HTTP_NNN__ = erro HTTP (não é resposta SEFAZ com cStat)
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
    return {
      sucesso:   false,
      cStat:     null,
      errorCode: "SEFAZ_HTTP_ERROR",
      httpStatus,
      xMotivo:   motivoHttp[httpStatus] ?? `HTTP ${httpStatus}: ${body.slice(0, 200)}`,
    };
  }

  console.log("[CT-e SOAP response]", soapResp.slice(0, 2000));

  // SOAP Fault
  const faultMatch = soapResp.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (faultMatch) {
    return { sucesso: false, cStat: null, errorCode: "SOAP_FAULT", xMotivo: `SOAP Fault: ${faultMatch[1].trim()}` };
  }

  const cStat    = tagVal(soapResp, "cStat");
  const xMotivo  = tagVal(soapResp, "xMotivo");
  const protocolo = tagVal(soapResp, "nProt");
  const dhRecbto  = tagVal(soapResp, "dhRecbto") || tagVal(soapResp, "dhRegEvento");
  const chave     = tagVal(soapResp, "chCTe");
  const xmlProtMatch = soapResp.match(/<cteProc[\s\S]*?<\/cteProc>/)
    ?? soapResp.match(/<protCTe[\s\S]*?<\/protCTe>/);
  const xmlProt = xmlProtMatch?.[0];

  if (!cStat) {
    return {
      sucesso: false, cStat: null, errorCode: "SEFAZ_UNEXPECTED_RESPONSE",
      xMotivo: `Resposta inesperada: ${soapResp.slice(0, 500)}`,
    };
  }

  return {
    sucesso:   cStat === "100",
    cStat,
    xMotivo,
    protocolo: protocolo || undefined,
    dhRecbto:  dhRecbto  || undefined,
    chave:     chave     || undefined,
    xmlProt,
  };
}

// ─── Transmissão ─────────────────────────────────────────────────────────────
export async function transmitirCTe(
  cteXmlAssinado: string,
  pem:            PemPair,
  uf:             string,
  ambiente:       Ambiente,
): Promise<RespostaCTe> {
  const ep       = endpoint(uf, ambiente);
  const soapBody = envelopeCTe(cteXmlAssinado);

  const resp = await soapPost(ep, soapBody, pem);

  return parseResposta(resp);
}

function envelopeEventoCTe(eventoXmlAssinado: string, cuf: string): string {
  const body = eventoXmlAssinado.replace(/^<\?xml[^?]*\?>\s*/i, "").trim();
  return `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Header><cteCabecMsg xmlns="${EVENT_SOAP_NS}"><cUF>${cuf}</cUF><versaoDados>4.00</versaoDados></cteCabecMsg></soap12:Header>` +
      `<soap12:Body><cteDadosMsg xmlns="${EVENT_SOAP_NS}">${body}</cteDadosMsg></soap12:Body>` +
    `</soap12:Envelope>`;
}

function endpointConsultaCTe(uf: string, ambiente: Ambiente): string {
  const autorizador = AUTORIZADOR_POR_UF[uf];
  if (!autorizador) throw new Error(`UF do emitente inválida ou não mapeada: "${uf}"`);
  return ENDPOINTS[ambiente][autorizador].replace(/CTeRecepcaoSincV4/g, "CTeConsultaV4");
}

function envelopeConsultaCTe(chave: string, ambiente: Ambiente, cuf: string): string {
  const tpAmb = ambiente === "producao" ? "1" : "2";
  return `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap12:Header><cteCabecMsg xmlns="${CONSULTA_SOAP_NS}"><cUF>${cuf}</cUF><versaoDados>4.00</versaoDados></cteCabecMsg></soap12:Header>` +
      `<soap12:Body><cteDadosMsg xmlns="${CONSULTA_SOAP_NS}"><consSitCTe versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chCTe>${chave}</chCTe></consSitCTe></cteDadosMsg></soap12:Body>` +
    `</soap12:Envelope>`;
}

function parseRespostaEventoCTe(soapResp: string): RespostaCTe {
  const infEvento = soapResp.match(/<(?:[^:>]+:)?infEvento\b[^>]*>[\s\S]*?<\/(?:[^:>]+:)?infEvento>/)?.[0];
  if (!infEvento) return parseResposta(soapResp);
  const cStat = tagVal(infEvento, "cStat");
  const xMotivo = tagVal(infEvento, "xMotivo");
  if (!cStat) return parseResposta(soapResp);
  return {
    sucesso: cStat === "135",
    cStat,
    xMotivo,
    protocolo: tagVal(infEvento, "nProt") || undefined,
    dhRecbto: tagVal(infEvento, "dhRegEvento") || undefined,
    chave: tagVal(infEvento, "chCTe") || undefined,
  };
}

export async function transmitirEventoCTe(
  eventoXmlAssinado: string,
  pem: PemPair,
  uf: string,
  ambiente: Ambiente,
): Promise<RespostaCTe> {
  const ufNormalizada = uf.trim().toUpperCase();
  const autorizador = AUTORIZADOR_POR_UF[ufNormalizada];
  if (!autorizador) throw new Error(`UF do emitente inválida ou não mapeada: "${uf}"`);
  const endpointEvento = EVENT_ENDPOINTS[ambiente][autorizador];
  const cuf = ufNormalizada === "" ? "51" : ({
    AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23", DF: "53", ES: "32", GO: "52", MA: "21",
    MG: "31", MS: "50", MT: "51", PA: "15", PB: "25", PE: "26", PI: "22", PR: "41", RJ: "33", RN: "24",
    RO: "11", RR: "14", RS: "43", SC: "42", SE: "28", SP: "35", TO: "17",
  }[ufNormalizada] ?? "51");
  const resp = await soapPost(endpointEvento, envelopeEventoCTe(eventoXmlAssinado, cuf), pem, EVENT_SOAP_ACTION);
  return parseRespostaEventoCTe(resp);
}

/** Consulta a situação oficial de um CT-e; usada para confirmar um evento duplicado. */
export async function consultarSituacaoCTe(
  chave: string,
  pem: PemPair,
  uf: string,
  ambiente: Ambiente,
): Promise<RespostaCTe> {
  const ufNormalizada = uf.trim().toUpperCase();
  const cuf = ({
    AC: "12", AL: "27", AM: "13", AP: "16", BA: "29", CE: "23", DF: "53", ES: "32", GO: "52", MA: "21",
    MG: "31", MS: "50", MT: "51", PA: "15", PB: "25", PE: "26", PI: "22", PR: "41", RJ: "33", RN: "24",
    RO: "11", RR: "14", RS: "43", SC: "42", SE: "28", SP: "35", TO: "17",
  }[ufNormalizada] ?? chave.slice(0, 2));
  // Alguns servidores SEFAZ-MT respondem a esta consulta com chunked HTTP
  // inválido para o parser do Node. O relay Deno já usado pela integração
  // fiscal lê a resposta de forma compatível e mantém o mTLS.
  const resp = await soapPostViaEdge(
    endpointConsultaCTe(ufNormalizada, ambiente),
    envelopeConsultaCTe(chave, ambiente, cuf),
    pem,
    CONSULTA_SOAP_ACTION,
  );
  return parseResposta(resp);
}
