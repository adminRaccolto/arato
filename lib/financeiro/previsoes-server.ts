// Previsão de Gastos — operações de banco (service_role). Usado por /api/financeiro/previsoes e pela folha.
// Regras de negócio puras ficam em ./previsoes.ts.
import { hojeLocal } from "../data-local";
import { resultadoConsumo, type Tolerancia } from "./previsoes";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SB = any;

export type PrevisaoRow = {
  id: string; conta_id: string; fazenda_id: string; produtor_id: string | null; empresa_id: string | null;
  operacao_gerencial_id: string; og_classificacao: string; pessoa_id: string | null;
  ano_safra_id: string | null; ciclo_id: string | null; centro_custo_id: string | null;
  descricao: string | null; valor: number; saldo: number; data_vencimento: string;
  status: string; diferenca: number | null; decisao: string | null; origem: string;
  recorrencia_grupo: string | null; folha_id: string | null; lancamento_previsao_id: string | null; observacao: string | null;
};

export type NovaPrevisao = Omit<PrevisaoRow, "id" | "og_classificacao" | "saldo" | "status" | "diferenca" | "decisao" | "lancamento_previsao_id"> & {
  og_classificacao?: string;
};

/** Tabela da Seção 352 ainda não criada no banco. */
export function tabelaPrevisoesAusente(e: { message?: string; code?: string } | null | undefined): boolean {
  const m = String(e?.message ?? "");
  return e?.code === "42P01" || e?.code === "PGRST205" || /previsoes_gasto/.test(m) && /(does not exist|not find|schema cache)/i.test(m);
}

export async function toleranciaDaConta(sb: SB, conta_id: string): Promise<Tolerancia> {
  const { data } = await sb.from("previsoes_config").select("tolerancia_pct, tolerancia_valor").eq("conta_id", conta_id).maybeSingle();
  return { pct: Number(data?.tolerancia_pct ?? 0), valor: Number(data?.tolerancia_valor ?? 0) };
}

async function inserirLancamento(sb: SB, row: Record<string, unknown>) {
  let r = await sb.from("lancamentos").insert(row).select("id").single();
  // Seção 352 ainda sem 'previsao' no CHECK de origem: grava como manual
  if (r.error?.code === "23514" && String(r.error.message ?? "").includes("origem_lancamento")) {
    r = await sb.from("lancamentos").insert({ ...row, origem_lancamento: "manual" }).select("id").single();
  }
  return r;
}

/** Cria (ou recria) o título de PREVISÃO no CP com o saldo da previsão. Retorna o id do título. */
export async function criarTituloPrevisao(sb: SB, p: PrevisaoRow, extra: Record<string, unknown> = {}): Promise<string | null> {
  if (!(p.saldo > 0.005)) return null;
  let anoSafra = p.ano_safra_id;
  if (!anoSafra) {
    try {
      const { data } = await sb.rpc("fn_ano_safra_da_data", { p_fazenda: p.fazenda_id, p_data: p.data_vencimento });
      if (typeof data === "string") anoSafra = data;
    } catch { /* sem ano safra para a data */ }
  }
  const { data: og } = await sb.from("operacoes_gerenciais").select("descricao").eq("id", p.operacao_gerencial_id).maybeSingle();
  const { data, error } = await inserirLancamento(sb, {
    fazenda_id: p.fazenda_id, produtor_id: p.produtor_id, empresa_id: p.empresa_id, pessoa_id: p.pessoa_id,
    ano_safra_id: anoSafra, ciclo_id: p.ciclo_id, centro_custo_id: p.centro_custo_id,
    operacao_gerencial_id: p.operacao_gerencial_id,
    natureza: "previsao", tipo: "pagar", status: "em_aberto", moeda: "BRL", auto: true,
    descricao: p.descricao || og?.descricao || "Previsão de gasto",
    categoria: og?.descricao ?? "Previsão",
    valor: Math.round(p.saldo * 100) / 100,
    data_vencimento: p.data_vencimento, data_lancamento: hojeLocal(),
    origem_lancamento: "previsao", previsao_gasto_id: p.id,
    observacao: p.observacao,
    ...extra,
  });
  if (error) throw new Error(`Título de previsão: ${error.message}`);
  await sb.from("previsoes_gasto").update({ lancamento_previsao_id: data.id, updated_at: new Date().toISOString() }).eq("id", p.id);
  return data.id as string;
}

