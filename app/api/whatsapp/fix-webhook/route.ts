import { NextResponse } from "next/server";

export async function POST() {
  const EVO_BASE     = process.env.EVOLUTION_API_URL ?? "";
  const EVO_KEY      = process.env.EVOLUTION_API_KEY ?? "";
  const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "";

  const novaUrl = "https://web.arato.agr.br/api/whatsapp/webhook";
  // Evolution API v2 exige wrapper "webhook"
  const body = JSON.stringify({
    webhook: {
      url: novaUrl,
      enabled: true,
      events: ["MESSAGES_UPSERT"],
      webhookByEvents: false,
      webhookBase64: false,
    },
  });
  const hdrs = { "Content-Type": "application/json", apikey: EVO_KEY };

  // Tenta os endpoints conhecidos das versões da Evolution API
  const endpoints = [
    { method: "POST", path: `/webhook/set/${EVO_INSTANCE}` },
    { method: "PUT",  path: `/webhook/set/${EVO_INSTANCE}` },
    { method: "POST", path: `/instance/setWebhook/${EVO_INSTANCE}` },
    { method: "PUT",  path: `/instance/setWebhook/${EVO_INSTANCE}` },
    { method: "POST", path: `/webhook/${EVO_INSTANCE}` },
    { method: "PUT",  path: `/webhook/${EVO_INSTANCE}` },
  ];

  const results = [];
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${EVO_BASE}${ep.path}`, { method: ep.method, headers: hdrs, body });
      const txt = await r.text();
      let json; try { json = JSON.parse(txt); } catch { json = txt; }
      results.push({ endpoint: `${ep.method} ${ep.path}`, status: r.status, ok: r.ok, response: json });
      if (r.ok) return NextResponse.json({ fixed: true, endpoint: `${ep.method} ${ep.path}`, novaUrl, response: json });
    } catch (e) {
      results.push({ endpoint: `${ep.method} ${ep.path}`, error: String(e) });
    }
  }

  return NextResponse.json({ fixed: false, tried: results }, { status: 500 });
}
