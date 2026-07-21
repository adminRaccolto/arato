import { NextResponse } from "next/server";

export async function POST() {
  const EVO_BASE     = process.env.EVOLUTION_API_URL ?? "";
  const EVO_KEY      = process.env.EVOLUTION_API_KEY ?? "";
  const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE ?? "";

  const novaUrl = "https://web.arato.agr.br/api/whatsapp/webhook";
  const hdrs = { "Content-Type": "application/json", apikey: EVO_KEY };

  // Descobre versão da API
  let apiVersion = "?";
  try {
    const rv = await fetch(`${EVO_BASE}/`, { headers: hdrs });
    const tv = await rv.text();
    apiVersion = tv.slice(0, 200);
  } catch { /* ignora */ }

  // Eventos — tenta uppercase e lowercase para compatibilidade com v1 e v2
  const eventsUpper  = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE"];
  const eventsLower  = ["messages.upsert", "messages.update", "send.message", "connection.update"];
  const eventsMinimo = ["MESSAGES_UPSERT"];

  // Testa formatos diferentes para o body
  const bodies = [
    { label: "v2_wrapper_upper",  body: JSON.stringify({ webhook: { url: novaUrl, enabled: true, events: eventsUpper, webhookByEvents: false, webhookBase64: false } }) },
    { label: "v2_flat_upper",     body: JSON.stringify({ url: novaUrl, enabled: true, events: eventsUpper, webhookByEvents: false, webhookBase64: false }) },
    { label: "v2_wrapper_lower",  body: JSON.stringify({ webhook: { url: novaUrl, enabled: true, events: eventsLower, webhookByEvents: false, webhookBase64: false } }) },
    { label: "v2_flat_lower",     body: JSON.stringify({ url: novaUrl, enabled: true, events: eventsLower, webhookByEvents: false, webhookBase64: false }) },
    { label: "v1_minimo_upper",   body: JSON.stringify({ instanceName: EVO_INSTANCE, webhook: { url: novaUrl, enabled: true, events: eventsMinimo } }) },
    { label: "v1_minimo_lower",   body: JSON.stringify({ instanceName: EVO_INSTANCE, webhook: { url: novaUrl, enabled: true, events: ["messages.upsert"] } }) },
  ];

  const paths = [
    { method: "POST", path: `/webhook/set/${EVO_INSTANCE}` },
    { method: "PUT",  path: `/webhook/set/${EVO_INSTANCE}` },
    { method: "POST", path: `/instance/webhook/${EVO_INSTANCE}` },
    { method: "PUT",  path: `/instance/webhook/${EVO_INSTANCE}` },
  ];

  const results = [];
  for (const b of bodies) {
    for (const ep of paths) {
      try {
        const r = await fetch(`${EVO_BASE}${ep.path}`, { method: ep.method, headers: hdrs, body: b.body });
        const txt = await r.text();
        let json; try { json = JSON.parse(txt); } catch { json = txt; }
        results.push({ body: b.label, endpoint: `${ep.method} ${ep.path}`, status: r.status, ok: r.ok, response: json });
        if (r.ok) return NextResponse.json({ v: 2, fixed: true, body: b.label, endpoint: `${ep.method} ${ep.path}`, novaUrl, response: json });
      } catch (e) {
        results.push({ body: b.label, endpoint: `${ep.method} ${ep.path}`, error: String(e) });
      }
    }
  }

  return NextResponse.json({ v: 2, fixed: false, apiVersion, tried: results }, { status: 500 });
}