/** Tira a previsão do CP / fluxo: apaga o título de previsão (nunca um título real ou baixado). */
export async function removerTituloPrevisao(sb: SB, p: Pick<PrevisaoRow, "id" | "lancamento_previsao_id">): Promise<void> {
  if (p.lancamento_previsao_id) {
    const { error } = await sb.from("lancamentos").delete().eq("id", p.lancamento_previsao_id).eq("natureza", "previsao").neq("status", "baixado");
    if (error) throw new Error(`Remover previsão do CP: ${error.message}`);
  }
  await sb.from("previsoes_gasto").update({ lancamento_previsao_id: null, updated_at: new Date().toISOString() }).eq("id", p.id);
}

/** Atualiza o valor/vencimento do título de previsão para o saldo atual (ou recria se sumiu). */
export async function sincronizarTituloPrevisao(sb: SB, p: PrevisaoRow): Promise<void> {
  if (!(p.saldo > 0.005)) { await removerTituloPrevisao(sb, p); return; }
  if (p.lancamento_previsao_id) {
    const { data: l } = await sb.from("lancamentos").select("id, natureza").eq("id", p.lancamento_previsao_id).maybeSingle();
    if (l && l.natureza === "previsao") {
      const { error } = await sb.from("lancamentos").update({ valor: Math.round(p.saldo * 100) / 100, data_vencimento: p.data_vencimento }).eq("id", l.id);
      if (error) throw new Error(`Atualizar previsão no CP: ${error.message}`);
      return;
    }
  }
  await criarTituloPrevisao(sb, p);
}

export async function criarPrevisoes(sb: SB, linhas: NovaPrevisao[], userId: string | null, extraTitulo: Record<string, unknown> = {}): Promise<PrevisaoRow[]> {
  const out: PrevisaoRow[] = [];
  const ogIds = [...new Set(linhas.map(l => l.operacao_gerencial_id))];
  const { data: ogs } = await sb.from("operacoes_gerenciais").select("id, classificacao").in("id", ogIds);
  const classe: Record<string, string> = {};
  for (const o of ogs ?? []) classe[o.id] = o.classificacao;
  for (const l of linhas) {
    const og_classificacao = l.og_classificacao || classe[l.operacao_gerencial_id];
    if (!og_classificacao) throw new Error("Operação Gerencial não encontrada.");
    const { data, error } = await sb.from("previsoes_gasto").insert({
      ...l, og_classificacao, saldo: l.valor, status: "aberta", created_by: userId,
    }).select("*").single();
    if (error) throw error;
    const row = data as PrevisaoRow;
    row.lancamento_previsao_id = await criarTituloPrevisao(sb, row, extraTitulo);
    out.push(row);
  }
  return out;
}

export type ConsumoInput = {
  previsao_id: string;
  valor: number;
  lancamento_id?: string | null;
  emp_lancamento_id?: string | null;
  nf_entrada_id?: string | null;
  origem: "cp_manual" | "nf_entrada" | "folha" | "efetivar_cp";
  userId?: string | null;
};

/**
 * Consome a previsão com um gasto real. A previsão fica cumprida; diferença acima da tolerância vai para a Decisão do
 * Gestor. Enquanto o gestor não decide, uma SOBRA continua prevista no CP / fluxo (conservador para o caixa).
 */
