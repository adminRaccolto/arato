// /api/admin/avisos — Gestão Arato → Avisos aos Clientes. Só equipe Raccolto (role raccotlo/raccotlo_gestor).
//   GET                         → avisos, ciências por aviso, usuários no público e a lista de clientes
//   GET ?ciencias=<aviso_id>    → quem já deu ciência e quem ainda não (usuários dos clientes do público)
//   POST { operacao: "salvar", aviso }          → cria ou altera
//   POST { operacao: "ativar", id, ativo }      → desativa / reativa
//   POST { operacao: "encerrar", id }           → tira do ar agora (fim = agora)
//   POST { operacao: "excluir", id }            → apaga o aviso e as ciências
// Tabelas avisos_sistema / avisos_ciencia (Seção 448): RLS sem política, só service role.
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase-servidor";
import { exigirRaccoltoAdmin, getRequestUser } from "../../../../lib/api-auth";
import { validarAviso, type Aviso } from "../../../../lib/avisos";

export const runtime = "nodejs";

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
}

const TABELA_FALTANDO = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /avisos_(sistema|ciencia)/.test(e.message ?? "") && /does not exist|schema cache/.test(e.message ?? ""));
const erroTabela = () => NextResponse.json({ ok: false, error: "As tabelas de avisos ainda não existem: rode a Seção 448 do supabase_migrations.sql no Supabase." }, { status: 500 });

type Usuario = { user_id: string; conta_id: string; nome: string | null; email: string | null };

