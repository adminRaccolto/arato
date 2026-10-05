import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Segurança: só Vercel Cron pode chamar este endpoint (mesmo padrão dos outros crons) ───
function autorizado(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// Vencido depende da data, não de evento — a tabela física só se recalcula quando a linha
// de origem muda. Este cron roda todo dia e marca/desmarca "vencido" em rel_lancamentos
// (fn_marcar_vencidos, Seção 325), para CP/CR de produtor e de empresa.
export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: "não autorizado" }, { status: 401 });

  const adm = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await adm.rpc("fn_marcar_vencidos");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, atualizados: data });
}
