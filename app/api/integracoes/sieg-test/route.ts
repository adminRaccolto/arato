/**
 * GET /api/integracoes/sieg-test?fazenda_id=xxx
 * Testa as credenciais SIEG v1 (JWT + baixar-xmls) e retorna diagnóstico.
 */

import { NextRequest, NextResponse } from "next/server";
import { credenciaisEnv, credenciaisValidas } from "../../../../lib/sieg";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const fazendaId = req.nextUrl.searchParams.get("fazenda_id") ?? "";

  const creds = credenciaisEnv();

  const diagCreds = {
    apiKey_ok:    !!creds.apiKey,
    secretKey_ok: !!creds.secretKey,
    clienteId:    creds.clienteId || "(não configurado)",
    apiKey_fim:   creds.apiKey   ? `...${creds.apiKey.slice(-6)}`   : "(vazio)",
    secretKey_fim:creds.secretKey? `...${creds.secretKey.slice(-6)}`: "(vazio)",
  };

  if (!credenciaisValidas(creds)) {
    return NextResponse.json({
      erro: "Credenciais SIEG incompletas. Configure SIEG_API_KEY, SIEG_SECRET_KEY e SIEG_CLIENTE_ID.",
      diagCreds,
    }, { status: 500 });
  }

  console.log(`[sieg-test] fazenda=${fazendaId} clienteId=${creds.clienteId}`);

  try {
    // Passo 1: obter JWT
    const jwtRes = await fetch("https://api.sieg.com/api/v1/create-jwt", {
      method:  "POST",
      headers: {
        "accept":       "application/json",
        "X-Secret-Key": creds.secretKey,
        "X-Client-Id":  creds.clienteId,
      },
    });

    const jwtBody = await jwtRes.text();
    console.log(`[sieg-test] JWT status=${jwtRes.status} body=${jwtBody.slice(0, 100)}`);

    if (!jwtRes.ok) {
      return NextResponse.json({
        diagCreds,
        etapa: "create-jwt",
        sieg_status: jwtRes.status,
        sieg_ok: false,
        sieg_resposta: jwtBody.slice(0, 300),
      });
    }

    let jwt: string;
    try {
      const parsed = JSON.parse(jwtBody);
      jwt = typeof parsed === "string" ? parsed : (parsed.token ?? parsed.Token ?? JSON.stringify(parsed));
    } catch {
      jwt = jwtBody.trim().replace(/^["']|["']$/g, "");
    }

    // Passo 2: testar baixar-xmls (Take=1)
    const xmlRes = await fetch("https://api.sieg.com/api/v1/baixar-xmls", {
      method:  "POST",
      headers: {
        "accept":        "application/json",
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${jwt}`,
        "X-API-Key":     creds.apiKey,
        "X-Secret-Key":  creds.secretKey,
        "X-Client-Id":   creds.clienteId,
      },
      body: JSON.stringify({ TipoXml: 1, Take: 1, Skip: 0, BaixarEventos: false }),
    });

    const xmlBody = await xmlRes.text();
    let xmlParsed: unknown;
    try { xmlParsed = JSON.parse(xmlBody); } catch { xmlParsed = xmlBody; }

    console.log(`[sieg-test] baixar-xmls status=${xmlRes.status} body=${xmlBody.slice(0, 200)}`);

    return NextResponse.json({
      diagCreds,
      jwt_ok:        true,
      jwt_preview:   `${jwt.slice(0, 20)}...`,
      sieg_status:   xmlRes.status,
      sieg_ok:       xmlRes.ok,
      sieg_resposta: xmlParsed,
    });

  } catch (err) {
    console.error("[sieg-test] erro de rede:", err);
    return NextResponse.json({ diagCreds, erro_rede: String(err) }, { status: 502 });
  }
}
