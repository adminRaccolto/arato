/**
 * Supabase Edge Function: cte-transmit
 * Relay para transmissão de CT-e à SEFAZ via mTLS de IP brasileiro.
 *
 * CONFIGURAÇÃO OBRIGATÓRIA:
 * 1. Supabase Dashboard → Edge Functions → cte-transmit → Settings
 *    → desabilitar "Verify JWT" (JWT verification OFF)
 * 2. Supabase Dashboard → Edge Functions → Secrets
 *    → adicionar EDGE_BEARER_SECRET = <qualquer string aleatória segura>
 * 3. Vercel → Settings → Environment Variables
 *    → EDGE_BEARER_SECRET = <mesma string>
 *    → SUPABASE_SEFAZ_URL = URL do projeto Supabase (se em São Paulo)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Autenticação por secret compartilhado (JWT verification deve estar DESABILITADO)
  const EDGE_SECRET = Deno.env.get("EDGE_BEARER_SECRET");
  if (EDGE_SECRET) {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token !== EDGE_SECRET) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — EDGE_BEARER_SECRET inválido" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  let endpoint: string, soapBody: string, certPem: string, keyPem: string;
  try {
    const body = await req.json() as {
      endpoint: string;
      soapBody: string;
      certPem:  string;
      keyPem:   string;
    };
    endpoint = body.endpoint;
    soapBody = body.soapBody;
    certPem  = body.certPem;
    keyPem   = body.keyPem;
  } catch {
    return new Response(
      JSON.stringify({ error: "Bad Request — JSON inválido" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!endpoint || !soapBody || !certPem || !keyPem) {
    return new Response(
      JSON.stringify({ error: "Bad Request — campos obrigatórios ausentes" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Deno.createHttpClient com cert + key habilita mTLS (client certificate)
    const client = Deno.createHttpClient({
      cert: certPem,
      key:  keyPem,
    });

    const bodyBytes = new TextEncoder().encode(soapBody);

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/cte/wsdl/CTeAutorizacao4/cteDadosMsg"',
        "Content-Length": String(bodyBytes.length),
      },
      body: soapBody,
      // @ts-ignore — propriedade Deno-específica não reconhecida pelo tipo fetch padrão
      client,
    });

    const httpStatus = resp.status;
    const responseBody = await resp.text();

    console.log(`[cte-transmit] ${endpoint} → HTTP ${httpStatus}`);
    if (httpStatus !== 200) {
      console.log("[cte-transmit] body:", responseBody.slice(0, 400));
    }

    return new Response(
      JSON.stringify({ httpStatus, body: responseBody }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[cte-transmit] erro:", String(err));
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
