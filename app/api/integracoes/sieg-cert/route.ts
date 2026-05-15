/**
 * POST /api/integracoes/sieg-cert
 * Registra CNPJs no Sieg DFe Monitor para monitoramento.
 * Endpoint Sieg: POST https://api.sieg.com/api/Certificado/Registrar?api_key=<KEY>
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      fazenda_id:   string;
      cnpj:         string;
      consulta_nfe?: boolean;
      consulta_cte?: boolean;
    };

    const { fazenda_id, cnpj } = body;
    if (!fazenda_id || !cnpj) {
      return NextResponse.json({ erro: "fazenda_id e cnpj são obrigatórios" }, { status: 400 });
    }

    const db = sb();

    const { data: row } = await db
      .from("configuracoes_modulo")
      .select("config")
      .eq("fazenda_id", fazenda_id)
      .eq("modulo", "sieg")
      .maybeSingle();

    const cfg = (row?.config ?? {}) as Record<string, string>;
    const apiKeyFazenda = (cfg.api_key ?? "").trim();
    const apiKeyGlobal  = (process.env.SIEG_API_KEY ?? "").trim();
    const apiKey        = apiKeyFazenda || apiKeyGlobal;
    const keySource     = apiKeyFazenda ? "fazenda" : "global";

    if (!apiKey) {
      return NextResponse.json({ erro: "API Key Sieg não configurada" }, { status: 400 });
    }

    const cnpjLimpo = cnpj.replace(/\D/g, "");

    const res = await fetch(
      `https://api.sieg.com/api/Certificado/Registrar?api_key=${encodeURIComponent(apiKey)}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", "api-key": apiKey },
        body:    JSON.stringify({
          Cnpj:         cnpjLimpo,
          ConsultaNfe:  body.consulta_nfe ?? true,
          ConsultaCte:  body.consulta_cte ?? true,
        }),
      }
    );

    const text = await res.text();
    let resposta: unknown;
    try { resposta = JSON.parse(text); } catch { resposta = text; }

    if (!res.ok) {
      return NextResponse.json(
        { erro: `Sieg API HTTP ${res.status}: ${text.slice(0, 300)}`, key_source: keySource },
        { status: 502 }
      );
    }

    return NextResponse.json({ sucesso: true, resposta, key_source: keySource, cnpj: cnpjLimpo });

  } catch (err) {
    console.error("[sieg-cert]", err);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
