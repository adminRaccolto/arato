import type { SupabaseClient } from "@supabase/supabase-js";

export type DadosAdiantamento = {
  fazenda_id: string;
  funcionario_id: string;
  data: string;
  valor: number;
  competencia_ref?: string | null;
  descricao?: string | null;
  tipo?: "salario" | "gratificacao";
  conta_bancaria?: string | null;
};
export type RequisicaoAdiantamento = { assinatura: string; id: string };

/** A mesma tentativa mantém a chave após falha de rede; mudar os dados inicia outra operação. */
export function requisicaoAdiantamento(
  anterior: RequisicaoAdiantamento | null,
  dados: DadosAdiantamento,
  gerarId: () => string = () => crypto.randomUUID(),
): RequisicaoAdiantamento {
  const assinatura = JSON.stringify([dados.fazenda_id, dados.funcionario_id, dados.data, Number(dados.valor),
    dados.competencia_ref || null, dados.descricao?.trim() || null, dados.tipo ?? "salario", dados.conta_bancaria || null]);
  return anterior?.assinatura === assinatura ? anterior : { assinatura, id: gerarId() };
}

export async function criarAdiantamentoFuncionario(
  db: SupabaseClient,
  dados: DadosAdiantamento,
  requisicao: string,
  usuario: string,
) {
  const { data, error } = await db.rpc("folha_criar_adiantamento", {
    p_dados: dados, p_requisicao: requisicao, p_usuario: usuario,
  });
  if (error) {
    if (["PGRST202", "42883", "42703", "PGRST204"].includes(error.code)) {
      throw new Error("Execute a Seção 432 do supabase_migrations.sql para ativar o lançamento rápido e a baixa segura dos adiantamentos.");
    }
    throw new Error(error.message);
  }
  return data;
}
