import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Recalibra storage_usado_bytes em todas as contas somando tamanho_bytes real
// Protegido por CRON_SECRET (mesmo padrão dos outros crons)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth   = req.headers.get("authorization") ?? "";

  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
    }
  } else {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ erro: "CRON_SECRET não configurado" }, { status: 401 });
    }
  }

  const db = sb();

  // Busca todas as contas
  const { data: contas, error: contasErr } = await db
    .from("contas").select("id");
  if (contasErr) {
    return NextResponse.json({ erro: contasErr.message }, { status: 500 });
  }

  const resultados: Array<{ conta_id: string; bytes_antes: number; bytes_real: number }> = [];

  for (const conta of (contas ?? [])) {
    // Soma real dos tamanhos na tabela documentos_anexos
    const { data: soma } = await db
      .from("documentos_anexos")
      .select("tamanho_bytes")
      .eq("conta_id", conta.id);

    const bytes_real = (soma ?? []).reduce((acc, r) => acc + Number(r.tamanho_bytes ?? 0), 0);

    // Lê o valor atual para incluir no log
    const { data: contaRow } = await db
      .from("contas").select("storage_usado_bytes").eq("id", conta.id).single();
    const bytes_antes = Number(contaRow?.storage_usado_bytes ?? 0);

    if (bytes_antes !== bytes_real) {
      await db.from("contas")
        .update({ storage_usado_bytes: bytes_real })
        .eq("id", conta.id);
      resultados.push({ conta_id: conta.id, bytes_antes, bytes_real });
    }
  }

  return NextResponse.json({
    ok: true,
    contas_verificadas: (contas ?? []).length,
    contas_corrigidas:  resultados.length,
    correcoes:          resultados,
  });
}
