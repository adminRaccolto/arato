import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const COTAS_FALLBACK: Record<string, number> = {
  essencial:   0,
  gestao:      1,
  performance: 3,
};

export async function GET() {
  const { getSessionUser } = await import("../../../../lib/api-auth");
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

  const db = sb();

  const { data: perfil } = await db.from("perfis").select("conta_id")
    .eq("user_id", user.id).maybeSingle();
  if (!perfil?.conta_id) {
    return NextResponse.json({ usado_bytes: 0, cota_bytes: 0, plano_id: "essencial" });
  }

  const { data: conta } = await db.from("contas")
    .select("storage_usado_bytes").eq("id", perfil.conta_id).single();
  const usado_bytes = Number(conta?.storage_usado_bytes ?? 0);

  const { data: assinatura } = await db
    .from("assinaturas")
    .select("plano_id, planos(storage_gb)")
    .eq("conta_id", perfil.conta_id)
    .in("status", ["ativa", "trial"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const plano_id  = (assinatura?.plano_id as string) ?? "essencial";
  const storageGb = ((assinatura?.planos as { storage_gb?: number } | null)?.storage_gb)
    ?? COTAS_FALLBACK[plano_id]
    ?? 0;
  const cota_bytes = storageGb * 1024 * 1024 * 1024;

  return NextResponse.json({ usado_bytes, cota_bytes, plano_id });
}
