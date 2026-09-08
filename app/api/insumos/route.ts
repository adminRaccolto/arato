import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { data, error } = await sb().from("insumos").insert(body).select().single();
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...payload } = body as { id: string; [key: string]: unknown };
    if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });
    const { error } = await sb().from("insumos").update(payload).eq("id", id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = await Promise.resolve(new URL(req.url));
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });
    const { error } = await sb().from("insumos").delete().eq("id", id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ erro: String(e) }, { status: 500 });
  }
}
