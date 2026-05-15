/**
 * GET /api/integracoes/sieg-test?fazenda_id=xxx
 * Testa a API key Sieg com a conta e retorna diagnóstico completo.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";
import { normalizarApiKeySieg }      from "../../../../lib/sieg";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest) {
  const fazendaId = req.nextUrl.searchParams.get("fazenda_id") ?? "";

  const db = sb();
  const { data: row } = await db
    .from("configuracoes_modulo")
    .select("config")
    .eq("fazenda_id", fazendaId)
    .eq("modulo", "sieg")
    .maybeSingle();

  const cfg          = (row?.config ?? {}) as Record<string, string>;
  const apiKeyFazRaw = (cfg.api_key ?? "").trim();
  const apiKeyGlbRaw = (process.env.SIEG_API_KEY ?? "").trim();
  const apiKeyRaw    = apiKeyFazRaw || apiKeyGlbRaw;
  const apiKey       = normalizarApiKeySieg(apiKeyRaw);
  const keySource    = apiKeyFazRaw ? "fazenda (configuracoes_modulo)" : "global (env SIEG_API_KEY)";

  const keyDiag = {
    fonte:        keySource,
    comprimento:  apiKey.length,
    inicio:       apiKey.slice(0, 6),
    fim:          apiKey.slice(-6),
    tem_percent:  apiKeyRaw.includes("%"),
    foi_decoded:  apiKeyRaw !== apiKey,
  };

  if (!apiKey) {
    return NextResponse.json({ erro: "Nenhuma API Key configurada", keyDiag });
  }

  // Testa Certificado/Registrar com CNPJ fictício para ver se a auth funciona
  const testCnpj = "00000000000191"; // Banco do Brasil — nunca tem NF mas serve para testar auth

  console.log(`[sieg-test] fazenda=${fazendaId} key=${keyDiag.fonte} len=${keyDiag.comprimento} inicio=${keyDiag.inicio} fim=${keyDiag.fim}`);

  try {
    const res = await fetch(
      `https://api.sieg.com/api/Certificado/Registrar?api_key=${encodeURIComponent(apiKey)}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ Cnpj: testCnpj, ConsultaNfe: true, ConsultaCte: false }),
      }
    );

    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }

    console.log(`[sieg-test] HTTP ${res.status} — resposta: ${body.slice(0, 200)}`);

    return NextResponse.json({
      keyDiag,
      sieg_status:   res.status,
      sieg_ok:       res.ok,
      sieg_resposta: parsed,
      url_enviada:   `https://api.sieg.com/api/Certificado/Registrar?api_key=${apiKey.slice(0, 6)}...${apiKey.slice(-6)}`,
    });

  } catch (err) {
    console.error("[sieg-test] erro de rede:", err);
    return NextResponse.json({ keyDiag, erro_rede: String(err) });
  }
}
