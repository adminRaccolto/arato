// Simula um evento messages.upsert da Evolution API direto no webhook
// Útil para testar se o webhook processa corretamente sem depender da Evolution
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { telefone, mensagem = "olá, teste direto" } = await req.json() as { telefone: string; mensagem?: string };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://web.arato.agr.br";
  const webhookUrl = `${appUrl}/api/whatsapp/webhook`;

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
    destination: webhookUrl,
    date_time: new Date().toISOString(),
    sender: `${telefone}@s.whatsapp.net`,
    server_url: process.env.EVOLUTION_API_URL ?? "",
  };

  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    let respJson: unknown = txt;
    try { respJson = JSON.parse(txt); } catch { /* mantém texto */ }
    return NextResponse.json({ ok: r.ok, status: r.status, response: respJson });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) });
  }
}
