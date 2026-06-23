import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { validateFazendaAccess } from "../../../../lib/api-auth";

export const dynamic = "force-dynamic";



export async function GET(req: NextRequest) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const conta_id   = req.nextUrl.searchParams.get("conta_id");
  const fazenda_id = req.nextUrl.searchParams.get("fazenda_id");

  if (!conta_id && !fazenda_id) {
    return NextResponse.json({ error: "conta_id ou fazenda_id obrigatório" }, { status: 400 });
  }

  // Valida acesso usando a fazenda como referência (ou a primeira fazenda da conta)
  const faz_ref = fazenda_id ?? "";
  if (faz_ref) {
    const auth = await validateFazendaAccess(faz_ref, req.headers.get("authorization") ?? undefined);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let q = admin.from("produtores").select("*").order("nome");

  if (conta_id && fazenda_id) {
    q = q.or(`conta_id.eq.${conta_id},fazenda_id.eq.${fazenda_id}`);
  } else if (conta_id) {
    q = q.eq("conta_id", conta_id);
  } else {
    q = q.eq("fazenda_id", fazenda_id!);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ produtores: data ?? [] });
}
