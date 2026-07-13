import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function DELETE(req: NextRequest) {
  const { getSessionUser } = await import("../../../../lib/api-auth");
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  const db = sb();

  const { data: perfil } = await db.from("perfis").select("conta_id")
    .eq("user_id", user.id).maybeSingle();

  const { data: doc, error: fetchErr } = await db
    .from("documentos_anexos")
    .select("id, storage_path, tamanho_bytes, conta_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !doc) {
    return NextResponse.json({ erro: "Documento não encontrado" }, { status: 404 });
  }

  // Garante que o documento pertence à conta do usuário
  if (perfil?.conta_id && doc.conta_id !== perfil.conta_id) {
    return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
  }

  // Remove do Storage
  const { error: rmErr } = await db.storage.from("arquivos").remove([doc.storage_path]);
  if (rmErr) {
    return NextResponse.json({ erro: `Erro ao remover arquivo: ${rmErr.message}` }, { status: 500 });
  }

  // Remove o registro
  await db.from("documentos_anexos").delete().eq("id", id);

  // Decrementa contador (não deixa negativo)
  if (perfil?.conta_id) {
    const { data: conta } = await db.from("contas")
      .select("storage_usado_bytes").eq("id", perfil.conta_id).single();
    const atual = Number(conta?.storage_usado_bytes ?? 0);
    const novo  = Math.max(0, atual - Number(doc.tamanho_bytes));
    await db.from("contas").update({ storage_usado_bytes: novo }).eq("id", perfil.conta_id);
  }

  return NextResponse.json({ ok: true });
}
