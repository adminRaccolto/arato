/**
 * GET  /api/admin/completar-pessoas — situação dos cadastros de pessoas e da rotina.
 * POST /api/admin/completar-pessoas — { acao: "previa" | "iniciar" | "parar" }.
 * A prévia consulta uma amostra e não grava nada. Iniciar liga a rotina, que o agendamento executa em lotes.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirRaccoltoAdmin } from "../../../../lib/api-auth";
import { carregarPessoas, resumoPessoas, rodarLote } from "../../../../lib/pessoas/completar-servidor";

export const runtime = "nodejs";
export const maxDuration = 120;

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ROTINA = "completar_pessoas";
const SEM_MIGRACAO = /ibge_consultado_em|receita_consultada_em|rotinas_sistema/i;

function erro(e: unknown) {
  const msg = e instanceof Error ? e.message : (e as { message?: string })?.message ?? String(e);
  return SEM_MIGRACAO.test(msg)
    ? NextResponse.json({ ok: false, error: "Execute a Seção 417 no Supabase para usar esta rotina." }, { status: 503 })
    : NextResponse.json({ ok: false, error: msg }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const negado = await exigirRaccoltoAdmin(req);
  if (negado) return negado;
  try {
    const sb = admin();
    const { data: rotina, error } = await sb.from("rotinas_sistema").select("ativa, ultima_execucao, ultimo_resultado").eq("id", ROTINA).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, rotina: rotina ?? { ativa: false }, ...resumoPessoas(await carregarPessoas(sb)) });
  } catch (e) { return erro(e); }
}

export async function POST(req: NextRequest) {
  const negado = await exigirRaccoltoAdmin(req);
  if (negado) return negado;
  try {
    const { acao } = await req.json() as { acao?: string };
    const sb = admin();
    if (acao === "previa") {
      const lote = await rodarLote(sb, { aplicar: false, incluirAntigos: true, prazoMs: 90000, limiteCep: 25, limiteCnpj: 10 });
      return NextResponse.json({ ok: true, ...lote });
    }
    if (acao === "iniciar" || acao === "parar") {
      const { error } = await sb.from("rotinas_sistema").upsert({ id: ROTINA, ativa: acao === "iniciar" });
      if (error) throw error;
      return NextResponse.json({ ok: true, ativa: acao === "iniciar" });
    }
    return NextResponse.json({ ok: false, error: "Ação inválida." }, { status: 400 });
  } catch (e) { return erro(e); }
}
