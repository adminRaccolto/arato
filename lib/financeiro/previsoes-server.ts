// Previsão de Gastos — operações de banco (service_role). Usado por /api/financeiro/previsoes e pela folha.
// Regras de negócio puras ficam em ./previsoes.ts.
import { type Tolerancia } from "./previsoes";

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

async function comandoPrevisao(sb: SB, id: string | null, acao: string, dados: Record<string, unknown>, usuario: string | null = null, requisicao: string | null = null) {
  const { data, error } = await sb.rpc("previsoes_comando_atomico", { p_id: id, p_acao: acao, p_dados: dados, p_usuario: usuario, p_requisicao: requisicao });
  if (error) throw new Error(error.code === "PGRST202" ? "Execute a Seção 435 do supabase_migrations.sql para atualizar previsões com segurança." : error.message);
  if (!data?.ok) throw new Error("A operação da previsão não foi confirmada.");
  return data;
}

export async function criarTituloPrevisao(sb: SB, p: PrevisaoRow): Promise<string | null> {
  return (await comandoPrevisao(sb, p.id, "sincronizar", {})).lancamento_id;
}
export async function sincronizarTituloPrevisao(sb: SB, p: PrevisaoRow): Promise<void> {
  await comandoPrevisao(sb, p.id, "sincronizar", {});
}
export async function criarPrevisoes(sb: SB, linhas: NovaPrevisao[], userId: string | null, extraTitulo: Record<string, unknown> = {}, requisicao = crypto.randomUUID()): Promise<PrevisaoRow[]> {
  if (Object.keys(extraTitulo).length) throw new Error("Informe os dados do título na previsão de origem.");
  return (await comandoPrevisao(sb, null, "criar", { linhas }, userId, requisicao)).linhas;
}
export type ConsumoInput = {
  previsao_id: string; valor: number; lancamento_id?: string | null; emp_lancamento_id?: string | null;
  nf_entrada_id?: string | null; origem: "cp_manual" | "nf_entrada" | "folha" | "efetivar_cp";
  userId?: string | null; campos_titulo?: Record<string, unknown>;
};
export async function consumirPrevisao(sb: SB, c: ConsumoInput): Promise<{ status: string; diferenca: number }> {
  const { userId, ...dados } = c;
  return comandoPrevisao(sb, c.previsao_id, "consumir", dados, userId);
}
export async function decidirPrevisao(sb: SB, id: string, decisao: "efetivada" | "saldo", userId: string | null): Promise<void> {
  await comandoPrevisao(sb, id, "decidir", { decisao }, userId);
}
export async function tratarVencida(sb: SB, id: string, acao: { tipo: "nova_data"; data: string } | { tipo: "efetivar" }, userId: string | null): Promise<void> {
  await comandoPrevisao(sb, id, "vencida", acao, userId);
}
export async function cancelarPrevisao(sb: SB, id: string): Promise<void> {
  await comandoPrevisao(sb, id, "cancelar", {});
}
export async function editarPrevisao(sb: SB, id: string, campos: Partial<NovaPrevisao>): Promise<void> {
  await comandoPrevisao(sb, id, "editar", campos);
}
