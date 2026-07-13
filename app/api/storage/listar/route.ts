import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const { getSessionUser } = await import("../../../../lib/api-auth");
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

  const p             = req.nextUrl.searchParams;
  const entidade_tipo = p.get("entidade_tipo");
  const entidade_id   = p.get("entidade_id");
  if (!entidade_tipo || !entidade_id) {
    return NextResponse.json({ erro: "entidade_tipo e entidade_id obrigatórios" }, { status: 400 });
  }

  const db = sb();

  const { data: perfil } = await db.from("perfis").select("conta_id")
    .eq("user_id", user.id).maybeSingle();

  if (!perfil?.conta_id) {
    return NextResponse.json({ erro: "Conta não encontrada" }, { status: 403 });
  }

  const { data, error } = await db
    .from("documentos_anexos")
    .select("id, nome_original, storage_path, tamanho_bytes, mime_type, created_at")
    .eq("conta_id",      perfil.conta_id)   // isolamento de tenant: obrigatório
    .eq("entidade_tipo", entidade_tipo)
    .eq("entidade_id",   entidade_id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // URLs assinadas (1 hora)
  const docs = await Promise.all((data ?? []).map(async doc => {
    const { data: signed } = await db.storage
      .from("arquivos")
      .createSignedUrl(doc.storage_path, 3600);
    return { ...doc, url: signed?.signedUrl ?? null };
  }));

  // Uso de storage da conta
  let usado_bytes = 0;
  let cota_bytes  = 0;
  let plano_id    = "essencial";
  if (perfil?.conta_id) {
    const { data: conta } = await db.from("contas")
      .select("storage_usado_bytes").eq("id", perfil.conta_id).single();
    usado_bytes = Number(conta?.storage_usado_bytes ?? 0);

    const { data: assinatura } = await db
      .from("assinaturas")
      .select("plano_id, planos(storage_gb)")
      .eq("conta_id", perfil.conta_id)
      .in("status", ["ativa", "trial"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    plano_id        = (assinatura?.plano_id as string) ?? "essencial";
    const storageGb = ((assinatura?.planos as { storage_gb?: number } | null)?.storage_gb) ?? 0;
    cota_bytes      = storageGb * 1024 * 1024 * 1024;
  }

  return NextResponse.json({ data: docs, usado_bytes, cota_bytes, plano_id });
}
