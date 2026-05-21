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

  // Testa autenticação via /BaixarXmls (Take=1) — mesmo endpoint do cron.
  // Resposta 200 com array ou objeto {Status/Mensagens} = chave válida.
  // Resposta 401/403 = chave inválida ou conta bloqueada.
  console.log(`[sieg-test] fazenda=${fazendaId} key=${keyDiag.fonte} len=${keyDiag.comprimento} inicio=${keyDiag.inicio} fim=${keyDiag.fim}`);

  try {
    const res = await fetch(
      `https://api.sieg.com/BaixarXmls?api_key=${encodeURIComponent(apiKey)}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ XmlType: 1, Take: 1, Skip: 0, Downloadevent: false }),
      }
    );

    const body = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = body; }

    console.log(`[sieg-test] HTTP ${res.status} — resposta: ${body.slice(0, 200)}`);

    // 200 = autenticou (pode ter docs ou não)
    // 401/403 = chave inválida
    const ok = res.status === 200;

    return NextResponse.json({
      keyDiag,
      sieg_status:   res.status,
      sieg_ok:       ok,
      sieg_resposta: parsed,
      url_enviada:   `https://api.sieg.com/BaixarXmls?api_key=${apiKey.slice(0, 6)}...${apiKey.slice(-6)}`,
    });

  } catch (err) {
    console.error("[sieg-test] erro de rede:", err);
    return NextResponse.json({ keyDiag, erro_rede: String(err) });
  }
}
