/**
 * GET /api/fiscal/impressao-documento?tabela=cte_entradas|ctes|nf_servicos&id=
 * Dados para imprimir CT-e (DACTE) e NFS (espelho) em Documentos Fiscais → Notas de Fornecedores. A NF de produtos
 * continua pelo DANFE (/api/fiscal/danfe). O XML do CT-e fica no Storage (bucket arquivos), lido aqui com service role.
 */
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirAcessoRegistro } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABELAS = ["cte_entradas", "ctes", "nf_servicos"] as const;
type Tabela = typeof TABELAS[number];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const tabela = url.searchParams.get("tabela") as Tabela | null;
  const id = url.searchParams.get("id");
  if (!tabela || !TABELAS.includes(tabela)) return NextResponse.json({ ok: false, error: "Documento inválido." }, { status: 400 });
  const negado = await exigirAcessoRegistro(req, tabela, id);
  if (negado) return negado;
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: registro, error } = await sb.from(tabela).select("*").eq("id", id!).single();
    if (error) throw error;

    if (tabela === "nf_servicos") {
      const pid = registro.prestador_id as string | null;
      const { data: prest } = pid ? await sb.from("pessoas").select("*").eq("id", pid).maybeSingle() : { data: null };
      const p = prest as Record<string, unknown> | null;
      return NextResponse.json({
        ok: true, registro,
        prestador: p ? { logradouro: p.logradouro ?? null, numero: p.numero ?? null, bairro: p.bairro ?? null, municipio: p.municipio ?? null,
          estado: p.estado ?? null, cep: p.cep ?? null, inscricao_municipal: p.inscricao_municipal ?? null } : null,
      });
    }

    let xml: string | null = null;
    if (tabela === "cte_entradas" && registro.xml_storage_path) {
      const { data } = await sb.storage.from("arquivos").download(String(registro.xml_storage_path));
      if (data) xml = await data.text();
    }
    if (tabela === "ctes" && registro.xml_url) {
      try { const r = await fetch(String(registro.xml_url)); if (r.ok) xml = await r.text(); } catch { /* imprime pelo registro */ }
    }
    return NextResponse.json({ ok: true, registro, xml });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
