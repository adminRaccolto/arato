import forge from "node-forge";
import { pfxParaPem, type PemPair } from "./signer";

export const ERRO_CERTIFICADO_A1 = "Não foi possível abrir o certificado A1 com a senha informada. Confira a senha do arquivo .pfx/.p12 e envie o certificado novamente.";
export const ERRO_CERTIFICADOS_CONSULTA = "Nenhum dos certificados A1 desta conta pôde ser aberto com a senha salva. Reenvie um certificado com a senha correta em Configurações → Parâmetros → Fiscal → Certificado Digital e tente consultar a IE novamente.";

/** Valida a senha antes de permitir que o upload substitua o certificado atual. */
export function validarCertificadoA1(buffer: Buffer, senha: string): { pem: PemPair; vencimento: string } {
  try {
    const pem = pfxParaPem(buffer, senha);
    const certificado = forge.pki.certificateFromPem(pem.cert);
    return { pem, vencimento: certificado.validity.notAfter.toISOString().slice(0, 10) };
  } catch {
    throw new Error(ERRO_CERTIFICADO_A1);
  }
}

export interface CandidatoCertificadoA1 {
  fazendaId: string;
  caminho: string;
  senha: string;
}

/** A consulta cadastral pode usar outro certificado da mesma conta se o primeiro falhar. */
export async function selecionarCertificadoA1ParaConsulta(
  candidatos: CandidatoCertificadoA1[],
  carregar: (caminho: string, fazendaId: string) => Promise<Buffer>,
): Promise<PemPair> {
  const tentados = new Set<string>();
  for (const candidato of candidatos) {
    if (!candidato.caminho || !candidato.senha) continue;
    const chave = JSON.stringify([candidato.fazendaId, candidato.caminho, candidato.senha]);
    if (tentados.has(chave)) continue;
    tentados.add(chave);
    try {
      const buffer = await carregar(candidato.caminho, candidato.fazendaId);
      return validarCertificadoA1(buffer, candidato.senha).pem;
    } catch {
      // Preserva o par arquivo/senha de cada configuração e tenta o próximo certificado.
    }
  }
  throw new Error(ERRO_CERTIFICADOS_CONSULTA);
}
