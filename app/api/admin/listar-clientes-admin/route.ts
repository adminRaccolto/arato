import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/admin/listar-clientes-admin
// Retorna todos os clientes do seletor de produção enriquecidos com dados de contas/billing
export async function GET() {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );

  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const admin = adminClient();

  // maybeSingle() evita 406 quando perfil não existe
  const { data: perfil } = await admin.from("perfis").select("role").eq("user_id", user.id).maybeSingle();
  const isGino = (user.email ?? "").toLowerCase() === "gino@raccolto.com.br";
  if (!isGino && perfil?.role !== "raccotlo" && perfil?.role !== "raccotlo_gestor") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  // 1. Buscar todas as fazendas com acesso raccotlo ativo
  const { data: fazendas, error: fazErr } = await admin
    .from("fazendas")
    .select("id, nome, municipio, estado, area_total_ha, conta_id, produtor_id")
    .eq("raccolto_acesso", true)
    .order("nome");

  if (fazErr) return NextResponse.json({ error: fazErr.message }, { status: 500 });

  // 2. Enriquecer com produtores
  const produtorIds = [...new Set((fazendas ?? []).filter(f => f.produtor_id).map(f => f.produtor_id as string))];
  let produtorMap: Record<string, string> = {};
  if (produtorIds.length > 0) {
    const { data: prods } = await admin.from("produtores").select("id, nome").in("id", produtorIds);
    produtorMap = Object.fromEntries((prods ?? []).map(p => [p.id, p.nome]));
  }

  // 3. Enriquecer com dados de contas (billing)
  const contaIds = [...new Set((fazendas ?? []).filter(f => f.conta_id).map(f => f.conta_id as string))];
  let contaMap: Record<string, Record<string, unknown>> = {};
  if (contaIds.length > 0) {
    const { data: contas } = await admin.from("contas").select("*").in("id", contaIds);
    contaMap = Object.fromEntries((contas ?? []).map(c => [c.id, c]));
  }

  // 4. Buscar perfis vinculados às fazendas — fallback para nome quando não há produtor_id
  const fazendaIds = (fazendas ?? []).map(f => f.id);
  let perfilPorFazenda: Record<string, string> = {};
  if (fazendaIds.length > 0) {
    const { data: perfis } = await admin
      .from("perfis")
      .select("fazenda_id, nome_completo, conta_id")
      .in("fazenda_id", fazendaIds);

    // Também busca perfis por conta_id para clientes com conta
    const contaIdsParaPerfil = contaIds;
    let perfisPorConta: typeof perfis = [];
    if (contaIdsParaPerfil.length > 0) {
      const { data: pc } = await admin
        .from("perfis")
        .select("fazenda_id, nome_completo, conta_id")
        .in("conta_id", contaIdsParaPerfil);
      perfisPorConta = pc ?? [];
    }

    const todosPerfis = [...(perfis ?? []), ...perfisPorConta];
    for (const p of todosPerfis) {
      if (p.fazenda_id && p.nome_completo && !perfilPorFazenda[p.fazenda_id]) {
        perfilPorFazenda[p.fazenda_id] = p.nome_completo;
      }
    }
  }

  // 5. Agrupar por conta_id — uma entrada por cliente
  const idx: Record<string, {
    conta_id: string | null;
    conta_nome: string;
    produtor_nome: string | null;
    fazendas: Array<{ id: string; nome: string; municipio?: string; estado?: string; area_total_ha?: number }>;
    area_total: number;
    conta_data: Record<string, unknown> | null;
  }> = {};

  for (const f of fazendas ?? []) {
    const cid = f.conta_id ?? `sem_conta_${f.id}`;
    const prodNome = f.produtor_id ? (produtorMap[f.produtor_id] ?? null) : null;
    // Fallback: nome via perfil do usuário daquela fazenda
    const perfilNome = perfilPorFazenda[f.id] ?? null;
    const nomeRepresentante = prodNome ?? perfilNome;

    const contaDados = f.conta_id ? (contaMap[f.conta_id] ?? null) : null;
    const contaNome = contaDados ? String(contaDados.nome ?? f.nome) : f.nome;

    if (!idx[cid]) {
      idx[cid] = {
        conta_id:      f.conta_id ?? null,
        conta_nome:    contaNome,
        produtor_nome: nomeRepresentante,
        fazendas:      [],
        area_total:    0,
        conta_data:    contaDados,
      };
    }
    if (!idx[cid].produtor_nome && nomeRepresentante) idx[cid].produtor_nome = nomeRepresentante;
    idx[cid].fazendas.push({ id: f.id, nome: f.nome, municipio: f.municipio, estado: f.estado, area_total_ha: f.area_total_ha });
    idx[cid].area_total += f.area_total_ha ?? 0;
  }

  const clientes = Object.values(idx).sort((a, b) => {
    const na = (a.produtor_nome ?? a.conta_nome).toLowerCase();
    const nb = (b.produtor_nome ?? b.conta_nome).toLowerCase();
    return na.localeCompare(nb, "pt-BR");
  });

  return NextResponse.json({ clientes });
}
