/**
 * POST /api/integracoes/sieg-dedup
 * Remove duplicatas de NF-e importadas via Sieg (mesma chave_acesso em mais de uma fazenda da conta).
 * Mantém a versão mais antiga (primeiro import) e remove as demais.
 * Uso: raccotlo admin, via chamada direta.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { fazenda_id: string; dry_run?: boolean };
    const { fazenda_id, dry_run = false } = body;
    if (!fazenda_id) return NextResponse.json({ erro: "fazenda_id obrigatório" }, { status: 400 });

    const db = sb();

    // Busca todas as fazendas da conta
    const { data: fazRow } = await db.from("fazendas").select("conta_id").eq("id", fazenda_id).maybeSingle();
    if (!fazRow?.conta_id) return NextResponse.json({ erro: "Conta não encontrada para esta fazenda" }, { status: 400 });

    const { data: fazRows } = await db.from("fazendas").select("id").eq("conta_id", fazRow.conta_id);
    const fazendaIds = (fazRows ?? []).map(f => f.id);
    if (fazendaIds.length === 0) return NextResponse.json({ erro: "Nenhuma fazenda encontrada" }, { status: 400 });

    // Busca todas as NFs de origem sieg para todas as fazendas da conta
    const { data: nfs, error } = await db
      .from("nf_entradas")
      .select("id, chave_acesso, fazenda_id, created_at, status")
      .in("fazenda_id", fazendaIds)
      .eq("origem", "sieg")
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

    // Agrupa por chave_acesso — identifica duplicatas
    const grupos: Record<string, typeof nfs> = {};
    for (const nf of nfs ?? []) {
      if (!nf.chave_acesso) continue;
      if (!grupos[nf.chave_acesso]) grupos[nf.chave_acesso] = [];
      grupos[nf.chave_acesso]!.push(nf);
    }

    const duplicatas: Array<{ chave: string; ids_removidos: string[] }> = [];
    const idsParaRemover: string[] = [];

    for (const [chave, registros] of Object.entries(grupos)) {
      if (registros.length <= 1) continue;
      // Protege NFs processadas — nunca remover status=processada
      const processada = registros.find(r => r.status === "processada");
      const manter = processada ?? registros[0]!;
      const remover = registros.filter(r => r.id !== manter.id && r.status !== "processada");
      if (remover.length === 0) continue;
      const idsRemover = remover.map(r => r.id);
      idsParaRemover.push(...idsRemover);
      duplicatas.push({ chave, ids_removidos: idsRemover });
    }

    if (!dry_run && idsParaRemover.length > 0) {
      // Remove itens das NFs duplicadas
      await db.from("nf_entrada_itens").delete().in("nf_entrada_id", idsParaRemover);
      // Remove as NFs duplicadas
      await db.from("nf_entradas").delete().in("id", idsParaRemover);
    }

    return NextResponse.json({
      sucesso: true,
      dry_run,
      duplicatas_encontradas: duplicatas.length,
      registros_removidos:    idsParaRemover.length,
      detalhe: duplicatas,
    });

  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
