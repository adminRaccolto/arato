import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Chamada vem do App Campo, repo/deploy separado (arato-campo) — origem
// cross-domain de verdade, precisa de CORS explícito. `campo.arato.agr.br` é
// o domínio-alvo (CLAUDE.md do App Campo, seção 5) mas ainda não configurado
// como custom domain; `arato-campo.vercel.app` é o domínio real de produção
// hoje. Mesmo padrão de app/api/admin/novo-cliente/route.ts (allowlist, não
// `*`, porque esta rota consome estoque de verdade).
function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ["https://campo.arato.agr.br", "https://arato-campo.vercel.app", "http://localhost:3001"];
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

function jsonCors(req: Request, body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { ...init?.headers, ...corsHeaders(req) } });
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

type Tabela = "plantios" | "pulverizacoes" | "adubacoes_base" | "correcoes_solo" | "abastecimentos";
const TABELAS_VALIDAS: Tabela[] = ["plantios", "pulverizacoes", "adubacoes_base", "correcoes_solo", "abastecimentos"];

interface Payload {
  tabela: Tabela;
  id: string;
  decisao: "aprovado" | "rejeitado";
  motivoRejeicao?: string;
}

// Baixa de estoque no momento da APROVAÇÃO de um lançamento vindo do App
// Campo — não na criação (CLAUDE.md do App Campo, seções 2.8/4.3). Sem gerar
// lançamento financeiro (Conta a Pagar) nenhum: replica a lógica real usada
// pelas telas desktop (lib/db.ts — processarPlantio/processarPulverizacao/
// processarAdubacao/processarCorrecao), não a rota antiga
// app/api/campo/consumir-estoque (que cria CP e duplicava dívida já lançada
// na NF de compra — bug conhecido, já corrigido no fluxo desktop).
//
// Diferença em relação a lib/db.ts: lá a quantidade consumida já vem
// pré-calculada (quantidade_kg/total_consumido/quantidade_ton) porque o
// desktop grava isso no momento do lançamento. As linhas que o App Campo
// grava só têm a DOSE por hectare (dose_kg_ha/dose_ha/dose_ton_ha) — a
// quantidade total é calculada aqui, na aprovação, como dose × área da
// própria linha (cada linha de pulverizacoes/adubacoes_base/correcoes_solo/
// plantios já representa um único talhão — ver
// arato-campo/lib/tarefas/executores.ts).
async function consumirEstoque(
  adm: SupabaseClient,
  tabela: Tabela,
  id: string
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (tabela === "plantios") {
    const { data: p, error } = await adm
      .from("plantios")
      .select("fazenda_id, ciclo_id, insumo_id, dose_kg_ha, area_ha, data_plantio, variedade, lote_semente")
      .eq("id", id)
      .single();
    if (error || !p) return { ok: false, erro: error?.message ?? "plantio não encontrado" };
    // Sem insumo ou sem dose numérica em kg (dose em outra unidade — ver
    // lib/tarefas/executores.ts do App Campo) — nada pra baixar, mesma
    // limitação que já existe hoje, não é regressão desta rota.
    if (!p.insumo_id || !p.dose_kg_ha) return { ok: true };

    const qty = p.dose_kg_ha * p.area_ha;
    const { data: ins } = await adm
      .from("insumos")
      .select("estoque, custo_medio, valor_unitario, nome")
      .eq("id", p.insumo_id)
      .single();
    if (!ins) return { ok: false, erro: "insumo do plantio não encontrado" };

    await adm.from("insumos").update({ estoque: (ins.estoque ?? 0) - qty }).eq("id", p.insumo_id);
    const { error: movErro } = await adm.from("movimentacoes_estoque").insert({
      insumo_id: p.insumo_id,
      fazenda_id: p.fazenda_id,
      tipo: "saida",
      quantidade: qty,
      custo_unitario_na_baixa: ins.custo_medio ?? ins.valor_unitario ?? undefined,
      data: p.data_plantio,
      ciclo_id: p.ciclo_id,
      operacao: "plantio",
      observacao: `Plantio — ${ins.nome} ${p.variedade ?? ""}`.trim(),
      auto: true,
      lote_semente: p.lote_semente ?? null,
    });
    if (movErro) return { ok: false, erro: movErro.message };
    return { ok: true };
  }

  if (tabela === "pulverizacoes") {
    const { data: pulv, error } = await adm
      .from("pulverizacoes")
      .select("fazenda_id, ciclo_id, tipo, data_inicio, area_ha")
      .eq("id", id)
      .single();
    if (error || !pulv) return { ok: false, erro: error?.message ?? "pulverização não encontrada" };

    const { data: itens, error: itensErro } = await adm
      .from("pulverizacao_itens")
      .select("insumo_id, dose_ha")
      .eq("pulverizacao_id", id);
    if (itensErro) return { ok: false, erro: itensErro.message };

    let custoTotal = 0;
    for (const item of itens ?? []) {
      if (!item.insumo_id || !item.dose_ha) continue;
      const qty = item.dose_ha * pulv.area_ha;
      const { data: ins } = await adm
        .from("insumos")
        .select("estoque, custo_medio, valor_unitario, nome")
        .eq("id", item.insumo_id)
        .single();
      if (!ins) continue;
      const custoUnit = ins.custo_medio ?? ins.valor_unitario ?? 0;
      custoTotal += custoUnit * qty;

      await adm.from("insumos").update({ estoque: (ins.estoque ?? 0) - qty }).eq("id", item.insumo_id);
      await adm.from("movimentacoes_estoque").insert({
        insumo_id: item.insumo_id,
        fazenda_id: pulv.fazenda_id,
        tipo: "saida",
        quantidade: qty,
        custo_unitario_na_baixa: custoUnit || undefined,
        data: pulv.data_inicio,
        ciclo_id: pulv.ciclo_id,
        operacao: pulv.tipo,
        observacao: `Pulverização ${pulv.tipo} — ${ins.nome}`,
        auto: true,
      });
    }

    // Mesmo campo que o desktop mantém populado (processarPulverizacao em
    // lib/db.ts) — as linhas do App Campo não vêm com custo_total calculado.
    await adm.from("pulverizacoes").update({ custo_total: custoTotal }).eq("id", id);
    return { ok: true };
  }

  if (tabela === "adubacoes_base") {
    const { data: adub, error } = await adm
      .from("adubacoes_base")
      .select("fazenda_id, ciclo_id, data_aplicacao, area_ha")
      .eq("id", id)
      .single();
    if (error || !adub) return { ok: false, erro: error?.message ?? "adubação não encontrada" };

    const { data: itens, error: itensErro } = await adm
      .from("adubacoes_base_itens")
      .select("insumo_id, dose_kg_ha")
      .eq("adubacao_id", id);
    if (itensErro) return { ok: false, erro: itensErro.message };

    for (const item of itens ?? []) {
      if (!item.insumo_id || !item.dose_kg_ha) continue;
      const kg = item.dose_kg_ha * adub.area_ha;
      const { data: ins } = await adm
        .from("insumos")
        .select("estoque, unidade, custo_medio, valor_unitario, nome")
        .eq("id", item.insumo_id)
        .single();
      if (!ins) continue;

      // Conversão kg → unidade nativa do insumo — mesma tabela de conversão
      // de processarAdubacao (lib/db.ts).
      const unidade: string = ins.unidade ?? "kg";
      let qtdNativa: number;
      switch (unidade) {
        case "kg": qtdNativa = kg; break;
        case "t": qtdNativa = kg / 1000; break;
        case "g": qtdNativa = kg * 1000; break;
        case "sc": qtdNativa = kg / 60; break;
        case "L": qtdNativa = kg; break;
        default: qtdNativa = kg; break;
      }

      await adm.from("insumos").update({ estoque: (ins.estoque ?? 0) - qtdNativa }).eq("id", item.insumo_id);
      await adm.from("movimentacoes_estoque").insert({
        insumo_id: item.insumo_id,
        fazenda_id: adub.fazenda_id,
        tipo: "saida",
        quantidade: qtdNativa,
        custo_unitario_na_baixa: ins.custo_medio ?? ins.valor_unitario ?? undefined,
        data: adub.data_aplicacao,
        ciclo_id: adub.ciclo_id,
        motivo: "adubacao_base",
        descricao: `Adubação de Base — ${ins.nome}`,
      });
    }
    return { ok: true };
  }

  if (tabela === "correcoes_solo") {
    const { data: correcao, error } = await adm
      .from("correcoes_solo")
      .select("fazenda_id, ciclo_id, data_aplicacao, area_ha")
      .eq("id", id)
      .single();
    if (error || !correcao) return { ok: false, erro: error?.message ?? "correção de solo não encontrada" };

    const { data: itens, error: itensErro } = await adm
      .from("correcoes_solo_itens")
      .select("insumo_id, dose_ton_ha")
      .eq("correcao_id", id);
    if (itensErro) return { ok: false, erro: itensErro.message };

    for (const item of itens ?? []) {
      if (!item.insumo_id || !item.dose_ton_ha) continue;
      const ton = item.dose_ton_ha * correcao.area_ha;
      const { data: ins } = await adm
        .from("insumos")
        .select("estoque, unidade, custo_medio, valor_unitario, nome")
        .eq("id", item.insumo_id)
        .single();
      if (!ins) continue;

      // Conversão toneladas → unidade nativa do insumo — mesma tabela de
      // conversão de processarCorrecao (lib/db.ts).
      const unidade: string = ins.unidade ?? "kg";
      let qtdNativa: number;
      switch (unidade) {
        case "t": qtdNativa = ton; break;
        case "kg": qtdNativa = ton * 1000; break;
        case "g": qtdNativa = ton * 1_000_000; break;
        case "sc": qtdNativa = (ton * 1000) / 60; break;
        default: qtdNativa = ton * 1000; break;
      }

      await adm.from("insumos").update({ estoque: (ins.estoque ?? 0) - qtdNativa }).eq("id", item.insumo_id);
      await adm.from("movimentacoes_estoque").insert({
        insumo_id: item.insumo_id,
        fazenda_id: correcao.fazenda_id,
        tipo: "saida",
        quantidade: qtdNativa,
        custo_unitario_na_baixa: ins.custo_medio ?? ins.valor_unitario ?? undefined,
        ciclo_id: correcao.ciclo_id,
        data: correcao.data_aplicacao,
        motivo: "correcao_solo",
        descricao: `Correção de Solo — ${ins.nome}`,
      });
    }
    return { ok: true };
  }

  // abastecimentos — baixa da bomba (bombas_combustivel.estoque_atual_l) se
  // a bomba consome estoque próprio; senão baixa direto do insumo
  // combustível, mesmo padrão das outras operações. Espelha
  // app/estoque/abastecimento/page.tsx (desktop) — mas, diferente do
  // desktop, NUNCA gera lançamento financeiro (Conta a Pagar): essa decisão
  // de faturamento é do gestor, fora do escopo do operador de campo
  // (CLAUDE.md do App Campo, seção 3.2).
  const { data: abastecimento, error: erroAbastecimento } = await adm
    .from("abastecimentos")
    .select("fazenda_id, bomba_id, insumo_id, quantidade_l, ciclo_id, data")
    .eq("id", id)
    .single();
  if (erroAbastecimento || !abastecimento) {
    return { ok: false, erro: erroAbastecimento?.message ?? "abastecimento não encontrado" };
  }

  if (abastecimento.bomba_id) {
    const { data: bomba } = await adm
      .from("bombas_combustivel")
      .select("estoque_atual_l, consume_estoque")
      .eq("id", abastecimento.bomba_id)
      .single();

    if (bomba && bomba.consume_estoque !== false) {
      await adm
        .from("bombas_combustivel")
        .update({ estoque_atual_l: Math.max(0, (bomba.estoque_atual_l ?? 0) - abastecimento.quantidade_l) })
        .eq("id", abastecimento.bomba_id);
      return { ok: true };
    }
  }

  if (abastecimento.insumo_id) {
    const { data: ins } = await adm
      .from("insumos")
      .select("estoque, custo_medio, valor_unitario, nome")
      .eq("id", abastecimento.insumo_id)
      .single();
    if (ins) {
      await adm.from("insumos").update({ estoque: (ins.estoque ?? 0) - abastecimento.quantidade_l }).eq("id", abastecimento.insumo_id);
      await adm.from("movimentacoes_estoque").insert({
        insumo_id: abastecimento.insumo_id,
        fazenda_id: abastecimento.fazenda_id,
        tipo: "saida",
        quantidade: abastecimento.quantidade_l,
        custo_unitario_na_baixa: ins.custo_medio ?? ins.valor_unitario ?? undefined,
        ciclo_id: abastecimento.ciclo_id,
        data: abastecimento.data,
        motivo: "abastecimento",
        descricao: `Abastecimento — ${ins.nome}`,
      });
    }
  }
  return { ok: true };
}

