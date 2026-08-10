/**
 * Supabase Edge Function: cte-transmit
 * Relay para transmissão de CT-e à SEFAZ via mTLS de IP brasileiro.
 *
 * Autenticação: JWT do Supabase (Bearer service_role_key no header Authorization).
 * O Supabase valida automaticamente o JWT antes de executar a função.
 * SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL e SUPABASE_ANON_KEY são auto-injetados.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
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
    return new Response("Bad Request — JSON inválido", { status: 400 });
  }

  if (!endpoint || !soapBody || !certPem || !keyPem) {
    return new Response("Bad Request — campos obrigatórios ausentes", { status: 400 });
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

    return new Response(JSON.stringify({ httpStatus, body: responseBody }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cte-transmit] erro:", String(err));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
