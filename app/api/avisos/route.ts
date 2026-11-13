// /api/avisos — avisos da Raccolto para o usuário logado (popup com ciência, components/AvisosSistema.tsx).
//   GET                      → avisos no ar, do público do usuário, ainda sem ciência dele
//   POST { aviso_id }        → registra "Li e estou ciente" (uma vez por usuário)
// Equipe Raccolto não recebe (vê a prévia na tela de cadastro). Sem as tabelas (Seção 448 não rodada): lista vazia.
import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase-servidor";
import { acessoDoUsuario, getRequestUser } from "../../../lib/api-auth";
import { avisoParaContas, avisosPendentes, statusAviso, type Aviso } from "../../../lib/avisos";

export const runtime = "nodejs";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function contexto(req: Request) {
  const user = await getRequestUser(req.headers.get("authorization"));
  if (!user) return null;
  const acesso = await acessoDoUsuario(user.id, user.email);
  return { user, acesso };
}

async function avisosNoAr(sb: ReturnType<typeof db>): Promise<Aviso[] | null> {
  const agora = new Date().toISOString();
  const { data, error } = await sb.from("avisos_sistema").select("*").eq("ativo", true).lte("inicio", agora).or(`fim.is.null,fim.gt.${agora}`);
  if (error) return null; // tabela ainda não criada: sem avisos
  return (data ?? []) as Aviso[];
}

export async function GET(req: Request) {
  const ctx = await contexto(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  if (ctx.acesso.raccolto) return NextResponse.json({ ok: true, avisos: [] });
  const sb = db();
  const avisos = await avisosNoAr(sb);
  if (!avisos?.length) return NextResponse.json({ ok: true, avisos: [] });
  const { data: lidos } = await sb.from("avisos_ciencia").select("aviso_id").eq("user_id", ctx.user.id).in("aviso_id", avisos.map(a => a.id));
  const pendentes = avisosPendentes(avisos, ctx.acesso.contas, (lidos ?? []).map(l => l.aviso_id as string));
  return NextResponse.json({
    ok: true,
    avisos: pendentes.map(a => ({ id: a.id, titulo: a.titulo, mensagem: a.mensagem, tipo: a.tipo, obrigatorio: a.obrigatorio, botao_texto: a.botao_texto, botao_link: a.botao_link, inicio: a.inicio })),
  });
}

export async function POST(req: Request) {
  const ctx = await contexto(req);
  if (!ctx) return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  if (ctx.acesso.raccolto) return NextResponse.json({ ok: true });
  const { aviso_id } = await req.json().catch(() => ({})) as { aviso_id?: string };
  if (!aviso_id) return NextResponse.json({ ok: false, error: "Aviso não informado." }, { status: 400 });
  const sb = db();
  const { data: aviso } = await sb.from("avisos_sistema").select("*").eq("id", aviso_id).maybeSingle();
  if (!aviso || statusAviso(aviso as Aviso) !== "no_ar" || !avisoParaContas(aviso as Aviso, ctx.acesso.contas)) {
    return NextResponse.json({ ok: false, error: "Aviso não disponível." }, { status: 404 });
  }
  const { data: perfil } = await sb.from("perfis").select("nome, conta_id").eq("user_id", ctx.user.id).maybeSingle();
  const contaDoAviso = aviso.publico === "contas" ? ctx.acesso.contas.find(c => (aviso.conta_ids ?? []).includes(c)) : undefined;
  const { error } = await sb.from("avisos_ciencia").upsert({
    aviso_id, user_id: ctx.user.id,
    conta_id: contaDoAviso ?? (perfil?.conta_id as string | null) ?? ctx.acesso.contas[0] ?? null,
    nome: (perfil?.nome as string | null) ?? null,
    email: ctx.user.email ?? null,
  }, { onConflict: "aviso_id,user_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
