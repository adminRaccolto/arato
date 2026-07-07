/**
 * RacTech — camada de acesso a dados
 * Todas as queries ao Supabase ficam aqui.
 * Os componentes importam essas funções e não chamam supabase diretamente.
 */

import { supabase } from "./supabase";
import type { Conta, Fazenda, Talhao, Safra, Operacao, Insumo, MovimentacaoEstoque, Lancamento, Contrato, ContratoItem, ContratoCessaoDebito, Romaneio, NotaFiscal, Simulacao, Empresa, ContaBancaria, Produtor, ProdutorIE, MatriculaImovel, Pessoa, AnoSafra, Ciclo, Maquina, BombaCombustivel, Funcionario, FuncionarioPremiacao, FuncionarioFerias, GrupoUsuario, Usuario, Deposito, HistoricoManutencao, NfEntrada, NfEntradaItem, EstoqueTerceiro, ContratoFinanceiro, ParcelaLiberacao, ParcelaPagamento, GarantiaContrato, CentroCustoContrato, Arrendamento, ArrendamentoMatricula, LogSistema, PrincipioAtivo, NomeComercial, PASaldo, MovimentacaoPA, NfImportadaSieg, NfImportadaItemSieg, RegraClassificacaoNf, ConfiguracaoAutomacao } from "./supabase";

// ————————————————————————————————————————
// LOGS DE AUDITORIA
// ————————————————————————————————————————

export async function registrarLog(
  fazendaId: string,
  acao: LogSistema["acao"],
  modulo: string,
  descricao: string,
  opts?: {
    usuarioId?: string;
    usuarioNome?: string;
    usuarioEmail?: string;
    entidade?: string;
    entidadeId?: string;
    dadosDepois?: Record<string, unknown>;
  }
): Promise<void> {
  // Fire-and-forget: nunca bloqueia a operação principal
  supabase.from("logs_sistema").insert({
    fazenda_id: fazendaId,
    acao,
    modulo,
    descricao,
    usuario_id:    opts?.usuarioId   ?? null,
    usuario_nome:  opts?.usuarioNome ?? null,
    usuario_email: opts?.usuarioEmail ?? null,
    entidade:      opts?.entidade    ?? null,
    entidade_id:   opts?.entidadeId  ?? null,
    dados_depois:  opts?.dadosDepois ?? null,
  }).then(({ error }) => {
    if (error) console.warn("[log] falha ao registrar:", error.message);
  });
}

export async function listarLogs(
  fazendaId: string,
  modulo?: string,
  limite = 200
): Promise<LogSistema[]> {
  let q = supabase.from("logs_sistema").select("*").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }).limit(limite);
  if (modulo) q = q.eq("modulo", modulo);
  const { data } = await q;
  return (data ?? []) as LogSistema[];
}

// ————————————————————————————————————————
// CONTAS TENANT (entidade raiz do SaaS)
// ————————————————————————————————————————

export async function criarContaTenant(c: Omit<Conta, "id" | "created_at">): Promise<Conta> {
  const { data, error } = await supabase.from("contas").insert(c).select().single();
  if (error) throw error;
  return data;
}

