import type { SupabaseClient } from "@supabase/supabase-js";

type Referencia = { tabela: string; id: string | null | undefined; global?: boolean };
const comConta = new Set(["pessoas", "operacoes_gerenciais", "contas_bancarias"]);

/** As rotas com chave de serviço também precisam validar os destinos de suas relações. */
export async function validarReferenciasCliente(sb: SupabaseClient, fazendaId: string, referencias: Referencia[]): Promise<void> {
  const { data: origem, error } = await sb.from("fazendas").select("id,conta_id").eq("id", fazendaId).single();
  if (error || !origem) throw new Error("Fazenda da operação não encontrada.");
  for (const ref of referencias.filter(r => r.id)) {
    const colunas: string = comConta.has(ref.tabela) ? "id,fazenda_id,conta_id" : "id,fazenda_id";
    const { data: bruto, error: erro } = await sb.from(ref.tabela).select(colunas).eq("id", ref.id!).maybeSingle();
    const registro = bruto as { id: string; fazenda_id: string | null; conta_id?: string | null } | null;
    if (erro) throw erro;
    if (!registro) throw new Error("Uma referência da operação não foi encontrada. Recarregue os cadastros.");
    if (registro.fazenda_id === fazendaId || (origem.conta_id && registro.conta_id === origem.conta_id)) continue;
    if (ref.global && !registro.fazenda_id && !registro.conta_id) continue;
    if (registro.fazenda_id && origem.conta_id) {
      const { data: fazenda, error: erroFazenda } = await sb.from("fazendas").select("conta_id").eq("id", registro.fazenda_id).maybeSingle();
      if (erroFazenda) throw erroFazenda;
      if (fazenda?.conta_id === origem.conta_id) continue;
    }
    throw new Error("Uma referência da operação pertence a outro cliente.");
  }
}
