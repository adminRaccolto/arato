// rota temporária — remover após uso
import { NextResponse } from "next/server";

export async function GET() {
  const base = process.env.EVOLUTION_API_URL ?? "";
  const key  = process.env.EVOLUTION_API_KEY ?? "";
  const res  = await fetch(`${base}/instance/fetchInstances`, {
    headers: { apikey: key },
  });
  const data = await res.json();
  return NextResponse.json(data);
}
