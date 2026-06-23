import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Usa service role key para bypass de RLS no Storage


export async function POST(req: NextRequest) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const contaId = formData.get("conta_id") as string | null;

    if (!file || !contaId) {
      return NextResponse.json({ error: "file e conta_id obrigatórios" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `clientes/${contaId}/logo.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error } = await supabaseAdmin.storage
      .from("logos")
      .upload(path, buffer, { upsert: true, contentType: file.type });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data } = supabaseAdmin.storage.from("logos").getPublicUrl(path);

    await supabaseAdmin.from("contas").update({ logo_url: data.publicUrl }).eq("id", contaId);

    return NextResponse.json({ url: data.publicUrl });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