export async function consumirPrevisao(sb: SB, c: ConsumoInput): Promise<{ status: string; diferenca: number }> {
  const { data: p, error } = await sb.from("previsoes_gasto").select("*").eq("id", c.previsao_id).maybeSingle();
  if (error) throw error;
  if (!p) throw new Error("Previsão não encontrada.");
  if (p.status !== "aberta") throw new Error("Esta previsão já foi consumida ou encerrada.");
  const valor = Math.round(Number(c.valor) * 100) / 100;
  if (!(valor > 0)) throw new Error("Valor do consumo inválido.");

  const { error: eC } = await sb.from("previsoes_gasto_consumos").insert({
    previsao_id: p.id, valor, origem: c.origem, created_by: c.userId ?? null,
    lancamento_id: c.lancamento_id ?? null, emp_lancamento_id: c.emp_lancamento_id ?? null, nf_entrada_id: c.nf_entrada_id ?? null,
  });
  if (eC) throw eC;

  // O título de previsão que virou o próprio título real (Efetivar no CP / fechar folha) não é apagado: só desliga.
  const proprio = !!c.lancamento_id && c.lancamento_id === p.lancamento_previsao_id;
  if (proprio) await sb.from("previsoes_gasto").update({ lancamento_previsao_id: null }).eq("id", p.id);

  const tol = await toleranciaDaConta(sb, p.conta_id);
  const r = resultadoConsumo({ saldo: Number(p.saldo), valorPrevisto: Number(p.valor), consumido: valor, tolerancia: tol });
  const sobra = r.status === "pendente_decisao" && r.diferenca > 0 ? r.diferenca : 0;
  const novo: PrevisaoRow = {
    ...p, saldo: sobra, status: r.status, diferenca: r.diferenca || null,
    decisao: r.dentroTolerancia ? "tolerancia" : null, lancamento_previsao_id: proprio ? null : p.lancamento_previsao_id,
  };
  const { error: eU } = await sb.from("previsoes_gasto").update({
    saldo: novo.saldo, status: novo.status, diferenca: novo.diferenca, decisao: novo.decisao, updated_at: new Date().toISOString(),
  }).eq("id", p.id);
  if (eU) throw eU;
  await sincronizarTituloPrevisao(sb, novo);
  return { status: r.status, diferenca: r.diferenca };
}

/** Decisão do Gestor sobre a diferença: efetivar (vira desvio, sai do CP) ou manter saldo (continua prevista). */
export async function decidirPrevisao(sb: SB, id: string, decisao: "efetivada" | "saldo", userId: string | null): Promise<void> {
  const { data: p } = await sb.from("previsoes_gasto").select("*").eq("id", id).maybeSingle();
  if (!p) throw new Error("Previsão não encontrada.");
  if (p.status !== "pendente_decisao") throw new Error("Esta previsão não está aguardando decisão.");
  const agora = new Date().toISOString();
  if (decisao === "saldo") {
    if (!(Number(p.diferenca) > 0)) throw new Error("Gasto acima do previsto não tem saldo a manter: efetive a diferença.");
    const novo = { ...p, saldo: Number(p.diferenca), status: "aberta" } as PrevisaoRow;
    await sb.from("previsoes_gasto").update({ saldo: novo.saldo, status: "aberta", decisao: "saldo", decidido_em: agora, decidido_por: userId, updated_at: agora }).eq("id", id);
    await sincronizarTituloPrevisao(sb, novo);
    return;
  }
  await removerTituloPrevisao(sb, p);
  await sb.from("previsoes_gasto").update({ saldo: 0, status: "efetivada", decisao: "efetivada", decidido_em: agora, decidido_por: userId, updated_at: agora }).eq("id", id);
}

