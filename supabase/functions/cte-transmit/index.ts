/**
 * Supabase Edge Function: cte-transmit
 * Relay para transmissão de CT-e à SEFAZ via mTLS de IP brasileiro.
 *
 * Usa node:https (compatibilidade Node.js do Deno) para mTLS com cert+key,
 * pois Deno.createHttpClient é API instável bloqueada no Deno Deploy.
 *
 * CONFIGURAÇÃO:
 * 1. Supabase Dashboard → Edge Functions → cte-transmit → Settings
 *    → desabilitar "Verify JWT"
 * 2. Supabase Dashboard → Edge Functions → Secrets
 *    → EDGE_BEARER_SECRET = <mesmo valor da Vercel>
 */

// @ts-ignore — node: prefix disponível no Deno 1.30+ (Supabase usa versão recente)
import https from "node:https";
// @ts-ignore
import { Buffer } from "node:buffer";

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
          "Content-Type":
            'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/cte/wsdl/CTeAutorizacao4/cteDadosMsg"',
          "Content-Length": bodyBuf.length,
        },
        cert: certPem,
        key: keyPem,
        // Domínios .gov.br usam ICP-Brasil (não incluída no bundle Node.js)
        rejectUnauthorized: false,
      },
      (res: { statusCode?: number; on: Function }) => {
        const status = res.statusCode ?? 0;
        let data = "";
        res.on("data", (chunk: string) => { data += chunk; });
        res.on("end", () => resolve({ status, body: data }));
      },
    );

    req.on("error", (err: Error) => reject(err));
    req.write(bodyBuf);
    req.end();
  });
}

// deno-lint-ignore no-explicit-any
async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Autenticação por secret próprio (JWT verification deve estar DESABILITADO)
  // @ts-ignore
  const EDGE_SECRET = (typeof Deno !== "undefined" ? Deno.env.get("EDGE_BEARER_SECRET") : null) as string | null;
  if (EDGE_SECRET) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token !== EDGE_SECRET) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — EDGE_BEARER_SECRET inválido" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  let endpoint: string, soapBody: string, certPem: string, keyPem: string;
  try {
    const body = await req.json() as {
      endpoint: string;
      soapBody: string;
      certPem: string;
      keyPem: string;
    };
    endpoint = body.endpoint;
    soapBody = body.soapBody;
    certPem = body.certPem;
    keyPem = body.keyPem;
  } catch {
    return new Response(JSON.stringify({ error: "Bad Request — JSON inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!endpoint || !soapBody || !certPem || !keyPem) {
    return new Response(JSON.stringify({ error: "Bad Request — campos obrigatórios ausentes" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await soapPostMtls(endpoint, soapBody, certPem, keyPem);
    console.log(`[cte-transmit] ${endpoint} → HTTP ${result.status}`);
    if (result.status !== 200) {
      console.log("[cte-transmit] body:", result.body.slice(0, 400));
    }
    return new Response(JSON.stringify({ httpStatus: result.status, body: result.body }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cte-transmit] erro mTLS:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// @ts-ignore
if (typeof Deno !== "undefined" && Deno.serve) {
  // @ts-ignore
  Deno.serve(handler);
} else {
  // @ts-ignore
  import("https://deno.land/std@0.168.0/http/server.ts").then(({ serve }) => serve(handler));
}
