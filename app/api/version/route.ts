import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
    // Horário do servidor — usado pelo navegador para detectar relógio do
    // sistema desacertado (causa real de logout confuso já encontrada em
    // produção: sessão parece "expirar" na hora errada quando o relógio do
    // computador do usuário está adiantado/atrasado).
    serverTime: Date.now(),
  });
}
