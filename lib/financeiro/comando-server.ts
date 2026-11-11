import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { validarReferenciasCliente } from "../api-referencias";

export async function comandoTitulo(sb: SupabaseClient, req: Request, tabela: "lancamentos" | "empresa_lancamentos", id: string, acao: string, dados: Record<string, unknown>) {
  const { data: titulo, error: leituraErro } = await sb.from(tabela).select("id,fazenda_id").eq("id", id).maybeSingle();
  if (leituraErro) throw leituraErro;
  if (!titulo) throw new Error("Título não encontrado.");
  await validarReferenciasCliente(sb, titulo.fazenda_id, [
    { tabela: "contas_bancarias", id: dados.conta_bancaria as string | null },
    { tabela: "pessoas", id: dados.pessoa_id as string | null },
    { tabela: "operacoes_gerenciais", id: dados.operacao_gerencial_id as string | null, global: true },
    { tabela: "anos_safra", id: dados.ano_safra_id as string | null },
    { tabela: "ciclos", id: dados.ciclo_id as string | null },
  ]);
  const requisicao = req.headers.get("x-arato-requisicao") || randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requisicao)) throw new Error("Identificação da operação inválida.");
  const { data, error } = await sb.rpc("financeiro_comando_titulo", {
    p_tabela: tabela, p_id: id, p_acao: acao, p_dados: dados, p_requisicao: requisicao,
  });
  if (error) throw new Error(error.code === "PGRST202" ? "Execute a Seção 434 do supabase_migrations.sql antes de usar as novas baixas." : error.message);
  if (!data?.ok) throw new Error("A operação financeira não foi confirmada.");
  return data;
}
