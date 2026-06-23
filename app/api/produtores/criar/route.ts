import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";



export async function POST(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  try {
    const body = await req.json();

    if (!body.fazenda_id || !body.nome) {
      return NextResponse.json({ error: "fazenda_id e nome são obrigatórios" }, { status: 400 });
    }

    const auth = await validateFazendaAccess(body.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
