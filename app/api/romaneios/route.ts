import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// DELETE /api/romaneios?id=<romaneio_id>
// Exclui o romaneio e recalcula entregue_sc + status do contrato
export async function DELETE(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  // Busca contrato_id antes de deletar
  const { data: rom, error: errGet } = await admin
    .from("romaneios")
    .select("id, contrato_id, sacas")
    .eq("id", id)
    .maybeSingle();

  if (errGet) return NextResponse.json({ error: errGet.message }, { status: 500 });
  if (!rom)   return NextResponse.json({ error: "Romaneio não encontrado" }, { status: 404 });

  const contratoId = rom.contrato_id;

  // Deleta o romaneio
  const { error: errDel } = await admin.from("romaneios").delete().eq("id", id);
  if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 });

  // Recalcula entregue_sc a partir dos romaneios restantes
  const { data: restantes } = await admin
    .from("romaneios")
    .select("sacas")
    .eq("contrato_id", contratoId);

  const novoEntregue = (restantes ?? []).reduce((s: number, r: { sacas?: number }) => s + (r.sacas ?? 0), 0);

  const { data: contrato } = await admin
    .from("contratos")
    .select("quantidade_sc, status")
    .eq("id", contratoId)
    .maybeSingle();

  const novoStatus =
    (contrato?.status === "cancelado") ? "cancelado" :
    novoEntregue === 0                 ? "aberto"    :
    novoEntregue >= (contrato?.quantidade_sc ?? 0) ? "encerrado" : "parcial";

  await admin.from("contratos").update({ entregue_sc: novoEntregue, status: novoStatus }).eq("id", contratoId);

  return NextResponse.json({ ok: true, entregue_sc: novoEntregue, status: novoStatus });
}
