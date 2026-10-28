// Estorno de NF de entrada pelo navegador (/api/compras/estornar-nf), com a confirmação do estorno no cartão de crédito
// quando a NF foi paga no cartão: a rota responde CARTAO_CONFIRMAR, a janela pergunta como o estorno aconteceu e a
// chamada é refeita com a escolha. Usado pelas telas que estornam NF (Documentos Fiscais, NF de Produtos, ModalNf).
import { confirmarEstornoCartao, type TituloCartaoEstorno } from "../../components/financeiro/ConfirmarEstornoCartao";

export async function estornarNfComConfirmacao(nf_id: string): Promise<{ ok: boolean; cancelado?: boolean; error?: string; json?: Record<string, unknown> }> {
  const chamar = (extra: Record<string, unknown> = {}) => fetch("/api/compras/estornar-nf", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nf_id, ...extra }),
  });
  let res = await chamar();
  let json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (res.status === 409 && json.codigo === "CARTAO_CONFIRMAR") {
    const escolha = await confirmarEstornoCartao({
      titulos: (json.titulos ?? []) as TituloCartaoEstorno[], apenasRetirarSeAberta: true,
      contexto: "Esta NF foi paga no cartão de crédito. Título em fatura aberta sai da fatura junto com a NF; o que já foi cobrado pela operadora fica na fatura e o estorno entra como crédito ou reembolso.",
    });
    if (!escolha) return { ok: false, cancelado: true };
    res = await chamar({ cartao_estorno: { confirmado: true, ...(escolha.modo === "retirar" ? {} : { modo: escolha.modo, mes: escolha.mes, ano: escolha.ano, data_reembolso: escolha.data_reembolso }) } });
    json = await res.json().catch(() => ({})) as Record<string, unknown>;
  }
  if (!res.ok) return { ok: false, error: (json.error as string | undefined) ?? `Erro HTTP ${res.status}`, json };
  return { ok: true, json };
}
