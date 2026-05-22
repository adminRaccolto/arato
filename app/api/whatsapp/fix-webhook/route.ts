import { NextResponse } from "next/server";

export async function POST() {
  const EVO_BASE     = process.env.EVOLUTION_API_URL ?? "";
  const EVO_KEY      = process.env.EVOLUTION_API_KEY ?? "";
  const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "";

  const novaUrl = "https://web.arato.agr.br/api/whatsapp/webhook";

  try {
    const r = await fetch(`${EVO_BASE}/webhook/set/${EVO_INSTANCE}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", apikey: EVO_KEY },
      body: JSON.stringify({
        url: novaUrl,
        enabled: true,
        events: ["MESSAGES_UPSERT"],
        webhookByEvents: false,
        webhookBase64: false,
      }),
    });
    const json = await r.json();
    return NextResponse.json({ ok: r.ok, status: r.status, result: json, novaUrl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
