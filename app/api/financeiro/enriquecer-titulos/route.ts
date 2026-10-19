/**
 * POST /api/financeiro/enriquecer-titulos
 * Resolve, para uma lista de títulos de CP/CR, o Nº da NF e o nome da Operação Gerencial — o que o título
 * guarda só como vínculo (nf_entrada_id / operacao_gerencial_id). Usado pela exportação Excel e pela
 * impressão do relatório CP/CR. Roda com service_role (imune a RLS e a JWT expirado) e só devolve títulos
 * das fazendas da conta do usuário.
 *
 * Body: { fazenda_id, titulos: { id, empresa?: boolean }[] }
 * Resposta: { ok, nf: { [id]: "numero" }, og: { [id]: "descrição da operação" } }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestUser, validateFazendaAccess } from "../../../../lib/api-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { fazenda_id: string; titulos: { id: string; empresa?: boolean }[] };
    if (!body.fazenda_id || !Array.isArray(body.titulos)) return NextResponse.json({ ok: false, error: "Parâmetros inválidos" }, { status: 400 });
    const user = await getRequestUser(req.headers.get("authorization"));
    if (!user) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
    const acesso = await validateFazendaAccess(body.fazenda_id, req.headers.get("authorization") ?? undefined);
    if (!acesso.ok) return NextResponse.json({ ok: false, error: acesso.error }, { status: acesso.status });

    const sb = admin();
    const { data: faz } = await sb.from("fazendas").select("conta_id").eq("id", body.fazenda_id).maybeSingle();
    let fazIds = [body.fazenda_id];
    if (faz?.conta_id) {
      const { data: fzs } = await sb.from("fazendas").select("id").eq("conta_id", faz.conta_id);
      if (fzs?.length) fazIds = fzs.map(f => f.id as string);
    }

    type Linha = { id: string; nf_entrada_id: string | null; nfe_numero?: string | null; numero_documento: string | null; operacao_gerencial_id: string | null };
    const linhas: Linha[] = [];
    for (const [tabela, ehEmpresa] of [["lancamentos", false], ["empresa_lancamentos", true]] as const) {
      const ids = body.titulos.filter(t => !!t.empresa === ehEmpresa).map(t => t.id);
      for (let i = 0; i < ids.length; i += 200) {
        const campos = ehEmpresa ? "id, nf_entrada_id, numero_documento, operacao_gerencial_id" : "id, nf_entrada_id, nfe_numero, numero_documento, operacao_gerencial_id";
        const { data, error } = await sb.from(tabela).select(campos).in("id", ids.slice(i, i + 200)).in("fazenda_id", fazIds);
        if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        linhas.push(...((data ?? []) as unknown as Linha[]));
      }
    }

    const idsNF = [...new Set(linhas.map(l => l.nf_entrada_id).filter((x): x is string => !!x))];
    const numNF = new Map<string, string>();
    for (let i = 0; i < idsNF.length; i += 200) {
      const { data } = await sb.from("nf_entradas").select("id, numero").in("id", idsNF.slice(i, i + 200));
      for (const n of data ?? []) if (n.numero) numNF.set(n.id as string, String(n.numero));
    }
    const idsOG = [...new Set(linhas.map(l => l.operacao_gerencial_id).filter((x): x is string => !!x))];
    const nomeOG = new Map<string, string>();
    for (let i = 0; i < idsOG.length; i += 200) {
      const { data } = await sb.from("operacoes_gerenciais").select("id, descricao").in("id", idsOG.slice(i, i + 200));
      for (const o of data ?? []) nomeOG.set(o.id as string, o.descricao as string);
    }

    const nf: Record<string, string> = {};
    const og: Record<string, string> = {};
    for (const l of linhas) {
      const n = (l.nf_entrada_id ? numNF.get(l.nf_entrada_id) : undefined) ?? l.nfe_numero ?? l.numero_documento;
      if (n) nf[l.id] = String(n);
      if (l.operacao_gerencial_id && nomeOG.get(l.operacao_gerencial_id)) og[l.id] = nomeOG.get(l.operacao_gerencial_id)!;
    }
    return NextResponse.json({ ok: true, nf, og, total: linhas.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}
