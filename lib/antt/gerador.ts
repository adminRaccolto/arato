import type { ApiResponseANTT } from "./ciot";

// Endpoint e contrato conferidos na GeradorCIOTShared.dll de PRODUÇÃO publicada em:
// https://appservices.antt.gov.br/pefServices/Downloads/GeradorCIOT_DLL.zip
// A reserva usa chave + Bearer; o certificado continua sendo usado na declaração PEF.
export const GERADOR_CIOT_PRODUCAO = "https://mtcuybq605.execute-api.sa-east-1.amazonaws.com/api-ciot-prd/GeradorCIOT";
type NumeroCiot = { CIOT: string };
let cacheToken: { chave: string; token: string; expira: number } | undefined;

function falha(mensagem: string, status: number, incerto: boolean): ApiResponseANTT<NumeroCiot> {
  return { Sucesso: false, Dados: null as unknown as NumeroCiot, Mensagem: mensagem, Erros: [mensagem], HttpStatus: status, ResultadoIncerto: incerto };
}

/** Mesmo fluxo da biblioteca oficial: POST /token {} e POST /gerar {cpfCnpj}. */
export async function gerarNumeroCiot(cpfCnpj: string): Promise<ApiResponseANTT<NumeroCiot>> {
  const chave = process.env.ANTT_GERADOR_CHAVE?.trim();
  if (!chave) return falha("Configure ANTT_GERADOR_CHAVE no servidor para utilizar o gerador oficial de CIOT em produção.", 503, false);

  let enviouGeracao = false;
  try {
    if (!cacheToken || cacheToken.chave !== chave || Date.now() >= cacheToken.expira) {
      const res = await fetch(`${GERADOR_CIOT_PRODUCAO}/token`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", chave },
        body: "{}", signal: AbortSignal.timeout(15000), cache: "no-store",
      });
      if (!res.ok) return falha(`O gerador oficial da ANTT recusou a autenticação (HTTP ${res.status}). Nenhuma reserva foi enviada.`, res.status, false);
      const raw = await res.json() as { token?: unknown };
      if (typeof raw.token !== "string" || !raw.token.trim()) return falha("O gerador oficial da ANTT não retornou um token válido. Nenhuma reserva foi enviada.", 502, false);
      cacheToken = { chave, token: raw.token, expira: Date.now() + 55 * 60 * 1000 };
    }
    enviouGeracao = true;
    // Não repetir automaticamente: mesmo sem resposta o número pode ter sido reservado.
    const res = await fetch(`${GERADOR_CIOT_PRODUCAO}/gerar`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${cacheToken.token}` },
      body: JSON.stringify({ cpfCnpj: cpfCnpj.replace(/\D/g, "") }),
      signal: AbortSignal.timeout(15000), cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 401) cacheToken = undefined;
      return falha(`O gerador oficial da ANTT retornou HTTP ${res.status} ao reservar o CIOT.${res.status >= 500 ? " Não foi possível confirmar o processamento; consulte o CIOT antes de tentar novamente." : ""}`, res.status, res.status >= 500);
    }
    const raw = await res.json() as Record<string, unknown> | string;
    const dados = typeof raw === "object" && raw ? (raw.Dados ?? raw.dados) as Record<string, unknown> | undefined : undefined;
    const numero = typeof raw === "string" ? raw : String(dados?.CIOT ?? dados?.ciot ?? "");
    if (!/^\d{12}$/.test(numero) || (typeof raw === "object" && raw?.Sucesso === false)) {
      return falha("O gerador oficial da ANTT não confirmou um número de CIOT válido. Consulte o CIOT antes de tentar novamente.", 502, true);
    }
    return { Sucesso: true, Dados: { CIOT: numero }, Mensagem: "CIOT reservado pelo gerador oficial da ANTT.", Erros: [] };
  } catch {
    return falha(enviouGeracao
      ? "Não foi possível obter a resposta do gerador oficial da ANTT. A reserva não foi confirmada; consulte o CIOT antes de tentar novamente."
      : "Não foi possível autenticar no gerador oficial da ANTT. Nenhuma reserva foi enviada.", 502, enviouGeracao);
  }
}
