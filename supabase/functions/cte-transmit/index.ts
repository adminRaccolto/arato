/**
 * Supabase Edge Function: cte-transmit
 * Relay para transmissão de CT-e à SEFAZ via mTLS de IP brasileiro.
 *
 * CONFIGURAÇÃO OBRIGATÓRIA:
 * 1. Supabase Dashboard → Edge Functions → cte-transmit → Settings
 *    → DESABILITAR "Verify JWT"
 * 2. Supabase Dashboard → Edge Functions → Secrets
 *    → EDGE_BEARER_SECRET = <mesmo valor configurado na Vercel>
 *    → ICP_BRASIL_CA_BUNDLE_B64 = <bundle PEM da ICP-Brasil em Base64>
 *       (AC Raiz Brasileira v10 + Autoridade Certificadora SERPRO SSLv1)
 *       Gerado via: base64 -w0 icp-brasil-bundle.pem
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
 * Decodifica ICP_BRASIL_CA_BUNDLE_B64 (Base64 → PEM string).
 * Retorna array vazio se a variável não estiver configurada.
 */
function loadCaBundle(): string[] {
  // @ts-ignore — Deno env
  const b64 = (typeof Deno !== "undefined" ? Deno.env.get("ICP_BRASIL_CA_BUNDLE_B64") : null) as string | null;
  if (!b64) return [];
  try {
    const pem = atob(b64);
    const certs = splitCerts(pem);
    if (certs.length === 0) {
      console.warn("[cte-transmit] ICP_BRASIL_CA_BUNDLE_B64 decodificado mas sem certificados PEM");
    }
    return certs;
  } catch (e) {
    console.error("[cte-transmit] Falha ao decodificar ICP_BRASIL_CA_BUNDLE_B64:", e);
    return [];
  }
}

/**
 * POST SOAP com mTLS usando Deno.createHttpClient + CA bundle da ICP-Brasil.
 * Fallback para node:https com rejectUnauthorized:false se o bundle não estiver configurado.
 */
/** Monta os headers HTTP para SOAP 1.1 ou 1.2 */
function soapHeaders(soapAction: string, soapVersion: string): Record<string, string> {
  if (soapVersion === "1.2") {
    // SOAP 1.2: action embutido no Content-Type
    return { "Content-Type": `application/soap+xml; charset=utf-8; action=${soapAction}` };
  }
  // SOAP 1.1 (padrão SEFAZ): text/xml + SOAPAction header separado
  // soapAction já vem com aspas: '"http://..."'
  return {
    "Content-Type": "text/xml; charset=utf-8",
    "SOAPAction":   soapAction,
  };
}

async function soapPostMtls(
  url: string,
  body: string,
  certPem: string,
  keyPem: string,
  soapAction: string,
  soapVersion: string,
  caCerts: string[],
): Promise<{ status: number; body: string }> {
  const headers = soapHeaders(soapAction, soapVersion);

  // ─── Caminho A: Deno.createHttpClient com CA bundle (seguro) ──────────────
  if (caCerts.length > 0) {
    // @ts-ignore — Deno API
    const client = Deno.createHttpClient({
      cert: certPem,
      key: keyPem,
      caCerts,
    });

    let resp: Response;
    try {
      resp = await fetch(url, {
        // @ts-ignore — extensão Deno: client é aceito pelo fetch do Deno
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

  // ─── Caminho B: node:https sem validação de CA (fallback inseguro) ────────
  console.warn(
    "[cte-transmit] ICP_BRASIL_CA_BUNDLE_B64 não configurado — usando rejectUnauthorized:false. " +
    "Configure o secret para habilitar validação TLS completa da ICP-Brasil.",
  );

  // @ts-ignore — node: disponível no Deno 1.30+ (Supabase usa versão recente)
  const https = await import("node:https");
  // @ts-ignore
  const { Buffer } = await import("node:buffer");

  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuf = Buffer.from(body, "utf8");

    const req = https.default.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: { ...headers, "Content-Length": bodyBuf.length },
        cert: certPem,
        key: keyPem,
        rejectUnauthorized: false,
      },
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
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  // Autenticação por secret compartilhado (JWT verification deve estar DESABILITADO)
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

  let endpoint: string, soapBody: string, certPem: string, keyPem: string, soapAction: string, soapVersion: string;
  try {
    const payload = await req.json() as {
      endpoint: string;
      soapBody: string;
      certPem: string;
      keyPem: string;
      soapAction?: string;
      soapVersion?: string;  // "1.1" (text/xml + SOAPAction header) ou "1.2" (application/soap+xml)
    };
    endpoint    = payload.endpoint;
    soapBody    = payload.soapBody;
    certPem     = payload.certPem;
    keyPem      = payload.keyPem;
    soapVersion = payload.soapVersion ?? "1.1";
    soapAction  = payload.soapAction ?? '"http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4/cteRecepcao"';
  } catch {
    return json({ error: "Bad Request — JSON inválido" }, 400);
  }

  if (!endpoint || !soapBody || !certPem || !keyPem) {
    return json({ error: "Bad Request — campos obrigatórios ausentes (endpoint, soapBody, certPem, keyPem)" }, 400);
  }

  // Valida que o endpoint é SVRS/SEFAZ (segurança mínima)
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

  const caCerts = loadCaBundle();
  const secureMode = caCerts.length > 0;
  console.log(`[cte-transmit] SOAP ${soapVersion} | TLS: ${secureMode ? `seguro (${caCerts.length} CA(s) ICP-Brasil)` : "fallback rejectUnauthorized:false"}`);

  try {
    const result = await soapPostMtls(endpoint, soapBody, certPem, keyPem, soapAction, soapVersion, caCerts);
    console.log(`[cte-transmit] ${new URL(endpoint).hostname} → HTTP ${result.status} (${result.body.length} bytes)`);
    if (result.status !== 200) {
      console.log("[cte-transmit] body:", result.body.slice(0, 500));
    }
    return json({ httpStatus: result.status, body: result.body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isUnknownIssuer = msg.includes("UnknownIssuer") || msg.includes("unknown issuer");
    console.error("[cte-transmit] erro mTLS:", msg);

    if (isUnknownIssuer) {
      return json({
        error: `SEFAZ_TLS_UNKNOWN_ISSUER: ${msg}. ` +
          "Configure ICP_BRASIL_CA_BUNDLE_B64 nas Secrets da Edge Function com o bundle da ICP-Brasil.",
        cStat: null,
      }, 502);
    }

    const isTimeout = msg.includes("timed out") || msg.includes("timeout");
    if (isTimeout) {
      return json({ error: `SEFAZ_TIMEOUT: ${msg}`, cStat: null }, 504);
    }

    return json({ error: `SEFAZ_TRANSPORT_ERROR: ${msg}`, cStat: null }, 502);
  }
});
