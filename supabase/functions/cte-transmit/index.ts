/**
 * Supabase Edge Function: cte-transmit
 * Relay para transmissão de CT-e à SEFAZ via mTLS.
 *
 * Por que existe: a Vercel roda em data centers nos EUA; o SVRS (autorizador
 * de CT-e de MT) bloqueia IPs fora do Brasil na camada HTTP após o TLS.
 * Esta function roda na região do projeto Supabase (sa-east-1, São Paulo)
 * e faz o POST SOAP com mTLS de um IP brasileiro.
 *
 * Chamada pelo lib/cte/transmitter.ts via fetch interno.
 * Autenticação: Bearer <SUPABASE_SERVICE_ROLE_KEY> no header Authorization.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req: Request) => {
  // Só aceita POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Autenticação interna — apenas o backend Vercel pode chamar
  const auth = req.headers.get("Authorization") ?? "";
  if (!SERVICE_ROLE_KEY || !auth.startsWith("Bearer ") || auth.slice(7) !== SERVICE_ROLE_KEY) {
    return new Response("Unauthorized", { status: 401 });
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
    certPem  = body.certPem;
    keyPem   = body.keyPem;
  } catch {
    return new Response("Bad Request — JSON inválido", { status: 400 });
  }

  if (!endpoint || !soapBody || !certPem || !keyPem) {
    return new Response("Bad Request — campos obrigatórios: endpoint, soapBody, certPem, keyPem", { status: 400 });
  }

  try {
    // Deno.createHttpClient suporta mTLS via cert + key (disponível Deno 1.18+)
    // O SVRS usa cert do servidor com CA padrão — sem necessidade de caCerts customizado
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
      // @ts-ignore — propriedade Deno-específica, não existe no tipo padrão fetch
      client,
    });

    const httpStatus = resp.status;
    const responseBody = await resp.text();

    console.log(`[cte-transmit] ${endpoint} → HTTP ${httpStatus}`);
    if (httpStatus !== 200) {
      console.log("[cte-transmit] body:", responseBody.slice(0, 300));
    }

    return new Response(JSON.stringify({ httpStatus, body: responseBody }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cte-transmit] erro:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