// POST /api/campo/aprovar-lancamento
// Chamada pelo App Campo (repo separado, arato-campo) na tela Aprovações —
// só o App Campo usa esta rota. Precisa viver aqui (não no App Campo) porque
// exige SUPABASE_SERVICE_ROLE_KEY, que o App Campo nunca tem (CLAUDE.md dele,
// seção 3.2) — o operador de campo (produto='campo') só tem RLS de leitura
// de catálogo em insumos, não escrita, e movimentacoes_estoque não tem
// policy nenhuma pra esse perfil.
export async function POST(req: NextRequest) {
  const adm = adminClient();

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return jsonCors(req, { error: "Não autenticado" }, { status: 401 });

  const {
    data: { user },
    error: authErr,
  } = await adm.auth.getUser(token);
  if (authErr || !user) return jsonCors(req, { error: "Token inválido" }, { status: 401 });

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return jsonCors(req, { error: "Corpo inválido" }, { status: 400 });
  }

  const { tabela, id, decisao, motivoRejeicao } = body;
  if (!TABELAS_VALIDAS.includes(tabela) || !id || (decisao !== "aprovado" && decisao !== "rejeitado")) {
    return jsonCors(req, { error: "Parâmetros inválidos" }, { status: 400 });
  }

  // Só Gerente Campo (ou equipe Raccolto) aprova/rejeita — CLAUDE.md do App
  // Campo, decisões 4.2/4.3. Não confia em nada que o client tenha mandado
  // sobre quem está autorizado — resolve tudo aqui, a partir do token.
  const { data: perfil } = await adm
    .from("perfis")
    .select("id, conta_id, produto, fazendas_permitidas, papel, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!perfil) return jsonCors(req, { error: "Perfil não encontrado" }, { status: 403 });

  const ehRaccolto = (perfil.role ?? "").startsWith("raccotlo");
  if (!ehRaccolto && perfil.papel !== "gerente_campo") {
    return jsonCors(req, { error: "Só Gerente Campo aprova ou rejeita lançamentos" }, { status: 403 });
  }

  // Lançamento alvo — precisa estar 'pendente' (evita reprocessar: duplo
  // clique, retry de rede baixando estoque duas vezes) e a fazenda precisa
  // estar dentro do que este perfil pode acessar. Mesma regra de
  // fn_pode_acessar_fazenda_campo (banco do App Campo), replicada aqui
  // porque esta rota usa service_role e por isso não passa pelo RLS.
  const { data: alvo, error: alvoErro } = await adm
    .from(tabela)
    .select("id, fazenda_id, status_campo")
    .eq("id", id)
    .maybeSingle();

  if (alvoErro || !alvo) return jsonCors(req, { error: "Lançamento não encontrado" }, { status: 404 });
  if (alvo.status_campo !== "pendente") {
    return jsonCors(req, { error: "Este lançamento já foi processado" }, { status: 409 });
  }

  if (!ehRaccolto) {
    const { data: fazenda } = await adm.from("fazendas").select("conta_id").eq("id", alvo.fazenda_id).maybeSingle();
    const contaFazenda = fazenda?.conta_id;
    const permitido =
      perfil.produto === "campo"
        ? perfil.fazendas_permitidas
          ? perfil.fazendas_permitidas.includes(alvo.fazenda_id)
          : perfil.conta_id === contaFazenda
        : perfil.conta_id === contaFazenda;
    if (!permitido) return jsonCors(req, { error: "Acesso negado a esta fazenda" }, { status: 403 });
  }

  if (decisao === "aprovado") {
    const resultado = await consumirEstoque(adm, tabela, id);
    if (!resultado.ok) {
      return jsonCors(req, { error: `Falha ao baixar estoque: ${resultado.erro}` }, { status: 500 });
    }
  }

  const { error: updErro } = await adm
    .from(tabela)
    .update({
      status_campo: decisao,
      aprovado_por_perfil_id: perfil.id,
      aprovado_em: new Date().toISOString(),
      ...(decisao === "rejeitado" ? { motivo_rejeicao: motivoRejeicao ?? null } : {}),
    })
    .eq("id", id);

  if (updErro) return jsonCors(req, { error: updErro.message }, { status: 500 });

  return jsonCors(req, { ok: true });
}
