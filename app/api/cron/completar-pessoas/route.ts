/**
 * Agendamento: completa cadastros de pessoas em lotes. Cadastro novo, de qualquer tela ou importação, é tratado sempre.
 * Os antigos só entram com a rotina ligada em Gestão → Dados & Limpeza → Manutenção.
 */
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { rodarLote } from "../../../../lib/pessoas/completar-servidor";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: rotina, error } = await sb.from("rotinas_sistema").select("ativa").eq("id", "completar_pessoas").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); // Seção 417 ainda não executada
  try {
    const r = await rodarLote(sb, { aplicar: true, incluirAntigos: !!rotina?.ativa, prazoMs: 270000, limiteCep: 1500, limiteCnpj: 150 });
    const resumo = { ...r, exemplos: undefined, erros: r.erros.slice(0, 20) };
    await sb.from("rotinas_sistema").upsert({ id: "completar_pessoas", ativa: !!rotina?.ativa, ultima_execucao: new Date().toISOString(), ultimo_resultado: resumo });
    return NextResponse.json({ ok: true, ...resumo });
  } catch (e) {
    console.error("[cron completar-pessoas]", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
