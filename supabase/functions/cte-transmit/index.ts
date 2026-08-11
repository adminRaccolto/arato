/**
 * Supabase Edge Function: cte-transmit
 * Relay para transmissão de CT-e à SEFAZ via mTLS de IP brasileiro.
 *
 * CONFIGURAÇÃO OBRIGATÓRIA:
 * 1. Supabase Dashboard → Edge Functions → cte-transmit → Settings
 *    → DESABILITAR "Verify JWT"
 * 2. Supabase Dashboard → Edge Functions → Secrets
 *    → EDGE_BEARER_SECRET = <mesmo valor configurado na Vercel>
 *    → ICP_BRASIL_CA_BUNDLE_B64 = <bundle PEM em Base64 — AC Raiz v10 + SERPRO SSLv1>
 *       Gerado via: base64 -i supabase/functions/cte-transmit/icp-brasil-bundle.pem
 */

// @ts-ignore — node: disponível no Deno 1.30+ (Supabase usa versão recente)
import https from "node:https";
// @ts-ignore
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Divide um PEM com múltiplos certificados em array de strings PEM */
function splitCerts(pem: string): string[] {
  const matches = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  return matches ?? [];
}

/**
 * Decodifica ICP_BRASIL_CA_BUNDLE_B64 (Base64 → PEM).
 * Retorna array vazio se a variável não estiver configurada.
 * node:https aceita o array `ca` diretamente.
 */
function loadCaBundle(): string[] {
  // @ts-ignore
  const b64 = (typeof Deno !== "undefined" ? Deno.env.get("ICP_BRASIL_CA_BUNDLE_B64") : null) as string | null;
  if (!b64) return [];
  try {
    const pem = atob(b64);
    return splitCerts(pem);
  } catch (e) {
    console.error("[cte-transmit] Falha ao decodificar ICP_BRASIL_CA_BUNDLE_B64:", e);
    return [];
  }
}

/**
 * POST SOAP com mTLS via node:https.
 * Usa `ca` para validar a cadeia ICP-Brasil quando o bundle estiver configurado;
 * caso contrário usa rejectUnauthorized:false (fallback inseguro com aviso).
 *
 * soapVersion "1.2": Content-Type application/soap+xml (SVRS exige 1.2)
 * soapVersion "1.1": Content-Type text/xml + SOAPAction header (legado)
 */
function soapPostMtls(
  url: string,
  body: string,
  certPem: string,
  keyPem: string,
  soapAction: string,
  soapVersion: string,
  caBundlePems: string[],
): Promise<{ status: number; body: string }> {
  const secureMode = caBundlePems.length > 0;
  if (!secureMode) {
    console.warn(
      "[cte-transmit] ICP_BRASIL_CA_BUNDLE_B64 não configurado — usando rejectUnauthorized:false. " +
      "Configure o secret para validação TLS completa da ICP-Brasil.",
    );
  }

  // Monta headers conforme versão SOAP
  const contentType = soapVersion === "1.2"
    ? `application/soap+xml; charset=utf-8; action="${soapAction}"`
    : "text/xml; charset=utf-8";

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuf = Buffer.from(body, "utf8");

    const reqOptions: Record<string, unknown> = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: "POST",
      headers: {
        "Content-Type":   contentType,
        "Content-Length": bodyBuf.length,
        ...(soapVersion === "1.1" ? { SOAPAction: `"${soapAction}"` } : {}),
      },
      cert: certPem,
      key:  keyPem,
    };

    if (secureMode) {
      // Valida servidor com as CAs da ICP-Brasil
      reqOptions.ca = caBundlePems;
      reqOptions.rejectUnauthorized = true;
    } else {
      reqOptions.rejectUnauthorized = false;
    }

    const req = https.request(
      reqOptions,
      (res: { statusCode?: number; on: (e: string, cb: (d?: unknown) => void) => void }) => {
        const status = res.statusCode ?? 0;
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => resolve({ status, body: data }));
      },
    );

    req.on("error", (err: Error) => reject(err));
    req.write(bodyBuf);
    req.end();
  });
}

// @ts-ignore
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  // @ts-ignore
  const EDGE_SECRET = (typeof Deno !== "undefined" ? Deno.env.get("EDGE_BEARER_SECRET") : null) as string | null;
  if (EDGE_SECRET) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token !== EDGE_SECRET) {
      console.warn("[cte-transmit] acesso negado — EDGE_BEARER_SECRET inválido");
      return json({ error: "Unauthorized — EDGE_BEARER_SECRET inválido" }, 401);
    }
  }

  let endpoint: string, soapBody: string, certPem: string, keyPem: string,
      soapAction: string, soapVersion: string;
  try {
    const payload = await req.json() as {
      endpoint: string;
      soapBody: string;
      certPem: string;
      keyPem: string;
      soapAction?: string;
      soapVersion?: string;
    };
    endpoint    = payload.endpoint;
    soapBody    = payload.soapBody;
    certPem     = payload.certPem;
    keyPem      = payload.keyPem;
    soapVersion = payload.soapVersion ?? "1.2";
    soapAction  = payload.soapAction  ?? "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4/cteRecepcao";
  } catch {
    return json({ error: "Bad Request — JSON inválido" }, 400);
  }

  if (!endpoint || !soapBody || !certPem || !keyPem) {
    return json({ error: "Bad Request — campos obrigatórios ausentes" }, 400);
  }

  const allowedHosts = [
    "cte.svrs.rs.gov.br",
    "cte-homologacao.svrs.rs.gov.br",
    "nfe.fazenda.sp.gov.br",
    "cte.fazenda.mg.gov.br",
    "hom.cte.fazenda.gov.br",
  ];
  try {
    const host = new URL(endpoint).hostname;
    if (!allowedHosts.some(h => host.endsWith(h))) {
      console.warn("[cte-transmit] endpoint não permitido:", host);
      return json({ error: `Endpoint não permitido: ${host}` }, 403);
    }
  } catch {
    return json({ error: "Endpoint inválido" }, 400);
  }

  const caBundlePems = loadCaBundle();
  console.log(
    `[cte-transmit] SOAP ${soapVersion} | TLS: ${caBundlePems.length > 0 ? `seguro (${caBundlePems.length} CA(s) ICP-Brasil)` : "fallback rejectUnauthorized:false"}`
  );

  try {
    const result = await soapPostMtls(
      endpoint, soapBody, certPem, keyPem, soapAction, soapVersion, caBundlePems,
    );
    console.log(`[cte-transmit] ${new URL(endpoint).hostname} → HTTP ${result.status} (${result.body.length} bytes)`);
    if (result.status !== 200) {
      console.log("[cte-transmit] body:", result.body.slice(0, 500));
    }
    return json({ httpStatus: result.status, body: result.body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cte-transmit] erro mTLS:", msg);

    if (msg.includes("UnknownIssuer") || msg.includes("unknown issuer") || msg.includes("UNABLE_TO_GET_ISSUER_CERT")) {
      return json({
        error: `SEFAZ_TLS_UNKNOWN_ISSUER: ${msg}. Configure ICP_BRASIL_CA_BUNDLE_B64 nas Secrets.`,
        cStat: null,
      }, 502);
    }
    if (msg.includes("timed out") || msg.includes("timeout")) {
      return json({ error: `SEFAZ_TIMEOUT: ${msg}`, cStat: null }, 504);
    }
    return json({ error: `SEFAZ_TRANSPORT_ERROR: ${msg}`, cStat: null }, 502);
  }
});
