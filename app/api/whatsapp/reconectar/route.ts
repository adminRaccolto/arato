import { NextResponse } from "next/server";

const EVO_BASE     = () => process.env.EVOLUTION_API_URL ?? "";
const EVO_KEY      = () => process.env.EVOLUTION_API_KEY ?? "";
const EVO_INSTANCE = () => process.env.EVOLUTION_INSTANCE ?? "";

function hdrs() {
  return { "Content-Type": "application/json", apikey: EVO_KEY() };
}

export async function POST() {
  const base = EVO_BASE();
  const instance = EVO_INSTANCE();

  if (!base || !instance) {
    return NextResponse.json({ error: "EVOLUTION_API_URL ou EVOLUTION_INSTANCE não configurados" }, { status: 500 });
  }

  // 1. Tenta restart da instância
  try {
    await fetch(`${base}/instance/restart/${instance}`, { method: "PUT", headers: hdrs() });
  } catch { /* ignora — endpoint pode não existir */ }

  // 2. Tenta conectar e obter QR code
  try {
    const r = await fetch(`${base}/instance/connect/${instance}`, {
      method: "GET",
      headers: hdrs(),
    });
    const json = await r.json() as Record<string, unknown>;
    // Retorna QR code base64 se disponível
    return NextResponse.json({ ok: true, ...json });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  // Verifica estado atual
  const base = EVO_BASE();
  const instance = EVO_INSTANCE();

  try {
    const r = await fetch(`${base}/instance/connectionState/${instance}`, {
      headers: hdrs(),
    });
    const json = await r.json() as Record<string, unknown>;
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
