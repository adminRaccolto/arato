// /api/admin/saude-dados — achados do auditor "Saúde dos dados". Só equipe Raccolto (role raccotlo/raccotlo_gestor).
//   GET                              → achados (todos os status), últimas execuções, nomes de contas e catálogo de regras
//   POST { acao: "executar" }        → roda o auditor agora
//   POST { acao: "status", ids, status, motivo? } → muda o status (em_analise / resolvido / ignorado / novo)
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "../../../../lib/supabase-servidor";
import { executarAuditoria } from "../../../../lib/auditoria/saude/executar";
import { REGRAS } from "../../../../lib/auditoria/saude/regras";

export const runtime = "nodejs";
export const maxDuration = 300;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function exigirRaccolto(): Promise<{ nome: string } | NextResponse> {
  const cookieStore = await cookies();
  const sbUser = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => cookieStore.getAll() } });
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: perfil } = await admin().from("perfis").select("role, nome").eq("user_id", user.id).maybeSingle();
  if (perfil?.role !== "raccotlo" && perfil?.role !== "raccotlo_gestor") return NextResponse.json({ error: "Acesso restrito à equipe Raccolto" }, { status: 403 });
  return { nome: (perfil?.nome as string | null) ?? user.email ?? "Raccolto" };
}

async function todos<T>(tab: string, cols: string): Promise<T[]> {
  const sb = admin(); const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tab).select(cols).order("id").range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function GET() {
  const quem = await exigirRaccolto();
  if (quem instanceof NextResponse) return quem;
  try {
    const sb = admin();
    const [achados, contas, fazendas, { data: execucoes }] = await Promise.all([
      todos("auditoria_achados", "id,regra,chave,conta_id,fazenda_id,titulo,valor,detalhe,status,motivo,primeiro_em,ultimo_em,resolvido_em,atualizado_por"),
      todos<{ id: string; nome: string }>("contas", "id,nome"),
      todos<{ id: string; nome: string }>("fazendas", "id,nome"),
      sb.from("auditoria_execucoes").select("*").order("em", { ascending: false }).limit(10),
    ]);
    return NextResponse.json({ ok: true, achados, contas, fazendas, execucoes: execucoes ?? [], regras: REGRAS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg.includes("auditoria_achados") ? "Tabela auditoria_achados não existe: rode a Seção 361 do supabase_migrations.sql." : msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const quem = await exigirRaccolto();
  if (quem instanceof NextResponse) return quem;
  const body = await req.json().catch(() => ({})) as { acao?: string; ids?: string[]; status?: string; motivo?: string };
  if (body.acao === "executar") return NextResponse.json(await executarAuditoria(admin(), `manual · ${quem.nome}`));
  if (body.acao === "status") {
    if (!body.ids?.length || !["novo", "em_analise", "resolvido", "ignorado"].includes(body.status ?? "")) return NextResponse.json({ ok: false, error: "ids e status válidos são obrigatórios" }, { status: 400 });
    if (body.status === "ignorado" && !body.motivo?.trim()) return NextResponse.json({ ok: false, error: "Informe o motivo para ignorar" }, { status: 400 });
    const { error } = await admin().from("auditoria_achados").update({
      status: body.status, motivo: body.motivo?.trim() || null, atualizado_por: quem.nome,
      resolvido_em: body.status === "resolvido" ? new Date().toISOString() : null,
    }).in("id", body.ids);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false, error: "ação desconhecida" }, { status: 400 });
}
