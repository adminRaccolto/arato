/**
 * Supabase Edge Function: cte-transmit
 * Relay para transmissão de CT-e à SEFAZ via mTLS de IP brasileiro.
 *
 * CONFIGURAÇÃO OBRIGATÓRIA:
 * 1. Supabase Dashboard → Edge Functions → cte-transmit → Settings
 *    → DESABILITAR "Verify JWT"
 * 2. Supabase Dashboard → Edge Functions → Secrets
 *    → EDGE_BEARER_SECRET = <mesmo valor configurado na Vercel>
 *    → ICP_BRASIL_CA_BUNDLE_B64 = <bundle PEM em Base64>
 *       Gerado via: base64 -i supabase/functions/cte-transmit/icp-brasil-bundle.pem | tr -d '\n'
 *
 * DIAGNÓSTICO: se ICP_BRASIL_CA_BUNDLE_B64 não estiver configurado, a Edge Function
 * retorna SEFAZ_TLS_UNKNOWN_ISSUER — o Deno ignora rejectUnauthorized:false em node:https
 * e sempre valida o certificado do servidor usando seu CA store nativo (sem ICP-Brasil).
 */

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

/** Divide um PEM com múltiplos certificados em array de PEM individuais */
function splitCerts(pem: string): string[] {
  const matches = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  return matches ?? [];
}

/**
 * Decodifica ICP_BRASIL_CA_BUNDLE_B64 (Base64 → array de PEM).
 * Retorna null se o secret não estiver configurado (sem fallback — é obrigatório).
 */
function loadCaBundle(): string[] | null {
  // @ts-ignore
  const b64 = (typeof Deno !== "undefined" ? Deno.env.get("ICP_BRASIL_CA_BUNDLE_B64") : null) as string | null;
  if (!b64) return null;
  try {
    // Remove espaços/quebras de linha — macOS base64 insere \n a cada 76 chars;
    // atob() do Deno é estrito e rejeita qualquer caractere fora do alfabeto Base64.
    const b64clean = b64.replace(/\s+/g, "");
    const pem = atob(b64clean);
    const certs = splitCerts(pem);
    if (certs.length === 0) {
      console.error("[cte-transmit] ICP_BRASIL_CA_BUNDLE_B64 decodificado mas sem certificados PEM válidos");
      return null;
    }
    console.log(`[cte-transmit] CA bundle carregado: ${certs.length} cert(s)`);
    return certs;
  } catch (e) {
    console.error("[cte-transmit] Falha ao decodificar ICP_BRASIL_CA_BUNDLE_B64 (Base64 inválido?):", e);
    return null;
  }
}

/**
 * POST SOAP com mTLS via Deno.createHttpClient + caCerts.
 *
 * Por que Deno.createHttpClient e não node:https?
 * O Deno ignora rejectUnauthorized:false em node:https — o TLS usa o stack
 * nativo do Deno que não inclui as CAs da ICP-Brasil. Deno.createHttpClient
 * é a única API que aceita caCerts customizados no runtime do Supabase.
 *
 * soapVersion "1.2": Content-Type application/soap+xml + SOAPAction header
 */
async function soapPost(
  url: string,
  body: string,
  certPem: string,
  keyPem: string,
  soapAction: string,
  soapVersion: string,
  caCerts: string[],
): Promise<{ status: number; body: string }> {
  // @ts-ignore — Deno.createHttpClient: disponível no Supabase Edge Functions
  const client = Deno.createHttpClient({
    cert:    certPem,
    key:     keyPem,
    caCerts,          // CAs da ICP-Brasil (AC Raiz v10 + SERPRO SSLv1)
  });

  // Headers exatos do sped-cte (padrão de facto para CT-e no Brasil)
  const contentType = soapVersion === "1.2"
    ? `application/soap+xml;charset=UTF-8;action="${soapAction}"`
    : `text/xml;charset=UTF-8`;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "SOAPAction":   `"${soapAction}"`,
  };

  let resp: Response;
  try {
    resp = await fetch(url, {
      // @ts-ignore — extensão Deno: client é aceito pelo fetch do Supabase runtime
      client,
      method: "POST",
      headers,
      body,
    });
  } finally {
    // @ts-ignore
    client.close?.();
  }

  const text = await resp.text();
  return { status: resp.status, body: text };
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
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    if (token !== EDGE_SECRET) {
      console.warn("[cte-transmit] acesso negado — EDGE_BEARER_SECRET inválido");
      return json({ error: "Unauthorized — EDGE_BEARER_SECRET inválido" }, 401);
    }
  }

  let endpoint: string, soapBody: string, certPem: string, keyPem: string,
      soapAction: string, soapVersion: string;
  try {
    const p = await req.json() as {
      endpoint: string; soapBody: string; certPem: string; keyPem: string;
      soapAction?: string; soapVersion?: string;
    };
    endpoint    = p.endpoint;
    soapBody    = p.soapBody;
    certPem     = p.certPem;
    keyPem      = p.keyPem;
    soapVersion = p.soapVersion ?? "1.2";
    soapAction  = p.soapAction  ?? "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4/cteRecepcao";
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
      return json({ error: `Endpoint não permitido: ${host}` }, 403);
    }
  } catch {
    return json({ error: "Endpoint inválido" }, 400);
  }

  // ICP_BRASIL_CA_BUNDLE_B64 é obrigatório — Deno não tem as CAs da ICP-Brasil nativamente
  const caCerts = loadCaBundle();
  if (!caCerts) {
    console.error("[cte-transmit] ICP_BRASIL_CA_BUNDLE_B64 não configurado");
    return json({
      error:  "SEFAZ_TLS_UNKNOWN_ISSUER: ICP_BRASIL_CA_BUNDLE_B64 não configurado nas Secrets da Edge Function. " +
              "Gere o Base64 com: base64 -i supabase/functions/cte-transmit/icp-brasil-bundle.pem | tr -d '\\n' " +
              "e adicione como secret ICP_BRASIL_CA_BUNDLE_B64 no Supabase Dashboard.",
      cStat:  null,
    }, 502);
  }

  console.log(`[cte-transmit] SOAP ${soapVersion} | ${caCerts.length} CA(s) ICP-Brasil | ${new URL(endpoint).hostname}`);

  try {
    const result = await soapPost(endpoint, soapBody, certPem, keyPem, soapAction, soapVersion, caCerts);
    console.log(`[cte-transmit] → HTTP ${result.status} (${result.body.length} bytes)`);
    if (result.status !== 200) {
      console.log("[cte-transmit] body:", result.body.slice(0, 500));
    }
    return json({ httpStatus: result.status, body: result.body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cte-transmit] erro:", msg);

    if (msg.includes("UnknownIssuer") || msg.includes("unknown issuer") || msg.includes("UNABLE_TO_GET_ISSUER_CERT")) {
      return json({
        error: `SEFAZ_TLS_UNKNOWN_ISSUER: ${msg}. ` +
               "Verifique se ICP_BRASIL_CA_BUNDLE_B64 está correto nas Secrets.",
        cStat: null,
      }, 502);
    }
    if (msg.includes("timed out") || msg.includes("timeout")) {
      return json({ error: `SEFAZ_TIMEOUT: ${msg}`, cStat: null }, 504);
    }
    return json({ error: `SEFAZ_TRANSPORT_ERROR: ${msg}`, cStat: null }, 502);
  }
});