export async function listarContasTenant(): Promise<Conta[]> {
  const { data, error } = await supabase.from("contas").select("*").order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function listarContasAdmin(): Promise<(Conta & { fazendas_count: number })[]> {
  const { data, error } = await supabase
    .from("contas")
    .select("*, fazendas(id)")
    .order("nome");
  if (error) throw error;
  return (data ?? []).map((c: Conta & { fazendas?: { id: string }[] }) => ({
    ...c,
    fazendas_count: Array.isArray(c.fazendas) ? c.fazendas.length : 0,
    fazendas: undefined,
  }));
}

export async function atualizarConta(id: string, campos: Partial<Omit<Conta, "id" | "created_at">>): Promise<void> {
  const { error } = await supabase.from("contas").update(campos).eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// FAZENDAS
// ————————————————————————————————————————

export async function listarFazendas(id?: string): Promise<Fazenda[]> {
  let q = supabase.from("fazendas").select("*").order("nome");
  if (id) {
    q = q.eq("id", id);
  } else {
    // Acesso por conta (não por usuário individual) — múltiplos usuários por conta, múltiplas fazendas por conta
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];
    const { data: perfil } = await supabase.from("perfis").select("conta_id").eq("user_id", user.id).maybeSingle();
    if (perfil?.conta_id) {
      q = q.eq("conta_id", perfil.conta_id);
    } else {
      // Fallback para contas legadas ainda sem conta_id: filtra por owner_user_id
      q = q.eq("owner_user_id", user.id);
    }
  }
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function criarFazenda(f: Omit<Fazenda, "id" | "created_at">): Promise<Fazenda> {
  const res = await fetch("/api/fazenda/salvar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(f),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error ?? "Erro ao criar fazenda.");
  return json.data as Fazenda;
}

export async function atualizarFazenda(id: string, f: Partial<Fazenda>): Promise<void> {
  const res = await fetch("/api/fazenda/salvar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...f }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error ?? "Erro ao salvar fazenda.");
}

export async function excluirFazenda(id: string): Promise<void> {
  const { error } = await supabase.from("fazendas").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// TALHÕES
// ————————————————————————————————————————

export async function listarTalhoes(fazenda_id: string): Promise<Talhao[]> {
  const { data, error } = await supabase.from("talhoes").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function criarTalhao(t: Omit<Talhao, "id" | "created_at">): Promise<Talhao> {
  const { area_plantada_ha, ...rest } = t;
  const { data, error } = await supabase.from("talhoes").insert(rest).select().single();
  if (error) throw error;
  // Salva area_plantada_ha separadamente via rpc para contornar cache de schema desatualizado
  if (area_plantada_ha != null) {
    await supabase.rpc("set_talhao_area_plantada", { p_id: data.id, p_area: area_plantada_ha }).then(r => {
      if (r.error) {
        // Fallback: tenta update direto (funciona quando cache já foi recarregado)
        supabase.from("talhoes").update({ area_plantada_ha } as Partial<Talhao>).eq("id", data.id);
      }
    });
  }
  return { ...data, area_plantada_ha: area_plantada_ha ?? undefined };
}

export async function atualizarTalhao(id: string, t: Partial<Talhao>): Promise<void> {
  const { area_plantada_ha, ...rest } = t;
  if (Object.keys(rest).length > 0) {
    const { error } = await supabase.from("talhoes").update(rest).eq("id", id);
    if (error) throw error;
  }
  if (area_plantada_ha != null) {
    await supabase.rpc("set_talhao_area_plantada", { p_id: id, p_area: area_plantada_ha }).then(r => {
      if (r.error) {
        supabase.from("talhoes").update({ area_plantada_ha } as Partial<Talhao>).eq("id", id);
      }
    });
  }
}

export async function excluirTalhao(id: string): Promise<void> {
  await supabase.from("talhao_arrendamentos").delete().eq("talhao_id", id);
  const { error } = await supabase.from("talhoes").delete().eq("id", id);
  if (error) throw error;
}

export async function listarArrendamentosTalhao(talhao_id: string): Promise<string[]> {
  const { data } = await supabase.from("talhao_arrendamentos").select("arrendamento_id").eq("talhao_id", talhao_id);
  return (data ?? []).map((r: { arrendamento_id: string }) => r.arrendamento_id);
}

export async function salvarArrendamentosTalhao(talhao_id: string, arrendamento_ids: string[]): Promise<void> {
  await supabase.from("talhao_arrendamentos").delete().eq("talhao_id", talhao_id);
  if (arrendamento_ids.length === 0) return;
  const rows = arrendamento_ids.map(arrendamento_id => ({ talhao_id, arrendamento_id }));
  const { error } = await supabase.from("talhao_arrendamentos").insert(rows);
  if (error) throw error;
}

// ————————————————————————————————————————
// SAFRAS
// ————————————————————————————————————————

export async function listarSafras(fazenda_id: string): Promise<Safra[]> {
  const { data, error } = await supabase.from("safras").select("*").eq("fazenda_id", fazenda_id).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarSafra(s: Omit<Safra, "id" | "created_at">): Promise<Safra> {
  const { data, error } = await supabase.from("safras").insert(s).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarSafra(id: string, s: Partial<Safra>): Promise<void> {
  const { error } = await supabase.from("safras").update(s).eq("id", id);
  if (error) throw error;
}
export async function excluirSafra(id: string): Promise<void> {
  const { error } = await supabase.from("safras").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// OPERAÇÕES DE LAVOURA
// ————————————————————————————————————————

export async function listarOperacoes(safra_id: string): Promise<Operacao[]> {
  const { data, error } = await supabase
    .from("operacoes")
    .select("*")
    .eq("safra_id", safra_id)
    .order("data_prev");
  if (error) throw error;
  return data ?? [];
}

export async function criarOperacao(o: Omit<Operacao, "id" | "created_at">): Promise<Operacao> {
  const { data, error } = await supabase.from("operacoes").insert(o).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarOperacao(id: string, o: Partial<Operacao>): Promise<void> {
  const { error } = await supabase.from("operacoes").update(o).eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// INSUMOS
// ————————————————————————————————————————

export async function listarInsumos(fazenda_id: string): Promise<Insumo[]> {
  const { data, error } = await supabase.from("insumos").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function criarInsumo(i: Omit<Insumo, "id" | "created_at">): Promise<Insumo> {
  const { data, error } = await supabase.from("insumos").insert(i).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarInsumo(id: string, i: Partial<Insumo>): Promise<void> {
  const { error } = await supabase.from("insumos").update(i).eq("id", id);
  if (error) throw error;
}

export async function excluirInsumo(id: string): Promise<void> {
  const { error } = await supabase.from("insumos").delete().eq("id", id);
  if (error) throw error;
}

export async function excluirInsumos(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from("insumos").delete().in("id", ids);
  if (error) throw error;
}

export async function listarMovimentacoes(fazenda_id: string, insumo_id?: string, dataInicio?: string, dataFim?: string): Promise<MovimentacaoEstoque[]> {
  let q = supabase.from("movimentacoes_estoque").select("*").eq("fazenda_id", fazenda_id).order("data", { ascending: false });
  if (insumo_id) q = q.eq("insumo_id", insumo_id);
  if (dataInicio) q = q.gte("data", dataInicio);
  if (dataFim)    q = q.lte("data", dataFim);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

// Movimentação manual: atualiza saldo do insumo + registra movimentação
export async function criarMovimentacaoManual(
  fazenda_id: string,
  insumo_id: string,
  tipo: "entrada" | "saida" | "ajuste",
  motivo: MovimentacaoEstoque["motivo"],
  quantidade: number,          // positivo sempre; direção determinada pelo tipo
  deposito_id: string | undefined,
  data: string,
  observacao?: string,
  quantidade_nova?: number,    // para ajuste de saldo: valor absoluto desejado
  usuario_nome?: string,
): Promise<void> {
  const { data: ins, error: insErr } = await supabase.from("insumos").select("id, nome, estoque").eq("id", insumo_id).single();
  if (!ins || insErr) throw new Error("Insumo não encontrado");

  let delta: number;
  if (tipo === "ajuste" && quantidade_nova !== undefined) {
    delta = quantidade_nova - ins.estoque;
  } else {
    delta = tipo === "saida" ? -quantidade : quantidade;
  }

  await supabase.from("insumos").update({ estoque: ins.estoque + delta }).eq("id", insumo_id);

  // Para ajustes: armazenamos o delta assinado em quantidade (pode ser negativo)
  // Para entrada/saída: armazenamos positivo (direção indicada pelo tipo)
  await supabase.from("movimentacoes_estoque").insert({
    fazenda_id, insumo_id,
    tipo,
    motivo,
    quantidade: tipo === "ajuste" ? delta : Math.abs(delta),
    data, deposito_id: deposito_id ?? null,
    observacao, auto: false, usuario_nome: usuario_nome ?? null,
  });
}

export async function registrarMovimentacao(m: Omit<MovimentacaoEstoque, "id" | "created_at">): Promise<void> {
  const { error } = await supabase.from("movimentacoes_estoque").insert(m);
  if (error) throw error;
  // O trigger do banco atualiza o estoque automaticamente
}

// ————————————————————————————————————————
// LANÇAMENTOS FINANCEIROS
// ————————————————————————————————————————

export async function listarLancamentos(fazenda_id: string): Promise<Lancamento[]> {
  const PAGE = 1000;
  let all: Lancamento[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("lancamentos")
      .select("*")
      .eq("fazenda_id", fazenda_id)
      .order("data_vencimento")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all = all.concat(data ?? []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function listarLancamentosPeriodo(
  fazenda_id: string,
  dataInicio: string,
  dataFim: string,
  tipo?: "pagar" | "receber",
): Promise<Lancamento[]> {
  const PAGE = 1000;
  let all: Lancamento[] = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from("lancamentos")
      .select("*")
      .eq("fazenda_id", fazenda_id)
      .gte("data_vencimento", dataInicio)
      .lte("data_vencimento", dataFim)
      .order("data_vencimento")
      .range(from, from + PAGE - 1);
    if (tipo) q = q.eq("tipo", tipo);
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat(data ?? []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Lança por conta inteira (todas as fazendas da conta) — nova arquitetura sem fazenda ativa
export async function listarLancamentosContaPeriodo(
  conta_id: string | null,
  dataInicio: string,
  dataFim: string,
  tipo?: "pagar" | "receber",
  fazenda_id_fallback?: string | null,
): Promise<Lancamento[]> {
  // conta_id "sem_conta_<id>" é sintético (seletor-cliente sem backfill) — trata como null
  const cidReal = (conta_id && !conta_id.startsWith("sem_conta_")) ? conta_id : null;

  // 1. Resolve todas as fazendas da conta via API route (service_role_key — imune a JWT expirado)
  let fazendaIds: string[] = [];
  try {
    const res = await fetch("/api/fazenda/da-conta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conta_id: cidReal, fazenda_id: fazenda_id_fallback }),
    });
    if (res.ok) {
      const json = await res.json() as { ok: boolean; fazendas?: { id: string }[] };
      if (json.ok && json.fazendas?.length) {
        fazendaIds = json.fazendas.map((f: { id: string }) => f.id);
      }
    }
  } catch {
    // API inacessível (ex: SSR) — cai nos fallbacks abaixo
  }

  // Garante que a fazenda âncora está sempre incluída (segurança extra)
  if (fazenda_id_fallback && !fazendaIds.includes(fazenda_id_fallback)) {
    fazendaIds.push(fazenda_id_fallback);
  }

  // Último fallback: usa fazendas do usuário logado (clientes normais sem contaId)
  if (!fazendaIds.length) {
    const fzs = await listarFazendas();
    fazendaIds = fzs.map(f => f.id);
  }
  if (!fazendaIds.length) return [];

  // 2. Busca lancamentos filtrando pelas fazendas da conta
  const PAGE = 1000;
  let all: Lancamento[] = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from("lancamentos")
      .select("*")
      .in("fazenda_id", fazendaIds)
      .gte("data_vencimento", dataInicio)
      .lte("data_vencimento", dataFim)
      .order("data_vencimento")
      .range(from, from + PAGE - 1);
    if (tipo) q = q.eq("tipo", tipo);
    const { data, error } = await q;
    if (error) throw error;
    all = all.concat(data ?? []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

// Soma líquida de todos os lançamentos baixados ANTES de dataInicio (saldo anterior ao período)
export async function calcularSaldoAnterior(fazenda_id: string, dataInicio: string): Promise<number> {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("tipo, valor, valor_pago, cotacao_usd, moeda")
    .eq("fazenda_id", fazenda_id)
    .eq("status", "baixado")
    .lt("data_vencimento", dataInicio)
    .neq("moeda", "barter");
  if (error) throw error;
  return (data ?? []).reduce((acc, l) => {
    const v = l.valor_pago ?? l.valor ?? 0;
    const brl = l.moeda === "USD" ? v * (l.cotacao_usd ?? 5.12) : v;
    return acc + (l.tipo === "receber" ? brl : -brl);
  }, 0);
}

export async function criarLancamento(l: Omit<Lancamento, "id" | "created_at">): Promise<Lancamento> {
  const { data, error } = await supabase.from("lancamentos").insert(l).select().single();
  if (error) throw error;
  return data;
}

export async function excluirLancamento(id: string): Promise<void> {
  const { error } = await supabase.from("lancamentos").delete().eq("id", id);
  if (error) throw error;
}

// Cria múltiplas parcelas do mesmo lançamento com agrupador único
export async function criarParcelamento(
  base: Omit<Lancamento, "id" | "created_at" | "num_parcela" | "total_parcelas" | "agrupador">,
  totalParcelas: number,
  intervaloMeses: number, // 1 = mensal, 3 = trimestral, etc.
): Promise<Lancamento[]> {
  const agrupador = crypto.randomUUID();
  const criados: Lancamento[] = [];
  for (let i = 0; i < totalParcelas; i++) {
    const dataVenc = new Date(base.data_vencimento);
    dataVenc.setMonth(dataVenc.getMonth() + i * intervaloMeses);
    const parcela: Omit<Lancamento, "id" | "created_at"> = {
      ...base,
      data_vencimento: dataVenc.toISOString().slice(0, 10),
      num_parcela:     i + 1,
      total_parcelas:  totalParcelas,
      agrupador,
    };
    const { data, error } = await supabase.from("lancamentos").insert(parcela).select().single();
    if (error) throw error;
    criados.push(data);
  }
  return criados;
}

export async function baixarLancamento(
  id: string,
  valor_pago_agora: number,   // valor DESTA operação (será acumulado ao que já foi pago)
  data_baixa: string,
  conta_bancaria: string,
  extras?: {
    pessoa_id?: string;
    operacao_gerencial_id?: string;
    ano_safra_id?: string;
    ciclo_id?: string;
    observacao?: string;
    multa_valor?: number;
    juros_valor?: number;
    desconto_valor?: number;
    salvar_classificacao?: boolean;
  }
): Promise<void> {
  // Lê valores atuais para calcular acumulado e decidir status
  const { data: atual } = await supabase
    .from("lancamentos")
    .select("valor, cotacao_usd, moeda, valor_pago")
    .eq("id", id)
    .single();

  const cotacao      = (atual?.cotacao_usd as number | null) ?? 5.12;
  const valorTotal   = atual?.moeda === "USD" ? (atual.valor ?? 0) * cotacao : (atual?.valor ?? 0);
  const jaRPago      = (atual?.valor_pago as number | null) ?? 0;
  const novoTotal    = jaRPago + valor_pago_agora;
  // Tolerância de R$0,01 para evitar problemas de arredondamento
  const novoStatus   = novoTotal >= valorTotal - 0.01 ? "baixado" : "parcial";

  const patch: Record<string, unknown> = { status: novoStatus, valor_pago: novoTotal, data_baixa, conta_bancaria };
  if (extras?.pessoa_id)             patch.pessoa_id = extras.pessoa_id;
  if (extras?.operacao_gerencial_id) patch.operacao_gerencial_id = extras.operacao_gerencial_id;
  if (extras?.ano_safra_id)          patch.ano_safra_id = extras.ano_safra_id;
  if (extras?.ciclo_id)              patch.ciclo_id = extras.ciclo_id;
  if (extras?.observacao)            patch.observacao = extras.observacao;
  const { error } = await supabase.from("lancamentos").update(patch).eq("id", id);
  if (error) throw error;
}

/**
 * Reabre um lançamento baixado, voltando ao status em_aberto ou vencido.
 */
export async function reabrirLancamento(id: string): Promise<void> {
  const { data: l } = await supabase.from("lancamentos").select("data_vencimento").eq("id", id).single();
  const hoje = new Date().toISOString().slice(0, 10);
  const novoStatus = l?.data_vencimento && l.data_vencimento < hoje ? "vencido" : "em_aberto";
  const { error } = await supabase.from("lancamentos").update({
    status: novoStatus, data_baixa: null, valor_pago: null, lote_id: null,
  }).eq("id", id);
  if (error) throw error;
}

/**
 * Reabre múltiplos lançamentos baixados de uma vez.
 */
export async function reabrirLancamentos(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const hoje = new Date().toISOString().slice(0, 10);
  const { data: lancs } = await supabase.from("lancamentos").select("id, data_vencimento").in("id", ids);
  for (const l of (lancs ?? [])) {
    const novoStatus = l.data_vencimento && l.data_vencimento < hoje ? "vencido" : "em_aberto";
    await supabase.from("lancamentos").update({ status: novoStatus, data_baixa: null, valor_pago: null, lote_id: null }).eq("id", l.id);
  }
}

/**
 * Cria um lote de pagamento (borderô) e baixa todos os títulos de uma vez.
 * Retorna o lote criado.
 */
export async function criarPagamentoLote(
  fazenda_id: string,
  tipo: "pagar" | "receber",
  data_pagamento: string,
  conta_bancaria: string,
  descricao: string,
  itens: { lancamento_id: string; valor_pago: number }[],
): Promise<import("./supabase").PagamentoLote> {
  const valor_total = itens.reduce((s, i) => s + i.valor_pago, 0);
  // 1. Cria o lote
  const { data: lote, error: le } = await supabase
    .from("pagamento_lotes")
    .insert({ fazenda_id, tipo, conta_bancaria, data_pagamento, valor_total, descricao })
    .select()
    .single();
  if (le) throw le;

  // 2. Cria os itens do lote
  const rows = itens.map(i => ({ lote_id: lote.id, lancamento_id: i.lancamento_id, valor_pago: i.valor_pago }));
  const { error: ie } = await supabase.from("pagamento_lote_itens").insert(rows);
  if (ie) throw ie;

  // 3. Baixa cada lançamento individualmente
  for (const item of itens) {
    const { error: be } = await supabase
      .from("lancamentos")
      .update({ status: "baixado", valor_pago: item.valor_pago, data_baixa: data_pagamento, conta_bancaria, lote_id: lote.id })
      .eq("id", item.lancamento_id);
    if (be) throw be;
  }
  return lote;
}

export async function listarPagamentoLotes(fazenda_id: string, tipo: "pagar" | "receber"): Promise<import("./supabase").PagamentoLote[]> {
  const { data, error } = await supabase
    .from("pagamento_lotes")
    .select("*, itens:pagamento_lote_itens(*)")
    .eq("fazenda_id", fazenda_id)
    .eq("tipo", tipo)
    .order("data_pagamento", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ————————————————————————————————————————
// CONTRATOS E ROMANEIOS
// ————————————————————————————————————————

export async function listarContratos(fazenda_id: string): Promise<Contrato[]> {
  const { data, error } = await supabase.from("contratos").select("*").eq("fazenda_id", fazenda_id).order("data_contrato", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarContrato(c: Omit<Contrato, "id" | "created_at">): Promise<Contrato> {
  const { data, error } = await supabase.from("contratos").insert(c).select().single();
  if (error) throw error;
  return data;
}

export async function listarRomaneios(fazenda_id: string): Promise<Romaneio[]> {
  const { data, error } = await supabase.from("romaneios").select("*").eq("fazenda_id", fazenda_id).order("data", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarRomaneio(r: Omit<Romaneio, "id" | "created_at">): Promise<Romaneio> {
  const { data, error } = await supabase.from("romaneios").insert(r).select().single();
  if (error) throw error;
  // O trigger do banco atualiza entregue_sc e status do contrato automaticamente
  return data;
}

export async function atualizarContrato(id: string, c: Partial<Contrato>): Promise<void> {
  const { error } = await supabase.from("contratos").update(c).eq("id", id);
  if (error) throw error;
}

export async function excluirContrato(id: string): Promise<void> {
  await supabase.from("contrato_itens").delete().eq("contrato_id", id);
  const { error } = await supabase.from("contratos").delete().eq("id", id);
  if (error) throw error;
}

export async function encerrarContratosPorSafras(
  fazendaId: string,
  anosSafraIds: string[]
): Promise<number> {
  if (anosSafraIds.length === 0) return 0;
  const { data: antes } = await supabase
    .from("contratos")
    .select("id, numero, dado_em_cessao")
    .eq("fazenda_id", fazendaId)
    .in("ano_safra_id", anosSafraIds)
    .in("status", ["aberto", "parcial"]);
  const count = antes?.length ?? 0;
  if (count === 0) return 0;
  const ids = (antes as { id: string; numero: string; dado_em_cessao?: boolean }[]).map(r => r.id);
  const { error } = await supabase
    .from("contratos")
    .update({ status: "encerrado" })
    .in("id", ids);
  if (error) throw error;

  // Baixa automática dos CPs vinculados a contratos de cessão de crédito
  const today = new Date().toISOString().split("T")[0];
  for (const c of (antes as { id: string; numero: string; dado_em_cessao?: boolean }[])) {
    if (!c.dado_em_cessao) continue;
    const debs = await listarCessaoDebitos(c.id);
    for (const d of debs) {
      try {
        await baixarLancamento(d.lancamento_id, d.valor_cessao, today, "cessao", {
          observacao: `Baixa automática por cessão de crédito — Contrato ${c.numero}`,
        });
      } catch { /* ignora falhas individuais */ }
    }
  }

  return count;
}

export async function listarItensContrato(contrato_id: string): Promise<ContratoItem[]> {
  const { data, error } = await supabase.from("contrato_itens").select("*").eq("contrato_id", contrato_id).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function salvarItensContrato(contrato_id: string, fazenda_id: string, itens: Omit<ContratoItem, "id" | "created_at">[]): Promise<ContratoItem[]> {
  await supabase.from("contrato_itens").delete().eq("contrato_id", contrato_id);
  if (itens.length === 0) return [];
  const { data, error } = await supabase.from("contrato_itens").insert(itens.map(i => ({ ...i, contrato_id, fazenda_id }))).select();
  if (error) throw error;
  return data ?? [];
}

// ── Cessão ───────────────────────────────────────────────────────────────────
export async function listarCessaoDebitos(contrato_id: string): Promise<(ContratoCessaoDebito & { descricao?: string; data_vencimento?: string; valor?: number })[]> {
  const { data, error } = await supabase
    .from("contrato_cessao_debitos")
    .select("*, lancamentos(descricao, data_vencimento, valor, status)")
    .eq("contrato_id", contrato_id)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => {
    const lanc = r.lancamentos as Record<string, unknown> | null;
    return { ...(r as ContratoCessaoDebito), descricao: String(lanc?.descricao ?? ""), data_vencimento: String(lanc?.data_vencimento ?? ""), valor: Number(lanc?.valor ?? 0) };
  });
}

export async function salvarCessaoDebitos(contrato_id: string, fazenda_id: string, debitos: { lancamento_id: string; valor_cessao: number; obs?: string }[]): Promise<void> {
  await supabase.from("contrato_cessao_debitos").delete().eq("contrato_id", contrato_id);
  if (debitos.length === 0) return;
  const { error } = await supabase.from("contrato_cessao_debitos").insert(debitos.map(d => ({ ...d, contrato_id, fazenda_id })));
  if (error) throw error;
}

// ————————————————————————————————————————
// NOTAS FISCAIS
// ————————————————————————————————————————

export async function listarNotasFiscais(fazenda_id: string): Promise<NotaFiscal[]> {
  const { data, error } = await supabase.from("notas_fiscais").select("*").eq("fazenda_id", fazenda_id).order("data_emissao", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarNotaFiscal(n: Omit<NotaFiscal, "id" | "created_at">): Promise<NotaFiscal> {
  const { data, error } = await supabase.from("notas_fiscais").insert(n).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarStatusNFe(id: string, status: NotaFiscal["status"], chave_acesso?: string): Promise<void> {
  const { error } = await supabase.from("notas_fiscais").update({ status, chave_acesso }).eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// UTILITÁRIOS
// ————————————————————————————————————————

// ————————————————————————————————————————
// SIMULAÇÕES
// ————————————————————————————————————————

export async function listarSimulacoes(fazenda_id: string): Promise<Simulacao[]> {
  const { data, error } = await supabase.from("simulacoes").select("*").eq("fazenda_id", fazenda_id).order("data");
  if (error) throw error;
  return data ?? [];
}

export async function criarSimulacao(s: Omit<Simulacao, "id" | "created_at">): Promise<Simulacao> {
  const { data, error } = await supabase.from("simulacoes").insert(s).select().single();
  if (error) throw error;
  return data;
}

export async function toggleSimulacao(id: string, ativa: boolean): Promise<void> {
  const { error } = await supabase.from("simulacoes").update({ ativa }).eq("id", id);
  if (error) throw error;
}

export async function excluirSimulacao(id: string): Promise<void> {
  const { error } = await supabase.from("simulacoes").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// UTILITÁRIOS
// ————————————————————————————————————————

// ————————————————————————————————————————
// PRODUTORES
// ————————————————————————————————————————

export async function listarProdutores(fazenda_id: string): Promise<Produtor[]> {
  const { data, error } = await supabase.from("produtores").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarProdutor(p: Omit<Produtor, "id" | "created_at">): Promise<Produtor> {
  // Usa API route com service_role_key para evitar falha de RLS quando o JWT do browser expira
  const res = await fetch("/api/produtores/criar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Erro ao criar produtor");
  return json.produtor as Produtor;
}
export async function atualizarProdutor(id: string, p: Partial<Produtor>): Promise<void> {
  const { error } = await supabase.from("produtores").update(p).eq("id", id);
  if (error) throw error;
}
export async function excluirProdutor(id: string): Promise<void> {
  const { error } = await supabase.from("produtores").delete().eq("id", id);
  if (error) throw error;
}

// Busca produtores via owner_user_id da fazenda (admin raccotlo sem conta real do cliente)
export async function listarProdutoresViaFazenda(fazenda_id: string): Promise<Produtor[]> {
  const { data: fz } = await supabase.from("fazendas").select("owner_user_id, conta_id").eq("id", fazenda_id).maybeSingle();
  if (!fz) return [];
  if (fz.conta_id && !fz.conta_id.startsWith("sem_conta_")) {
    const { data, error } = await supabase.from("produtores").select("*").eq("conta_id", fz.conta_id).order("nome");
    if (!error && data?.length) return data;
  }
  if (fz.owner_user_id) {
    const { data, error } = await supabase.from("produtores").select("*").eq("owner_user_id", fz.owner_user_id).order("nome");
    if (!error) return data ?? [];
  }
  return [];
}

export async function listarProdutoresDaConta(conta_id: string, fazenda_id?: string): Promise<Produtor[]> {
  // Usa API route com service_role_key para evitar falha de RLS quando JWT expira
  const params = new URLSearchParams({ conta_id });
  if (fazenda_id) params.set("fazenda_id", fazenda_id);
  const res = await fetch(`/api/produtores/listar?${params}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Erro ao listar produtores");
  return (json.produtores ?? []) as Produtor[];
}

// ————————————————————————————————————————
// INSCRIÇÕES ESTADUAIS DO PRODUTOR
// ————————————————————————————————————————

export async function listarIEsDoProdutor(produtor_id: string, fazenda_id?: string): Promise<ProdutorIE[]> {
  let q = supabase
    .from("produtor_inscricoes_estaduais")
    .select("*")
    .eq("produtor_id", produtor_id);
  if (fazenda_id) q = q.eq("fazenda_id", fazenda_id);
  const { data } = await q.order("estado");
  return data ?? [];
}

export async function salvarIEsDoProdutor(produtor_id: string, ies: Omit<ProdutorIE, "id" | "created_at">[], fazenda_id?: string): Promise<void> {
  let del = supabase.from("produtor_inscricoes_estaduais").delete().eq("produtor_id", produtor_id);
  if (fazenda_id) del = del.eq("fazenda_id", fazenda_id);
  await del;
  if (ies.length > 0) {
    await supabase.from("produtor_inscricoes_estaduais").insert(
      ies.map(ie => ({ ...ie, produtor_id, ...(fazenda_id ? { fazenda_id } : {}) }))
    );
  }
}

export async function adicionarIEAoProdutor(ie: Omit<ProdutorIE, "id" | "created_at">): Promise<void> {
  const { error } = await supabase.from("produtor_inscricoes_estaduais").insert(ie);
  if (error) throw error;
}

// ————————————————————————————————————————
// MATRÍCULAS DE IMÓVEIS
// ————————————————————————————————————————

export async function listarMatriculas(fazenda_id: string): Promise<MatriculaImovel[]> {
  const { data, error } = await supabase.from("matriculas_imoveis").select("*").eq("fazenda_id", fazenda_id).order("numero");
  if (error) throw error;
  return data ?? [];
}
export async function criarMatricula(m: Omit<MatriculaImovel, "id" | "created_at">): Promise<MatriculaImovel> {
  const { data, error } = await supabase.from("matriculas_imoveis").insert(m).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarMatricula(id: string, m: Partial<MatriculaImovel>): Promise<void> {
  const { error } = await supabase.from("matriculas_imoveis").update(m).eq("id", id);
  if (error) throw error;
}
export async function excluirMatricula(id: string): Promise<void> {
  const { error } = await supabase.from("matriculas_imoveis").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// PESSOAS (CLIENTES / FORNECEDORES)
// ————————————————————————————————————————

export async function listarPessoas(fazenda_id: string): Promise<Pessoa[]> {
  const { data, error } = await supabase.from("pessoas").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}

// Resolve IDs de fazendas dado contaId + fallback de fazenda individual
async function resolverFazendaIdsDaConta(fazenda_id_fallback?: string | null): Promise<string[]> {
  if (fazenda_id_fallback) {
    const { data: fz } = await supabase.from("fazendas").select("id, owner_user_id, conta_id").eq("id", fazenda_id_fallback).maybeSingle();

    if (fz?.conta_id && !fz.conta_id.startsWith("sem_conta_")) {
      const { data: allFzs } = await supabase.from("fazendas").select("id").eq("conta_id", fz.conta_id);
      const ids = [...new Set([...(allFzs ?? []).map(f => f.id), fazenda_id_fallback])];
      if (ids.length) return ids;
    }

    // Fallback: inclui sempre a fazenda âncora para garantir visibilidade
    return [fazenda_id_fallback];
  }
  const fzs = await listarFazendas();
  return fzs.map(f => f.id);
}

// Carrega pessoas de TODAS as fazendas da conta (nova arquitetura multi-fazenda)
export async function listarPessoasDaConta(fazenda_id_fallback?: string | null): Promise<Pessoa[]> {
  const ids = await resolverFazendaIdsDaConta(fazenda_id_fallback);
  if (!ids.length) return [];
  const { data, error } = await supabase.from("pessoas").select("*").in("fazenda_id", ids).order("nome");
  if (error) throw error;
  return data ?? [];
}

// Carrega contas bancárias de TODAS as fazendas da conta
export async function listarContasBancariasDaConta(fazenda_id_fallback?: string | null): Promise<{ id: string; nome: string; banco: string; agencia: string; conta: string; fazenda_id: string }[]> {
  const ids = await resolverFazendaIdsDaConta(fazenda_id_fallback);
  if (!ids.length) return [];
  const { data, error } = await supabase.from("contas_bancarias").select("id, nome, banco, agencia, conta, fazenda_id").in("fazenda_id", ids).eq("ativa", true).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarPessoa(p: Omit<Pessoa, "id" | "created_at">): Promise<Pessoa> {
  const { data, error } = await supabase.from("pessoas").insert(p).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarPessoa(id: string, p: Partial<Pessoa>): Promise<void> {
  const { error } = await supabase.from("pessoas").update(p).eq("id", id);
  if (error) throw error;
}
export async function excluirPessoa(id: string): Promise<void> {
  // Null out FK references that lack ON DELETE SET NULL before deleting
  await supabase.from("contratos_financeiros").update({ pessoa_id: null }).eq("pessoa_id", id);
  await supabase.from("contratos").update({ pessoa_id: null }).eq("pessoa_id", id);
  await supabase.from("nf_entradas").update({ pessoa_id: null }).eq("pessoa_id", id);
  await supabase.from("nf_servicos").update({ prestador_id: null }).eq("prestador_id", id);
  const { error } = await supabase.from("pessoas").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// ANOS SAFRA
// ————————————————————————————————————————

export async function listarAnosSafra(fazenda_id: string): Promise<AnoSafra[]> {
  const { data, error } = await supabase.from("anos_safra").select("*").eq("fazenda_id", fazenda_id).order("descricao");
  if (error) throw error;
  if (data && data.length > 0) return data;
  // Fallback: anos_safra referenciados pelos ciclos desta fazenda (dados sem fazenda_id direto)
  const { data: ciclosData } = await supabase.from("ciclos").select("ano_safra_id").eq("fazenda_id", fazenda_id);
  if (!ciclosData || ciclosData.length === 0) return [];
  const anoIds = [...new Set(ciclosData.map((c: { ano_safra_id: string }) => c.ano_safra_id).filter(Boolean))];
  if (anoIds.length === 0) return [];
  const { data: anos, error: e2 } = await supabase.from("anos_safra").select("*").in("id", anoIds).order("descricao");
  if (e2) throw e2;
  return anos ?? [];
}
export async function criarAnoSafra(a: Omit<AnoSafra, "id" | "created_at">): Promise<AnoSafra> {
  const { data, error } = await supabase.from("anos_safra").insert(a).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarAnoSafra(id: string, a: Partial<AnoSafra>): Promise<void> {
  const { error } = await supabase.from("anos_safra").update(a).eq("id", id);
  if (error) throw error;
}
export async function excluirAnoSafra(id: string): Promise<void> {
  const { error } = await supabase.from("anos_safra").delete().eq("id", id);
  if (error) throw error;
}

export async function encerrarAnoSafra(id: string, fazendaId: string): Promise<number> {
  // Fecha a safra
  const { error: e1 } = await supabase.from("anos_safra").update({ status: "encerrada" }).eq("id", id);
  if (e1) throw e1;
  // Encerra todos os contratos abertos/parciais desta safra
  return encerrarContratosPorSafras(fazendaId, [id]);
}

export async function reabrirAnoSafra(id: string): Promise<void> {
  const { error } = await supabase.from("anos_safra").update({ status: "ativa" }).eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// CICLOS
// ————————————————————————————————————————

export async function listarCiclos(ano_safra_id: string): Promise<Ciclo[]> {
  const { data, error } = await supabase.from("ciclos").select("*").eq("ano_safra_id", ano_safra_id).order("data_inicio");
  if (error) throw error;
  return data ?? [];
}
export async function listarTodosCiclos(fazenda_id: string): Promise<Ciclo[]> {
  const { data, error } = await supabase.from("ciclos").select("*").eq("fazenda_id", fazenda_id).order("data_inicio");
  if (error) throw error;
  return data ?? [];
}
export async function criarCiclo(c: Omit<Ciclo, "id" | "created_at">): Promise<Ciclo> {
  const { data, error } = await supabase.from("ciclos").insert(c).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarCiclo(id: string, c: Partial<Ciclo>): Promise<void> {
  const { error } = await supabase.from("ciclos").update(c).eq("id", id);
  if (error) throw error;
}
export async function excluirCiclo(id: string): Promise<void> {
  const { error } = await supabase.from("ciclos").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// MÁQUINAS
// ————————————————————————————————————————

export async function listarMaquinas(fazenda_id: string): Promise<Maquina[]> {
  const { data, error } = await supabase.from("maquinas").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarMaquina(m: Omit<Maquina, "id" | "created_at">): Promise<Maquina> {
  const { data, error } = await supabase.from("maquinas").insert(m).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarMaquina(id: string, m: Partial<Maquina>): Promise<void> {
  const { error } = await supabase.from("maquinas").update(m).eq("id", id);
  if (error) throw error;
}
export async function excluirMaquina(id: string): Promise<void> {
  const { error } = await supabase.from("maquinas").delete().eq("id", id);
  if (error) throw error;
}

export async function excluirMaquinas(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from("maquinas").delete().in("id", ids);
  if (error) throw error;
}

// ————————————————————————————————————————
// BOMBAS DE COMBUSTÍVEL
// ————————————————————————————————————————

export async function listarBombas(fazenda_id: string): Promise<BombaCombustivel[]> {
  const { data, error } = await supabase.from("bombas_combustivel").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarBomba(b: Omit<BombaCombustivel, "id" | "created_at">): Promise<BombaCombustivel> {
  const { data, error } = await supabase.from("bombas_combustivel").insert(b).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarBomba(id: string, b: Partial<BombaCombustivel>): Promise<void> {
  const { error } = await supabase.from("bombas_combustivel").update(b).eq("id", id);
  if (error) throw error;
}
export async function excluirBomba(id: string): Promise<void> {
  const { error } = await supabase.from("bombas_combustivel").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// FUNCIONÁRIOS
// ————————————————————————————————————————

export async function listarFuncionarios(fazenda_id: string): Promise<Funcionario[]> {
  const { data, error } = await supabase.from("funcionarios").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarFuncionario(f: Omit<Funcionario, "id" | "created_at">): Promise<Funcionario> {
  const { data, error } = await supabase.from("funcionarios").insert(f).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarFuncionario(id: string, f: Partial<Funcionario>): Promise<void> {
  const { error } = await supabase.from("funcionarios").update(f).eq("id", id);
  if (error) throw error;
}
export async function excluirFuncionario(id: string): Promise<void> {
  const { error } = await supabase.from("funcionarios").delete().eq("id", id);
  if (error) throw error;
}

// — Premiações —
export async function listarPremiacoesFuncionario(funcionario_id: string): Promise<FuncionarioPremiacao[]> {
  const { data, error } = await supabase.from("funcionario_premiacoes").select("*").eq("funcionario_id", funcionario_id).order("mes_referencia", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function criarPremiacao(p: Omit<FuncionarioPremiacao, "id" | "created_at">): Promise<FuncionarioPremiacao> {
  const { data, error } = await supabase.from("funcionario_premiacoes").insert(p).select().single();
  if (error) throw error;
  return data;
}
export async function excluirPremiacao(id: string): Promise<void> {
  const { error } = await supabase.from("funcionario_premiacoes").delete().eq("id", id);
  if (error) throw error;
}

// — Férias —
export async function listarFeriasFuncionario(funcionario_id: string): Promise<FuncionarioFerias[]> {
  const { data, error } = await supabase.from("funcionario_ferias").select("*").eq("funcionario_id", funcionario_id).order("periodo_inicio");
  if (error) throw error;
  return data ?? [];
}
export async function salvarFeriasGozo(id: string, dados: Partial<FuncionarioFerias>): Promise<void> {
  const { error } = await supabase.from("funcionario_ferias").update(dados).eq("id", id);
  if (error) throw error;
}
export async function sincronizarPeriodosFerias(funcionario_id: string, fazenda_id: string, data_admissao: string): Promise<void> {
  const admissao = new Date(data_admissao);
  const hoje = new Date();
  const { data: existentes } = await supabase.from("funcionario_ferias").select("periodo_inicio").eq("funcionario_id", funcionario_id);
  const existentesSet = new Set((existentes ?? []).map((r: { periodo_inicio: string }) => r.periodo_inicio.slice(0, 10)));

  const inserir: object[] = [];
  let ano = 1;
  while (true) {
    const inicio = new Date(admissao);
    inicio.setFullYear(inicio.getFullYear() + (ano - 1));
    const fim = new Date(inicio);
    fim.setFullYear(fim.getFullYear() + 1);
    fim.setDate(fim.getDate() - 1);
    if (inicio > hoje) break;
    const isoInicio = inicio.toISOString().slice(0, 10);
    if (!existentesSet.has(isoInicio)) {
      const status = fim > hoje ? "aquisindo" : "disponivel";
      inserir.push({ funcionario_id, fazenda_id, periodo_inicio: isoInicio, periodo_fim: fim.toISOString().slice(0, 10), status });
    }
    ano++;
    if (ano > 50) break;
  }
  if (inserir.length > 0) await supabase.from("funcionario_ferias").insert(inserir);
}

// — Folha mensal —
export async function processarFolhaMensal(fazenda_id: string, mes_referencia: string): Promise<{ gerados: number }> {
  const { data: funcs } = await supabase.from("funcionarios").select("*").eq("fazenda_id", fazenda_id).eq("ativo", true);
  if (!funcs || funcs.length === 0) return { gerados: 0 };

  // Busca IDs das operações gerenciais por classificação (FAZ = 2.01.01.10, ADM = 2.02.01.03)
  const { data: opsData } = await supabase.from("operacoes_gerenciais")
    .select("id, classificacao").eq("fazenda_id", fazenda_id);
  const opsByClass: Record<string, string> = {};
  for (const op of (opsData ?? [])) opsByClass[op.classificacao] = op.id;

  const anoMes = mes_referencia; // YYYY-MM
  let gerados = 0;

  for (const f of funcs) {
    if (!f.salario_base) continue;
    const sal = Number(f.salario_base);

    // FAZ = funcionários da fazenda, ADM = administrativos
    const prefixo = f.tipo_contrato === "clt_adm" ? "2.02.01.03" : "2.01.01.10";
    const dataComp = `${anoMes}-01`;

    // Apenas salário — FGTS, INSS, Sistema S, SAT/RAT e provisões são lançados manualmente via guias
    const lancamentos = [
      { descricao: `Salário — ${f.nome}`, valor: sal, class: `${prefixo}.001`, label: "SALÁRIOS" },
    ];

    for (const l of lancamentos) {
      if (l.valor <= 0) continue;
      const { data: existing } = await supabase.from("lancamentos").select("id")
        .eq("fazenda_id", fazenda_id).eq("descricao", l.descricao)
        .eq("data_lancamento", dataComp).eq("tipo", "pagar").maybeSingle();
      if (existing) continue;
      await supabase.from("lancamentos").insert({
        fazenda_id,
        tipo: "pagar",
        moeda: "BRL",
        descricao: l.descricao,
        valor: l.valor,
        data_lancamento: dataComp,
        data_vencimento: `${anoMes}-05`,
        status: "em_aberto",
        auto: true,
        operacao_gerencial_id: opsByClass[l.class] ?? null,
        categoria: l.label,
        origem_lancamento: "manual",
      });
      gerados++;
    }
  }
  return { gerados };
}

// ————————————————————————————————————————
// GRUPOS DE USUÁRIOS
// ————————————————————————————————————————

export async function listarGrupos(): Promise<GrupoUsuario[]> {
  const { data, error } = await supabase.from("grupos_usuarios").select("*").order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarGrupo(g: Omit<GrupoUsuario, "id" | "created_at">): Promise<GrupoUsuario> {
  const { data, error } = await supabase.from("grupos_usuarios").insert(g).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarGrupo(id: string, g: Partial<GrupoUsuario>): Promise<void> {
  const { error } = await supabase.from("grupos_usuarios").update(g).eq("id", id);
  if (error) throw error;
}
export async function excluirGrupo(id: string): Promise<void> {
  const { error } = await supabase.from("grupos_usuarios").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// USUÁRIOS
// ————————————————————————————————————————

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase.from("usuarios").select("*").order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarUsuario(u: Omit<Usuario, "id" | "created_at">): Promise<Usuario> {
  const { data, error } = await supabase.from("usuarios").insert(u).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarUsuario(id: string, u: Partial<Usuario>): Promise<void> {
  const { error } = await supabase.from("usuarios").update(u).eq("id", id);
  if (error) throw error;
}
export async function excluirUsuario(id: string): Promise<void> {
  const { error } = await supabase.from("usuarios").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// EMPRESAS (PRODUTORES PF / PJ)
// ————————————————————————————————————————

export async function listarEmpresas(fazenda_id: string): Promise<Empresa[]> {
  const { data, error } = await supabase.from("empresas").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function criarEmpresa(e: Omit<Empresa, "id" | "created_at">): Promise<Empresa> {
  const { data, error } = await supabase.from("empresas").insert(e).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarEmpresa(id: string, e: Partial<Empresa>): Promise<void> {
  const { error } = await supabase.from("empresas").update(e).eq("id", id);
  if (error) throw error;
}

export async function excluirEmpresa(id: string): Promise<void> {
  const { error } = await supabase.from("empresas").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// CONTAS BANCÁRIAS
// ————————————————————————————————————————

export async function listarBancos(): Promise<import("./supabase").Banco[]> {
  const { data, error } = await supabase.from("bancos").select("*").eq("ativo", true).order("nome_curto");
  if (error) throw error;
  return data ?? [];
}

export async function listarContas(fazenda_id: string): Promise<ContaBancaria[]> {
  const { data, error } = await supabase.from("contas_bancarias").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function listarContasPorEmpresa(empresa_id: string): Promise<ContaBancaria[]> {
  const { data, error } = await supabase.from("contas_bancarias").select("*").eq("empresa_id", empresa_id).order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function criarConta(c: Omit<ContaBancaria, "id" | "created_at">): Promise<ContaBancaria> {
  const { data, error } = await supabase.from("contas_bancarias").insert(c).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarContaBancaria(id: string, c: Partial<ContaBancaria>): Promise<void> {
  const { error } = await supabase.from("contas_bancarias").update(c).eq("id", id);
  if (error) throw error;
}

export async function excluirConta(id: string): Promise<void> {
  const { error } = await supabase.from("contas_bancarias").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// DEPÓSITOS
// ————————————————————————————————————————

export async function listarDepositos(fazenda_id: string): Promise<Deposito[]> {
  const { data, error } = await supabase.from("depositos").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarDeposito(d: Omit<Deposito, "id" | "created_at">): Promise<Deposito> {
  const { data, error } = await supabase.from("depositos").insert(d).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarDeposito(id: string, d: Partial<Deposito>): Promise<void> {
  const { error } = await supabase.from("depositos").update(d).eq("id", id);
  if (error) throw error;
}
export async function excluirDeposito(id: string): Promise<void> {
  const { error } = await supabase.from("depositos").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// HISTÓRICO DE MANUTENÇÃO
// ————————————————————————————————————————

export async function listarHistoricoMaquina(maquina_id: string): Promise<HistoricoManutencao[]> {
  const { data, error } = await supabase.from("historico_manutencao").select("*").eq("maquina_id", maquina_id).order("data", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function criarHistoricoManutencao(h: Omit<HistoricoManutencao, "id" | "created_at">): Promise<HistoricoManutencao> {
  const { data, error } = await supabase.from("historico_manutencao").insert(h).select().single();
  if (error) throw error;
  return data;
}
export async function excluirHistoricoManutencao(id: string): Promise<void> {
  const { error } = await supabase.from("historico_manutencao").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// NF ENTRADAS
// ————————————————————————————————————————

export async function listarNfEntradas(fazenda_id: string): Promise<NfEntrada[]> {
  const { data, error } = await supabase.from("nf_entradas").select("*").eq("fazenda_id", fazenda_id).order("data_emissao", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function criarNfEntrada(n: Omit<NfEntrada, "id" | "created_at">): Promise<NfEntrada> {
  const { data, error } = await supabase.from("nf_entradas").insert(n).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarNfEntrada(id: string, n: Partial<NfEntrada>): Promise<void> {
  const { error } = await supabase.from("nf_entradas").update(n).eq("id", id);
  if (error) throw error;
}
export async function listarNfEntradaItens(nf_entrada_id: string): Promise<NfEntradaItem[]> {
  const { data, error } = await supabase.from("nf_entrada_itens").select("*").eq("nf_entrada_id", nf_entrada_id).order("created_at");
  if (error) throw error;
  return data ?? [];
}
export async function criarNfEntradaItem(i: Omit<NfEntradaItem, "id" | "created_at">): Promise<NfEntradaItem> {
  const { data, error } = await supabase.from("nf_entrada_itens").insert(i).select().single();
  if (error) throw error;
  return data;
}

// Busca o depósito de terceiro vinculado a um fornecedor pelo CNPJ
async function buscarDepositoTerceiroPorCnpj(fazenda_id: string, cnpj: string): Promise<string | null> {
  if (!cnpj) return null;
  // 1. Localiza a pessoa pelo CPF/CNPJ
  const { data: pessoas } = await supabase
    .from("pessoas")
    .select("id")
    .eq("fazenda_id", fazenda_id)
    .eq("cpf_cnpj", cnpj)
    .limit(1);
  if (!pessoas || pessoas.length === 0) return null;
  const pessoa_id = pessoas[0].id;
  // 2. Localiza o depósito de terceiro vinculado à pessoa
  const { data: deps } = await supabase
    .from("depositos")
    .select("id")
    .eq("fazenda_id", fazenda_id)
    .eq("pessoa_id", pessoa_id)
    .in("tipo", ["terceiro", "armazem_terceiro"])
    .eq("ativo", true)
    .limit(1);
  return deps && deps.length > 0 ? deps[0].id : null;
}

// Atualiza custo médio ponderado e saldo do insumo
async function creditarInsumo(insumo_id: string, quantidade: number, valor_unitario: number, fazenda_id?: string): Promise<void> {
  const { data: ins } = await supabase.from("insumos").select("estoque").eq("id", insumo_id).single();
  if (!ins) return;

  // Custo de baixa = média ponderada das entradas dos últimos 6 meses + esta nova entrada
  let novoCusto = valor_unitario;
  if (fazenda_id) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const { data: movs } = await supabase
      .from("movimentacoes_estoque")
      .select("quantidade, valor_unitario")
      .eq("insumo_id", insumo_id)
      .eq("fazenda_id", fazenda_id)
      .eq("tipo", "entrada")
      .gte("data", sixMonthsAgo.toISOString().split("T")[0])
      .not("valor_unitario", "is", null);
    const historico = movs ?? [];
    const todasEntradas = [...historico, { quantidade, valor_unitario }];
    const totalQtd  = todasEntradas.reduce((s, m) => s + (m.quantidade ?? 0), 0);
    const totalCust = todasEntradas.reduce((s, m) => s + (m.quantidade ?? 0) * ((m.valor_unitario as number) ?? 0), 0);
    novoCusto = totalQtd > 0 ? totalCust / totalQtd : valor_unitario;
  }

  await supabase.from("insumos").update({
    estoque:        (ins.estoque ?? 0) + quantidade,
    custo_medio:    Math.round(novoCusto * 10000) / 10000,
    valor_unitario, // sempre atualiza para o preço da última compra
  }).eq("id", insumo_id);
}

// Processa NF pendente: cria movimentações, atualiza custo médio, gera lançamento CP
// tipo_apropiacao:
//   "estoque"   → credita insumo + movimentação (compra normal)
//   "maquinario"→ lança manutenção
//   "terceiro"  → cria saldo em estoque_terceiros (legado)
//   "vef"       → NF de Venda c/ Entrega Futura: credita depósito de terceiro (busca por CNPJ)
//   "remessa"   → NF de Remessa/Entrega: debita estoque_terceiros + credita insumo_fazenda
//   "direto"    → custo direto, sem movimentação de estoque
export async function processarNfEntrada(
  nfId: string,
  fazenda_id: string,
  itens: NfEntradaItem[],
  valorTotal: number,
  emitente: string,
  dataEntrada: string,
  emitenteCnpj?: string,
): Promise<void> {
  for (const item of itens) {
    // ── Defensivo/Fertilizante/Inoculante → estoque por Princípio Ativo ─
    if (item.tipo_apropiacao === "estoque" && item.principio_ativo_id) {
      await registrarEntradaPA({
        fazendaId:         fazenda_id,
        principioAtivoId:  item.principio_ativo_id,
        quantidade:        item.quantidade,
        custoUnitario:     item.valor_unitario,
        nomeComercialRef:  item.nome_comercial_ref ?? item.descricao_produto,
        nfEntradaId:       nfId,
        nfEntradaItemId:   item.id,
        data:              dataEntrada,
        obs:               `NF — ${item.descricao_produto}`,
      });
    }

    // ── Compra normal (semente/outro) → estoque insumo ──────────
    if (item.tipo_apropiacao === "estoque" && item.insumo_id && !item.principio_ativo_id) {
      // Insere movimento ANTES de atualizar custo_medio (inclui esta entrada no cálculo dos 6 meses)
      await supabase.from("movimentacoes_estoque").insert({
        insumo_id:          item.insumo_id,
        fazenda_id,
        tipo:               "entrada",
        quantidade:         item.quantidade,
        valor_unitario:     item.valor_unitario,
        data:               dataEntrada,
        observacao:         `NF ${nfId} — ${item.descricao_produto}`,
        auto:               true,
        deposito_id:        item.deposito_id ?? null,
        nf_entrada_item_id: item.id,
      });
      await creditarInsumo(item.insumo_id, item.quantidade, item.valor_unitario, fazenda_id);
    }

    // ── Manutenção de máquina ────────────────────────────────────
    if (item.tipo_apropiacao === "maquinario" && item.maquina_id) {
      await supabase.from("historico_manutencao").insert({
        fazenda_id,
        maquina_id:          item.maquina_id,
        data:                dataEntrada,
        tipo:                "corretiva",
        descricao:           item.descricao_produto,
        custo:               item.valor_total,
        nf_entrada_item_id:  item.id,
      });
    }

    // ── Estoque de terceiros (legado / seleção manual) ───────────
    if (item.tipo_apropiacao === "terceiro") {
      await supabase.from("estoque_terceiros").insert({
        fazenda_id,
        insumo_id:           item.insumo_id ?? null,
        descricao:           item.descricao_produto,
        terceiro_nome:       emitente,
        terceiro_cnpj:       emitenteCnpj ?? null,
        nf_entrada_id:       nfId,
        quantidade_original: item.quantidade,
        quantidade_saldo:    item.quantidade,
        status:              "aberto",
      });
    }

    // ── VEF — Venda com Entrega Futura ───────────────────────────
    // NF de faturamento antecipado: o insumo ainda está no fornecedor.
    // Credita o depósito de terceiro vinculado ao CNPJ do emitente.
    if (item.tipo_apropiacao === "vef") {
      const depositoId = await buscarDepositoTerceiroPorCnpj(fazenda_id, emitenteCnpj ?? "");
      await supabase.from("estoque_terceiros").insert({
        fazenda_id,
        insumo_id:           item.insumo_id ?? null,
        descricao:           item.descricao_produto,
        terceiro_nome:       emitente,
        terceiro_cnpj:       emitenteCnpj ?? null,
        nf_entrada_id:       nfId,
        deposito_id:         depositoId ?? null,
        quantidade_original: item.quantidade,
        quantidade_saldo:    item.quantidade,
        status:              "aberto",
      });
    }

    // ── Remessa — Entrega de VEF anterior ───────────────────────
    // NF de remessa: o fornecedor está entregando o que ficou pendente.
    // Debita estoque_terceiros (busca pelo CNPJ + insumo) e credita insumo_fazenda.
    if (item.tipo_apropiacao === "remessa" && item.insumo_id) {
      // 1. Localiza o saldo de terceiro aberto/parcial por CNPJ + insumo
      const { data: registros } = await supabase
        .from("estoque_terceiros")
        .select("id, quantidade_saldo, quantidade_original")
        .eq("fazenda_id", fazenda_id)
        .eq("insumo_id", item.insumo_id)
        .in("status", ["aberto", "parcial"])
        .order("created_at", { ascending: true })
        .limit(1)
        .then(async r => {
          // Filtra por CNPJ apenas se disponível
          if (emitenteCnpj) {
            const { data: byCnpj } = await supabase
              .from("estoque_terceiros")
              .select("id, quantidade_saldo, quantidade_original")
              .eq("fazenda_id", fazenda_id)
              .eq("insumo_id", item.insumo_id!)
              .eq("terceiro_cnpj", emitenteCnpj)
              .in("status", ["aberto", "parcial"])
              .order("created_at", { ascending: true })
              .limit(1);
            return { data: byCnpj };
          }
          return r;
        });

      // 2. Debita o saldo de terceiro
      if (registros && registros.length > 0) {
        const reg = registros[0];
        const novoSaldo = Math.max(0, reg.quantidade_saldo - item.quantidade);
        const novoStatus = novoSaldo <= 0 ? "encerrado" : "parcial";
        await supabase.from("estoque_terceiros").update({
          quantidade_saldo: novoSaldo,
          status:           novoStatus,
        }).eq("id", reg.id);
      }

      // 3. Credita insumo_fazenda: custo médio 6 meses + saldo
      // Insere movimento ANTES de calcular custo_medio (inclui esta entrada no cálculo)
      await supabase.from("movimentacoes_estoque").insert({
        insumo_id:          item.insumo_id,
        fazenda_id,
        tipo:               "entrada",
        quantidade:         item.quantidade,
        valor_unitario:     item.valor_unitario,
        data:               dataEntrada,
        observacao:         `Remessa NF ${nfId} — ${item.descricao_produto} (${emitente})`,
        auto:               true,
        deposito_id:        item.deposito_id ?? null,
        nf_entrada_item_id: item.id,
      });
      await creditarInsumo(item.insumo_id, item.quantidade, item.valor_unitario, fazenda_id);
    }
  }

  // ── Pessoa: lookup por CNPJ ou auto-cria fornecedor ──────────────────────
  let pessoaId: string | null = null;
  if (emitenteCnpj) {
    const { data: pesExist } = await supabase
      .from("pessoas").select("id")
      .eq("fazenda_id", fazenda_id).eq("cpf_cnpj", emitenteCnpj).maybeSingle();
    if (pesExist) {
      pessoaId = pesExist.id;
    } else {
      const { data: novaPes } = await supabase.from("pessoas").insert({
        fazenda_id,
        nome: emitente,
        tipo: "pj",
        cliente: false,
        fornecedor: true,
        cpf_cnpj: emitenteCnpj,
      }).select("id").single();
      pessoaId = novaPes?.id ?? null;
    }
  }

  // ── Gera lançamento CP (apenas para NFs que não sejam só remessa) ─────────
  const temVef     = itens.some(i => i.tipo_apropiacao === "vef");
  const temRemessa = itens.some(i => i.tipo_apropiacao === "remessa");
  const temOutros  = itens.some(i => !["vef","remessa"].includes(i.tipo_apropiacao));

  const nfUpdates: Record<string, unknown> = { status: "processada", data_entrada: dataEntrada };
  if (pessoaId) nfUpdates.pessoa_id = pessoaId;

  if (!temRemessa || temOutros || temVef) {
    const { data: lancDB } = await supabase.from("lancamentos").insert({
      fazenda_id,
      tipo:             "pagar",
      moeda:            "BRL",
      descricao:        `NF Entrada — ${emitente}${temVef ? " (VEF)" : ""}`,
      categoria:        "insumos",
      data_lancamento:  dataEntrada,
      data_vencimento:  dataEntrada,
      valor:            valorTotal,
      status:           "em_aberto",
      auto:             true,
      pessoa_id:        pessoaId ?? undefined,
    }).select("id").single();
    if (lancDB?.id) nfUpdates.lancamento_id = lancDB.id;
  }

  // Marca NF como processada (e vincula pessoa + lancamento em um único update)
  await supabase.from("nf_entradas").update(nfUpdates).eq("id", nfId);
}

// Verifica se uma NF pode ser excluída e retorna o status do lançamento associado
export async function verificarExclusaoNf(nfId: string): Promise<{
  lancamento: { id: string; status: string; lote_id: string | null; conta_bancaria: string | null } | null;
}> {
  const { data: nf } = await supabase.from("nf_entradas").select("lancamento_id").eq("id", nfId).single();
  if (!nf?.lancamento_id) return { lancamento: null };
  const { data: lanc } = await supabase
    .from("lancamentos").select("id, status, lote_id, conta_bancaria")
    .eq("id", nf.lancamento_id).single();
  return { lancamento: lanc ?? null };
}

// Exclui NF e reverte todas as movimentações associadas
export async function excluirNfEntrada(nfId: string, fazendaId: string): Promise<void> {
  // 1. Itens da NF
  const { data: itens } = await supabase
    .from("nf_entrada_itens").select("id, insumo_id, quantidade, tipo_apropiacao")
    .eq("nf_entrada_id", nfId);
  const itemIds = (itens ?? []).map(i => i.id as string);

  if (itemIds.length > 0) {
    // 2a. Reverter movimentações de estoque insumo
    const { data: movs } = await supabase
      .from("movimentacoes_estoque").select("insumo_id, quantidade")
      .in("nf_entrada_item_id", itemIds).eq("tipo", "entrada");

    for (const mov of movs ?? []) {
      const { data: ins } = await supabase.from("insumos")
        .select("estoque").eq("id", mov.insumo_id).single();
      if (ins) {
        await supabase.from("insumos")
          .update({ estoque: (ins.estoque as number) - (mov.quantidade as number) })
          .eq("id", mov.insumo_id);
      }
    }
    await supabase.from("movimentacoes_estoque").delete().in("nf_entrada_item_id", itemIds);

    // 2b. Reverter movimentações de estoque PA
    await estornarMovimentacoesPA(nfId);

    await supabase.from("historico_manutencao").delete().in("nf_entrada_item_id", itemIds);
  }

  // 3. Estoque de terceiros vinculados a esta NF
  await supabase.from("estoque_terceiros").delete().eq("nf_entrada_id", nfId);

  // 4. Lançamento financeiro
  const { data: nf } = await supabase.from("nf_entradas")
    .select("lancamento_id").eq("id", nfId).single();
  if (nf?.lancamento_id) {
    await supabase.from("lancamentos").delete().eq("id", nf.lancamento_id);
  }

  // 5. Itens + NF
  await supabase.from("nf_entrada_itens").delete().eq("nf_entrada_id", nfId);
  const { error } = await supabase.from("nf_entradas").delete().eq("id", nfId).eq("fazenda_id", fazendaId);
  if (error) throw new Error(error.message);
}

// Processa NF de Devolução de Compra:
//   - Para cada item devolvido: cria saída de estoque
//   - Cria CR (Conta a Receber) pelo valor devolvido — fornecedor deve o dinheiro de volta
//   - Cria registro na nf_entradas com tipo_entrada = "devolucao_compra"
export interface ItemDevolucao {
  insumo_id: string;
  descricao_produto: string;
  unidade: string;
  deposito_id?: string;
  quantidade_devolver: number;
  valor_unitario: number;
  valor_total: number;
}

export async function processarDevolucaoCompra(
  fazenda_id:      string,
  nf_origem_id:    string,
  numero:          string,
  serie:           string,
  cfop:            string,
  emitente_nome:   string,
  emitente_cnpj:   string | undefined,
  pessoa_id:       string | undefined,
  data_emissao:    string,
  data_vencimento: string | undefined,
  itens:           ItemDevolucao[],
): Promise<NfEntrada> {
  const valorTotal = itens.reduce((s, i) => s + i.valor_total, 0);

  // 1. Cria NF de devolução
  const { data: nfDev, error: errNf } = await supabase
    .from("nf_entradas")
    .insert({
      fazenda_id,
      numero,
      serie,
      cfop,
      emitente_nome,
      emitente_cnpj: emitente_cnpj ?? null,
      pessoa_id:     pessoa_id    ?? null,
      data_emissao,
      data_entrada:  data_emissao,
      valor_total:   valorTotal,
      natureza:      "Devolução de Compra",
      status:        "processada",
      origem:        "manual",
      tipo_entrada:  "devolucao_compra",
      nf_origem_id,
    })
    .select()
    .single();
  if (errNf) throw errNf;

  // 2. Para cada item: cria item na NF de devolução + saída de estoque
  for (const item of itens) {
    // Insere item na NF
    const { data: nfItem } = await supabase
      .from("nf_entrada_itens")
      .insert({
        nf_entrada_id:    nfDev.id,
        fazenda_id,
        insumo_id:        item.insumo_id,
        deposito_id:      item.deposito_id ?? null,
        descricao_produto: item.descricao_produto,
        descricao_nf:     item.descricao_produto,
        unidade:          item.unidade,
        unidade_nf:       item.unidade,
        fator_conversao:  1,
        quantidade:       item.quantidade_devolver,
        valor_unitario:   item.valor_unitario,
        valor_total:      item.valor_total,
        tipo_apropiacao:  "estoque" as NfEntradaItem["tipo_apropiacao"],
        alerta_preco:     false,
      })
      .select()
      .single();

    // Saída do estoque (desbita o insumo que está sendo devolvido)
    await supabase.from("movimentacoes_estoque").insert({
      insumo_id:          item.insumo_id,
      fazenda_id,
      tipo:               "saida",
      quantidade:         item.quantidade_devolver,
      data:               data_emissao,
      observacao:         `Devolução NF ${nfDev.id} — ${item.descricao_produto}`,
      auto:               true,
      deposito_id:        item.deposito_id ?? null,
      nf_entrada_item_id: nfItem?.id ?? null,
    });

    // Débita a quantidade diretamente (equivalente a uma saída)
    const { data: ins } = await supabase
      .from("insumos")
      .select("estoque_atual")
      .eq("id", item.insumo_id)
      .single();
    if (ins) {
      const novoSaldo = Math.max(0, (ins.estoque_atual ?? 0) - item.quantidade_devolver);
      await supabase
        .from("insumos")
        .update({ estoque_atual: novoSaldo })
        .eq("id", item.insumo_id);
    }
  }

  // 3. Cria CR — fornecedor deve devolver o valor
  await supabase.from("lancamentos").insert({
    fazenda_id,
    tipo:            "receber",
    moeda:           "BRL",
    descricao:       `Devolução de Compra NF ${numero} — ${emitente_nome}`,
    categoria:       "devolucao",
    data_lancamento: data_emissao,
    data_vencimento: data_vencimento ?? data_emissao,
    valor:           valorTotal,
    status:          "em_aberto",
    auto:            true,
  });

  return nfDev as NfEntrada;
}

// ————————————————————————————————————————
// ESTOQUE DE TERCEIROS
// ————————————————————————————————————————

export async function listarEstoqueTerceiros(fazenda_id: string): Promise<EstoqueTerceiro[]> {
  const { data, error } = await supabase.from("estoque_terceiros").select("*").eq("fazenda_id", fazenda_id).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function atualizarEstoqueTerceiro(id: string, e: Partial<EstoqueTerceiro>): Promise<void> {
  const { error } = await supabase.from("estoque_terceiros").update(e).eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// CONTRATOS FINANCEIROS (custeio, CPR, etc.)
// ————————————————————————————————————————

// Mapeia tipos antigos/aliases → tipos válidos do TypeScript
const TIPO_CF_MAP: Record<string, ContratoFinanceiro["tipo"]> = {
  custeio: "custeio", financiamento: "investimento", investimento: "investimento",
  emprestimo: "outros", empréstimo: "outros", securitizacao: "securitizacao",
  securitização: "securitizacao", cpr: "cpr", egf: "egf", outros: "outros",
};

// Normaliza linha do banco: mapeia nomes antigos → nomes esperados pelo TypeScript
// O banco pode ter valor_total/cotacao_usd/tipo_amortizacao de dados migrados
function normalizarContrato(row: Record<string, unknown>): ContratoFinanceiro {
  const vf = (row.valor_financiado ?? row.valor_total ?? 0) as number;
  const vc = (row.valor_cotacao ?? row.cotacao_usd) as number | undefined;
  const vfbrl = (row.valor_financiado_brl as number | undefined)
    ?? (row.moeda === "USD" && vc ? vf * vc : vf);
  const tc = ((row.tipo_calculo ?? (row.tipo_amortizacao ? (row.tipo_amortizacao as string).toLowerCase() : "sac")) as string);
  const tipoCalculo: ContratoFinanceiro["tipo_calculo"] =
    tc === "price" ? "price" : tc === "outros" ? "outros" : "sac";
  const tipoRaw = (row.tipo as string | undefined ?? "outros").toLowerCase();
  const tipo: ContratoFinanceiro["tipo"] = TIPO_CF_MAP[tipoRaw] ?? "outros";
  const status = (row.status as string | undefined) ?? "ativo";
  const statusNorm: ContratoFinanceiro["status"] =
    status === "quitado" ? "quitado" : status === "cancelado" ? "cancelado" : "ativo";
  // Deriva taxa a.a. da taxa a.m. se só a mensal estiver no banco (dados migrados)
  const taxaAm  = (row.taxa_juros_am as number | undefined);
  const taxaAa  = (row.taxa_juros_aa as number | undefined)
    ?? (taxaAm ? (Math.pow(1 + taxaAm / 100, 12) - 1) * 100 : undefined);
  return {
    ...(row as Omit<ContratoFinanceiro, "tipo"|"status"|"valor_financiado"|"valor_cotacao"|"valor_financiado_brl"|"tipo_calculo"|"numero_documento"|"carencia_meses"|"periodicidade_meses"|"carencia_tipo"|"rateio_por_vencimento"|"fiscal"|"taxa_juros_aa"|"taxa_juros_am">),
    tipo,
    status:                statusNorm,
    valor_financiado:      vf,
    valor_cotacao:         vc,
    valor_financiado_brl:  vfbrl,
    tipo_calculo:          tipoCalculo,
    numero_documento:      (row.numero_documento ?? row.numero_contrato) as string | undefined,
    taxa_juros_am:         taxaAm,
    taxa_juros_aa:         taxaAa,
    carencia_meses:        (row.carencia_meses as number | undefined) ?? 0,
    periodicidade_meses:   (row.periodicidade_meses as number | undefined) ?? 1,
    carencia_tipo:         ((row.carencia_tipo as string | undefined) ?? "so_juros") as "so_juros" | "total",
    rateio_por_vencimento: (row.rateio_por_vencimento as boolean | undefined) ?? false,
    fiscal:                (row.fiscal as boolean | undefined) ?? true,
  } as ContratoFinanceiro;
}

export async function listarContratosFinanceiros(fazenda_id: string): Promise<ContratoFinanceiro[]> {
  const { data, error } = await supabase.from("contratos_financeiros").select("*").eq("fazenda_id", fazenda_id).order("data_contrato", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizarContrato);
}

// Converte campos TypeScript → colunas reais do banco (compatível com schema antigo e novo)
function desnormalizarContrato(c: Omit<ContratoFinanceiro, "id" | "created_at">): Record<string, unknown> {
  const vfBrl = c.valor_financiado_brl
    ?? (c.moeda === "USD" && c.valor_cotacao ? c.valor_financiado * c.valor_cotacao : c.valor_financiado);
  return {
    // campos originais do banco (manter para compatibilidade)
    fazenda_id:             c.fazenda_id,
    tipo:                   c.tipo,
    descricao:              c.descricao,
    numero_contrato:        c.numero_documento,
    pessoa_id:              c.pessoa_id,
    credor:                 c.credor,
    linha_credito:          c.linha_credito,
    valor_total:            c.valor_financiado,
    moeda:                  c.moeda,
    cotacao_usd:            c.valor_cotacao,
    data_contrato:          c.data_contrato,
    taxa_juros_aa:          c.taxa_juros_aa,
    taxa_juros_am:          c.taxa_juros_am,
    iof_pct:                c.iof_pct,
    tac_valor:              c.tac_valor,
    outros_custos:          c.outros_custos,
    conta_liberacao_id:     c.conta_liberacao_id,
    conta_pagamento_id:     c.conta_pagamento_id,
    tipo_amortizacao:       (c.tipo_calculo ?? "sac").toUpperCase(),
    status:                 c.status,
    observacao:             c.observacao,
    produtor_id:            c.produtor_id,
    // campos novos (Migration 141)
    valor_financiado_brl:   vfBrl,
    periodicidade_meses:    c.periodicidade_meses ?? 1,
    carencia_meses:         c.carencia_meses ?? 0,
    carencia_tipo:          c.carencia_tipo ?? "so_juros",
    crescimento_pct:        c.crescimento_pct ?? null,
    rateio_por_vencimento:  c.rateio_por_vencimento ?? false,
    fiscal:                 c.fiscal ?? true,
    codigo:                 c.codigo ?? null,
    ano_safra_id:           c.safra_id ?? null,
    forma_pagamento:        c.forma_pagamento ?? null,
    local_pagamento:        c.local_pagamento ?? null,
  };
}

export async function criarContratoFinanceiro(c: Omit<ContratoFinanceiro, "id" | "created_at">): Promise<ContratoFinanceiro> {
  const { data, error } = await supabase.from("contratos_financeiros").insert(desnormalizarContrato(c)).select().single();
  if (error) throw error;
  return normalizarContrato(data as Record<string, unknown>);
}

export async function atualizarContratoFinanceiro(id: string, c: Partial<ContratoFinanceiro>): Promise<void> {
  const row = desnormalizarContrato(c as Omit<ContratoFinanceiro, "id" | "created_at">);
  // Remove campos undefined para não sobrescrever com null
  const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  const { error } = await supabase.from("contratos_financeiros").update(clean).eq("id", id);
  if (error) throw error;
}

export async function excluirContratoFinanceiro(id: string): Promise<void> {
  // Exclui lancamentos CP gerados pelas parcelas (criados via baixarParcelaPagamento)
  const { data: lancsVinculados } = await supabase
    .from("lancamentos")
    .select("id")
    .eq("contrato_financeiro_id", id);
  if (lancsVinculados && lancsVinculados.length > 0) {
    await supabase.from("lancamentos").delete().in("id", lancsVinculados.map(l => l.id));
  }

  const r1 = await supabase.from("parcelas_liberacao").delete().eq("contrato_id", id);
  if (r1.error) throw new Error(`Erro ao excluir parcelas de liberação: ${r1.error.message}`);

  const r2 = await supabase.from("parcelas_pagamento").delete().eq("contrato_id", id);
  if (r2.error) throw new Error(`Erro ao excluir parcelas de pagamento: ${r2.error.message}`);

  const r3 = await supabase.from("garantias_contrato").delete().eq("contrato_id", id);
  if (r3.error) throw new Error(`Erro ao excluir garantias: ${r3.error.message}`);

  const r4 = await supabase.from("centros_custo_contrato").delete().eq("contrato_id", id);
  if (r4.error) throw new Error(`Erro ao excluir centros de custo: ${r4.error.message}`);

  const r5 = await supabase.from("aditivos_contrato").delete().eq("contrato_id", id);
  if (r5.error) throw new Error(`Erro ao excluir aditivos: ${r5.error.message}`);

  const { error } = await supabase.from("contratos_financeiros").delete().eq("id", id);
  if (error) throw error;
}

// Parcelas de liberação
export async function listarParcelasLiberacao(contrato_id: string): Promise<ParcelaLiberacao[]> {
  const { data, error } = await supabase.from("parcelas_liberacao").select("*").eq("contrato_id", contrato_id).order("num_parcela");
  if (error) throw error;
  return data ?? [];
}

export async function criarParcelaLiberacao(
  p: Omit<ParcelaLiberacao, "id" | "created_at">,
  contrato: ContratoFinanceiro,
): Promise<ParcelaLiberacao> {
  const { data, error } = await supabase.from("parcelas_liberacao").insert(p).select().single();
  if (error) throw error;

  // Cria lançamento CR automático (entrada de capital)
  const valor = contrato.moeda === "USD" && contrato.valor_cotacao
    ? p.valor_liberado * contrato.valor_cotacao
    : p.valor_liberado;
  const { data: lanc } = await supabase.from("lancamentos").insert({
    fazenda_id: p.fazenda_id,
    tipo: "receber",
    moeda: contrato.moeda,
    descricao: `${contrato.descricao} — Liberação ${p.num_parcela}`,
    categoria: CAT_CAPTACAO[contrato.tipo],
    data_lancamento: p.data_liberacao,
    data_vencimento: p.data_liberacao,
    valor,
    conta_bancaria: contrato.conta_liberacao_id ?? null,
    status: "em_aberto",
    auto: true,
  }).select().single();

  if (lanc) {
    await supabase.from("parcelas_liberacao").update({ lancamento_id: lanc.id }).eq("id", data.id);
    return { ...data, lancamento_id: lanc.id };
  }
  return data;
}

export async function excluirParcelaLiberacao(id: string): Promise<void> {
  const { error } = await supabase.from("parcelas_liberacao").delete().eq("id", id);
  if (error) throw error;
}

// Parcelas de pagamento
export async function listarParcelasPagamento(contrato_id: string): Promise<ParcelaPagamento[]> {
  const { data, error } = await supabase.from("parcelas_pagamento").select("*").eq("contrato_id", contrato_id).order("num_parcela");
  if (error) throw error;
  return data ?? [];
}

export async function salvarParcelasPagamento(contrato_id: string, fazenda_id: string, parcelas: Omit<ParcelaPagamento, "id" | "created_at" | "lancamento_id" | "contrato_id" | "fazenda_id">[]): Promise<ParcelaPagamento[]> {
  // Remove as existentes e recria (recalculo)
  await supabase.from("parcelas_pagamento").delete().eq("contrato_id", contrato_id);
  const { data, error } = await supabase.from("parcelas_pagamento").insert(
    parcelas.map(p => ({ ...p, contrato_id, fazenda_id }))
  ).select();
  if (error) throw error;
  return data ?? [];
}

const CAT_AMORT: Record<ContratoFinanceiro["tipo"], string> = {
  custeio:       "Pagamento de Custeio",
  investimento:  "Pagamento de Financiamento",
  securitizacao: "Pagamento de Securitização",
  cpr:           "Pagamento de CPR",
  egf:           "Pagamento de EGF",
  outros:        "Pagamento de Empréstimos",
};
const CAT_JUROS: Record<ContratoFinanceiro["tipo"], string> = {
  custeio:       "Juros de Custeio",
  investimento:  "Juros de Financiamento",
  securitizacao: "Juros de Securitização",
  cpr:           "Juros de CPR",
  egf:           "Juros de EGF",
  outros:        "Juros de Empréstimos",
};
const CAT_CAPTACAO: Record<ContratoFinanceiro["tipo"], string> = {
  custeio:       "Captação de Custeio",
  investimento:  "Captação de Financiamento",
  securitizacao: "Captação de Securitização",
  cpr:           "Captação de CPR",
  egf:           "Captação de EGF",
  outros:        "Captação de Empréstimos",
};

export async function baixarParcelaPagamento(
  id: string,
  fazenda_id: string,
  parcela: ParcelaPagamento,
  contrato: ContratoFinanceiro,
): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);
  const moeda = contrato.moeda;
  const contaId = contrato.conta_pagamento_id;
  const descBase = `${contrato.descricao} — Parcela ${parcela.num_parcela}`;

  const baseFields = {
    fazenda_id, moeda, tipo: "pagar" as const,
    data_lancamento: hoje, data_vencimento: parcela.data_vencimento,
    conta_bancaria: contaId ?? null, status: "em_aberto" as const, auto: true,
    contrato_financeiro_id: contrato.id,
  };

  // Lançamento de amortização (principal)
  if (parcela.amortizacao > 0) {
    await supabase.from("lancamentos").insert({
      ...baseFields,
      descricao: `${descBase} — Amortização`,
      categoria: CAT_AMORT[contrato.tipo],
      valor: parcela.amortizacao,
    });
  }

  // Lançamento de juros
  if (parcela.juros > 0) {
    await supabase.from("lancamentos").insert({
      ...baseFields,
      descricao: `${descBase} — Juros`,
      categoria: CAT_JUROS[contrato.tipo],
      valor: parcela.juros,
    });
  }

  // Lançamento de despesas acessórias (IOF, TAC, etc.)
  if (parcela.despesas_acessorios > 0) {
    await supabase.from("lancamentos").insert({
      ...baseFields,
      descricao: `${descBase} — Encargos (IOF/TAC)`,
      categoria: "Encargos Bancários",
      valor: parcela.despesas_acessorios,
    });
  }

  await supabase.from("parcelas_pagamento").update({ status: "pago" }).eq("id", id);

  // Se todas as parcelas do contrato foram pagas → quitação automática das máquinas financiadas
  const { data: abertas } = await supabase
    .from("parcelas_pagamento")
    .select("id")
    .eq("contrato_id", contrato.id)
    .neq("status", "pago");
  if ((abertas ?? []).length === 0) {
    await supabase
      .from("maquinas")
      .update({ status_financiamento: "quitado", data_quitacao: hoje })
      .eq("contrato_financiamento_id", contrato.id)
      .eq("status_financiamento", "financiado");
  }
}

// Garantias
export async function listarGarantias(contrato_id: string): Promise<GarantiaContrato[]> {
  const { data, error } = await supabase.from("garantias_contrato").select("*").eq("contrato_id", contrato_id);
  if (error) throw error;
  // Mapeia campo antigo `valor` → `valor_avaliacao` se coluna nova não existir ainda
  return (data ?? []).map((r: Record<string, unknown>) => ({
    ...(r as GarantiaContrato),
    valor_avaliacao: (r.valor_avaliacao ?? r.valor) as number | undefined,
  }));
}

export async function criarGarantia(g: Omit<GarantiaContrato, "id" | "created_at">): Promise<GarantiaContrato> {
  const row: Record<string, unknown> = {
    contrato_id: g.contrato_id,
    descricao:   g.descricao,
    valor:       g.valor_avaliacao,
  };
  if (g.fazenda_id)       row.fazenda_id       = g.fazenda_id;
  if (g.matricula_id)     row.matricula_id     = g.matricula_id;
  if (g.maquina_id)       row.maquina_id       = g.maquina_id;
  if (g.tipo_garantia)    row.tipo_garantia    = g.tipo_garantia;
  if (g.grau)             row.grau             = g.grau;
  if (g.tipo_bem)         row.tipo_bem         = g.tipo_bem;
  if (g.valor_avaliacao !== undefined) row.valor_avaliacao = g.valor_avaliacao;
  if (g.percentual_bem !== undefined)  row.percentual_bem  = g.percentual_bem;
  const { data, error } = await supabase.from("garantias_contrato").insert(row).select().single();
  if (error) throw error;
  return { ...(data as GarantiaContrato), valor_avaliacao: (data as Record<string, unknown>).valor_avaliacao as number | undefined ?? (data as Record<string, unknown>).valor as number | undefined };
}

export async function excluirGarantia(id: string): Promise<void> {
  const { error } = await supabase.from("garantias_contrato").delete().eq("id", id);
  if (error) throw error;
}

// Centro de custo
export async function listarCentrosCusto(contrato_id: string): Promise<CentroCustoContrato[]> {
  const { data, error } = await supabase.from("centros_custo_contrato").select("*").eq("contrato_id", contrato_id);
  if (error) throw error;
  return data ?? [];
}

export async function salvarCentrosCusto(contrato_id: string, itens: Omit<CentroCustoContrato, "id" | "created_at">[]): Promise<void> {
  await supabase.from("centros_custo_contrato").delete().eq("contrato_id", contrato_id);
  if (itens.length > 0) {
    // Insere apenas colunas que o banco garante ter; `valor` é opcional
    const rows = itens.map(i => ({
      contrato_id:  i.contrato_id ?? contrato_id,
      descricao:    i.descricao,
      percentual:   i.percentual,
      ...(i.valor !== undefined ? { valor: i.valor } : {}),
    }));
    const { error } = await supabase.from("centros_custo_contrato").insert(rows);
    if (error) throw error;
  }
}

// ── Aditivos ──────────────────────────────────────────────────
import type { AditivoContrato } from "./supabase";

export async function listarAditivos(contrato_id: string): Promise<AditivoContrato[]> {
  const { data, error } = await supabase
    .from("aditivos_contrato")
    .select("*")
    .eq("contrato_id", contrato_id)
    .order("data_aditivo");
  if (error) throw error;
  return data ?? [];
}

export async function criarAditivo(a: Omit<AditivoContrato, "id" | "created_at">): Promise<AditivoContrato> {
  const { data, error } = await supabase.from("aditivos_contrato").insert(a).select().single();
  if (error) throw error;
  return data;
}

export async function excluirAditivo(id: string): Promise<void> {
  const { error } = await supabase.from("aditivos_contrato").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// MÓDULO LAVOURA — Plantio
// ————————————————————————————————————————

import type { Plantio, PulverizacaoOp, PulverizacaoItem, ColheitaRegistro, ColheitaRomaneio, CorrecaoSolo, CorrecaoSoloItem, AdubacaoBase, AdubacaoBaseItem } from "./supabase";

// ————————————————————————————————————————
// CORREÇÃO DE SOLO
// ————————————————————————————————————————
export async function listarCorrecoes(fazenda_id: string): Promise<CorrecaoSolo[]> {
  const { data, error } = await supabase.from("correcoes_solo").select("*").eq("fazenda_id", fazenda_id).order("data_aplicacao", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function criarCorrecao(c: Omit<CorrecaoSolo, "id" | "created_at">): Promise<CorrecaoSolo> {
  const { data, error } = await supabase.from("correcoes_solo").insert(c).select().single();
  if (error) throw error;
  return data;
}
export async function criarCorrecaoItem(i: Omit<CorrecaoSoloItem, "id" | "created_at">): Promise<CorrecaoSoloItem> {
  const { data, error } = await supabase.from("correcoes_solo_itens").insert(i).select().single();
  if (error) throw error;
  return data;
}
export async function listarCorrecaoItens(correcao_id: string): Promise<CorrecaoSoloItem[]> {
  const { data, error } = await supabase.from("correcoes_solo_itens").select("*").eq("correcao_id", correcao_id);
  if (error) throw error;
  return data ?? [];
}
export async function excluirCorrecao(id: string): Promise<void> {
  const { data: correcao } = await supabase.from("correcoes_solo").select("fazenda_id").eq("id", id).single();
  const { data: itens } = await supabase.from("correcoes_solo_itens").select("*").eq("correcao_id", id);
  if (itens && correcao) {
    for (const it of itens) {
      if (!it.insumo_id || !it.quantidade_ton) continue;
      const { data: ins } = await supabase.from("insumos").select("estoque, unidade").eq("id", it.insumo_id).single();
      if (ins) {
        const ton = it.quantidade_ton;
        const unidade: string = ins.unidade ?? "kg";
        let qtd: number;
        switch (unidade) {
          case "t":  qtd = ton; break;
          case "kg": qtd = ton * 1000; break;
          case "g":  qtd = ton * 1_000_000; break;
          case "sc": qtd = (ton * 1000) / 60; break;
          default:   qtd = ton * 1000; break;
        }
        await supabase.from("insumos").update({ estoque: (ins.estoque ?? 0) + qtd }).eq("id", it.insumo_id);
        await supabase.from("movimentacoes_estoque").insert({
          insumo_id: it.insumo_id, fazenda_id: correcao.fazenda_id,
          tipo: "entrada", quantidade: qtd, data: new Date().toISOString().slice(0, 10),
          motivo: "estorno_exclusao", descricao: "Estorno por exclusão de correção de solo", auto: true,
        });
      }
    }
  }
  await supabase.from("correcoes_solo_itens").delete().eq("correcao_id", id);
  const { error } = await supabase.from("correcoes_solo").delete().eq("id", id);
  if (error) throw error;
}
export async function processarCorrecao(correcao: CorrecaoSolo, itens: CorrecaoSoloItem[], nomes: Record<string, string>): Promise<void> {
  for (const it of itens) {
    if (!it.insumo_id || !it.quantidade_ton) continue;
    const { data: ins } = await supabase.from("insumos").select("estoque, unidade, custo_medio, valor_unitario").eq("id", it.insumo_id).single();
    if (ins) {
      // Converte quantidade (em toneladas) para a unidade nativa do insumo
      const ton = it.quantidade_ton;
      const unidade: string = ins.unidade ?? "kg";
      let qtdNativa: number;
      switch (unidade) {
        case "t":   qtdNativa = ton; break;
        case "kg":  qtdNativa = ton * 1000; break;
        case "g":   qtdNativa = ton * 1_000_000; break;
        case "sc":  qtdNativa = (ton * 1000) / 60; break; // saca = 60 kg
        default:    qtdNativa = ton * 1000; break;
      }
      await supabase.from("insumos").update({ estoque: (ins.estoque ?? 0) - qtdNativa }).eq("id", it.insumo_id);
      await supabase.from("movimentacoes_estoque").insert({
        insumo_id:               it.insumo_id, fazenda_id: correcao.fazenda_id,
        tipo:                    "saida", quantidade: qtdNativa, data: correcao.data_aplicacao,
        custo_unitario_na_baixa: ins.custo_medio ?? ins.valor_unitario ?? undefined,
        safra: correcao.ciclo_id, motivo: "correcao_solo",
        descricao: `Correção de Solo — ${nomes[it.insumo_id] ?? "produto"}`,
      });
    }
  }
  if (correcao.custo_total && correcao.custo_total > 0) {
    await supabase.from("lancamentos").insert({
      fazenda_id: correcao.fazenda_id, tipo: "pagar",
      descricao: `Correção de Solo — ${correcao.area_ha} ha`,
      valor: correcao.custo_total, data_vencimento: correcao.data_aplicacao,
      status: "pendente", categoria: "Insumos — Corretivos",
    });
  }
}

// ————————————————————————————————————————
// ADUBAÇÃO DE BASE
// ————————————————————————————————————————
export async function listarAdubacoes(fazenda_id: string): Promise<AdubacaoBase[]> {
  const { data, error } = await supabase.from("adubacoes_base").select("*").eq("fazenda_id", fazenda_id).order("data_aplicacao", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function criarAdubacao(a: Omit<AdubacaoBase, "id" | "created_at">): Promise<AdubacaoBase> {
  const { data, error } = await supabase.from("adubacoes_base").insert(a).select().single();
  if (error) throw error;
  return data;
}
export async function criarAdubacaoItem(i: Omit<AdubacaoBaseItem, "id" | "created_at">): Promise<AdubacaoBaseItem> {
  const { data, error } = await supabase.from("adubacoes_base_itens").insert(i).select().single();
  if (error) throw error;
  return data;
}
export async function listarAdubacaoItens(adubacao_id: string): Promise<AdubacaoBaseItem[]> {
  const { data, error } = await supabase.from("adubacoes_base_itens").select("*").eq("adubacao_id", adubacao_id);
  if (error) throw error;
  return data ?? [];
}
export async function excluirAdubacao(id: string): Promise<void> {
  const { data: adub } = await supabase.from("adubacoes_base").select("fazenda_id").eq("id", id).single();
  const { data: itens } = await supabase.from("adubacoes_base_itens").select("*").eq("adubacao_id", id);
  if (itens && adub) {
    for (const it of itens) {
      if (!it.insumo_id || !it.quantidade_kg) continue;
      const { data: ins } = await supabase.from("insumos").select("estoque, unidade").eq("id", it.insumo_id).single();
      if (ins) {
        const kg = it.quantidade_kg;
        const unidade: string = ins.unidade ?? "kg";
        let qtd: number;
        switch (unidade) {
          case "kg": qtd = kg; break;
          case "t":  qtd = kg / 1000; break;
          case "g":  qtd = kg * 1000; break;
          case "sc": qtd = kg / 60; break;
          case "L":  qtd = kg; break;
          default:   qtd = kg; break;
        }
        await supabase.from("insumos").update({ estoque: (ins.estoque ?? 0) + qtd }).eq("id", it.insumo_id);
        await supabase.from("movimentacoes_estoque").insert({
          insumo_id: it.insumo_id, fazenda_id: adub.fazenda_id,
          tipo: "entrada", quantidade: qtd, data: new Date().toISOString().slice(0, 10),
          motivo: "estorno_exclusao", descricao: "Estorno por exclusão de adubação de base", auto: true,
        });
      }
    }
  }
  await supabase.from("adubacoes_base_itens").delete().eq("adubacao_id", id);
  const { error } = await supabase.from("adubacoes_base").delete().eq("id", id);
  if (error) throw error;
}
export async function processarAdubacao(adubacao: AdubacaoBase, itens: AdubacaoBaseItem[], nomes: Record<string, string>): Promise<void> {
  for (const it of itens) {
    if (!it.insumo_id || !it.quantidade_kg) continue;
    const { data: ins } = await supabase.from("insumos").select("estoque, unidade, custo_medio, valor_unitario").eq("id", it.insumo_id).single();
    if (ins) {
      // Converte quantidade (em kg) para a unidade nativa do insumo
      const kg = it.quantidade_kg;
      const unidade: string = ins.unidade ?? "kg";
      let qtdNativa: number;
      switch (unidade) {
        case "kg":  qtdNativa = kg; break;
        case "t":   qtdNativa = kg / 1000; break;
        case "g":   qtdNativa = kg * 1000; break;
        case "sc":  qtdNativa = kg / 60; break; // saca = 60 kg
        case "L":   qtdNativa = kg; break; // fertilizante líquido: assume 1 kg ≈ 1 L (aproximação)
        default:    qtdNativa = kg; break;
      }
      await supabase.from("insumos").update({ estoque: (ins.estoque ?? 0) - qtdNativa }).eq("id", it.insumo_id);
      await supabase.from("movimentacoes_estoque").insert({
        insumo_id:               it.insumo_id, fazenda_id: adubacao.fazenda_id,
        tipo:                    "saida", quantidade: qtdNativa, data: adubacao.data_aplicacao,
        custo_unitario_na_baixa: ins.custo_medio ?? ins.valor_unitario ?? undefined,
        safra: adubacao.ciclo_id, motivo: "adubacao_base",
        descricao: `Adubação de Base — ${nomes[it.insumo_id] ?? "fertilizante"}`,
      });
    }
  }
  if (adubacao.custo_total && adubacao.custo_total > 0) {
    await supabase.from("lancamentos").insert({
      fazenda_id: adubacao.fazenda_id, tipo: "pagar",
      descricao: `Adubação de Base — ${adubacao.area_ha} ha`,
      valor: adubacao.custo_total, data_vencimento: adubacao.data_aplicacao,
      status: "pendente", categoria: "Insumos — Fertilizantes",
    });
  }
}

export async function listarPlantios(fazenda_id: string): Promise<Plantio[]> {
  const { data, error } = await supabase.from("plantios").select("*").eq("fazenda_id", fazenda_id).order("data_plantio", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarPlantio(p: Omit<Plantio, "id" | "created_at">): Promise<Plantio> {
  const { data, error } = await supabase.from("plantios").insert(p).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarPlantio(id: string, p: Partial<Plantio>): Promise<void> {
  const { error } = await supabase.from("plantios").update(p).eq("id", id);
  if (error) throw error;
}

export async function excluirPlantio(id: string): Promise<void> {
  const { data: p } = await supabase.from("plantios").select("*").eq("id", id).single();
  if (p) {
    if (p.insumo_id && (p.quantidade_kg ?? 0) > 0) {
      const { data: ins } = await supabase.from("insumos").select("estoque").eq("id", p.insumo_id).single();
      if (ins) {
        await supabase.from("insumos").update({ estoque: (ins.estoque ?? 0) + p.quantidade_kg }).eq("id", p.insumo_id);
        await supabase.from("movimentacoes_estoque").insert({
          insumo_id: p.insumo_id, fazenda_id: p.fazenda_id,
          tipo: "entrada", quantidade: p.quantidade_kg, data: new Date().toISOString().slice(0, 10),
          motivo: "estorno_exclusao", descricao: "Estorno por exclusão de plantio", auto: true,
        });
      }
    }
    if (p.lancamento_id) {
      await supabase.from("lancamentos").delete().eq("id", p.lancamento_id);
    }
  }
  const { error } = await supabase.from("plantios").delete().eq("id", id);
  if (error) throw error;
}

// Processa plantio: baixa estoque de semente + lança CP custo
export async function processarPlantio(plantio: Plantio, insumoNome: string): Promise<string | null> {
  const qty = plantio.quantidade_kg ?? 0;
  const custo = plantio.custo_sementes ?? 0;
  const hoje = new Date().toISOString().slice(0, 10);

  // Baixa de estoque
  if (plantio.insumo_id && qty > 0) {
    const { data: ins } = await supabase.from("insumos").select("estoque, custo_medio, valor_unitario").eq("id", plantio.insumo_id).single();
    if (ins) {
      await supabase.from("insumos").update({ estoque: (ins.estoque ?? 0) - qty }).eq("id", plantio.insumo_id);
      await supabase.from("movimentacoes_estoque").insert({
        insumo_id:                plantio.insumo_id,
        fazenda_id:               plantio.fazenda_id,
        tipo:                     "saida",
        quantidade:               qty,
        custo_unitario_na_baixa:  ins.custo_medio ?? ins.valor_unitario ?? undefined,
        data:                     plantio.data_plantio,
        safra:                    plantio.ciclo_id,
        operacao:                 "plantio",
        observacao:               `Plantio — ${insumoNome} ${plantio.variedade ?? ""}`.trim(),
        auto:                     true,
      });
    }
  }

  // Lançamento CP custo de sementes
  if (custo > 0) {
    const { data: lanc } = await supabase.from("lancamentos").insert({
      fazenda_id: plantio.fazenda_id,
      tipo: "pagar", moeda: "BRL",
      descricao: `Plantio — ${insumoNome}${plantio.variedade ? ` (${plantio.variedade})` : ""}`,
      categoria: "Insumos — Sementes",
      data_lancamento: hoje,
      data_vencimento: plantio.data_plantio,
      valor: custo,
      safra_id: plantio.ciclo_id,
      status: "em_aberto", auto: true,
    }).select().single();
    if (lanc) {
      await supabase.from("plantios").update({ lancamento_id: lanc.id }).eq("id", plantio.id);
      return lanc.id;
    }
  }
  return null;
}

// ————————————————————————————————————————
// MÓDULO LAVOURA — Pulverização
// ————————————————————————————————————————

export async function listarPulverizacoes(fazenda_id: string): Promise<PulverizacaoOp[]> {
  const { data, error } = await supabase.from("pulverizacoes").select("*").eq("fazenda_id", fazenda_id).order("data_inicio", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarPulverizacao(p: Omit<PulverizacaoOp, "id" | "created_at">): Promise<PulverizacaoOp> {
  const { data, error } = await supabase.from("pulverizacoes").insert(p).select().single();
  if (error) throw error;
  return data;
}

export async function listarPulverizacaoItens(pulverizacao_id: string): Promise<PulverizacaoItem[]> {
  const { data, error } = await supabase.from("pulverizacao_itens").select("*").eq("pulverizacao_id", pulverizacao_id);
  if (error) throw error;
  return data ?? [];
}

export async function criarPulverizacaoItem(i: Omit<PulverizacaoItem, "id" | "created_at">): Promise<PulverizacaoItem> {
  const { data, error } = await supabase.from("pulverizacao_itens").insert(i).select().single();
  if (error) throw error;
  return data;
}

export async function excluirPulverizacao(id: string): Promise<void> {
  const { data: pulv } = await supabase.from("pulverizacoes").select("fazenda_id").eq("id", id).single();
  const { data: itens } = await supabase.from("pulverizacao_itens").select("*").eq("pulverizacao_id", id);
  if (itens && pulv) {
    for (const it of itens) {
      if (!it.insumo_id || !it.total_consumido) continue;
      const { data: ins } = await supabase.from("insumos").select("estoque").eq("id", it.insumo_id).single();
      if (ins) {
        await supabase.from("insumos").update({ estoque: (ins.estoque ?? 0) + it.total_consumido }).eq("id", it.insumo_id);
        await supabase.from("movimentacoes_estoque").insert({
          insumo_id: it.insumo_id, fazenda_id: pulv.fazenda_id,
          tipo: "entrada", quantidade: it.total_consumido, data: new Date().toISOString().slice(0, 10),
          motivo: "estorno_exclusao", descricao: "Estorno por exclusão de pulverização", auto: true,
        });
      }
    }
  }
  await supabase.from("pulverizacao_itens").delete().eq("pulverizacao_id", id);
  const { error } = await supabase.from("pulverizacoes").delete().eq("id", id);
  if (error) throw error;
}

// Processa pulverização: baixa estoque de cada produto + lança CP
export async function processarPulverizacao(
  pulv: PulverizacaoOp,
  itens: PulverizacaoItem[],
  nomesInsumos: Record<string, string>,
): Promise<void> {
  let custoTotal = 0;

  for (const item of itens) {
    // baixa de estoque
    const { data: ins } = await supabase.from("insumos").select("estoque, custo_medio, valor_unitario").eq("id", item.insumo_id).single();
    if (ins) {
      await supabase.from("insumos").update({ estoque: (ins.estoque ?? 0) - item.total_consumido }).eq("id", item.insumo_id);
      await supabase.from("movimentacoes_estoque").insert({
        insumo_id:               item.insumo_id,
        fazenda_id:              item.fazenda_id,
        tipo:                    "saida",
        quantidade:              item.total_consumido,
        custo_unitario_na_baixa: ins.custo_medio ?? ins.valor_unitario ?? undefined,
        data:                    pulv.data_inicio,
        safra:                   pulv.ciclo_id,
        operacao:                pulv.tipo,
        observacao:              `Pulverização ${pulv.tipo} — ${nomesInsumos[item.insumo_id] ?? item.insumo_id}`,
        auto:                    true,
      });
    }
    custoTotal += item.custo_total;
  }

  // Atualiza custo_total na pulverização
  await supabase.from("pulverizacoes").update({ custo_total: custoTotal }).eq("id", pulv.id);

  // Lançamento CP
  if (custoTotal > 0) {
    await supabase.from("lancamentos").insert({
      fazenda_id: pulv.fazenda_id,
      tipo: "pagar", moeda: "BRL",
      descricao: `Pulverização — ${TIPO_PULV_LABEL[pulv.tipo] ?? pulv.tipo}`,
      categoria: "Insumos — Defensivos",
      data_lancamento: new Date().toISOString().slice(0, 10),
      data_vencimento: pulv.data_inicio,
      valor: custoTotal,
      safra_id: pulv.ciclo_id,
      status: "em_aberto", auto: true,
    });
  }
}

const TIPO_PULV_LABEL: Record<string, string> = {
  herbicida: "Herbicida", fungicida: "Fungicida", inseticida: "Inseticida",
  nematicida: "Nematicida", acaricida: "Acaricida", fertilizante_foliar: "Fertilizante Foliar",
  regulador: "Regulador de Crescimento", dessecacao: "Dessecação", outros: "Outros",
};

// ————————————————————————————————————————
// MÓDULO LAVOURA — Colheita
// ————————————————————————————————————————

export async function listarColheitas(fazenda_id: string): Promise<ColheitaRegistro[]> {
  const { data, error } = await supabase.from("colheitas").select("*").eq("fazenda_id", fazenda_id).order("data_colheita", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarColheita(c: Omit<ColheitaRegistro, "id" | "created_at">): Promise<ColheitaRegistro> {
  const { data, error } = await supabase.from("colheitas").insert(c).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarColheita(id: string, c: Partial<ColheitaRegistro>): Promise<void> {
  const { error } = await supabase.from("colheitas").update(c).eq("id", id);
  if (error) throw error;
}

export async function excluirColheita(id: string): Promise<void> {
  await supabase.from("colheita_romaneios").delete().eq("colheita_id", id);
  const { error } = await supabase.from("colheitas").delete().eq("id", id);
  if (error) throw error;
}

export async function listarColheitaRomaneios(colheita_id: string): Promise<ColheitaRomaneio[]> {
  const { data, error } = await supabase.from("colheita_romaneios").select("*").eq("colheita_id", colheita_id).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function criarColheitaRomaneio(r: Omit<ColheitaRomaneio, "id" | "created_at">): Promise<ColheitaRomaneio> {
  const { data, error } = await supabase.from("colheita_romaneios").insert(r).select().single();
  if (error) throw error;
  // Recalcula totais da colheita
  await recalcularColheita(r.colheita_id, r.fazenda_id);
  return data;
}

export async function excluirColheitaRomaneio(id: string, colheita_id: string, fazenda_id: string): Promise<void> {
  const { error } = await supabase.from("colheita_romaneios").delete().eq("id", id);
  if (error) throw error;
  await recalcularColheita(colheita_id, fazenda_id);
}

async function recalcularColheita(colheita_id: string, fazenda_id: string): Promise<void> {
  const { data: roms } = await supabase.from("colheita_romaneios").select("*").eq("colheita_id", colheita_id);
  if (!roms) return;
  const totalKgBruto = roms.reduce((s, r) => s + (r.peso_liquido_kg ?? 0), 0);
  const totalKgClass = roms.reduce((s, r) => s + (r.peso_classificado_kg ?? 0), 0);
  const totalSacas   = roms.reduce((s, r) => s + (r.sacas ?? 0), 0);
  const umidMedia    = roms.filter(r => r.umidade_pct).length > 0
    ? roms.reduce((s, r) => s + (r.umidade_pct ?? 0), 0) / roms.filter(r => r.umidade_pct).length : null;
  const impMedia     = roms.filter(r => r.impureza_pct).length > 0
    ? roms.reduce((s, r) => s + (r.impureza_pct ?? 0), 0) / roms.filter(r => r.impureza_pct).length : null;

  // Busca area_ha da colheita para calcular produtividade
  const { data: col } = await supabase.from("colheitas").select("area_ha, ciclo_id").eq("id", colheita_id).single();
  const prodSc = col?.area_ha ? totalSacas / col.area_ha : null;

  await supabase.from("colheitas").update({
    total_kg_bruto: totalKgBruto,
    total_kg_classificado: totalKgClass,
    total_sacas: totalSacas,
    umidade_media: umidMedia,
    impureza_media: impMedia,
    produtividade_sc_ha: prodSc,
  }).eq("id", colheita_id);

  // Atualiza produtividade do ciclo
  if (col?.ciclo_id && prodSc) {
    await supabase.from("ciclos").update({ status: "colhida" } as Record<string, unknown>).eq("id", col.ciclo_id);
  }

  void fazenda_id; // used by callers, suppress lint
}

// Finaliza colheita: entrada de estoque de produto agrícola
export async function finalizarColheita(colheita: ColheitaRegistro, insumoId: string | null): Promise<void> {
  if (colheita.total_sacas <= 0) return;
  const qtd = colheita.total_sacas; // unit: sc

  if (insumoId) {
    // Entrada de estoque do produto agrícola
    const { data: ins } = await supabase.from("insumos").select("estoque, custo_medio").eq("id", insumoId).single();
    if (ins) {
      await supabase.from("insumos").update({ estoque: (ins.estoque ?? 0) + qtd }).eq("id", insumoId);
      await supabase.from("movimentacoes_estoque").insert({
        insumo_id: insumoId,
        fazenda_id: colheita.fazenda_id,
        tipo: "entrada",
        quantidade: qtd,
        data: colheita.data_colheita,
        safra: colheita.ciclo_id,
        operacao: "colheita",
        observacao: `Colheita própria — ${colheita.produto}${colheita.variedade ? ` (${colheita.variedade})` : ""}`,
        deposito_id: colheita.deposito_id ?? null,
        auto: true,
      });
    }
  }
}

// ————————————————————————————————————————
// TABELAS AUXILIARES
// ————————————————————————————————————————

import type { GrupoInsumo, SubgrupoInsumo, TipoPessoa, CentroCusto, CategoriaLancamento, PedidoCompra, PedidoCompraItem, PedidoCompraEntrega, RateioRegra, RateioRegraLinha, OperacaoCompra, OperacaoGerencial, FormaPagamento, RegraClassificacao, RateioGlobal, RateioGlobalFazenda, RateioGlobalCiclo } from "./supabase";

// Grupos de Insumos
export async function listarGruposInsumo(fazenda_id: string): Promise<GrupoInsumo[]> {
  const { data, error } = await supabase.from("grupos_insumos").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarGrupoInsumo(g: Omit<GrupoInsumo, "id" | "created_at">): Promise<GrupoInsumo> {
  const { data, error } = await supabase.from("grupos_insumos").insert(g).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarGrupoInsumo(id: string, g: Partial<GrupoInsumo>): Promise<void> {
  const { error } = await supabase.from("grupos_insumos").update(g).eq("id", id);
  if (error) throw error;
}
export async function excluirGrupoInsumo(id: string): Promise<void> {
  const { error } = await supabase.from("grupos_insumos").delete().eq("id", id);
  if (error) throw error;
}

// Subgrupos de Insumos
export async function listarSubgruposInsumo(fazenda_id: string, grupo_id?: string): Promise<SubgrupoInsumo[]> {
  let q = supabase.from("subgrupos_insumos").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (grupo_id) q = q.eq("grupo_id", grupo_id);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}
export async function criarSubgrupoInsumo(s: Omit<SubgrupoInsumo, "id" | "created_at">): Promise<SubgrupoInsumo> {
  const { data, error } = await supabase.from("subgrupos_insumos").insert(s).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarSubgrupoInsumo(id: string, s: Partial<SubgrupoInsumo>): Promise<void> {
  const { error } = await supabase.from("subgrupos_insumos").update(s).eq("id", id);
  if (error) throw error;
}
export async function excluirSubgrupoInsumo(id: string): Promise<void> {
  const { error } = await supabase.from("subgrupos_insumos").delete().eq("id", id);
  if (error) throw error;
}

// Seed — popula grupos e subgrupos padrão para produção agrícola (MT: soja, milho, algodão)
export async function seederGruposInsumo(fazenda_id: string): Promise<{ grupos: number; subgrupos: number }> {
  const GRUPOS: { nome: string; cor: string; subs: string[] }[] = [
    {
      nome: "Sementes",
      cor:  "#16A34A",
      subs: ["Soja", "Milho 1ª Safra", "Milho 2ª Safra (Safrinha)", "Algodão", "Sorgo", "Trigo / Triticale", "Braquiária / Pastagem", "Outras Culturas"],
    },
    {
      nome: "Fertilizantes",
      cor:  "#C9921B",
      subs: ["Macronutrientes — NPK Granel", "Macronutrientes — NPK Fórmula", "Nitrogênio (Ureia / Amônia)", "Fósforo (MAP / DAP / SSP)", "Potássio (KCl)", "Micronutrientes", "Calcário / Calcário Dolomítico", "Gesso Agrícola", "Organomineral", "Fertilizante Foliar", "Bioestimulante"],
    },
    {
      nome: "Defensivos",
      cor:  "#E24B4A",
      subs: ["Herbicida Pré-Emergente", "Herbicida Pós-Emergente", "Dessecante", "Fungicida Foliar", "Fungicida Tratamento de Sementes", "Inseticida Foliar", "Inseticida Tratamento de Sementes", "Acaricida", "Nematicida", "Regulador de Crescimento", "Adjuvante / Espalhante / Óleo"],
    },
    {
      nome: "Inoculantes",
      cor:  "#378ADD",
      subs: ["Inoculante Soja (Bradyrhizobium)", "Inoculante Milho", "Co-inoculante (Azospirillum)", "Bioestimulante Radicular", "Turfoso / Líquido / Gelado"],
    },
    {
      nome: "Produtos Agrícolas",
      cor:  "#1A4870",
      subs: ["Soja em Grão", "Milho em Grão", "Algodão — Pluma", "Algodão — Caroço", "Sorgo em Grão", "Farelo / Subproduto"],
    },
    {
      nome: "Combustíveis e Lubrificantes",
      cor:  "#555555",
      subs: ["Diesel S-10", "Diesel S-500", "Arla 32 (AdBlue)", "Gasolina", "Etanol", "Óleo de Motor", "Óleo Hidráulico", "Óleo de Transmissão / Câmbio", "Graxa", "Filtros (Ar / Óleo / Combustível / Hidráulico)"],
    },
    {
      nome: "Peças e Manutenção",
      cor:  "#374151",
      subs: ["Peças Originais — Colheitadeira", "Peças Originais — Trator", "Peças Originais — Plantadeira", "Peças Originais — Pulverizador", "Pneus e Câmaras", "Correias e Correntes", "Rolamentos e Buchas", "Material Elétrico / Eletrônico", "Serviço de Manutenção Terceirizado"],
    },
    {
      nome: "EPI e Segurança",
      cor:  "#6B21A8",
      subs: ["EPI — Proteção Individual", "Roupa de Proteção Química", "Máscaras e Respiradores", "Botas e Luvas", "Material de Higiene e Limpeza", "Equipamento de Emergência"],
    },
  ];

  let totalGrupos = 0;
  let totalSubgrupos = 0;

  for (const g of GRUPOS) {
    const { data: grp, error: eg } = await supabase
      .from("grupos_insumos")
      .insert({ fazenda_id, nome: g.nome, cor: g.cor })
      .select()
      .single();
    if (eg) throw eg;
    totalGrupos++;

    for (const nome of g.subs) {
      const { error: es } = await supabase
        .from("subgrupos_insumos")
        .insert({ fazenda_id, grupo_id: grp.id, nome });
      if (es) throw es;
      totalSubgrupos++;
    }
  }

  return { grupos: totalGrupos, subgrupos: totalSubgrupos };
}

// Tipos de Pessoa
export async function listarTiposPessoa(fazenda_id: string): Promise<TipoPessoa[]> {
  const { data, error } = await supabase.from("tipos_pessoa").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarTipoPessoa(t: Omit<TipoPessoa, "id" | "created_at">): Promise<TipoPessoa> {
  const { data, error } = await supabase.from("tipos_pessoa").insert(t).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarTipoPessoa(id: string, t: Partial<TipoPessoa>): Promise<void> {
  const { error } = await supabase.from("tipos_pessoa").update(t).eq("id", id);
  if (error) throw error;
}
export async function excluirTipoPessoa(id: string): Promise<void> {
  const { error } = await supabase.from("tipos_pessoa").delete().eq("id", id);
  if (error) throw error;
}

// Centros de Custo (tabela de dados mestres — diferente de centros_custo_contrato)
export async function listarCentrosCustoGeral(fazenda_id: string): Promise<CentroCusto[]> {
  const { data, error } = await supabase.from("centros_custo").select("*").eq("fazenda_id", fazenda_id).order("codigo");
  if (error) throw error;
  return data ?? [];
}
export async function criarCentroCusto(c: Omit<CentroCusto, "id" | "created_at">): Promise<CentroCusto> {
  const { data, error } = await supabase.from("centros_custo").insert(c).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarCentroCusto(id: string, c: Partial<CentroCusto>): Promise<void> {
  const { error } = await supabase.from("centros_custo").update(c).eq("id", id);
  if (error) throw error;
}
export async function excluirCentroCusto(id: string): Promise<void> {
  const { error } = await supabase.from("centros_custo").delete().eq("id", id);
  if (error) throw error;
}

// Categorias de Lançamento
export async function listarCategoriasLancamento(fazenda_id: string): Promise<CategoriaLancamento[]> {
  const { data, error } = await supabase.from("categorias_lancamento").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarCategoriaLancamento(c: Omit<CategoriaLancamento, "id" | "created_at">): Promise<CategoriaLancamento> {
  const { data, error } = await supabase.from("categorias_lancamento").insert(c).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarCategoriaLancamento(id: string, c: Partial<CategoriaLancamento>): Promise<void> {
  const { error } = await supabase.from("categorias_lancamento").update(c).eq("id", id);
  if (error) throw error;
}
export async function excluirCategoriaLancamento(id: string): Promise<void> {
  const { error } = await supabase.from("categorias_lancamento").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// ARRENDAMENTOS
// ————————————————————————————————————————

export async function listarArrendamentos(fazenda_id: string): Promise<Arrendamento[]> {
  const { data, error } = await supabase.from("arrendamentos").select("*").eq("fazenda_id", fazenda_id).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function criarArrendamento(a: Omit<Arrendamento, "id" | "created_at">): Promise<Arrendamento> {
  const { data, error } = await supabase.from("arrendamentos").insert(a).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarArrendamento(id: string, a: Partial<Arrendamento>): Promise<void> {
  const { error } = await supabase.from("arrendamentos").update(a).eq("id", id);
  if (error) throw error;
}

export async function excluirArrendamento(id: string): Promise<void> {
  const { error } = await supabase.from("arrendamentos").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// ARRENDAMENTO — MATRÍCULAS
// ————————————————————————————————————————

export async function listarArrendamentoMatriculas(arrendamento_id: string): Promise<ArrendamentoMatricula[]> {
  const { data, error } = await supabase.from("arrendamento_matriculas").select("*").eq("arrendamento_id", arrendamento_id).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function criarArrendamentoMatricula(m: Omit<ArrendamentoMatricula, "id" | "created_at">): Promise<ArrendamentoMatricula> {
  const { data, error } = await supabase.from("arrendamento_matriculas").insert(m).select().single();
  if (error) throw error;
  return data;
}

export async function excluirArrendamentoMatricula(id: string): Promise<void> {
  const { error } = await supabase.from("arrendamento_matriculas").delete().eq("id", id);
  if (error) throw error;
}

/** Salva a lista completa de arrendamentos+matrículas de uma fazenda (upsert/delete). */
export async function salvarArrendamentos(
  fazenda_id: string,
  lista: Array<{
    id?: string;
    proprietario_id?: string;
    proprietario_nome?: string;
    area_ha: number;
    forma_pagamento: "sc_soja" | "sc_milho" | "sc_soja_milho" | "brl";
    sc_ha?: number;
    sc_milho_ha?: number;
    valor_brl?: number;
    ano_safra_id?: string;
    inicio?: string;
    vencimento?: string;
    renovacao_auto?: boolean;
    observacao?: string;
    produtor_id?: string;
    produtor_id_2?: string;
    mats: Array<{ id?: string; numero: string; area_ha?: number; cartorio?: string }>;
  }>
): Promise<void> {
  // Busca IDs existentes no banco
  const existentes = await listarArrendamentos(fazenda_id);
  const idsNovos = new Set(lista.filter(a => a.id).map(a => a.id as string));
  // Exclui os que foram removidos
  for (const ex of existentes) {
    if (!idsNovos.has(ex.id)) await excluirArrendamento(ex.id);
  }
  // Cria / atualiza cada arrendamento
  for (const a of lista) {
    const payload = {
      fazenda_id,
      proprietario_id: a.proprietario_id || undefined,
      proprietario_nome: a.proprietario_nome || undefined,
      area_ha: a.area_ha,
      forma_pagamento: a.forma_pagamento,
      sc_ha: a.sc_ha ?? undefined,
      sc_milho_ha: a.sc_milho_ha ?? undefined,
      valor_brl: a.valor_brl ?? undefined,
      ano_safra_id: a.ano_safra_id || undefined,
      inicio: a.inicio || undefined,
      vencimento: a.vencimento || undefined,
      renovacao_auto: a.renovacao_auto ?? false,
      observacao: a.observacao || undefined,
      produtor_id: a.produtor_id || undefined,
      produtor_id_2: a.produtor_id_2 || undefined,
    };
    let arrId = a.id;
    if (arrId) {
      await atualizarArrendamento(arrId, payload);
    } else {
      const criado = await criarArrendamento(payload);
      arrId = criado.id;
    }
    // Matrículas do arrendamento: delete all + recreate (simples para CRUD inline)
    const { error: delErr } = await supabase.from("arrendamento_matriculas").delete().eq("arrendamento_id", arrId);
    if (delErr) throw delErr;
    for (const m of a.mats) {
      if (m.numero.trim()) {
        await criarArrendamentoMatricula({ arrendamento_id: arrId!, fazenda_id, numero: m.numero.trim(), area_ha: m.area_ha ?? undefined, cartorio: m.cartorio || undefined });
      }
    }
  }
}

// ————————————————————————————————————————
// PEDIDOS DE COMPRA
// ————————————————————————————————————————

export async function listarPedidosCompra(fazenda_id: string): Promise<PedidoCompra[]> {
  const { data, error } = await supabase.from("pedidos_compra").select("*").eq("fazenda_id", fazenda_id).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarPedidoCompra(p: Omit<PedidoCompra, "id" | "created_at" | "numero">): Promise<PedidoCompra> {
  const { data, error } = await supabase.from("pedidos_compra").insert(p).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarPedidoCompra(id: string, p: Partial<PedidoCompra>): Promise<void> {
  const { error } = await supabase.from("pedidos_compra").update(p).eq("id", id);
  if (error) throw error;
}

export async function excluirPedidoCompra(id: string): Promise<void> {
  await supabase.from("pedidos_compra_itens").delete().eq("pedido_id", id);
  await supabase.from("pedidos_compra_entregas").delete().eq("pedido_id", id);
  const { error } = await supabase.from("pedidos_compra").delete().eq("id", id);
  if (error) throw error;
}

export async function listarPedidoCompraItens(pedido_id: string): Promise<PedidoCompraItem[]> {
  const { data, error } = await supabase.from("pedidos_compra_itens").select("*").eq("pedido_id", pedido_id).order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function salvarPedidoCompraItens(pedido_id: string, fazenda_id: string, itens: Omit<PedidoCompraItem, "id" | "created_at" | "valor_total">[]): Promise<void> {
  await supabase.from("pedidos_compra_itens").delete().eq("pedido_id", pedido_id);
  if (itens.length === 0) return;
  const { error } = await supabase.from("pedidos_compra_itens").insert(itens.map(i => ({ ...i, pedido_id, fazenda_id })));
  if (error) throw error;
}

export async function listarPedidoCompraEntregas(pedido_id: string): Promise<PedidoCompraEntrega[]> {
  const { data, error } = await supabase.from("pedidos_compra_entregas").select("*").eq("pedido_id", pedido_id).order("data_entrega");
  if (error) throw error;
  return data ?? [];
}

export async function registrarEntrega(e: Omit<PedidoCompraEntrega, "id" | "created_at">): Promise<PedidoCompraEntrega> {
  const { data, error } = await supabase.from("pedidos_compra_entregas").insert(e).select().single();
  if (error) throw error;
  // Atualiza qtd_entregue no item
  if (e.item_id) {
    const { data: item } = await supabase.from("pedidos_compra_itens").select("quantidade, qtd_entregue").eq("id", e.item_id).single();
    if (item) {
      const novaQtd = (item.qtd_entregue ?? 0) + e.quantidade_entregue;
      await supabase.from("pedidos_compra_itens").update({ qtd_entregue: novaQtd }).eq("id", e.item_id);
    }
  }
  // Verifica se pedido foi totalmente entregue
  const itens = await listarPedidoCompraItens(e.pedido_id);
  const todoEntregue = itens.length > 0 && itens.every(it => (it.qtd_entregue ?? 0) >= (it.quantidade - (it.qtd_cancelada ?? 0)));
  const algumEntregue = itens.some(it => (it.qtd_entregue ?? 0) > 0);
  const novoStatus = todoEntregue ? "entregue" : algumEntregue ? "parcialmente_entregue" : undefined;
  if (novoStatus) await atualizarPedidoCompra(e.pedido_id, { status: novoStatus });
  return data;
}

// ————————————————————————————————————————
// REGRAS DE RATEIO
// ————————————————————————————————————————

export async function listarRegrasRateio(fazenda_id: string): Promise<RateioRegra[]> {
  const { data: regras, error } = await supabase
    .from("regras_rateio").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  if (!regras || regras.length === 0) return [];
  // carrega linhas de todas as regras em uma única query
  const ids = regras.map(r => r.id);
  const { data: linhas } = await supabase
    .from("regras_rateio_linhas").select("*").in("regra_id", ids).order("ordem");
  return regras.map(r => ({
    ...r,
    linhas: (linhas ?? []).filter(l => l.regra_id === r.id),
  }));
}

export async function criarRateioRegra(
  r: Omit<RateioRegra, "id" | "created_at" | "linhas">,
  linhas: Omit<RateioRegraLinha, "id" | "regra_id" | "created_at">[],
): Promise<RateioRegra> {
  const { linhas: _l, ...payload } = r as RateioRegra;
  void _l;
  const { data, error } = await supabase.from("regras_rateio").insert(payload).select().single();
  if (error) throw error;
  if (linhas.length > 0) {
    const rows = linhas.map((l, i) => ({ ...l, regra_id: data.id, ordem: i }));
    const { error: le } = await supabase.from("regras_rateio_linhas").insert(rows);
    if (le) throw le;
  }
  return data;
}

export async function atualizarRateioRegra(
  id: string,
  r: Partial<Omit<RateioRegra, "linhas">>,
  linhas?: Omit<RateioRegraLinha, "id" | "regra_id" | "created_at">[],
): Promise<void> {
  const { error } = await supabase.from("regras_rateio").update(r).eq("id", id);
  if (error) throw error;
  if (linhas !== undefined) {
    await supabase.from("regras_rateio_linhas").delete().eq("regra_id", id);
    if (linhas.length > 0) {
      const rows = linhas.map((l, i) => ({ ...l, regra_id: id, ordem: i }));
      const { error: le } = await supabase.from("regras_rateio_linhas").insert(rows);
      if (le) throw le;
    }
  }
}

export async function excluirRateioRegra(id: string): Promise<void> {
  // linhas são deletadas em cascata pelo ON DELETE CASCADE
  const { error } = await supabase.from("regras_rateio").delete().eq("id", id);
  if (error) throw error;
}

// ── Rateio Global (inter-fazendas) ────────────────────────────

type FazendaPayload = {
  fazenda_id: string;
  percentual: number;
  ciclos: { ciclo_id: string; percentual: number; descricao?: string }[];
};

export async function listarRegrasRateioGlobal(conta_id: string): Promise<RateioGlobal[]> {
  const { data: regras, error } = await supabase
    .from("regras_rateio_global")
    .select("*")
    .eq("conta_id", conta_id)
    .order("nome");
  if (error) throw error;
  const ids = (regras ?? []).map(r => r.id);
  if (ids.length === 0) return [];

  const { data: fazLinhas } = await supabase
    .from("rateio_global_fazendas")
    .select("*")
    .in("regra_global_id", ids)
    .order("ordem");

  const fazIds = (fazLinhas ?? []).map(f => f.id);
  const { data: cicloLinhas } = fazIds.length > 0
    ? await supabase.from("rateio_global_ciclos").select("*").in("rateio_fazenda_id", fazIds).order("ordem")
    : { data: [] as RateioGlobalCiclo[] };

  return (regras ?? []).map(r => ({
    ...r,
    fazendas: (fazLinhas ?? [])
      .filter(f => f.regra_global_id === r.id)
      .map(f => ({ ...f, ciclos: (cicloLinhas ?? []).filter(c => c.rateio_fazenda_id === f.id) })),
  }));
}

async function _inserirFazendasGlobal(regra_id: string, fazendas: FazendaPayload[]) {
  for (let i = 0; i < fazendas.length; i++) {
    const faz = fazendas[i];
    const { data: fazLinha, error: fe } = await supabase
      .from("rateio_global_fazendas")
      .insert({ regra_global_id: regra_id, fazenda_id: faz.fazenda_id, percentual: faz.percentual, ordem: i })
      .select().single();
    if (fe) throw fe;
    for (let j = 0; j < faz.ciclos.length; j++) {
      const { error: ce } = await supabase.from("rateio_global_ciclos").insert({
        rateio_fazenda_id: fazLinha.id,
        ciclo_id: faz.ciclos[j].ciclo_id,
        percentual: faz.ciclos[j].percentual,
        descricao: faz.ciclos[j].descricao,
        ordem: j,
      });
      if (ce) throw ce;
    }
  }
}

export async function criarRateioGlobal(
  header: Omit<RateioGlobal, "id" | "created_at" | "fazendas">,
  fazendas: FazendaPayload[],
): Promise<void> {
  const { data: regra, error } = await supabase
    .from("regras_rateio_global").insert(header).select().single();
  if (error) throw error;
  await _inserirFazendasGlobal(regra.id, fazendas);
}

export async function atualizarRateioGlobal(
  id: string,
  header: Partial<Omit<RateioGlobal, "id" | "created_at" | "fazendas">>,
  fazendas?: FazendaPayload[],
): Promise<void> {
  const { error } = await supabase.from("regras_rateio_global").update(header).eq("id", id);
  if (error) throw error;
  if (fazendas) {
    await supabase.from("rateio_global_fazendas").delete().eq("regra_global_id", id);
    await _inserirFazendasGlobal(id, fazendas);
  }
}

export async function excluirRateioGlobal(id: string): Promise<void> {
  const { error } = await supabase.from("regras_rateio_global").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// REGRAS DE CLASSIFICAÇÃO AUTOMÁTICA
// ————————————————————————————————————————

export async function listarRegrasClassificacao(fazenda_id: string): Promise<RegraClassificacao[]> {
  const { data, error } = await supabase
    .from("regras_classificacao")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .order("prioridade", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarRegraClassificacao(r: Omit<RegraClassificacao, "id" | "created_at">): Promise<RegraClassificacao> {
  const { data, error } = await supabase.from("regras_classificacao").insert(r).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarRegraClassificacao(id: string, r: Partial<RegraClassificacao>): Promise<void> {
  const { error } = await supabase.from("regras_classificacao").update(r).eq("id", id);
  if (error) throw error;
}

export async function excluirRegraClassificacao(id: string): Promise<void> {
  const { error } = await supabase.from("regras_classificacao").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Dado um conjunto de regras ativas, o CNPJ do emitente e os dados de um item,
 * retorna a primeira regra que bate (ordenadas por prioridade DESC).
 * Todos os critérios preenchidos na regra devem bater (AND).
 */
export function aplicarRegraClassificacao(
  regras: RegraClassificacao[],
  emitenteCnpj: string,
  emitenteNome: string,
  itemNcm: string,
  itemCfop: string,
  itemDescricao: string,
): RegraClassificacao | null {
  const cnpjNorm = emitenteCnpj.replace(/\D/g, "");
  const nomeUp   = emitenteNome.toUpperCase();
  const descUp   = itemDescricao.toUpperCase();

  for (const r of regras) {
    if (!r.ativo) continue;
    let bate = true;
    if (r.fornecedor_cnpj) {
      if (r.fornecedor_cnpj.replace(/\D/g, "") !== cnpjNorm) { bate = false; }
    }
    if (bate && r.fornecedor_nome_contem) {
      if (!nomeUp.includes(r.fornecedor_nome_contem.toUpperCase())) { bate = false; }
    }
    if (bate && r.ncm) {
      if (!itemNcm.startsWith(r.ncm)) { bate = false; }
    }
    if (bate && r.cfop) {
      if (!itemCfop.startsWith(r.cfop)) { bate = false; }
    }
    if (bate && r.descricao_contem) {
      if (!descUp.includes(r.descricao_contem.toUpperCase())) { bate = false; }
    }
    if (bate) return r;
  }
  return null;
}

// ————————————————————————————————————————
// OPERAÇÕES DE COMPRA (simples — campo operação nos pedidos de compra)
// ————————————————————————————————————————

export async function listarOperacoesCompra(fazenda_id: string): Promise<OperacaoCompra[]> {
  const { data, error } = await supabase.from("operacoes_compra").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarOperacaoCompra(o: Omit<OperacaoCompra, "id" | "created_at">): Promise<OperacaoCompra> {
  const { data, error } = await supabase.from("operacoes_compra").insert(o).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarOperacaoCompra(id: string, o: Partial<OperacaoCompra>): Promise<void> {
  const { error } = await supabase.from("operacoes_compra").update(o).eq("id", id);
  if (error) throw error;
}
export async function excluirOperacaoCompra(id: string): Promise<void> {
  const { error } = await supabase.from("operacoes_compra").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Sincroniza Operações de Compra a partir das Operações Gerenciais.
 * Regras de elegibilidade:
 *   - tipo === "despesa" (compras são sempre saídas de caixa)
 *   - permite_notas_fiscais === true  →  aparece em NF de entrada
 *   - permite_cp_cr === true          →  aparece em Contas a Pagar / Pedidos
 *   - !inativo
 *   - exclui grupos (classificação sem ponto OU sem nenhuma flag de tela ativa)
 *
 * Mapeamento de tipo:
 *   permite_notas_fiscais && permite_cp_cr  →  "ambos"
 *   apenas permite_notas_fiscais            →  "nf"
 *   apenas permite_cp_cr                   →  "pedido"
 *
 * Substitui todas as operações de compra existentes da fazenda.
 */
export async function sincronizarOperacoesCompra(fazenda_id: string): Promise<{ inseridos: number }> {
  // 1. Busca gerenciais elegíveis
  const { data: gers, error: errG } = await supabase
    .from("operacoes_gerenciais")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .eq("tipo", "despesa")
    .eq("inativo", false)
    .or("permite_notas_fiscais.eq.true,permite_cp_cr.eq.true");
  if (errG) throw new Error(errG.message);

  // Filtra grupos puros (sem nenhuma flag de tela)
  const elegíveis = (gers ?? []).filter(g =>
    g.permite_notas_fiscais || g.permite_cp_cr
  );

  // 2. Limpa existentes
  const { error: errD } = await supabase
    .from("operacoes_compra")
    .delete()
    .eq("fazenda_id", fazenda_id);
  if (errD) throw new Error(errD.message);

  if (elegíveis.length === 0) return { inseridos: 0 };

  // 3. Monta linhas para inserção
  const rows = elegíveis.map(g => ({
    fazenda_id,
    nome: g.descricao,
    descricao: g.classificacao,   // classificação como referência (ex: "2.01.003")
    tipo: (g.permite_notas_fiscais && g.permite_cp_cr)
      ? "ambos"
      : g.permite_notas_fiscais
        ? "nf"
        : "pedido",
  }));

  // 4. Insere em bulk
  const { error: errI } = await supabase.from("operacoes_compra").insert(rows);
  if (errI) throw new Error(errI.message);

  return { inseridos: rows.length };
}

// ————————————————————————————————————————
// FORMAS DE PAGAMENTO
// ————————————————————————————————————————

export async function listarFormasPagamento(fazenda_id: string): Promise<FormaPagamento[]> {
  const { data, error } = await supabase.from("formas_pagamento").select("*").eq("fazenda_id", fazenda_id).order("nome");
  if (error) throw error;
  return data ?? [];
}
export async function criarFormaPagamento(f: Omit<FormaPagamento, "id" | "created_at">): Promise<FormaPagamento> {
  const { data, error } = await supabase.from("formas_pagamento").insert(f).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarFormaPagamento(id: string, f: Partial<FormaPagamento>): Promise<void> {
  const { error } = await supabase.from("formas_pagamento").update(f).eq("id", id);
  if (error) throw error;
}
export async function excluirFormaPagamento(id: string): Promise<void> {
  const { error } = await supabase.from("formas_pagamento").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// OPERAÇÕES GERENCIAIS / PLANO DE CONTAS
// ————————————————————————————————————————

export async function listarOperacoesGerenciais(fazenda_id: string): Promise<OperacaoGerencial[]> {
  const { data, error } = await supabase.from("operacoes_gerenciais").select("*").eq("fazenda_id", fazenda_id).order("classificacao");
  if (error) throw error;
  return data ?? [];
}

// Retorna apenas operações folha (com gerar_financeiro=true e não grupos)
export async function listarOperacoesGerenciaisAtivas(
  fazenda_id: string,
  filtro?: { tipo?: "receita" | "despesa"; permite?: "notas_fiscais" | "cp_cr" | "tesouraria" | "estoque" }
): Promise<OperacaoGerencial[]> {
  let q = supabase.from("operacoes_gerenciais").select("*")
    .eq("fazenda_id", fazenda_id)
    .eq("inativo", false)
    .order("classificacao");
  if (filtro?.tipo) q = q.eq("tipo", filtro.tipo);
  if (filtro?.permite === "notas_fiscais") q = q.eq("permite_notas_fiscais", true);
  if (filtro?.permite === "cp_cr")         q = q.eq("permite_cp_cr", true);
  if (filtro?.permite === "tesouraria")    q = q.eq("permite_tesouraria", true);
  if (filtro?.permite === "estoque")       q = q.eq("permite_estoque", true);
  const { data, error } = await q;
  if (error) throw error;
  // Exclui nós de grupo (não têm gerar_financeiro E não têm permite_cp_cr/nf)
  return (data ?? []).filter(op =>
    op.permite_cp_cr || op.permite_notas_fiscais || op.permite_tesouraria ||
    op.permite_adiantamentos || op.permite_baixas || op.permite_estoque
  );
}

// Carrega operações gerenciais ativas de TODAS as fazendas da conta
export async function listarOperacoesGerenciaisAtivasDaConta(
  filtro?: { tipo?: "receita" | "despesa"; permite?: "notas_fiscais" | "cp_cr" | "tesouraria" | "estoque" },
  fazenda_id_fallback?: string | null,
): Promise<OperacaoGerencial[]> {
  const ids = await resolverFazendaIdsDaConta(fazenda_id_fallback);
  if (!ids.length) return [];
  let q = supabase.from("operacoes_gerenciais").select("*")
    .in("fazenda_id", ids)
    .eq("inativo", false)
    .order("classificacao");
  if (filtro?.tipo) q = q.eq("tipo", filtro.tipo);
  if (filtro?.permite === "notas_fiscais") q = q.eq("permite_notas_fiscais", true);
  if (filtro?.permite === "cp_cr")         q = q.eq("permite_cp_cr", true);
  if (filtro?.permite === "tesouraria")    q = q.eq("permite_tesouraria", true);
  if (filtro?.permite === "estoque")       q = q.eq("permite_estoque", true);
  const { data, error } = await q;
  if (error) throw error;

  const comPermissao = (data ?? []).filter(op =>
    op.permite_cp_cr || op.permite_notas_fiscais || op.permite_tesouraria ||
    op.permite_adiantamentos || op.permite_baixas || op.permite_estoque
  );

  // Deduplica por classificação: mesma operação pode existir em múltiplas fazendas da conta
  // (resultado de seed de templates). Mantém a primeira ocorrência por código.
  const seen = new Set<string>();
  return comPermissao.filter(op => {
    const key = op.classificacao ?? op.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── CFOP Fiscal ──────────────────────────────────────────────────────────────
import type { OperacaoCfopFiscal } from "./supabase";

export async function listarCfopsPorOperacao(operacao_gerencial_id: string): Promise<OperacaoCfopFiscal[]> {
  const { data, error } = await supabase.from("operacao_cfop_fiscal")
    .select("*")
    .eq("operacao_gerencial_id", operacao_gerencial_id)
    .eq("ativo", true)
    .order("cfop");
  if (error) throw error;
  return data ?? [];
}

export async function buscarCstPorCfop(operacao_gerencial_id: string, cfop: string): Promise<OperacaoCfopFiscal | null> {
  const { data } = await supabase.from("operacao_cfop_fiscal")
    .select("*")
    .eq("operacao_gerencial_id", operacao_gerencial_id)
    .eq("cfop", cfop)
    .eq("ativo", true)
    .maybeSingle();
  return data ?? null;
}

export async function salvarCfopFiscal(cfop: Omit<OperacaoCfopFiscal, "id" | "created_at">): Promise<OperacaoCfopFiscal> {
  const { data, error } = await supabase.from("operacao_cfop_fiscal").insert(cfop).select().single();
  if (error) throw error;
  return data;
}

export async function excluirCfopFiscal(id: string): Promise<void> {
  const { error } = await supabase.from("operacao_cfop_fiscal").delete().eq("id", id);
  if (error) throw error;
}

export async function listarTodosCfops(fazenda_id: string): Promise<OperacaoCfopFiscal[]> {
  const { data, error } = await supabase.from("operacao_cfop_fiscal")
    .select("*, operacoes_gerenciais(classificacao, descricao)")
    .eq("fazenda_id", fazenda_id)
    .eq("ativo", true)
    .order("cfop");
  if (error) throw error;
  return data ?? [];
}
export async function criarOperacaoGerencial(o: Omit<OperacaoGerencial, "id" | "created_at">): Promise<OperacaoGerencial> {
  const { data, error } = await supabase.from("operacoes_gerenciais").insert(o).select().single();
  if (error) throw error;
  return data;
}
export async function atualizarOperacaoGerencial(id: string, o: Partial<OperacaoGerencial>): Promise<void> {
  const { error } = await supabase.from("operacoes_gerenciais").update(o).eq("id", id);
  if (error) throw error;
}
export async function excluirOperacaoGerencial(id: string): Promise<void> {
  const { error } = await supabase.from("operacoes_gerenciais").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// LEARNING / APRENDIZAGEM
// ————————————————————————————————————————
import type { LearningProgress, ControllerAlerta, SuporteConversa, SuporteMensagem } from "./supabase";

export async function listarProgressoLearning(fazenda_id: string, user_id: string): Promise<LearningProgress[]> {
  const { data, error } = await supabase
    .from("learning_progress")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .eq("user_id", user_id);
  if (error) throw error;
  return data ?? [];
}

export async function marcarLicaoConcluida(fazenda_id: string, user_id: string, lesson_id: string): Promise<void> {
  const { error } = await supabase.from("learning_progress").upsert(
    { fazenda_id, user_id, lesson_id, completed: true, completed_at: new Date().toISOString() },
    { onConflict: "fazenda_id,user_id,lesson_id" }
  );
  if (error) throw error;
}

export async function desmarcarLicao(fazenda_id: string, user_id: string, lesson_id: string): Promise<void> {
  const { error } = await supabase
    .from("learning_progress")
    .delete()
    .eq("fazenda_id", fazenda_id)
    .eq("user_id", user_id)
    .eq("lesson_id", lesson_id);
  if (error) throw error;
}

// ————————————————————————————————————————
// CONTROLLER / ALERTAS
// ————————————————————————————————————————

export async function listarAlertasController(fazenda_id: string): Promise<ControllerAlerta[]> {
  const { data, error } = await supabase
    .from("controller_alertas")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertAlertaController(alerta: Omit<ControllerAlerta, "id" | "created_at" | "first_seen_at">): Promise<void> {
  const { error } = await supabase.from("controller_alertas").upsert(
    { ...alerta, first_seen_at: new Date().toISOString() },
    { onConflict: "fazenda_id,check_key,affected_id" }
  );
  if (error) throw error;
}

export async function reconhecerAlerta(id: string, user_id: string): Promise<void> {
  const { error } = await supabase
    .from("controller_alertas")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user_id })
    .eq("id", id);
  if (error) throw error;
}

export async function resolverAlerta(id: string): Promise<void> {
  const { error } = await supabase
    .from("controller_alertas")
    .update({ resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// SUPORTE IA — CONVERSAS
// ————————————————————————————————————————

function sbErr(error: { message?: string; code?: string } | null, ctx: string): never {
  throw new Error(`${ctx}: ${error?.message ?? JSON.stringify(error)}`);
}

export async function listarConversasSuporte(fazenda_id: string, user_id: string): Promise<SuporteConversa[]> {
  const { data, error } = await supabase
    .from("suporte_conversas")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .eq("user_id", user_id)
    .order("updated_at", { ascending: false });
  if (error) sbErr(error, "listarConversas");
  return data ?? [];
}

export async function criarConversaSuporte(fazenda_id: string, user_id: string, titulo?: string): Promise<SuporteConversa> {
  const { data, error } = await supabase
    .from("suporte_conversas")
    .insert({ fazenda_id, user_id, titulo: titulo ?? "Nova conversa", updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) sbErr(error, "criarConversa");
  return data!;
}

export async function atualizarTituloConversa(id: string, titulo: string): Promise<void> {
  const { error } = await supabase
    .from("suporte_conversas")
    .update({ titulo, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) sbErr(error, "atualizarTitulo");
}

export async function excluirConversa(id: string): Promise<void> {
  await supabase.from("suporte_mensagens").delete().eq("conversa_id", id);
  const { error } = await supabase.from("suporte_conversas").delete().eq("id", id);
  if (error) sbErr(error, "excluirConversa");
}

export async function listarMensagensSuporte(conversa_id: string): Promise<SuporteMensagem[]> {
  const { data, error } = await supabase
    .from("suporte_mensagens")
    .select("*")
    .eq("conversa_id", conversa_id)
    .order("created_at", { ascending: true });
  if (error) sbErr(error, "listarMensagens");
  return data ?? [];
}

export async function salvarMensagemSuporte(msg: Omit<SuporteMensagem, "id" | "created_at">): Promise<SuporteMensagem> {
  const { data, error } = await supabase
    .from("suporte_mensagens")
    .insert(msg)
    .select()
    .single();
  if (error) sbErr(error, "salvarMensagem");
  await supabase
    .from("suporte_conversas")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", msg.conversa_id);
  return data!;
}

// ————————————————————————————————————————
// PENDÊNCIAS OPERACIONAIS
// ————————————————————————————————————————

export type PendenciaRow = {
  id: string;
  fazenda_id: string;
  tipo: string;
  subtipo?: string;
  status: "pendente" | "resolvida" | "cancelada";
  motivo?: string;
  descricao?: string;
  dados_originais: Record<string, unknown>;
  operacao_id?: string;
  produto_nome_pendente?: string;
  talhao_nome_pendente?: string;
  origem?: string;
  usuario_nome?: string;
  usuario_whatsapp?: string;
  criado_em?: string;
  resolvido_em?: string;
};

export async function listarPendenciasOperacionais(fazendaId: string): Promise<PendenciaRow[]> {
  const { data, error } = await supabase
    .from("pendencias_operacionais")
    .select("*")
    .eq("fazenda_id", fazendaId)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PendenciaRow[];
}

export async function contarPendenciasOperacionais(fazendaId: string): Promise<number> {
  const { count, error } = await supabase
    .from("pendencias_operacionais")
    .select("id", { count: "exact", head: true })
    .eq("fazenda_id", fazendaId)
    .eq("status", "pendente");
  if (error) return 0;
  return count ?? 0;
}

export async function cancelarPendenciaOperacional(id: string): Promise<void> {
  const { error } = await supabase
    .from("pendencias_operacionais")
    .update({ status: "cancelada" })
    .eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// ————————————————————————————————————————
// PLANO DE CONTAS CONTÁBIL
// ————————————————————————————————————————

import type { ContaContabil } from "./planoContas";

export async function listarPlanoContas(fazenda_id: string): Promise<ContaContabil[]> {
  const { data, error } = await supabase
    .from("plano_contas")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .order("codigo");
  if (error) throw error;
  return (data ?? []).map(r => ({
    codigo:      r.codigo,
    nome:        r.nome,
    tipo:        r.tipo as ContaContabil["tipo"],
    nivel:       r.nivel,
    pai:         r.pai ?? undefined,
    natureza:    r.natureza as ContaContabil["natureza"] ?? undefined,
    transitoria: r.transitoria ?? undefined,
    operacional: r.operacional ?? undefined,
    lcdpr:       r.lcdpr ?? null,
  }));
}

export async function salvarContaContabil(fazenda_id: string, conta: ContaContabil): Promise<void> {
  const { error } = await supabase
    .from("plano_contas")
    .upsert({ fazenda_id, ...conta }, { onConflict: "fazenda_id,codigo" });
  if (error) throw error;
}

export async function excluirContaContabil(fazenda_id: string, codigo: string): Promise<void> {
  const { error } = await supabase
    .from("plano_contas")
    .delete()
    .eq("fazenda_id", fazenda_id)
    .eq("codigo", codigo);
  if (error) throw error;
}

export async function seedPlanoContas(fazenda_id: string, contas: ContaContabil[]): Promise<void> {
  const rows = contas.map(c => ({ fazenda_id, ...c }));
  const { error } = await supabase
    .from("plano_contas")
    .upsert(rows, { onConflict: "fazenda_id,codigo" });
  if (error) throw error;
}

// ————————————————————————————————————————
// PRINCÍPIOS ATIVOS + NOMES COMERCIAIS
// ————————————————————————————————————————

export async function listarPrincipiosAtivos(): Promise<PrincipioAtivo[]> {
  const { data, error } = await supabase
    .from("principios_ativos").select("*").order("categoria").order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function criarPrincipioAtivo(p: Omit<PrincipioAtivo, "id" | "created_at">): Promise<PrincipioAtivo> {
  const { data, error } = await supabase.from("principios_ativos").insert(p).select().single();
  if (error) throw error;
  return data as PrincipioAtivo;
}

export async function atualizarPrincipioAtivo(id: string, p: Partial<PrincipioAtivo>): Promise<void> {
  const { error } = await supabase.from("principios_ativos").update(p).eq("id", id);
  if (error) throw error;
}

export async function excluirPrincipioAtivo(id: string): Promise<void> {
  const { error } = await supabase.from("principios_ativos").delete().eq("id", id);
  if (error) throw error;
}

export async function listarNomesComerciais(principio_ativo_id?: string): Promise<NomeComercial[]> {
  let q = supabase.from("nomes_comerciais")
    .select("*, principio_ativo:principios_ativos(id,nome,categoria,unidade)")
    .order("nome_comercial");
  if (principio_ativo_id) q = q.eq("principio_ativo_id", principio_ativo_id) as typeof q;
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as NomeComercial[];
}

export async function salvarNomeComercial(n: Omit<NomeComercial, "id" | "created_at" | "principio_ativo">): Promise<NomeComercial> {
  const { data, error } = await supabase
    .from("nomes_comerciais")
    .upsert({ ...n }, { onConflict: "nome_comercial" })
    .select("*, principio_ativo:principios_ativos(id,nome,categoria,unidade)")
    .single();
  if (error) throw error;
  return data as NomeComercial;
}

export async function excluirNomeComercial(id: string): Promise<void> {
  const { error } = await supabase.from("nomes_comerciais").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Resolve um nome comercial para o insumo correspondente na fazenda.
 * Fluxo: nome → nomes_comerciais → principio_ativo → insumo da fazenda com esse principio_ativo_id
 * Retorna { principioAtivo, insumo } — insumo pode ser null se a fazenda não tem cadastro.
 */
export async function resolverNomeComercial(
  nomeProduto: string,
  fazendaId: string
): Promise<{ principioAtivo: PrincipioAtivo; insumo: Insumo | null } | null> {
  if (!nomeProduto?.trim()) return null;

  // Busca por match exato ou parcial no nome comercial
  const termos = nomeProduto.trim().split(/\s+/).filter(w => w.length > 2);
  const tentativas = [nomeProduto, ...termos];

  for (const termo of tentativas) {
    const { data } = await supabase
      .from("nomes_comerciais")
      .select("*, principio_ativo:principios_ativos(*)")
      .ilike("nome_comercial", `%${termo}%`)
      .limit(1)
      .maybeSingle();

    if (data?.principio_ativo) {
      const pa = data.principio_ativo as PrincipioAtivo;

      // Busca insumo da fazenda vinculado a esse princípio ativo
      const { data: ins } = await supabase
        .from("insumos")
        .select("*")
        .eq("fazenda_id", fazendaId)
        .eq("principio_ativo_id", pa.id)
        .limit(1)
        .maybeSingle();

      // Fallback: busca insumo pelo nome do princípio ativo
      if (!ins) {
        const { data: ins2 } = await supabase
          .from("insumos")
          .select("*")
          .eq("fazenda_id", fazendaId)
          .ilike("nome", `%${pa.nome.split(" ")[0]}%`)
          .limit(1)
          .maybeSingle();
        return { principioAtivo: pa, insumo: (ins2 as Insumo | null) };
      }

      return { principioAtivo: pa, insumo: ins as Insumo };
    }
  }

  return null;
}

/**
 * Busca ou cria o insumo canônico do PA na fazenda.
 * O nome do insumo É o nome do PA — nunca o nome comercial.
 */
export async function obterOuCriarInsumoDoPA(
  fazendaId: string,
  pa: PrincipioAtivo
): Promise<{ insumo: Insumo; criado: boolean }> {
  const PA_CAT_PARA_INSUMO: Record<string, Insumo["categoria"]> = {
    herbicida: "defensivo", fungicida: "defensivo",
    inseticida: "defensivo", acaricida: "defensivo",
    fertilizante: "fertilizante", inoculante: "inoculante",
    outro: "outros",
  };

  const { data: existente } = await supabase
    .from("insumos").select("*")
    .eq("fazenda_id", fazendaId)
    .eq("principio_ativo_id", pa.id)
    .limit(1).maybeSingle();
  if (existente) return { insumo: existente as Insumo, criado: false };

  const { data: novo, error } = await supabase
    .from("insumos")
    .insert({
      fazenda_id: fazendaId,
      nome: pa.nome,
      categoria: PA_CAT_PARA_INSUMO[pa.categoria] ?? "defensivo",
      unidade: pa.unidade,
      principio_ativo_id: pa.id,
      estoque: 0,
      estoque_minimo: 0,
      valor_unitario: 0,
      tipo: "insumo",
    })
    .select().single();
  if (error) throw error;
  return { insumo: novo as Insumo, criado: true };
}

// ————————————————————————————————————————
// ESTOQUE POR PRINCÍPIO ATIVO (PA)
// ————————————————————————————————————————

/** Categorias de PA que gerenciam estoque diretamente (sem insumo intermediário) */
const PA_CATS_ESTOQUE = new Set(["herbicida","fungicida","inseticida","acaricida","fertilizante","inoculante","outro"]);
export function isCategoriaPA(categoria: PrincipioAtivo["categoria"]): boolean {
  return PA_CATS_ESTOQUE.has(categoria);
}

export async function listarPASaldos(fazendaId: string): Promise<PASaldo[]> {
  const { data, error } = await supabase
    .from("pa_saldos")
    .select("*, principio_ativo:principios_ativos(id,nome,categoria,unidade)")
    .eq("fazenda_id", fazendaId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PASaldo[];
}

export async function registrarEntradaPA(params: {
  fazendaId: string;
  principioAtivoId: string;
  quantidade: number;
  custoUnitario: number;
  nomeComercialRef?: string;
  nfEntradaId?: string;
  nfEntradaItemId?: string;
  data?: string;
  obs?: string;
}): Promise<void> {
  const { fazendaId, principioAtivoId, quantidade, custoUnitario,
          nomeComercialRef, nfEntradaId, nfEntradaItemId, data, obs } = params;

  const { data: saldoRow } = await supabase
    .from("pa_saldos").select("saldo_atual, custo_medio")
    .eq("fazenda_id", fazendaId).eq("principio_ativo_id", principioAtivoId).maybeSingle();

  const saldoAtual = Number(saldoRow?.saldo_atual ?? 0);
  const custoAtual = Number(saldoRow?.custo_medio ?? 0);
  const novoSaldo  = saldoAtual + quantidade;
  const novoCusto  = novoSaldo > 0
    ? (saldoAtual * custoAtual + quantidade * custoUnitario) / novoSaldo
    : custoUnitario;

  await supabase.from("pa_saldos").upsert({
    fazenda_id: fazendaId, principio_ativo_id: principioAtivoId,
    saldo_atual: novoSaldo,
    custo_medio: Math.round(novoCusto * 10000) / 10000,
    updated_at: new Date().toISOString(),
  }, { onConflict: "fazenda_id,principio_ativo_id" });

  await supabase.from("movimentacoes_pa").insert({
    fazenda_id: fazendaId, principio_ativo_id: principioAtivoId,
    tipo: "entrada", quantidade, custo_unitario: custoUnitario,
    data: data ?? new Date().toISOString().split("T")[0],
    nome_comercial_ref: nomeComercialRef ?? null,
    nf_entrada_id: nfEntradaId ?? null,
    nf_entrada_item_id: nfEntradaItemId ?? null,
    origem_tipo: nfEntradaId ? "nf_entrada" : "manual",
    obs: obs ?? null,
  });
}

export async function registrarSaidaPA(params: {
  fazendaId: string;
  principioAtivoId: string;
  quantidade: number;
  origemTipo?: MovimentacaoPA["origem_tipo"];
  nomeComercialRef?: string;
  data?: string;
  obs?: string;
}): Promise<void> {
  const { fazendaId, principioAtivoId, quantidade, origemTipo, nomeComercialRef, data, obs } = params;

  const { data: saldoRow } = await supabase
    .from("pa_saldos").select("saldo_atual, custo_medio")
    .eq("fazenda_id", fazendaId).eq("principio_ativo_id", principioAtivoId).maybeSingle();

  const novoSaldo = Math.max(0, Number(saldoRow?.saldo_atual ?? 0) - quantidade);
  await supabase.from("pa_saldos").upsert({
    fazenda_id: fazendaId, principio_ativo_id: principioAtivoId,
    saldo_atual: novoSaldo, updated_at: new Date().toISOString(),
  }, { onConflict: "fazenda_id,principio_ativo_id" });

  await supabase.from("movimentacoes_pa").insert({
    fazenda_id: fazendaId, principio_ativo_id: principioAtivoId,
    tipo: "saida", quantidade,
    custo_unitario: saldoRow?.custo_medio ?? null,
    data: data ?? new Date().toISOString().split("T")[0],
    nome_comercial_ref: nomeComercialRef ?? null,
    origem_tipo: origemTipo ?? "manual",
    obs: obs ?? null,
  });
}

export async function listarMovimentacoesPA(fazendaId: string, principioAtivoId?: string): Promise<MovimentacaoPA[]> {
  let q = supabase.from("movimentacoes_pa")
    .select("*, principio_ativo:principios_ativos(id,nome,categoria,unidade)")
    .eq("fazenda_id", fazendaId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  if (principioAtivoId) q = q.eq("principio_ativo_id", principioAtivoId) as typeof q;
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MovimentacaoPA[];
}

export async function estornarMovimentacoesPA(nfEntradaId: string): Promise<void> {
  const { data: movs } = await supabase.from("movimentacoes_pa")
    .select("*").eq("nf_entrada_id", nfEntradaId).eq("tipo", "entrada");
  if (!movs?.length) return;
  for (const m of movs) {
    const { data: s } = await supabase.from("pa_saldos").select("saldo_atual")
      .eq("fazenda_id", m.fazenda_id).eq("principio_ativo_id", m.principio_ativo_id).maybeSingle();
    await supabase.from("pa_saldos").upsert({
      fazenda_id: m.fazenda_id, principio_ativo_id: m.principio_ativo_id,
      saldo_atual: Math.max(0, Number(s?.saldo_atual ?? 0) - Number(m.quantidade)),
      updated_at: new Date().toISOString(),
    }, { onConflict: "fazenda_id,principio_ativo_id" });
  }
  await supabase.from("movimentacoes_pa").delete().eq("nf_entrada_id", nfEntradaId);
}

// ————————————————————————————————————————
// SIEG — INTEGRAÇÃO FISCAL AUTOMÁTICA
// ————————————————————————————————————————

export async function listarNfsImportadas(fazendaId: string, status?: string): Promise<NfImportadaSieg[]> {
  let q = supabase.from("nf_importadas_sieg").select("*").eq("fazenda_id", fazendaId).order("data_emissao", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (data ?? []) as NfImportadaSieg[];
}

export async function listarItensSieg(nfId: string): Promise<NfImportadaItemSieg[]> {
  const { data } = await supabase.from("nf_importada_itens_sieg").select("*").eq("nf_id", nfId).order("numero_item");
  return (data ?? []) as NfImportadaItemSieg[];
}

export async function classificarItemSieg(
  itemId: string,
  nfId: string,
  dados: { insumo_id?: string | null; categoria?: string | null; centro_custo_id?: string | null; status_item: string }
): Promise<void> {
  await supabase.from("nf_importada_itens_sieg").update(dados).eq("id", itemId);
  const { data: itens } = await supabase.from("nf_importada_itens_sieg").select("status_item").eq("nf_id", nfId);
  const pendentes = (itens ?? []).filter(i => i.status_item === "pendente");
  if (pendentes.length === 0) {
    await supabase.from("nf_importadas_sieg").update({ status: "classificada", classificada_em: new Date().toISOString() }).eq("id", nfId);
  }
}

export async function ignorarNfSieg(nfId: string): Promise<void> {
  await supabase.from("nf_importadas_sieg").update({ status: "ignorada" }).eq("id", nfId);
  await supabase.from("nf_importada_itens_sieg").update({ status_item: "ignorado" }).eq("nf_id", nfId);
}

export async function reabrirNfSieg(nfId: string): Promise<void> {
  await supabase.from("nf_importadas_sieg").update({ status: "pendente", classificada_em: null }).eq("id", nfId);
}

export async function contarPendenciasSieg(fazendaId: string): Promise<number> {
  const { count } = await supabase.from("nf_importadas_sieg").select("id", { count: "exact", head: true }).eq("fazenda_id", fazendaId).eq("status", "pendente");
  return count ?? 0;
}

// ————————————————————————————————————————
// REGRAS DE CLASSIFICAÇÃO NF
// ————————————————————————————————————————

export async function listarRegrasClassificacaoNf(fazendaId: string): Promise<RegraClassificacaoNf[]> {
  const { data } = await supabase.from("regras_classificacao_nf").select("*").eq("fazenda_id", fazendaId).order("created_at", { ascending: false });
  return (data ?? []) as RegraClassificacaoNf[];
}

export async function criarRegraClassificacaoNf(r: Omit<RegraClassificacaoNf, "id" | "created_at" | "qtd_aplicacoes" | "ultima_aplicacao">): Promise<RegraClassificacaoNf> {
  const { data, error } = await supabase.from("regras_classificacao_nf").insert({ ...r, qtd_aplicacoes: 0 }).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarRegraClassificacaoNf(id: string, r: Partial<RegraClassificacaoNf>): Promise<void> {
  await supabase.from("regras_classificacao_nf").update(r).eq("id", id);
}

export async function excluirRegraClassificacaoNf(id: string): Promise<void> {
  await supabase.from("regras_classificacao_nf").delete().eq("id", id);
}

// ————————————————————————————————————————
// CONFIGURAÇÕES DE AUTOMAÇÃO
// ————————————————————————————————————————

export async function listarConfigAutomacoes(fazendaId: string): Promise<ConfiguracaoAutomacao[]> {
  const { data } = await supabase.from("configuracoes_automacao").select("*").eq("fazenda_id", fazendaId);
  return (data ?? []) as ConfiguracaoAutomacao[];
}

export async function salvarConfigAutomacao(
  fazendaId: string,
  automacaoId: string,
  ativa: boolean,
  config?: Record<string, unknown>
): Promise<void> {
  const { data: exists } = await supabase.from("configuracoes_automacao").select("id").eq("fazenda_id", fazendaId).eq("automacao_id", automacaoId).maybeSingle();
  if (exists) {
    await supabase.from("configuracoes_automacao").update({ ativa, ...(config !== undefined ? { config } : {}) }).eq("fazenda_id", fazendaId).eq("automacao_id", automacaoId);
  } else {
    await supabase.from("configuracoes_automacao").insert({ fazenda_id: fazendaId, automacao_id: automacaoId, ativa, config: config ?? {} });
  }
}

export async function buscarConfigAutomacao(fazendaId: string, automacaoId: string): Promise<ConfiguracaoAutomacao | null> {
  const { data } = await supabase.from("configuracoes_automacao").select("*").eq("fazenda_id", fazendaId).eq("automacao_id", automacaoId).maybeSingle();
  return data as ConfiguracaoAutomacao | null;
}

// ————————————————————————————————————————
// ADIANTAMENTOS A FORNECEDORES
// ————————————————————————————————————————

import type { AdiantamentoFornecedor, AdiantamentoAplicacao } from "./supabase";

export async function listarAdiantamentos(fazenda_id: string): Promise<AdiantamentoFornecedor[]> {
  const { data, error } = await supabase
    .from("adiantamentos_fornecedor")
    .select("*")
    .eq("fazenda_id", fazenda_id)
    .order("data_emissao", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listarAplicacoesAdiantamento(adiantamento_id: string): Promise<AdiantamentoAplicacao[]> {
  const { data, error } = await supabase
    .from("adiantamentos_aplicacoes")
    .select("*")
    .eq("adiantamento_id", adiantamento_id)
    .order("data_aplicacao", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function criarAdiantamento(
  a: Omit<AdiantamentoFornecedor, "id" | "created_at" | "valor_aplicado" | "lancamento_id">,
  jaQuitado: boolean,
): Promise<AdiantamentoFornecedor> {
  const { data: adiant, error: eAdiant } = await supabase
    .from("adiantamentos_fornecedor")
    .insert({ ...a, valor_aplicado: 0, status: "em_aberto" })
    .select()
    .single();
  if (eAdiant) throw eAdiant;

  const { data: lanc, error: eLanc } = await supabase
    .from("lancamentos")
    .insert({
      fazenda_id:      a.fazenda_id,
      tipo:            "pagar",
      moeda:           a.moeda,
      cotacao_usd:     a.cotacao_usd ?? null,
      descricao:       `Adiantamento — ${a.descricao}`,
      categoria:       "Adiantamento a Fornecedores",
      data_lancamento: a.data_emissao,
      data_vencimento: a.data_emissao,
      valor:           a.valor,
      status:          jaQuitado ? "baixado" : "em_aberto",
      data_baixa:      jaQuitado ? a.data_emissao : null,
      pessoa_id:       a.pessoa_id ?? null,
      conta_bancaria:  a.conta_bancaria_id ?? null,
      ano_safra_id:    a.ano_safra_id ?? null,
      auto:            true,
    })
    .select()
    .single();
  if (eLanc) throw eLanc;

  await supabase.from("adiantamentos_fornecedor").update({ lancamento_id: lanc.id }).eq("id", adiant.id);
  return { ...adiant, lancamento_id: lanc.id };
}

export async function atualizarAdiantamento(id: string, data: Partial<AdiantamentoFornecedor>): Promise<void> {
  const { error } = await supabase.from("adiantamentos_fornecedor").update(data).eq("id", id);
  if (error) throw error;
}

export async function cancelarAdiantamento(id: string): Promise<void> {
  const { error } = await supabase.from("adiantamentos_fornecedor").update({ status: "cancelado" }).eq("id", id);
  if (error) throw error;
}

export async function aplicarAdiantamento(
  adiantamento: AdiantamentoFornecedor,
  valorAplicado: number,
  dataAplicacao: string,
  descricao: string,
  nrNf?: string,
  nfEntradaId?: string,
): Promise<AdiantamentoAplicacao> {
  const novoTotal = (adiantamento.valor_aplicado ?? 0) + valorAplicado;
  const novoStatus: AdiantamentoFornecedor["status"] =
    novoTotal >= adiantamento.valor ? "aplicado" : "parcial";

  const { data: apl, error: eApl } = await supabase
    .from("adiantamentos_aplicacoes")
    .insert({
      adiantamento_id: adiantamento.id,
      fazenda_id:      adiantamento.fazenda_id,
      descricao,
      valor_aplicado:  valorAplicado,
      data_aplicacao:  dataAplicacao,
      nr_nf:           nrNf ?? null,
      nf_entrada_id:   nfEntradaId ?? null,
    })
    .select()
    .single();
  if (eApl) throw eApl;

  await supabase
    .from("adiantamentos_fornecedor")
    .update({ valor_aplicado: novoTotal, status: novoStatus })
    .eq("id", adiantamento.id);

  return apl;
}

import type { ImovelUrbano } from "./supabase";

// ————————————————————————————————————————
// IMÓVEIS URBANOS
// ————————————————————————————————————————

export async function listarImoveisUrbanos(fazenda_id: string): Promise<ImovelUrbano[]> {
  const { data, error } = await supabase.from("imoveis_urbanos").select("*").eq("fazenda_id", fazenda_id).order("descricao");
  if (error) throw error;
  return data ?? [];
}

export async function criarImovelUrbano(i: Omit<ImovelUrbano, "id" | "created_at">): Promise<ImovelUrbano> {
  const { data, error } = await supabase.from("imoveis_urbanos").insert(i).select().single();
  if (error) throw error;
  return data;
}

export async function atualizarImovelUrbano(id: string, i: Partial<ImovelUrbano>): Promise<void> {
  const { error } = await supabase.from("imoveis_urbanos").update(i).eq("id", id);
  if (error) throw error;
}

export async function excluirImovelUrbano(id: string): Promise<void> {
  const { error } = await supabase.from("imoveis_urbanos").delete().eq("id", id);
  if (error) throw error;
}

// ————————————————————————————————————————
// SEEDER — Produtos Agrícolas Padrão
// ————————————————————————————————————————

const PRODUTOS_AGRICOLAS_PADRAO: {
  nome: string;
  subgrupo: string;
  unidade: string;
}[] = [
  { nome: "Soja Convencional",  subgrupo: "soja",        unidade: "sc" },
  { nome: "Soja Transgênica",   subgrupo: "soja",        unidade: "sc" },
  { nome: "Milho",              subgrupo: "milho",       unidade: "sc" },
  { nome: "Milho Pipoca",       subgrupo: "milho_pipoca",unidade: "sc" },
  { nome: "Algodão",            subgrupo: "algodao",     unidade: "@"  },
  { nome: "Gergelim",           subgrupo: "gergelim",    unidade: "kg" },
  { nome: "Trigo",              subgrupo: "trigo",       unidade: "sc" },
  { nome: "Girassol",           subgrupo: "girassol",    unidade: "kg" },
  { nome: "Brachiaria",         subgrupo: "brachiaria",  unidade: "sc" },
  { nome: "Sorgo",              subgrupo: "sorgo",       unidade: "sc" },
  { nome: "Milheto",            subgrupo: "milheto",     unidade: "sc" },
];

export async function seederProdutosAgricolas(fazenda_id: string): Promise<number> {
  // Busca nomes já existentes para evitar duplicatas
  const { data: existentes } = await supabase
    .from("insumos")
    .select("nome")
    .eq("fazenda_id", fazenda_id)
    .eq("categoria", "produto_agricola");

  const nomesExistentes = new Set((existentes ?? []).map((r: { nome: string }) => r.nome.toLowerCase()));

  const novos = PRODUTOS_AGRICOLAS_PADRAO.filter(
    p => !nomesExistentes.has(p.nome.toLowerCase())
  );

  if (novos.length === 0) return 0;

  const { error } = await supabase.from("insumos").insert(
    novos.map(p => ({
      fazenda_id,
      nome:           p.nome,
      categoria:      "produto_agricola",
      subgrupo:       p.subgrupo,
      unidade:        p.unidade,
      tipo:           "produto",
      estoque:        0,
      estoque_minimo: 0,
      valor_unitario: 0,
    }))
  );

  if (error) throw error;
  return novos.length;
}

// ═══════════════════════════════════════════
// PARCERIAS AGRÍCOLAS & GRUPOS ECONÔMICOS
// ═══════════════════════════════════════════

import type {
  Parceria, ParceriaParticipante, ParceriaArea,
  ParceriaDistribuicao, ParceriaApuracao, ParceriaApuracaoCota,
  GrupoEconomico, GrupoEconomicoMembro,
} from "./supabase";

// ── Parcerias ──────────────────────────────

export async function listarParcerias(conta_id: string): Promise<Parceria[]> {
  const { data, error } = await supabase
    .from("parcerias")
    .select("*")
    .eq("conta_id", conta_id)
    .order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function salvarParceria(
  p: Omit<Parceria, "id" | "created_at"> & { id?: string }
): Promise<Parceria> {
  const { id, ...campos } = p;
  if (id) {
    const { data, error } = await supabase.from("parcerias").update(campos).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from("parcerias").insert(campos).select().single();
  if (error) throw error;
  return data;
}

export async function excluirParceria(id: string): Promise<void> {
  const { error } = await supabase.from("parcerias").delete().eq("id", id);
  if (error) throw error;
}

// ── Participantes ──────────────────────────

export async function listarParticipantes(parceria_id: string): Promise<ParceriaParticipante[]> {
  const { data, error } = await supabase
    .from("parceria_participantes")
    .select("*, produtor:produtores(nome, cpf_cnpj)")
    .eq("parceria_id", parceria_id)
    .order("percentual", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function salvarParticipantes(
  parceria_id: string,
  participantes: Array<Omit<ParceriaParticipante, "id" | "created_at" | "produtor"> & { id?: string }>
): Promise<void> {
  const { data: existentes } = await supabase
    .from("parceria_participantes").select("id").eq("parceria_id", parceria_id);

  const idsEnviados = participantes.filter(p => p.id).map(p => p.id!);
  const idsRemover = (existentes ?? []).map((e: { id: string }) => e.id).filter((id: string) => !idsEnviados.includes(id));

  if (idsRemover.length > 0) {
    await supabase.from("parceria_participantes").delete().in("id", idsRemover);
  }
  for (const pt of participantes) {
    const { id, ...campos } = { ...pt, parceria_id };
    if (id) {
      await supabase.from("parceria_participantes").update(campos).eq("id", id);
    } else {
      await supabase.from("parceria_participantes").insert(campos);
    }
  }
}

// ── Áreas vinculadas ───────────────────────

export async function listarAreasParcerias(parceria_id: string): Promise<ParceriaArea[]> {
  const { data, error } = await supabase
    .from("parceria_areas")
    .select("*, talhao:talhoes(nome, area_ha), ciclo:ciclos(descricao)")
    .eq("parceria_id", parceria_id);
  if (error) throw error;
  return data ?? [];
}

export async function salvarAreasParcerias(
  parceria_id: string,
  areas: Array<Omit<ParceriaArea, "id" | "created_at" | "talhao" | "ciclo"> & { id?: string }>
): Promise<void> {
  await supabase.from("parceria_areas").delete().eq("parceria_id", parceria_id);
  if (areas.length > 0) {
    await supabase.from("parceria_areas").insert(areas.map(a => ({ ...a, parceria_id })));
  }
}

// ── Distribuição de custos ─────────────────

export async function listarDistribuicao(parceria_id: string): Promise<ParceriaDistribuicao[]> {
  const { data, error } = await supabase
    .from("parceria_distribuicao")
    .select("*")
    .eq("parceria_id", parceria_id);
  if (error) throw error;
  return data ?? [];
}

export async function salvarDistribuicao(
  parceria_id: string,
  regras: Array<Omit<ParceriaDistribuicao, "id"> & { id?: string }>
): Promise<void> {
  await supabase.from("parceria_distribuicao").delete().eq("parceria_id", parceria_id);
  if (regras.length > 0) {
    await supabase.from("parceria_distribuicao").insert(
      regras.map(({ id: _id, ...r }) => ({ ...r, parceria_id }))
    );
  }
}

// ── Apuração de resultado ──────────────────

export async function listarApuracoes(parceria_id: string): Promise<ParceriaApuracao[]> {
  const { data, error } = await supabase
    .from("parceria_apuracoes")
    .select("*")
    .eq("parceria_id", parceria_id)
    .order("data_apuracao", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function salvarApuracao(
  apuracao: Omit<ParceriaApuracao, "id" | "created_at"> & { id?: string },
  cotas: Array<Omit<ParceriaApuracaoCota, "id">>
): Promise<string> {
  const { id, ...campos } = apuracao;
  let apuracaoId = id;
  if (apuracaoId) {
    await supabase.from("parceria_apuracoes").update(campos).eq("id", apuracaoId);
    await supabase.from("parceria_apuracao_cotas").delete().eq("apuracao_id", apuracaoId);
  } else {
    const { data, error } = await supabase.from("parceria_apuracoes").insert(campos).select("id").single();
    if (error) throw error;
    apuracaoId = data.id;
  }
  if (cotas.length > 0) {
    await supabase.from("parceria_apuracao_cotas").insert(
      cotas.map(c => ({ ...c, apuracao_id: apuracaoId }))
    );
  }
  return apuracaoId!;
}

export async function listarCotasApuracao(apuracao_id: string): Promise<ParceriaApuracaoCota[]> {
  const { data, error } = await supabase
    .from("parceria_apuracao_cotas").select("*").eq("apuracao_id", apuracao_id);
  if (error) throw error;
  return data ?? [];
}

// ── Grupos Econômicos ──────────────────────

export async function listarGruposEconomicos(conta_id: string): Promise<GrupoEconomico[]> {
  const { data, error } = await supabase
    .from("grupos_economicos").select("*").eq("conta_id", conta_id).order("nome");
  if (error) throw error;
  return data ?? [];
}

export async function salvarGrupoEconomico(
  g: Omit<GrupoEconomico, "id" | "created_at"> & { id?: string }
): Promise<GrupoEconomico> {
  const { id, ...campos } = g;
  if (id) {
    const { data, error } = await supabase.from("grupos_economicos").update(campos).eq("id", id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from("grupos_economicos").insert(campos).select().single();
  if (error) throw error;
  return data;
}

export async function excluirGrupoEconomico(id: string): Promise<void> {
  const { error } = await supabase.from("grupos_economicos").delete().eq("id", id);
  if (error) throw error;
}

export async function listarMembrosGrupo(grupo_id: string): Promise<GrupoEconomicoMembro[]> {
  const { data, error } = await supabase
    .from("grupo_economico_membros")
    .select("*, fazenda:fazendas(nome), produtor:produtores(nome, cpf_cnpj)")
    .eq("grupo_id", grupo_id);
  if (error) throw error;
  return data ?? [];
}

export async function salvarMembrosGrupo(
  grupo_id: string,
  membros: Array<Omit<GrupoEconomicoMembro, "id" | "created_at" | "fazenda" | "produtor"> & { id?: string }>
): Promise<void> {
  await supabase.from("grupo_economico_membros").delete().eq("grupo_id", grupo_id);
  if (membros.length > 0) {
    await supabase.from("grupo_economico_membros").insert(
      membros.map(({ id: _id, ...m }) => ({ ...m, grupo_id }))
    );
  }
}

// Calcula rateio de uma apuração conforme regras de distribuição
export function calcularCotas(
  participantes: ParceriaParticipante[],
  distribuicao: ParceriaDistribuicao[],
  receita: number,
  custos: Record<string, number>,
): ParceriaApuracaoCota[] {
  const cotas: ParceriaApuracaoCota[] = participantes.map(pt => ({
    id: "",
    apuracao_id: "",
    participante_id: pt.id,
    receita_cota: 0,
    custo_cota: 0,
    resultado_cota: 0,
    lancado_sped: false,
  }));

  for (const cota of cotas) {
    const pt = participantes.find(p => p.id === cota.participante_id)!;
    cota.receita_cota = receita * (pt.percentual / 100);
  }

  for (const [tipoCusto, valorCusto] of Object.entries(custos)) {
    for (const cota of cotas) {
      const pt = participantes.find(p => p.id === cota.participante_id)!;
      const regra = distribuicao.find(d => d.participante_id === pt.id && d.tipo_custo === tipoCusto)
                 ?? distribuicao.find(d => d.participante_id === pt.id && d.tipo_custo === "todos");
      const pct = regra ? regra.percentual : pt.percentual;
      cota.custo_cota += valorCusto * (pct / 100);
    }
  }

  for (const cota of cotas) {
    cota.resultado_cota = cota.receita_cota - cota.custo_cota;
  }
  return cotas;
}

// ————————————————————————————————————————
// UTILITÁRIOS
// ————————————————————————————————————————

/** ID fixo da fazenda demo — substituir por auth.user() quando implementar login */
export const FAZENDA_ID = "00000000-0000-0000-0000-000000000001";