/** Previsão vencida: nova data (continua prevista) ou efetivar (encerra; o saldo vira desvio). */
export async function tratarVencida(sb: SB, id: string, acao: { tipo: "nova_data"; data: string } | { tipo: "efetivar" }, userId: string | null): Promise<void> {
  const { data: p } = await sb.from("previsoes_gasto").select("*").eq("id", id).maybeSingle();
  if (!p) throw new Error("Previsão não encontrada.");
  if (p.status !== "aberta") throw new Error("Só uma previsão em aberto pode ser tratada.");
  const agora = new Date().toISOString();
  if (acao.tipo === "nova_data") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(acao.data)) throw new Error("Data inválida.");
    await sb.from("previsoes_gasto").update({ data_vencimento: acao.data, decisao: "nova_data", decidido_em: agora, decidido_por: userId, updated_at: agora }).eq("id", id);
    await sincronizarTituloPrevisao(sb, { ...p, data_vencimento: acao.data });
    return;
  }
  await removerTituloPrevisao(sb, p);
  await sb.from("previsoes_gasto").update({
    diferenca: Number(p.saldo), saldo: 0, status: "efetivada", decisao: "vencida_efetivada", decidido_em: agora, decidido_por: userId, updated_at: agora,
  }).eq("id", id);
}

/** Excluir antes de qualquer consumo = cancelar (a linha fica, fora do Previsto). */
export async function cancelarPrevisao(sb: SB, id: string): Promise<void> {
  const { data: p } = await sb.from("previsoes_gasto").select("*").eq("id", id).maybeSingle();
  if (!p) throw new Error("Previsão não encontrada.");
  const { count } = await sb.from("previsoes_gasto_consumos").select("id", { count: "exact", head: true }).eq("previsao_id", id);
  if ((count ?? 0) > 0 || p.status !== "aberta") throw new Error("Previsão já consumida não pode ser cancelada.");
  await removerTituloPrevisao(sb, p);
  await sb.from("previsoes_gasto").update({ status: "cancelada", saldo: 0, updated_at: new Date().toISOString() }).eq("id", id);
}

/** Edita uma previsão ainda sem consumo: valor, vencimento, OG, fornecedor, ciclo, centro de custo, descrição. */
export async function editarPrevisao(sb: SB, id: string, campos: Partial<NovaPrevisao>): Promise<void> {
  const { data: p } = await sb.from("previsoes_gasto").select("*").eq("id", id).maybeSingle();
  if (!p) throw new Error("Previsão não encontrada.");
  const { count } = await sb.from("previsoes_gasto_consumos").select("id", { count: "exact", head: true }).eq("previsao_id", id);
  if ((count ?? 0) > 0 || p.status !== "aberta") throw new Error("Previsão já consumida não pode ser editada.");
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["descricao", "data_vencimento", "pessoa_id", "ciclo_id", "centro_custo_id", "ano_safra_id", "observacao", "produtor_id", "empresa_id"] as const) {
    if (k in campos) upd[k] = (campos as Record<string, unknown>)[k] ?? null;
  }
  if (campos.valor != null) { if (!(Number(campos.valor) > 0)) throw new Error("Valor inválido."); upd.valor = Number(campos.valor); upd.saldo = Number(campos.valor); }
  if (campos.operacao_gerencial_id && campos.operacao_gerencial_id !== p.operacao_gerencial_id) {
    const { data: og } = await sb.from("operacoes_gerenciais").select("classificacao").eq("id", campos.operacao_gerencial_id).maybeSingle();
    if (!og) throw new Error("Operação Gerencial não encontrada.");
    upd.operacao_gerencial_id = campos.operacao_gerencial_id; upd.og_classificacao = og.classificacao;
  }
  const { error } = await sb.from("previsoes_gasto").update(upd).eq("id", id);
  if (error) throw error;
  // O título de previsão é refeito para levar OG/fornecedor/ciclo novos
  await removerTituloPrevisao(sb, p);
  const { data: atual } = await sb.from("previsoes_gasto").select("*").eq("id", id).single();
  await criarTituloPrevisao(sb, atual as PrevisaoRow);
}
