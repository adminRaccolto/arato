import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { OperacaoPendente } from "../../../../lib/offline-store";

export const runtime = "nodejs";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

interface ResultadoOp {
  id: string;
  ok: boolean;
  erro?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { ops } = (await req.json()) as { ops: OperacaoPendente[] };

    if (!Array.isArray(ops) || ops.length === 0) {
      return NextResponse.json({ resultados: [] });
    }

    const supabase = sb();
    const resultados: ResultadoOp[] = [];

    for (const op of ops) {
      try {
        switch (op.tipo) {
          case "plantio": {
            const { error } = await supabase.from("plantios").insert(op.payload);
            if (error) throw error;
            break;
          }

          case "pulverizacao": {
            const { data, error: e1 } = await supabase
              .from("pulverizacoes")
              .insert(op.payload)
              .select("id")
              .single();
            if (e1) throw e1;

            if (op.itens?.length && data?.id) {
              const itens = op.itens.map((i) => ({ ...i, pulverizacao_id: data.id }));
              const { error: e2 } = await supabase.from("pulverizacao_itens").insert(itens);
              if (e2) throw e2;
            }
            break;
          }

          case "colheita": {
            const { error } = await supabase.from("colheitas").insert(op.payload);
            if (error) throw error;
            break;
          }

          case "abastecimento": {
            // Insere o abastecimento; atualizações secundárias (horímetro, estoque)
            // são aplicadas somente quando online — aceitável para uso offline de campo.
            const { error } = await supabase.from("abastecimentos").insert(op.payload);
            if (error) throw error;
            break;
          }

          default:
            throw new Error(`Tipo desconhecido: ${(op as OperacaoPendente).tipo}`);
        }

        resultados.push({ id: op.id, ok: true });
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null
              ? ((err as Record<string, unknown>).message as string) ?? JSON.stringify(err)
              : String(err);
        resultados.push({ id: op.id, ok: false, erro: msg });
      }
    }

    return NextResponse.json({ resultados });
  } catch (err) {
    console.error("[campo/sync]", err);
    return NextResponse.json({ erro: "Erro interno no servidor" }, { status: 500 });
  }
}
