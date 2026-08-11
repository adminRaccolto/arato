/**
 * lib/cte/transmitter.ts
 * Transmite o CT-e assinado para os webservices da SEFAZ via SOAP 1.2 com mTLS.
 *
 * Roteamento: pela UF do emitente (não por uf_ini/uf_fim do transporte).
 * Relay via Supabase Edge Function (sa-east-1) quando rodando na Vercel (IP EUA).
 */

import https from "https";
import { gunzipSync } from "node:zlib";
import type { PemPair } from "../nfe/signer";

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

const CUF_MAP: Record<string, string> = {
  AC:"12",AL:"27",AM:"13",AP:"16",BA:"29",CE:"23",DF:"53",ES:"32",
  GO:"52",MA:"21",MG:"31",MS:"50",MT:"51",PA:"15",PB:"25",PE:"26",
  PI:"22",PR:"41",RJ:"33",RN:"24",RO:"11",RR:"14",RS:"43",SC:"42",
  SE:"28",SP:"35",TO:"17",
};

// CT-e 3.00: XML direto em cteDadosMsg + cteCabecMsg obrigatório no Header
function envelopeCTe(cteXml: string, cuf: string): string {
  const cteXmlBody = cteXml.replace(/^<\?xml[^?]*\?>\s*/i, "");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap12:Header>
    <cteCabecMsg xmlns="${SOAP_NS}">
      <cUF>${cuf}</cUF>
      <versaoDados>4.00</versaoDados>
    </cteCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <cteDadosMsg xmlns="${SOAP_NS}">
      ${cteXmlBody}
    </cteDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

// ─── Diagnóstico do envelope ──────────────────────────────────────────────────
function inspectSoapEnvelope(soapBody: string): void {
  const match   = soapBody.match(/<cteDadosMsg[^>]*>([\s\S]*?)<\/cteDadosMsg>/);
  const payload = match?.[1].trim() ?? "";

  let cteVersion: string | null = null;
  let gzipValid = false;

  try {
    const cteXml = gunzipSync(Buffer.from(payload, "base64")).toString("utf8");
    gzipValid    = true;
    cteVersion   = cteXml.match(/<infCte[^>]*versao="([^"]+)"/)?.[1] ?? null;
  } catch {
    // payload não é gzip — esperado no formato atual (CT-e 3.00 direto)
  }

  console.log("[CT-e SOAP check]", {
    soap12:            soapBody.includes("http://www.w3.org/2003/05/soap-envelope"),
    hasCteCabecMsg:    soapBody.includes("<cteCabecMsg"),
    containsRawCte:    payload.includes("<CTe"),
    payloadLength:     payload.length,
    gzipValid,
    cteVersion,
  });
}

// ─── Relay via Supabase Edge Function (IP brasileiro) ────────────────────────
async function soapPostViaEdge(url: string, body: string, pem: PemPair): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_SEFAZ_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const edgeFnUrl   = `${supabaseUrl}/functions/v1/cte-transmit`;
  const edgeSecret  = process.env.EDGE_BEARER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const resp = await fetch(edgeFnUrl, {
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
      soapAction:  SOAP_ACTION,
      soapVersion: "1.2",
    }),
  });

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

// ─── SOAP direto (fallback dev local no Brasil) ───────────────────────────────
function soapPost(url: string, body: string, pem: PemPair): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: "POST",
      headers: {
        "Content-Type": `application/soap+xml;charset=UTF-8;action="${SOAP_ACTION}"`,
        "SOAPAction":   `"${SOAP_ACTION}"`,
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
      cert: pem.certChain ?? pem.cert,
      key:  pem.key,
    }, (res) => {
      const status = res.statusCode ?? 0;
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        console.log(`[CT-e SOAP] ${u.hostname} → HTTP ${status}`);
        if (status !== 200) console.log("[CT-e SOAP body]", data.slice(0, 500));
        resolve(status !== 200 ? `__HTTP_${status}__${data.slice(0, 300)}` : data);
      });
    });
    req.on("error", (err: NodeJS.ErrnoException) => reject(new Error(String(err))));
    req.write(body);
    req.end();
  });
}

// ─── Parser de resposta ───────────────────────────────────────────────────────
function tagVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`));
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
  const dhRecbto  = tagVal(soapResp, "dhRecbto");
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
  const ep  = endpoint(uf, ambiente);
  const cuf = CUF_MAP[uf.toUpperCase()] ?? "51";
  const soapBody = envelopeCTe(cteXmlAssinado, cuf);

  inspectSoapEnvelope(soapBody);

  const edgeUrl    = process.env.SUPABASE_SEFAZ_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const edgeSecret = process.env.EDGE_BEARER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  const useEdge    = !!(edgeUrl && edgeSecret);

  const resp = useEdge
    ? await soapPostViaEdge(ep, soapBody, pem)
    : await soapPost(ep, soapBody, pem);

  return parseResposta(resp);
}
