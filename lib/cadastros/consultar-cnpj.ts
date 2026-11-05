/**
 * Consulta pública de CNPJ: BrasilAPI e, se ela não responder, ReceitaWS, reempacotada no formato da BrasilAPI.
 * Roda só no servidor: a ReceitaWS não permite chamada direta do navegador.
 */

export type ResultadoCnpj =
  | { situacao: "ok"; dados: Record<string, unknown> }
  | { situacao: "nao_encontrado" | "invalido" | "indisponivel"; erro: string };

const INDISPONIVEL = "Falha ao consultar a Receita Federal: BrasilAPI e ReceitaWS indisponíveis no momento. Tente novamente em alguns minutos.";

export async function consultarCnpj(cnpj: string): Promise<ResultadoCnpj> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      // A BrasilAPI responde 403 a quem não se identifica; sem isso, toda consulta caía na ReceitaWS, que aceita bem menos.
      headers: { "User-Agent": "Arato-ERP/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) return { situacao: "ok", dados: { fonte: "brasilapi", ...(await r.json()) } };
    if (r.status === 404) return { situacao: "nao_encontrado", erro: "CNPJ não encontrado na Receita Federal" };
    if (r.status === 400) {
      const corpo = await r.json().catch(() => null) as { message?: string } | null;
      return { situacao: "invalido", erro: corpo?.message || "CNPJ inválido: confira os dígitos" };
    }
    // 429/5xx: tenta a segunda fonte antes de desistir
  } catch { /* segue para a segunda fonte */ }

  try {
    const r2 = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, { signal: AbortSignal.timeout(10000) });
    const d2 = await r2.json().catch(() => null) as Record<string, unknown> | null;
    if (r2.ok && d2 && d2.status !== "ERROR") {
      return {
        situacao: "ok",
        dados: {
          fonte: "receitaws",
          razao_social: d2.nome,
          logradouro: d2.logradouro,
          numero: d2.numero,
          complemento: d2.complemento,
          bairro: d2.bairro,
          municipio: d2.municipio,
          uf: d2.uf,
          cep: d2.cep,
          email: d2.email,
          descricao_porte: d2.porte,
          descricao_situacao_cadastral: d2.situacao,
          cnae_fiscal_descricao: (d2.atividade_principal as { text?: string }[] | undefined)?.[0]?.text,
        },
      };
    }
    if (d2?.status === "ERROR") return { situacao: "nao_encontrado", erro: (d2.message as string) || "CNPJ não encontrado na Receita Federal" };
  } catch { /* nenhuma das duas respondeu */ }

  return { situacao: "indisponivel", erro: INDISPONIVEL };
}
