/**
 * Supabase Edge Function: cte-transmit
 * Relay para transmissão de CT-e à SEFAZ via mTLS de IP brasileiro.
 *
 * CONFIGURAÇÃO OBRIGATÓRIA:
 * 1. Supabase Dashboard → Edge Functions → cte-transmit → Settings
 *    → DESABILITAR "Verify JWT"
 * 2. Supabase Dashboard → Edge Functions → Secrets:
 *    → EDGE_BEARER_SECRET = <mesmo valor configurado na Vercel>
 *    → ICP_BRASIL_CA_BUNDLE_B64 = bundle PEM convertido para Base64
 *       Gere com: base64 -i supabase/functions/cte-transmit/icp-brasil-bundle.pem | tr -d '\n'
 *       Ou PEM direto (sem conversão) — a função aceita ambos.
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

function splitCerts(pem: string): string[] {
  return pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
}

// ─── CA Bundle com diagnóstico detalhado ──────────────────────────────────────
type CaBundleResult =
  | { ok: true; certs: string[]; encoding: "base64" | "pem" }
  | {
      ok: false;
      code:
        | "CA_SECRET_MISSING"
        | "CA_SECRET_EMPTY"
        | "CA_BASE64_INVALID"
        | "CA_CERTIFICATES_NOT_FOUND";
      detail: string;
    };

function loadCaBundle(): CaBundleResult {
  // @ts-ignore
  const raw = (typeof Deno !== "undefined" ? Deno.env.get("ICP_BRASIL_CA_BUNDLE_B64") : undefined) as
    | string
    | undefined;

  if (raw === undefined) {
    return {
      ok: false,
      code: "CA_SECRET_MISSING",
      detail: "A variável ICP_BRASIL_CA_BUNDLE_B64 não existe no ambiente da função",
    };
  }

  const value = raw.trim();
  if (!value) {
    return {
      ok: false,
      code: "CA_SECRET_EMPTY",
      detail: "A variável ICP_BRASIL_CA_BUNDLE_B64 existe, mas está vazia",
    };
  }

  let pem: string;
  let encoding: "base64" | "pem";

  // Aceita PEM direto (para facilitar testes e diagnóstico)
  if (value.includes("-----BEGIN CERTIFICATE-----")) {
    pem = value.replaceAll("\\n", "\n");
    encoding = "pem";
  } else {
    try {
      // macOS base64 insere \n a cada 76 chars; atob() do Deno é estrito
      pem = atob(value.replace(/\s+/g, ""));
      encoding = "base64";
    } catch (error) {
      return {
        ok: false,
        code: "CA_BASE64_INVALID",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const certs = splitCerts(pem);
  if (!certs.length) {
    return {
      ok: false,
      code: "CA_CERTIFICATES_NOT_FOUND",
      detail:
        `O valor foi decodificado (${pem.length} bytes), ` +
        "mas não contém blocos BEGIN/END CERTIFICATE válidos. " +
        "Verifique se o arquivo icp-brasil-bundle.pem está correto " +
        "(execute: openssl crl2pkcs7 -nocrl -certfile icp-brasil-bundle.pem | openssl pkcs7 -print_certs -noout)",
    };
  }

  return { ok: true, certs, encoding };
}

// ─── POST SOAP com mTLS via Deno.createHttpClient ────────────────────────────
async function soapPost(
  url: string,
  body: string,
  certPem: string,
  keyPem: string,
  soapAction: string,
  caCerts: string[],
): Promise<{ status: number; body: string }> {
  // @ts-expect-error — Deno.createHttpClient: única API que aceita caCerts no Supabase Edge
  const client = Deno.createHttpClient({ cert: certPem, key: keyPem, caCerts });

  try {
    const resp = await fetch(url, {
      client,
      method: "POST",
      headers: {
        // SOAP 1.2: action embutido no Content-Type (não usa SOAPAction separado)
        "Content-Type": `application/soap+xml; charset=utf-8; action="${soapAction}"`,
      },
      body,
      signal: AbortSignal.timeout(45_000),
    });
    // Lê o body ANTES de fechar o cliente
    const responseBody = await resp.text();
    return { status: resp.status, body: responseBody };
  } finally {
    // @ts-ignore
    client.close();
  }
}

// ─── Hosts permitidos (autorizadores SEFAZ) ───────────────────────────────────
const ALLOWED_HOSTS = new Set([
  "cte.sefaz.mt.gov.br",
  "homologacao.sefaz.mt.gov.br",
  "cte.svrs.rs.gov.br",
  "cte-homologacao.svrs.rs.gov.br",
  "nfe.fazenda.sp.gov.br",
  "homologacao.nfe.fazenda.sp.gov.br",
  "cte.fazenda.mg.gov.br",
  "hcte.fazenda.mg.gov.br",
]);

// @ts-ignore
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  // Valida EDGE_BEARER_SECRET
  // @ts-ignore
  const EDGE_SECRET = (typeof Deno !== "undefined"
    // @ts-ignore
    ? Deno.env.get("EDGE_BEARER_SECRET")
    : undefined) as string | undefined;

  if (EDGE_SECRET) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    if (token !== EDGE_SECRET) {
      console.warn("[cte-transmit] acesso negado — EDGE_BEARER_SECRET inválido");
      return json({ error: "Unauthorized — EDGE_BEARER_SECRET inválido" }, 401);
    }
  }

  let endpoint: string,
    soapBody: string,
    certPem: string,
    keyPem: string,
    soapAction: string;

  try {
    const p = (await req.json()) as {
      endpoint: string;
      soapBody: string;
      certPem: string;
      keyPem: string;
      soapAction?: string;
      soapVersion?: string; // mantido por compatibilidade, ignorado (sempre SOAP 1.2)
    };
    endpoint   = p.endpoint;
    soapBody   = p.soapBody;
    certPem    = p.certPem;
    keyPem     = p.keyPem;
    soapAction = p.soapAction ?? "http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4/cteRecepcao";
  } catch {
    return json({ error: "Bad Request — JSON inválido" }, 400);
  }

  if (!endpoint || !soapBody || !certPem || !keyPem) {
    return json({ error: "Bad Request — campos obrigatórios ausentes (endpoint, soapBody, certPem, keyPem)" }, 400);
  }

  let host: string;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    return json({ error: "Endpoint inválido — não é uma URL válida" }, 400);
  }

  if (!ALLOWED_HOSTS.has(host)) {
    return json({ error: `Endpoint não permitido: ${host}` }, 403);
  }

  // Carrega CA bundle com diagnóstico detalhado
  const caResult = loadCaBundle();
  if (!caResult.ok) {
    console.error("[cte-transmit] CA inválida:", caResult);
    return json(
      {
        errorCode: caResult.code,
        error: caResult.detail,
        cStat: null,
      },
      500,
    );
  }

  const caCerts = caResult.certs;
  console.log("[cte-transmit] CA carregada:", {
    encoding: caResult.encoding,
    certificateCount: caCerts.length,
    endpoint: host,
  });

  try {
    const result = await soapPost(endpoint, soapBody, certPem, keyPem, soapAction, caCerts);
    console.log(`[cte-transmit] → HTTP ${result.status} (${result.body.length} bytes)`);
    if (result.status !== 200) {
      console.log("[cte-transmit] body:", result.body.slice(0, 500));
    }
    return json({ httpStatus: result.status, body: result.body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cte-transmit] erro:", msg);

    if (
      msg.includes("UnknownIssuer") ||
      msg.includes("unknown issuer") ||
      msg.includes("UNABLE_TO_GET_ISSUER_CERT")
    ) {
      return json(
        {
          error:
            `SEFAZ_TLS_UNKNOWN_ISSUER: ${msg}. ` +
            "Verifique se ICP_BRASIL_CA_BUNDLE_B64 está correto (AC Raiz v10 + SERPRO SSLv1).",
          cStat: null,
        },
        502,
      );
    }
    if (msg.includes("timed out") || msg.includes("timeout") || msg.includes("Timeout")) {
      return json({ error: `SEFAZ_TIMEOUT: ${msg}`, cStat: null }, 504);
    }
    return json({ error: `SEFAZ_TRANSPORT_ERROR: ${msg}`, cStat: null }, 502);
  }
});
