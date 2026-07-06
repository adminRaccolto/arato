import { NextResponse } from "next/server";
import { fetchPlanosPrecos } from "../../../../lib/planos";

export const dynamic = "force-dynamic";

export async function GET() {
  const precos = await fetchPlanosPrecos();
  return NextResponse.json(precos, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}
