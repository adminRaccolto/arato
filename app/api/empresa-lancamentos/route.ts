/**
 * POST /api/empresa-lancamentos
 * Insere lançamentos em empresa_lancamentos usando service_role_key — imune a JWT expirado e RLS.
 * Chamado por processarNfEntrada quando o destino da NF é uma empresa cadastrada.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase-servidor";
import { exigirAcessoFazendas } from "../../../lib/api-auth";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      rows: Record<string, unknown>[];
    };
    if (!body.rows || body.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "rows vazio" }, { status: 400 });
    }
    const negado = await exigirAcessoFazendas(req, body.rows.map(r => r.fazenda_id as string | undefined));
    if (negado) return negado;
    const sb = admin();
    // Título de NF que já tem título ativo da Empresa: não cria outro (processamento disparado duas vezes — achado
    // 30/10/2026, NF 665 em dobro). Devolve os que já existem.
    const nfIds = [...new Set(body.rows.map(r => r.nf_entrada_id as string | undefined).filter((v): v is string => !!v))];
    if (nfIds.length) {
      const { data: ja } = await sb.from("empresa_lancamentos").select("id").in("nf_entrada_id", nfIds).neq("status", "cancelado").order("created_at");
      if (ja?.length) return NextResponse.json({ ok: true, ids: ja.map(r => r.id), ja_existia: true });
    }
    const { data, error } = await sb
      .from("empresa_lancamentos")
      .insert(body.rows)
      .select("id");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ids: (data ?? []).map(r => r.id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