/** Usuários dos clientes (perfil com conta), sem equipe Raccolto e sem operador do App Campo. Paginado (limite de 1.000 do Supabase). */
async function usuariosDosClientes(sb: ReturnType<typeof db>): Promise<Usuario[]> {
  const out: Usuario[] = [];
  // E-mail fica no cadastro de login (auth), não no perfil
  const emails = new Map<string, string>();
  for (let pagina = 1; pagina <= 50; pagina++) {
    const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) break;
    for (const u of data.users) if (u.email) emails.set(u.id, u.email);
    if (data.users.length < 1000) break;
  }
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from("perfis").select("id, user_id, conta_id, nome, role, produto").not("conta_id", "is", null).not("user_id", "is", null).order("id").range(de, de + 999);
    if (error) throw error;
    for (const p of data ?? []) {
      if (String(p.role ?? "").startsWith("raccotlo") || p.produto === "campo") continue;
      out.push({ user_id: p.user_id as string, conta_id: p.conta_id as string, nome: (p.nome as string | null) ?? null, email: emails.get(p.user_id as string) ?? null });
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function cienciasDe(sb: ReturnType<typeof db>, avisoIds: string[]) {
  const out: { aviso_id: string; user_id: string; conta_id: string | null; nome: string | null; email: string | null; ciente_em: string }[] = [];
  if (!avisoIds.length) return out;
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from("avisos_ciencia").select("id, aviso_id, user_id, conta_id, nome, email, ciente_em").in("aviso_id", avisoIds).order("id").range(de, de + 999);
    if (error) throw error;
    out.push(...((data ?? []) as typeof out));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const doPublico = (a: Pick<Aviso, "publico" | "conta_ids">, u: Usuario) => a.publico === "todos" || (a.conta_ids ?? []).includes(u.conta_id);

export async function GET(req: Request) {
  const neg = await exigirRaccoltoAdmin(req);
  if (neg) return neg;
  const sb = db();
  const url = new URL(req.url);
  try {
    const ciencias = url.searchParams.get("ciencias");
    if (ciencias) {
      const { data: aviso, error } = await sb.from("avisos_sistema").select("*").eq("id", ciencias).maybeSingle();
      if (TABELA_FALTANDO(error)) return erroTabela();
      if (error) throw error;
      if (!aviso) return NextResponse.json({ ok: false, error: "Aviso não encontrado." }, { status: 404 });
      const [lidos, usuarios, { data: contas }] = await Promise.all([cienciasDe(sb, [ciencias]), usuariosDosClientes(sb), sb.from("contas").select("id, nome")]);
      const nomeConta = new Map((contas ?? []).map(c => [c.id as string, c.nome as string]));
      const leu = new Set(lidos.map(l => l.user_id));
      return NextResponse.json({
        ok: true,
        cientes: lidos.map(l => ({ ...l, cliente: l.conta_id ? nomeConta.get(l.conta_id) ?? "—" : "—" })).sort((a, b) => b.ciente_em.localeCompare(a.ciente_em)),
        pendentes: usuarios.filter(u => doPublico(aviso as Aviso, u) && !leu.has(u.user_id))
          .map(u => ({ ...u, cliente: nomeConta.get(u.conta_id) ?? "—" }))
          .sort((a, b) => a.cliente.localeCompare(b.cliente) || String(a.nome ?? a.email).localeCompare(String(b.nome ?? b.email))),
      });
    }
    const { data: avisos, error } = await sb.from("avisos_sistema").select("*").order("inicio", { ascending: false });
    if (TABELA_FALTANDO(error)) return erroTabela();
    if (error) throw error;
    const lista = (avisos ?? []) as Aviso[];
    const [lidos, usuarios, { data: contas }] = await Promise.all([cienciasDe(sb, lista.map(a => a.id)), usuariosDosClientes(sb), sb.from("contas").select("id, nome").order("nome")]);
    const lidosPor = new Map<string, Set<string>>();
    for (const l of lidos) { const s = lidosPor.get(l.aviso_id) ?? new Set<string>(); s.add(l.user_id); lidosPor.set(l.aviso_id, s); }
    return NextResponse.json({
      ok: true,
      avisos: lista.map(a => {
        const publico = usuarios.filter(u => doPublico(a, u));
        const s = lidosPor.get(a.id) ?? new Set<string>();
        return { ...a, ciencias: s.size, usuarios_publico: publico.length, pendentes: publico.filter(u => !s.has(u.user_id)).length };
      }),
      contas: (contas ?? []).map(c => ({ id: c.id as string, nome: (c.nome as string) ?? "—" })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const neg = await exigirRaccoltoAdmin(req);
  if (neg) return neg;
  const sb = db();
  const body = await req.json().catch(() => ({})) as { operacao?: string; id?: string; ativo?: boolean; aviso?: Partial<Aviso> };
  try {
    if (body.operacao === "salvar") {
      const a = body.aviso ?? {};
      const dados = {
        titulo: (a.titulo ?? "").trim(),
        mensagem: (a.mensagem ?? "").trim(),
        tipo: a.tipo ?? "informativo",
        publico: a.publico === "contas" ? "contas" : "todos",
        conta_ids: a.publico === "contas" ? [...new Set(a.conta_ids ?? [])] : null,
        inicio: a.inicio ?? new Date().toISOString(),
        fim: a.fim || null,
        obrigatorio: !!a.obrigatorio,
        botao_texto: a.botao_texto?.trim() || null,
        botao_link: a.botao_texto?.trim() ? (a.botao_link?.trim() || null) : null,
        ativo: a.ativo ?? true,
      } as const;
      const erro = validarAviso(dados as Partial<Aviso>);
      if (erro) return NextResponse.json({ ok: false, error: erro }, { status: 400 });
      if (a.id) {
        const { data, error } = await sb.from("avisos_sistema").update({ ...dados, updated_at: new Date().toISOString() }).eq("id", a.id).select().maybeSingle();
        if (TABELA_FALTANDO(error)) return erroTabela();
        if (error) throw error;
        return NextResponse.json({ ok: true, aviso: data });
      }
      const u = await getRequestUser(req.headers.get("authorization"));
      const { data, error } = await sb.from("avisos_sistema").insert({ ...dados, criado_por: u?.email ?? null }).select().single();
      if (TABELA_FALTANDO(error)) return erroTabela();
      if (error) throw error;
      return NextResponse.json({ ok: true, aviso: data });
    }
    if (!body.id) return NextResponse.json({ ok: false, error: "Aviso não informado." }, { status: 400 });
    if (body.operacao === "ativar") {
      const { error } = await sb.from("avisos_sistema").update({ ativo: !!body.ativo, updated_at: new Date().toISOString() }).eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (body.operacao === "encerrar") {
      const { data: atual } = await sb.from("avisos_sistema").select("inicio").eq("id", body.id).maybeSingle();
      const agora = new Date();
      // Agendado que nunca entrou no ar: desativa (fim antes do início não é aceito)
      const patch = atual && new Date(atual.inicio as string) >= agora ? { ativo: false } : { fim: agora.toISOString() };
      const { error } = await sb.from("avisos_sistema").update({ ...patch, updated_at: agora.toISOString() }).eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (body.operacao === "excluir") {
      const { error } = await sb.from("avisos_sistema").delete().eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "Operação desconhecida." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) }, { status: 500 });
  }
}
