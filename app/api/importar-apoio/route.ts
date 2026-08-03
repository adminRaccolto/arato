import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ApoioRow {
  fazenda_nome: string;
  descricao: string;
  categoria?: string;
  data_lancamento?: string;
  data_vencimento: string;
  valor: number;
  moeda?: string;
  pessoa_cpf_cnpj?: string;
  num_parcela?: string;
  total_parcelas?: string;
  tipo_documento_lcdpr?: string;
  numero_documento?: string;
  observacao?: string;
  produtor_cpf_cnpj?: string;
}

export async function POST(req: NextRequest) {
  // Autenticar usuário via cookies
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Admin client com service_role_key — bypassa RLS
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { rows, conta_id } = await req.json() as { rows: ApoioRow[]; conta_id: string };
  if (!rows?.length || !conta_id) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  // Verificar que o usuário realmente tem acesso à conta
  const { data: perfil } = await admin
    .from("perfis")
    .select("conta_id, role")
    .eq("user_id", user.id)
    .single();
  if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 403 });
  if (perfil.role !== "raccotlo" && perfil.conta_id !== conta_id) {
    return NextResponse.json({ error: "Sem acesso a esta conta" }, { status: 403 });
  }

  // Carregar todas as fazendas da conta
  const { data: fazendasDB } = await admin
    .from("fazendas").select("id, nome").eq("conta_id", conta_id);
  const fazendaMap: Record<string, string> = {};
  (fazendasDB ?? []).forEach((f: { id: string; nome: string }) => {
    fazendaMap[f.nome.trim().toLowerCase()] = f.id;
  });
  const fazendaIds = Object.values(fazendaMap);

  // Mapas de pessoas e produtores
  const [pessoasRes, produtoresRes] = await Promise.all([
    fazendaIds.length
      ? admin.from("pessoas").select("id, cpf_cnpj, nome").in("fazenda_id", fazendaIds)
      : { data: [] },
    fazendaIds.length
      ? admin.from("produtores").select("id, cpf_cnpj").in("fazenda_id", fazendaIds)
      : { data: [] },
  ]);
  const pessoaMap: Record<string, { id: string; nome: string }> = {};
  (pessoasRes.data ?? []).forEach((p: { id: string; cpf_cnpj: string | null; nome: string }) => {
    if (p.cpf_cnpj) pessoaMap[p.cpf_cnpj.replace(/\D/g, "")] = { id: p.id, nome: p.nome };
  });
  const produtorMap: Record<string, string> = {};
  (produtoresRes.data ?? []).forEach((p: { id: string; cpf_cnpj: string | null }) => {
    if (p.cpf_cnpj) produtorMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id;
  });

  // Fazenda de fallback (primeira da conta)
  const [defaultFazendaId] = Object.values(fazendaMap);

  // Preparar todos os registros de uma vez (sem loop assíncrono)
  type InsertRow = {
    fazenda_id: string; tipo: string; descricao: string; categoria: string | null;
    data_lancamento: string | null; data_vencimento: string; valor: number; moeda: string;
    pessoa_id: string | null; pessoa_nome: string | null; numero_documento: string | null;
    tipo_documento_lcdpr: string | null; num_parcela: number | null; total_parcelas: number | null;
    observacao: string | null; produtor_id: string | null; baixado: boolean;
  };

  const toInsert: InsertRow[] = [];
  const erros: { linha: number; msg: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nomeFaz = r.fazenda_nome?.trim().toLowerCase() ?? "";
    const fazIdRow = nomeFaz ? (fazendaMap[nomeFaz] ?? defaultFazendaId) : defaultFazendaId;

    if (!fazIdRow) {
      erros.push({ linha: i + 1, msg: `Fazenda "${r.fazenda_nome}" não encontrada na conta` });
      continue;
    }

    const docKey = r.pessoa_cpf_cnpj ? r.pessoa_cpf_cnpj.replace(/\D/g, "") : "";
    const pessoaInfo = docKey.length >= 11 ? pessoaMap[docKey] ?? null : null;
    const produtorId = r.produtor_cpf_cnpj?.trim()
      ? produtorMap[r.produtor_cpf_cnpj.replace(/\D/g, "")] ?? null : null;

    const moedaRaw = (r.moeda ?? "BRL").trim().toUpperCase();
    const moeda = moedaRaw === "USD" || moedaRaw === "US$" ? "USD"
      : moedaRaw === "SSJ" || moedaRaw === "SCM" || moedaRaw === "BARTER" ? "barter"
      : "BRL";

    toInsert.push({
      fazenda_id:           fazIdRow,
      tipo:                 "pagar",
      descricao:            r.descricao.trim(),
      categoria:            r.categoria?.trim() || null,
      data_lancamento:      r.data_lancamento?.trim() || null,
      data_vencimento:      r.data_vencimento.trim(),
      valor:                Number(r.valor) || 0,
      moeda,
      pessoa_id:            pessoaInfo?.id ?? null,
      pessoa_nome:          pessoaInfo?.nome ?? null,
      numero_documento:     r.numero_documento?.trim() || null,
      tipo_documento_lcdpr: r.tipo_documento_lcdpr?.trim() || null,
      num_parcela:          r.num_parcela ? parseInt(r.num_parcela) : null,
      total_parcelas:       r.total_parcelas ? parseInt(r.total_parcelas) : null,
      observacao:           r.observacao?.trim() || null,
      produtor_id:          produtorId,
      baixado:              false,
    });
  }

  // Inserir em lotes de 500 — uma única chamada por lote (100x mais rápido)
  const BATCH = 500;
  let ok = 0;
  for (let s = 0; s < toInsert.length; s += BATCH) {
    const chunk = toInsert.slice(s, s + BATCH);
    const { error } = await admin
      .from("apoio_lancamentos")
      .insert(chunk);
    if (error) {
      erros.push({ linha: s + 1, msg: `Lote ${Math.floor(s/BATCH)+1}: ${error.message}` });
    } else {
      ok += chunk.length;
    }
  }

  return NextResponse.json({ ok, erros: erros.length, detalhes: erros.slice(0, 20) });
}
