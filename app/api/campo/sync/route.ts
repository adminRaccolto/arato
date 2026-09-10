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

// Cada operação da fila offline já tem um UUID próprio (op.id, gerado no cliente por
// crypto.randomUUID() em lib/offline-store.ts). Se a fila reenviar a mesma operação —
// por falha de rede na resposta, por exemplo — o servidor não deve processá-la de novo.
// Checa se já existe uma linha com esse origem_op_id antes de inserir; a UNIQUE INDEX
// na coluna (Seção 242) cobre o caso raro de duas requisições concorrentes para a
// mesma operação chegarem quase juntas.
async function jaProcessado(supabase: ReturnType<typeof sb>, tabela: string, opId: string): Promise<boolean> {
  const { data } = await supabase.from(tabela).select("id").eq("origem_op_id", opId).maybeSingle();
  return !!data;
}

function ehViolacaoUnica(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "23505";
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
            if (await jaProcessado(supabase, "plantios", op.id)) break;
            const { error } = await supabase.from("plantios").insert({ ...op.payload, origem_op_id: op.id });
            if (error && !ehViolacaoUnica(error)) throw error;
            break;
          }

          case "pulverizacao": {
            if (await jaProcessado(supabase, "pulverizacoes", op.id)) break;
            const { data, error: e1 } = await supabase
              .from("pulverizacoes")
              .insert({ ...op.payload, origem_op_id: op.id })
              .select("id")
              .maybeSingle();
            if (e1) { if (!ehViolacaoUnica(e1)) throw e1; break; }

            if (op.itens?.length && data?.id) {
              const itens = op.itens.map((i) => ({ ...i, pulverizacao_id: data.id }));
              const { error: e2 } = await supabase.from("pulverizacao_itens").insert(itens);
              if (e2) throw e2;
            }
            break;
          }

          case "colheita": {
            if (await jaProcessado(supabase, "colheitas", op.id)) break;
            const { error } = await supabase.from("colheitas").insert({ ...op.payload, origem_op_id: op.id });
            if (error && !ehViolacaoUnica(error)) throw error;
            break;
          }

          case "abastecimento": {
            // Insere o abastecimento; atualizações secundárias (horímetro, estoque)
            // são aplicadas somente quando online — aceitável para uso offline de campo.
            if (await jaProcessado(supabase, "abastecimentos", op.id)) break;
            const { error } = await supabase.from("abastecimentos").insert({ ...op.payload, origem_op_id: op.id });
            if (error && !ehViolacaoUnica(error)) throw error;
            break;
          }

          case "adubacao": {
            if (await jaProcessado(supabase, "adubacoes_base", op.id)) break;
            const { data: adub, error: eAdub } = await supabase
              .from("adubacoes_base")
              .insert({ ...op.payload, origem_op_id: op.id })
              .select("id")
              .maybeSingle();
            if (eAdub) { if (!ehViolacaoUnica(eAdub)) throw eAdub; break; }
            if (op.itens?.length && adub?.id) {
              const itens = op.itens.map(it => ({ ...it, adubacao_id: adub.id }));
              const { error: eItens } = await supabase.from("adubacoes_base_itens").insert(itens);
              if (eItens) throw eItens;
            }
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
