import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const COTAS_FALLBACK: Record<string, number> = {
  essencial:   0,
  gestao:      1,
  performance: 3,
};

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const { getSessionUser, validateFazendaAccess } = await import("../../../lib/api-auth");
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

  const form = await req.formData();
  const file          = form.get("file")          as File   | null;
  const entidade_tipo = form.get("entidade_tipo") as string | null;
  const entidade_id   = form.get("entidade_id")   as string | null;
  const fazenda_id    = form.get("fazenda_id")    as string | null;

  if (!file || !entidade_tipo || !entidade_id || !fazenda_id) {
    return NextResponse.json({ erro: "Campos obrigatórios ausentes" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({
      erro: `Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo permitido: 5 MB.`,
    }, { status: 400 });
  }

  const access = await validateFazendaAccess(fazenda_id);
  if (!access.ok) return NextResponse.json({ erro: access.error }, { status: access.status });

  const db = sb();

  const { data: perfil } = await db.from("perfis").select("conta_id")
    .eq("user_id", user.id).maybeSingle();
  if (!perfil?.conta_id) return NextResponse.json({ erro: "Conta não encontrada" }, { status: 403 });

  // Plano e cota
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

  if (cota_bytes === 0) {
    return NextResponse.json({
      erro: "Seu plano Essencial não inclui armazenamento de documentos. Faça upgrade para o plano Gestão ou Performance.",
      codigo: "PLANO_SEM_STORAGE",
    }, { status: 403 });
  }

  const { data: conta } = await db.from("contas")
    .select("storage_usado_bytes").eq("id", perfil.conta_id).single();
  const usado = Number(conta?.storage_usado_bytes ?? 0);

  if (usado + file.size > cota_bytes) {
    const pct = ((usado / cota_bytes) * 100).toFixed(0);
    return NextResponse.json({
      erro: `Cota esgotada (${pct}% usado). Uso atual: ${fmtMB(usado)} de ${fmtMB(cota_bytes)} disponíveis. Entre em contato para ampliar o espaço.`,
      codigo: "COTA_ESGOTADA",
      usado_bytes:  usado,
      cota_bytes,
    }, { status: 507 });
  }

  // Upload
  const ext  = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const uuid = crypto.randomUUID();
  const path = `documentos/${perfil.conta_id}/${entidade_tipo}/${entidade_id}/${uuid}.${ext}`;
  const buf  = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db.storage
    .from("arquivos")
    .upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });

  if (upErr) return NextResponse.json({ erro: `Erro no upload: ${upErr.message}` }, { status: 500 });

  // Registro
  const { data: doc, error: docErr } = await db.from("documentos_anexos").insert({
    conta_id: perfil.conta_id,
    fazenda_id,
    entidade_tipo,
    entidade_id,
    nome_original:  file.name,
    storage_path:   path,
    tamanho_bytes:  file.size,
    mime_type:      file.type || null,
    criado_por:     user.id,
  }).select("id").single();

  if (docErr) {
    await db.storage.from("arquivos").remove([path]);
    return NextResponse.json({ erro: `Erro ao registrar: ${docErr.message}` }, { status: 500 });
  }

  // Atualiza contador
  await db.from("contas")
    .update({ storage_usado_bytes: usado + file.size })
    .eq("id", perfil.conta_id);

  return NextResponse.json({ id: doc.id, path, nome: file.name, tamanho: file.size });
}

function fmtMB(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}
