import { NextResponse } from "next/server";
import { fetchPlanosPrecos } from "../../../../lib/planos";
import { exigirLogin } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";

// GET /api/admin/planos — retorna preços atuais (definidos em lib/planos.ts)
export async function GET(req: Request) {
  const negado = await exigirLogin(req);
  if (negado) return negado;
  const precos = await fetchPlanosPrecos();
  return NextResponse.json(precos);
}
