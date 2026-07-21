// Simula um evento messages.upsert da Evolution API direto no handler do webhook
// Evita auto-chamada HTTP (causa MIDDLEWARE_INVOCATION_FAILED no Vercel)
import { NextRequest, NextResponse } from "next/server";
import { POST as webhookHandler } from "../webhook/route";

export async function POST(req: NextRequest) {
  const { telefone, mensagem = "olá, teste direto" } = await req.json() as { telefone: string; mensagem?: string };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web.arato.agr.br";

  const payload = {
    event: "MESSAGES_UPSERT",
    instance: process.env.EVOLUTION_INSTANCE ?? "Arato-BOT",
    data: {
      key: {
        remoteJid: `${telefone}@s.whatsapp.net`,
        fromMe: false,
        id: `SIM_${Date.now()}`,
      },
      messageType: "conversation",
      message: {
        conversation: mensagem,
      },
      pushName: "Simulação",
      status: "DELIVERY_ACK",
      instanceId: "simulado",
    },
    destination: `${appUrl}/api/whatsapp/webhook`,
    date_time: new Date().toISOString(),
    sender: `${telefone}@s.whatsapp.net`,
    server_url: process.env.EVOLUTION_API_URL ?? "",
  };

  // Cria NextRequest falsa com o payload exato da Evolution — sem HTTP, sem middleware
  const fakeUrl = new URL("/api/whatsapp/webhook", appUrl);
  const fakeReq = new NextRequest(fakeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  try {
    const res = await webhookHandler(fakeReq);
    const txt = await res.text();
    let respJson: unknown = txt;
    try { respJson = JSON.parse(txt); } catch { /* mantém texto */ }
    return NextResponse.json({ ok: res.ok, status: res.status, response: respJson });
  } catch (e) {
    console.error("[SIM] erro ao chamar webhook handler:", e);
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
