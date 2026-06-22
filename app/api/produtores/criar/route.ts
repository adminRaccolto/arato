import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Usa service role key para bypass de RLS — necessário quando o JWT do browser expira
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.fazenda_id || !body.nome) {
      return NextResponse.json({ error: "fazenda_id e nome são obrigatórios" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("produtores")
      .insert(body)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ produtor: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
