// API route: salva produtor_id nos lançamentos CP confirmados pelo usuário
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSessionUser } from "../../../../../lib/api-auth";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { atualizacoes } = await req.json() as {
      atualizacoes: { lancamento_id: string; produtor_id: string }[];
    };

    if (!atualizacoes?.length) {
      return NextResponse.json({ atualizados: 0 });
    }

    const supabase = sb();
    let atualizados = 0;
    const erros: string[] = [];

    for (const { lancamento_id, produtor_id } of atualizacoes) {
      const { error } = await supabase
        .from("lancamentos")
        .update({ produtor_id })
        .eq("id", lancamento_id);

      if (error) {
        erros.push(`${lancamento_id}: ${error.message}`);
      } else {
        atualizados++;
      }
    }

    return NextResponse.json({ atualizados, erros });
  } catch (err) {
    console.error("[api/admin/cp-produtor/salvar]", err);
    return NextResponse.json({ error: "Erro interno ao salvar." }, { status: 500 });
  }
}
