import { NextResponse } from "next/server";
import { fetchPlanosPrecos } from "../../../../lib/planos";

export const dynamic = "force-dynamic";

// GET /api/admin/planos — retorna preços atuais (definidos em lib/planos.ts)
export async function GET() {
  const precos = await fetchPlanosPrecos();
  return NextResponse.json(precos);
}
