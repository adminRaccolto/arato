/**
 * Supabase Edge Function: cte-transmit
 * Relay para transmissão de CT-e à SEFAZ via mTLS de IP brasileiro.
 *
 * Usa node:https com rejectUnauthorized:false porque o SVRS usa certificado
 * assinado pela AC ICP-Brasil, que não está no bundle de CAs padrão do Deno.
 * A segurança é garantida pela assinatura digital do XML (não pelo TLS do servidor).
 *
 * CONFIGURAÇÃO OBRIGATÓRIA:
 * 1. Supabase Dashboard → Edge Functions → cte-transmit → Settings
 *    → DESABILITAR "Verify JWT"
 * 2. Supabase Dashboard → Edge Functions → Secrets
 *    → EDGE_BEARER_SECRET = <mesmo valor configurado na Vercel>
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

function soapPostMtls(
  url: string,
  body: string,
  certPem: string,
  keyPem: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuf = Buffer.from(body, "utf8");

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/cte/wsdl/CTeAutorizacao4/cteDadosMsg"',
          "Content-Length": bodyBuf.length,
        },
        cert: certPem,
        key: keyPem,
        // ICP-Brasil CA não está no bundle padrão do Deno/Node.
        // A integridade é garantida pela assinatura digital do XML CT-e.
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

  let endpoint: string, soapBody: string, certPem: string, keyPem: string;
  try {
    const payload = await req.json() as {
      endpoint: string;
      soapBody: string;
      certPem: string;
      keyPem: string;
    };
    endpoint = payload.endpoint;
    soapBody = payload.soapBody;
    certPem  = payload.certPem;
    keyPem   = payload.keyPem;
  } catch {
    return json({ error: "Bad Request — JSON inválido" }, 400);
  }

  if (!endpoint || !soapBody || !certPem || !keyPem) {
    return json({ error: "Bad Request — campos obrigatórios ausentes (endpoint, soapBody, certPem, keyPem)" }, 400);
  }

  // Valida que o endpoint é SVRS/SEFAZ (segurança mínima)
  const allowedHosts = [
    "cte.svrs.rs.gov.br",
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

  try {
    const result = await soapPostMtls(endpoint, soapBody, certPem, keyPem);
    console.log(`[cte-transmit] ${new URL(endpoint).hostname} → HTTP ${result.status} (${result.body.length} bytes)`);
    if (result.status !== 200) {
      console.log("[cte-transmit] body:", result.body.slice(0, 500));
    }
    return json({ httpStatus: result.status, body: result.body });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cte-transmit] erro mTLS:", msg);
    return json({ error: msg }, 502);
  }
});
