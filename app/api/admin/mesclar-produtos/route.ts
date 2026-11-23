/**
 * Fundir cadastros de produto — só equipe Raccolto (Gestão Arato → Correções → Fundir Produtos), 23/11/2026.
 * GET  ?conta_id=…  → produtos do cliente (com nº de movimentações e itens de NF) + nomes de apoio + fusões recentes
 * POST { acao: "fundir", destino_id, origem_ids, campos }  → fn_mesclar_insumos_escolhendo (Seção 461)
 * POST { acao: "desfazer", mesclagem_id }                  → fn_desfazer_mesclagem
 * A fusão em si (NF, estoque, vínculos, custo médio, desfazer) é do banco: tudo ou nada.
 */
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirRaccoltoAdmin, getRequestUser } from "../../../../lib/api-auth";

export const maxDuration = 300;

function serviceRole() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } });
}
type Sb = ReturnType<typeof serviceRole>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function todas<T>(f: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await f(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function nomes(sb: Sb, tabela: string, ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const lista = [...new Set(ids.filter((x): x is string => !!x))];
  const out: Record<string, string> = {};
  for (let i = 0; i < lista.length; i += 200) {
    const { data } = await sb.from(tabela).select("id, nome").in("id", lista.slice(i, i + 200));
    for (const r of (data ?? []) as { id: string; nome: string }[]) out[r.id] = r.nome;
  }
  return out;
}

const CAMPOS_PRODUTO = "id, nome, unidade, tipo, categoria, subgrupo, grupo_id, fabricante, ncm, principio_ativo_id, cultura_id, estoque_minimo, deposito_padrao_id, foto_url, estoque, custo_medio, ativo, created_at, fazenda_id";

export async function GET(req: Request) {
  const negado = await exigirRaccoltoAdmin(req);
  if (negado) return negado;
  const contaId = new URL(req.url).searchParams.get("conta_id") ?? "";
  if (!UUID.test(contaId)) return NextResponse.json({ error: "Escolha o cliente." }, { status: 400 });
  const sb = serviceRole();
  try {
    const { data: fz, error: eFz } = await sb.from("fazendas").select("id").eq("conta_id", contaId);
    if (eFz) throw new Error(eFz.message);
    const fids = (fz ?? []).map(f => f.id as string);
    if (!fids.length) return NextResponse.json({ produtos: [], apoio: {}, fusoes: [] });

    const produtos = await todas<Record<string, unknown>>((a, b) => sb.from("insumos").select(CAMPOS_PRODUTO)
      .in("fazenda_id", fids).is("mesclado_em", null).order("id").range(a, b));
    const contar = async (tabela: string) => {
      const linhas = await todas<{ insumo_id: string | null }>((a, b) => sb.from(tabela).select("id, insumo_id")
        .in("fazenda_id", fids).not("insumo_id", "is", null).order("id").range(a, b));
      const m: Record<string, number> = {};
      for (const l of linhas) if (l.insumo_id) m[l.insumo_id] = (m[l.insumo_id] ?? 0) + 1;
      return m;
    };
    const [movs, itensNf] = await Promise.all([contar("movimentacoes_estoque"), contar("nf_entrada_itens")]);

    const { data: fus } = await sb.from("insumos_mesclagens").select("id, destino_id, origem_ids, created_at, feito_por, desfeita_em, alteracoes")
      .eq("conta_id", contaId).order("created_at", { ascending: false }).limit(30);
    const fusoes = (fus ?? []) as { id: string; destino_id: string; origem_ids: string[]; created_at: string; feito_por: string | null; desfeita_em: string | null; alteracoes: unknown[] }[];
    const nomesFusao = await nomes(sb, "insumos", fusoes.flatMap(f => [f.destino_id, ...f.origem_ids]));

    const [grupos, principios, culturas, depositos] = await Promise.all([
      nomes(sb, "grupos_insumos", produtos.map(p => p.grupo_id as string)),
      nomes(sb, "principios_ativos", produtos.map(p => p.principio_ativo_id as string)),
      nomes(sb, "culturas", produtos.map(p => p.cultura_id as string)),
      nomes(sb, "depositos", produtos.map(p => p.deposito_padrao_id as string)),
    ]);
    return NextResponse.json({
      produtos: produtos.map(p => ({ ...p, movimentos: movs[p.id as string] ?? 0, itensNf: itensNf[p.id as string] ?? 0 })),
      apoio: { grupo_id: grupos, principio_ativo_id: principios, cultura_id: culturas, deposito_padrao_id: depositos },
      fusoes: fusoes.map(f => ({
        id: f.id, created_at: f.created_at, feito_por: f.feito_por, desfeita_em: f.desfeita_em, linhas: Array.isArray(f.alteracoes) ? f.alteracoes.length : 0,
        destino: nomesFusao[f.destino_id] ?? f.destino_id, origens: f.origem_ids.map(o => nomesFusao[o] ?? o),
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const negado = await exigirRaccoltoAdmin(req);
  if (negado) return negado;
  const u = await getRequestUser(req.headers.get("authorization"));
  const corpo = await req.json().catch(() => ({})) as { acao?: string; destino_id?: string; origem_ids?: string[]; campos?: Record<string, unknown>; mesclagem_id?: string };
  const sb = serviceRole();
  const faltaSecao = (code?: string) => code === "PGRST202" || code === "42883";

  if (corpo.acao === "fundir") {
    const origens = Array.isArray(corpo.origem_ids) ? corpo.origem_ids.filter(x => typeof x === "string" && UUID.test(x)) : [];
    if (!UUID.test(corpo.destino_id ?? "") || !origens.length || origens.length !== (corpo.origem_ids ?? []).length) {
      return NextResponse.json({ error: "Escolha o cadastro que fica e ao menos um cadastro para fundir." }, { status: 422 });
    }
    const campos = corpo.campos && typeof corpo.campos === "object" && !Array.isArray(corpo.campos) ? corpo.campos : {};
    const { data, error } = await sb.rpc("fn_mesclar_insumos_escolhendo", {
      p_destino: corpo.destino_id, p_origens: origens, p_campos: campos, p_feito_por: `tela Fundir Produtos — ${u?.email ?? "Raccolto"}`,
    });
    if (error) {
      if (faltaSecao(error.code)) return NextResponse.json({ error: "Execute a Seção 461 do supabase_migrations.sql no Supabase para usar a fusão pela tela." }, { status: 422 });
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json({ ok: true, ...(data as object) });
  }

  if (corpo.acao === "desfazer") {
    if (!UUID.test(corpo.mesclagem_id ?? "")) return NextResponse.json({ error: "Fusão não informada." }, { status: 422 });
    const { data, error } = await sb.rpc("fn_desfazer_mesclagem", { p_mesclagem: corpo.mesclagem_id });
    if (error) return NextResponse.json({ error: error.message }, { status: 422 });
    return NextResponse.json({ ok: true, ...(data as object) });
  }
  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
