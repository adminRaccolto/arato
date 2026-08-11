/**
 * lib/cte/transmitter.ts
 * Transmite o CT-e assinado para os webservices da SEFAZ via SOAP 1.2 com mTLS.
 * MT usa SVRS (RS) como autorizador para CT-e.
 *
 * PROBLEMA DE IP: o SVRS bloqueia IPs não-brasileiros (Vercel roda nos EUA).
 * SOLUÇÃO: quando SUPABASE_URL está definida, roteia via Supabase Edge Function
 * "cte-transmit" que roda em São Paulo (sa-east-1) e faz o mTLS de um IP BR.
 */

import https from "https";
import type { PemPair } from "../nfe/signer";

// ─── Endpoints ────────────────────────────────────────────────────────────────
// Serviço CT-e 3.00: CTeRecepcaoSincV4 (recepção síncrona)
// MT e demais estados SVRS usam o autorizador do RS.
const ENDPOINT_PROD: Record<string, string> = {
  SP:    "https://nfe.fazenda.sp.gov.br/cteWEB/services/CTeRecepcaoSincV4",
  MG:    "https://cte.fazenda.mg.gov.br/cte/services/CTeRecepcaoSincV4",
  _svrs: "https://cte.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
};

const ENDPOINT_HOM: Record<string, string> = {
  _svrs: "https://cte-homologacao.svrs.rs.gov.br/ws/CTeRecepcaoSincV4/CTeRecepcaoSincV4.asmx",
};

// SOAP 1.2 — SVRS retorna soap12:Upgrade fault quando recebe SOAP 1.1
const SOAP_ACTION = 'http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4/cteRecepcao';
const SOAP_NS    = 'http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4';

function endpoint(uf: string, ambiente: "producao" | "homologacao"): string {
  if (ambiente === "homologacao") return ENDPOINT_HOM[uf] ?? ENDPOINT_HOM["_svrs"];
  return ENDPOINT_PROD[uf] ?? ENDPOINT_PROD["_svrs"];
}

// ─── Relay via Supabase Edge Function (IP brasileiro) ────────────────────────
async function soapPostViaEdge(url: string, body: string, pem: PemPair): Promise<string> {
  // SUPABASE_SEFAZ_URL/KEY = projeto separado em sa-east-1 (São Paulo) para IP BR.
  // Fallback para o projeto principal (pode estar em região diferente).
  const supabaseUrl = process.env.SUPABASE_SEFAZ_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const edgeFnUrl   = `${supabaseUrl}/functions/v1/cte-transmit`;

  // EDGE_BEARER_SECRET: secret compartilhado entre Vercel e Supabase Edge Function.
  // Define nas variáveis de ambiente do Supabase (Edge Functions → Secrets → EDGE_BEARER_SECRET)
  // e na Vercel (Settings → Environment Variables → EDGE_BEARER_SECRET).
  // A Edge Function usa JWT verification DESABILITADO e valida com esse secret.
  const edgeSecret = process.env.EDGE_BEARER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const resp = await fetch(edgeFnUrl, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${edgeSecret}`,
    },
    body: JSON.stringify({
      endpoint:    url,
      soapBody:    body,
      certPem:     pem.cert,
      keyPem:      pem.key,
      soapAction:  SOAP_ACTION,
      soapVersion: "1.2",
    }),
  });

  // Supabase pode retornar texto puro (ex: "Unauthorized") se JWT verification estiver ativo
  // e o token não passar. Tratamos isso como erro claro em vez de SyntaxError.
  const contentType = resp.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await resp.text().catch(() => "");
    console.error(`[CT-e via Edge] HTTP ${resp.status}, content-type: ${contentType}, body: ${text.slice(0, 200)}`);
    if (resp.status === 401 || text.toLowerCase().includes("unauthorized")) {
      throw new Error(
        "Edge Function: acesso negado (401). " +
        "Desabilite JWT verification na Edge Function (Supabase Dashboard → Edge Functions → cte-transmit → Settings) " +
        "e adicione EDGE_BEARER_SECRET nas variáveis de ambiente do Supabase e da Vercel."
      );
    }
    throw new Error(`Edge Function retornou HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }

  const result = await resp.json() as { httpStatus?: number; body?: string; error?: string };
  if (result.error) throw new Error(`Edge Function erro: ${result.error}`);

  const httpStatus = result.httpStatus ?? 0;
  const soapResp   = result.body ?? "";

  console.log(`[CT-e via Edge] → HTTP ${httpStatus}`);
  if (httpStatus === 0) {
    // status 0 = conexão silenciada antes de resposta HTTP (Deno.createHttpClient não funciona
    // em Deno Deploy). A Edge Function deve usar node:https para mTLS. Atualize o código
    // da Edge Function no Supabase Dashboard Editor com a versão mais recente.
    throw new Error(
      "mTLS falhou na Edge Function (HTTP 0 — conexão sem resposta). " +
      "Atualize o código da Edge Function no Supabase Dashboard → Edge Functions → cte-transmit → Via Editor " +
      "com o arquivo supabase/functions/cte-transmit/index.ts mais recente do repositório."
    );
  }
  if (httpStatus !== 200) {
    console.log("[CT-e via Edge body]", soapResp.slice(0, 500));
    return `__HTTP_${httpStatus}__${soapResp.slice(0, 300)}`;
  }
  return soapResp;
}

// ─── SOAP request com mTLS — direto (fallback local/dev) ─────────────────────
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
          "Content-Type": "text/xml; charset=utf-8",
          "SOAPAction":   SOAP_ACTION,
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
    req.on("error", (err: NodeJS.ErrnoException) => {
      const msg = err.code === "ECONNRESET" || err.code === "ECONNREFUSED"
        ? `Servidor SEFAZ recusou a conexão (${err.code}). Verifique o certificado A1 — deve ser emitido por AC ICP-Brasil (Certisign, Soluti, Valid, SERPRO).`
        : String(err);
      reject(new Error(msg));
    });
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

// ─── Envelope SOAP 1.2 — CTeRecepcaoSincV4 ──────────────────────────────────
// CTeRecepcaoSincV4 = serviço síncrono: cteDadosMsg contém o CTe diretamente.
// (enviCTe é só para o serviço assíncrono de lote — não usar aqui)
function envelopeCTe(cteXml: string, cuf: string, tpAmb: "1" | "2"): string {
  const cteXmlBody = cteXml.replace(/^<\?xml[^?]*\?>\s*/i, "");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Header>
    <cteCabecMsg xmlns="${SOAP_NS}">
      <cUF>${cuf}</cUF>
      <versaoDados>3.00</versaoDados>
    </cteCabecMsg>
  </soap12:Header>
  <soap12:Body>
    <cteDadosMsg xmlns="${SOAP_NS}">
      ${cteXmlBody}
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

  // Usa Edge Function quando rodando em produção (Vercel EUA → SEFAZ rejeita por IP).
  // Em desenvolvimento local (Mac no Brasil) chama direto.
  const useEdge = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const resp = useEdge
    ? await soapPostViaEdge(ep, soapBody, pem)
    : await soapPost(ep, soapBody, pem);

  return parseResposta(resp);
}
