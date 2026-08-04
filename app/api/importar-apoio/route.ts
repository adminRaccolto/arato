import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ApoioRow {
  fazenda_nome: string;
  descricao: string;
  categoria?: string;
  data_lancamento?: string;
  data_vencimento: string;
  valor: number;
  moeda?: string;
  pessoa_cpf_cnpj?: string;
  pessoa_nome?: string;
  num_parcela?: string;
  total_parcelas?: string;
  tipo_documento_lcdpr?: string;
  numero_documento?: string;
  observacao?: string;
  produtor_cpf_cnpj?: string;
  produtor_nome?: string;
  safra_nome?: string;
  origem?: string;
}

// Remove acentos, normaliza para lowercase e colapsa espaços múltiplos
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Normaliza CNPJ/CPF digits — corrige zero inicial perdido pelo Excel (salvo como número)
// Ex: "6338993000869" (13 dígitos) → "06338993000869" (14 dígitos CNPJ)
//     "1234567890"   (10 dígitos) → "01234567890"   (11 dígitos CPF)
function normalizarDoc(digits: string): string {
  if (digits.length === 13) return "0" + digits; // CNPJ sem leading zero
  if (digits.length === 10) return "0" + digits; // CPF sem leading zero
  return digits;
}

// Normaliza nomes de coluna da planilha → campos do sistema (mesmo que normalizeApoioRow no client)
function normalizarColunasRow(r: Record<string, string>): Record<string, string> {
  const n: Record<string, string> = { ...r };

  if (!n.pessoa_cpf_cnpj?.trim()) {
    for (const a of [
      "CNPJ","cnpj","CPF","cpf","CPF_CNPJ","cpf_cnpj",
      "CPF/CNPJ","CNPJ/CPF","cnpj/cpf","cpf/cnpj",     // ordem invertida — ERPs BR
      "Documento","documento","DOCUMENTO",
      "Doc","doc","CNPJ_Fornecedor","cnpj_fornecedor",
      "Nr.CNPJ","Nro.CNPJ","Nr CNPJ","CNPJ Fornecedor", // variações sem underscore
      "CPF Fornecedor","cpf_cpnj","cpnj",                // typos comuns
    ]) {
      if (r[a]?.trim()) { n.pessoa_cpf_cnpj = r[a]; break; }
    }
  }

  if (!n.pessoa_nome?.trim()) {
    for (const a of [
      "Fornecedor","fornecedor","FORNECEDOR",
      "Credor","credor","CREDOR","Parceiro","parceiro",
      "RazaoSocial","razao_social","RAZAO_SOCIAL","Razão Social","RAZÃO SOCIAL",
      "Nome Fornecedor","Nome_Fornecedor","nome_fornecedor",
      "Beneficiario","BENEFICIARIO","Beneficiário","Nome","NOME",
    ]) {
      if (r[a]?.trim()) { n.pessoa_nome = r[a]; break; }
    }
  }

  if (!n.produtor_nome?.trim()) {
    for (const a of [
      "Produtor","produtor","PRODUTOR","Emitente","emitente",
      "Tomador","tomador","produtor_nome",
    ]) {
      if (r[a]?.trim()) { n.produtor_nome = r[a]; break; }
    }
  }

  if (!n.produtor_cpf_cnpj?.trim()) {
    for (const a of [
      "CPF_Produtor","cpf_produtor","CNPJ_Produtor","cnpj_produtor",
      "CPF Produtor","CNPJ Produtor","CPF_Emitente","cpf_emitente",
    ]) {
      if (r[a]?.trim()) { n.produtor_cpf_cnpj = r[a]; break; }
    }
  }

  if (!n.safra_nome?.trim()) {
    for (const a of [
      "Safra","safra","SAFRA","AnoSafra","ano_safra","ANO_SAFRA",
      "Exercicio","Exercício","exercicio","Ano","ano",
    ]) {
      if (r[a]?.trim()) { n.safra_nome = r[a]; break; }
    }
  }

  if (!n.origem?.trim()) {
    for (const a of [
      "Origem","origem","ORIGEM","Centro_Custo","centro_custo",
      "Centro Custo","Departamento","departamento","Unidade_Negocio",
    ]) {
      if (r[a]?.trim()) { n.origem = r[a]; break; }
    }
  }

  return n;
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { rows, conta_id, fazenda_id_fallback } = await req.json() as { rows: ApoioRow[]; conta_id: string; fazenda_id_fallback?: string };
  if (!rows?.length || !conta_id) {
    return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  }

  // Verificar acesso do usuário à conta
  const { data: perfil } = await admin
    .from("perfis")
    .select("conta_id, role")
    .eq("user_id", user.id)
    .single();
  if (!perfil) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 403 });
  if (perfil.role !== "raccotlo" && perfil.conta_id !== conta_id) {
    return NextResponse.json({ error: "Sem acesso a esta conta" }, { status: 403 });
  }

  // Carregar todas as fazendas da conta — mapa com chave normalizada
  const { data: fazendasDB } = await admin
    .from("fazendas").select("id, nome").eq("conta_id", conta_id);

  const fazendaMap: Record<string, string> = {};    // normalizado → fazenda_id
  const fazendaNomeMap: Record<string, string> = {}; // normalizado → nome original
  (fazendasDB ?? []).forEach((f: { id: string; nome: string }) => {
    const key = normalizar(f.nome);
    fazendaMap[key] = f.id;
    fazendaNomeMap[key] = f.nome;
  });
  const fazendaIds = Object.values(fazendaMap);

  // Fallback: produtores PJ da conta → seu próprio fazenda_id
  // Cobre empresas do grupo cadastradas como produtor mas não como fazenda
  const { data: produtoresPJDB } = await admin
    .from("produtores")
    .select("id, nome, fazenda_id")
    .eq("conta_id", conta_id)
    .eq("tipo", "pj");

  const produtorPJFazendaMap: Record<string, string> = {}; // normalizado(nome) → fazenda_id
  (produtoresPJDB ?? []).forEach((p: { nome: string; fazenda_id: string }) => {
    if (p.fazenda_id) produtorPJFazendaMap[normalizar(p.nome)] = p.fazenda_id;
  });

  // Mapas de pessoas, produtores e safras — todos com suporte a nome normalizado
  const [pessoasRes, produtoresRes, safrasRes] = await Promise.all([
    fazendaIds.length
      ? admin.from("pessoas").select("id, cpf_cnpj, nome").in("fazenda_id", fazendaIds)
      : { data: [] },
    fazendaIds.length
      // nome obrigatório para matching por nome (não só por CPF)
      ? admin.from("produtores").select("id, cpf_cnpj, nome").in("fazenda_id", fazendaIds)
      : { data: [] },
    // anos_safra por conta (via conta_id das fazendas)
    fazendaIds.length
      ? admin.from("anos_safra").select("id, descricao").in("fazenda_id", fazendaIds)
      : { data: [] },
  ]);

  const pessoaMapDoc: Record<string, { id: string; nome: string }> = {};
  // pessoaMapNome: nomes que aparecem em APENAS 1 registro — nomes duplicados são marcados como
  // ambíguos ("__ambiguo__") e só podem ser resolvidos via CPF/CNPJ, nunca pelo nome
  const pessoaMapNome: Record<string, { id: string; nome: string } | "__ambiguo__"> = {};
  (pessoasRes.data ?? []).forEach((p: { id: string; cpf_cnpj: string | null; nome: string }) => {
    const info = { id: p.id, nome: p.nome };
    if (p.cpf_cnpj) {
      const digits = p.cpf_cnpj.replace(/\D/g, "");
      pessoaMapDoc[digits] = info;
      // também mapeia versão sem leading zero (caso o cadastro tenha gravado sem)
      if (digits.startsWith("0")) pessoaMapDoc[digits.slice(1)] = info;
    }
    const nomeKey = normalizar(p.nome);
    if (pessoaMapNome[nomeKey] && pessoaMapNome[nomeKey] !== "__ambiguo__") {
      // mesmo nome → ambíguo, só CNPJ resolve
      pessoaMapNome[nomeKey] = "__ambiguo__";
    } else if (!pessoaMapNome[nomeKey]) {
      pessoaMapNome[nomeKey] = info;
    }
  });

  // Produtor: match por CPF/CNPJ OU por nome normalizado (para relatórios via FK)
  const produtorMapDoc: Record<string, { id: string; nome: string }> = {};
  const produtorMapNome: Record<string, { id: string; nome: string } | "__ambiguo__"> = {};
  (produtoresRes.data ?? []).forEach((p: { id: string; cpf_cnpj: string | null; nome: string }) => {
    const info = { id: p.id, nome: p.nome };
    if (p.cpf_cnpj) {
      const digits = p.cpf_cnpj.replace(/\D/g, "");
      produtorMapDoc[digits] = info;
      if (digits.startsWith("0")) produtorMapDoc[digits.slice(1)] = info;
    }
    const nomeKey = normalizar(p.nome);
    if (produtorMapNome[nomeKey] && produtorMapNome[nomeKey] !== "__ambiguo__") {
      produtorMapNome[nomeKey] = "__ambiguo__";
    } else if (!produtorMapNome[nomeKey]) {
      produtorMapNome[nomeKey] = info;
    }
  });

  // Ano Safra: match por descrição normalizada (ex: "2025/2026" → uuid)
  const safraMap: Record<string, { id: string; descricao: string }> = {};
  (safrasRes.data ?? []).forEach((s: { id: string; descricao: string }) => {
    safraMap[normalizar(s.descricao)] = { id: s.id, descricao: s.descricao };
  });

  type InsertRow = {
    fazenda_id: string; tipo: string; descricao: string; categoria: string | null;
    data_lancamento: string | null; data_vencimento: string; valor: number; moeda: string;
    pessoa_id: string | null; pessoa_nome: string | null; numero_documento: string | null;
    tipo_documento_lcdpr: string | null; num_parcela: number | null; total_parcelas: number | null;
    observacao: string | null; baixado: boolean;
    produtor_id: string | null; produtor_nome: string | null;
    ano_safra_id: string | null; safra_nome: string | null;
    origem: string | null;
  };

  const toInsert: InsertRow[] = [];
  const erros: { linha: number; msg: string }[] = [];
  const fazendasNaoEncontradas = new Set<string>();
  let semPessoa = 0;
  let semPessoaNomePlanilha = 0; // chegou sem pessoa_nome na planilha (nem por alias)

  for (let i = 0; i < rows.length; i++) {
    const r = normalizarColunasRow(rows[i] as unknown as Record<string, string>) as unknown as ApoioRow;
    const nomeFazNorm = normalizar(r.fazenda_nome ?? "");
    // 1ª tentativa: fazenda pelo nome | 2ª: produtor PJ | 3ª: fazenda ativa passada pelo cliente
    const fazIdRow = nomeFazNorm
      ? (fazendaMap[nomeFazNorm] ?? produtorPJFazendaMap[nomeFazNorm] ?? fazenda_id_fallback)
      : fazenda_id_fallback;

    if (!fazIdRow) {
      fazendasNaoEncontradas.add(r.fazenda_nome ?? "(vazio)");
      erros.push({ linha: i + 2, msg: `Fazenda "${r.fazenda_nome}" não encontrada` });
      continue;
    }

    // Match de pessoa: 1º CPF/CNPJ (com correção de zero perdido pelo Excel) → 2º nome
    let pessoaInfo: { id: string; nome: string } | null = null;
    const docRaw = r.pessoa_cpf_cnpj ? r.pessoa_cpf_cnpj.replace(/\D/g, "") : "";
    const docKey = normalizarDoc(docRaw);
    if (docKey.length >= 11) {
      pessoaInfo = pessoaMapDoc[docKey] ?? pessoaMapDoc[docRaw] ?? null;
    }
    if (!pessoaInfo && r.pessoa_nome?.trim()) {
      const nomeMatch = pessoaMapNome[normalizar(r.pessoa_nome)];
      if (nomeMatch && nomeMatch !== "__ambiguo__") pessoaInfo = nomeMatch;
      // Se ambíguo (2 CNPJs, mesmo nome): não vincula via nome — exige CPF/CNPJ para desambiguar
    }
    if (!pessoaInfo) semPessoa++;
    if (!r.pessoa_nome?.trim() && !r.pessoa_cpf_cnpj?.trim()) semPessoaNomePlanilha++;

    // Produtor: 1º CPF/CNPJ (com correção de zero perdido) → 2º nome → 3º texto livre
    const prodRaw = r.produtor_cpf_cnpj?.replace(/\D/g, "") ?? "";
    const prodCpfKey = normalizarDoc(prodRaw);
    let produtorInfo: { id: string; nome: string } | null = null;
    if (prodCpfKey.length >= 11) produtorInfo = produtorMapDoc[prodCpfKey] ?? produtorMapDoc[prodRaw] ?? null;
    if (!produtorInfo && r.produtor_nome?.trim()) {
      const nomeMatch = produtorMapNome[normalizar(r.produtor_nome)];
      if (nomeMatch && nomeMatch !== "__ambiguo__") produtorInfo = nomeMatch;
    }
    const produtorId   = produtorInfo?.id ?? null;
    // produtor_nome: nome canônico do cadastro (para FK) OU texto da planilha (display)
    const produtorNome = produtorInfo?.nome ?? r.produtor_nome?.trim() ?? null;

    // Ano Safra: match por descrição normalizada (ex: "2025/2026")
    const safraRaw  = r.safra_nome?.trim() ?? "";
    const safraInfo = safraRaw ? (safraMap[normalizar(safraRaw)] ?? null) : null;
    const safraId   = safraInfo?.id ?? null;
    // safra_nome: descrição canônica do cadastro OU texto da planilha (display)
    const safraNome = safraInfo?.descricao ?? (safraRaw || null);

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
      // Se não achou no cadastro, grava o nome da planilha — evita "—" na tela
      pessoa_nome:          pessoaInfo?.nome ?? (r.pessoa_nome?.trim() || null),
      numero_documento:     r.numero_documento?.trim() || null,
      tipo_documento_lcdpr: r.tipo_documento_lcdpr?.trim() || null,
      num_parcela:          r.num_parcela ? parseInt(r.num_parcela) : null,
      total_parcelas:       r.total_parcelas ? parseInt(r.total_parcelas) : null,
      observacao:           r.observacao?.trim() || null,
      produtor_id:          produtorId,
      produtor_nome:        produtorNome,
      ano_safra_id:         safraId,
      safra_nome:           safraNome,
      origem:               r.origem?.trim() || null,
      baixado:              false,
    });
  }

  // Inserir em lotes de 50 — falha isolada por lote, bem abaixo do timeout
  const BATCH = 50;
  let ok = 0;
  const errosInsert: { linha: number; msg: string }[] = [];
  for (let s = 0; s < toInsert.length; s += BATCH) {
    const chunk = toInsert.slice(s, s + BATCH);
    const { error } = await admin.from("apoio_lancamentos").insert(chunk);
    if (error) {
      // falha no lote: registrar cada linha individualmente
      for (let j = 0; j < chunk.length; j++) {
        errosInsert.push({ linha: s + j + 2, msg: error.message });
      }
    } else {
      ok += chunk.length;
    }
  }

  return NextResponse.json({
    ok,
    erros: erros.length + errosInsert.length,
    sem_pessoa: semPessoa,
    // diagnóstico: quantas linhas chegaram sem pessoa_nome nem cpf_cnpj na planilha
    sem_pessoa_nome_planilha: semPessoaNomePlanilha,
    fazendas_sistema: Object.values(fazendaNomeMap),
    fazendas_nao_encontradas: Array.from(fazendasNaoEncontradas),
    detalhes: [...erros.slice(0, 10), ...errosInsert],
  });
}
