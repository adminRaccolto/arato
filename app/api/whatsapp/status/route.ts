import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const EVO_BASE     = process.env.EVOLUTION_API_URL ?? "";
  const EVO_KEY      = process.env.EVOLUTION_API_KEY ?? "";
  const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "";

  const result: Record<string, unknown> = {
    vars: {
      EVOLUTION_API_URL:  EVO_BASE  ? `${EVO_BASE.slice(0, 30)}...` : "❌ AUSENTE",
      EVOLUTION_API_KEY:  EVO_KEY   ? `${EVO_KEY.slice(0, 6)}...`   : "❌ AUSENTE",
      EVOLUTION_INSTANCE: EVO_INSTANCE || "❌ AUSENTE",
      ANTHROPIC_API_KEY:  process.env.ANTHROPIC_API_KEY ? "✅ presente" : "❌ AUSENTE",
      OPENAI_API_KEY:     process.env.OPENAI_API_KEY    ? "✅ presente" : "❌ AUSENTE",
    },
  };

  // 1. Status da instância Evolution
  try {
    const r = await fetch(`${EVO_BASE}/instance/connectionState/${EVO_INSTANCE}`, {
      headers: { apikey: EVO_KEY },
    });
    const json = await r.json() as Record<string, unknown>;
    result.evolution_status = json;
  } catch (e) {
    result.evolution_status = `ERRO: ${String(e)}`;
  }

  // 2. Webhook configurado na instância
  try {
    const r = await fetch(`${EVO_BASE}/webhook/find/${EVO_INSTANCE}`, {
      headers: { apikey: EVO_KEY },
    });
    const json = await r.json() as Record<string, unknown>;
    result.evolution_webhook = json;
  } catch (e) {
    result.evolution_webhook = `ERRO: ${String(e)}`;
  }

  // 3. Usuários com WhatsApp cadastrado
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data, error } = await sb.from("usuarios")
      .select("id, nome, whatsapp, ativo")
      .not("whatsapp", "is", null)
      .limit(20);
    result.usuarios_com_whatsapp = error ? `ERRO: ${error.message}` : (data ?? []);
  } catch (e) {
    result.usuarios_com_whatsapp = `ERRO: ${String(e)}`;
  }

  return NextResponse.json(result, { status: 200 });
}
