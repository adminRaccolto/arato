import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      mdfe_id:                  string;
      ciot:                     string;
      ciot_codigo_verificador?: string;
      ciot_protocolo?:          string;
    };
    if (!body.mdfe_id || !body.ciot) {
      return NextResponse.json({ ok: false, error: "mdfe_id e ciot são obrigatórios" }, { status: 400 });
    }
    const { error } = await admin().from("mdfes").update({
      ciot:                     body.ciot,
      ciot_codigo_verificador:  body.ciot_codigo_verificador ?? null,
      ciot_protocolo:           body.ciot_protocolo          ?? null,
    }).eq("id", body.mdfe_id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
