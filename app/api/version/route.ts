import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
  });
}
