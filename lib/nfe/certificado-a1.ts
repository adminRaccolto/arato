import forge from "node-forge";
import { X509Certificate } from "node:crypto";
import { documentoDoCertificado, certificadoDoTitular } from "./identidade-certificado.ts";
import { pfxParaPem, type PemPair } from "./signer.ts";

export const ERRO_CERTIFICADO_A1 = "Não foi possível abrir o certificado A1 com a senha informada. Confira a senha do arquivo .pfx/.p12 e envie o certificado novamente.";
export const ERRO_CERTIFICADOS_CONSULTA = "Nenhum dos certificados A1 desta conta pôde ser aberto com a senha salva. Reenvie um certificado com a senha correta em Configurações → Parâmetros → Fiscal → Certificado Digital e tente consultar a IE novamente.";

/** Valida a senha antes de permitir que o upload substitua o certificado atual. */
export function validarCertificadoA1(buffer: Buffer, senha: string, opcoes: {documento?:string; agora?:Date} = {}) {
  let pem: PemPair;
  try {pem=pfxParaPem(buffer,senha);} catch {throw new Error(ERRO_CERTIFICADO_A1);}
  const certificado=forge.pki.certificateFromPem(pem.cert);
  const agora=opcoes.agora ?? new Date();
  if(agora < certificado.validity.notBefore) throw new Error("O certificado A1 ainda não entrou em validade.");
  if(agora >= certificado.validity.notAfter) throw new Error("O certificado A1 está vencido. Renove o certificado deste titular.");
  const documento=documentoDoCertificado(certificado);
  if(opcoes.documento && (!documento || !certificadoDoTitular(documento,opcoes.documento)))
    throw new Error("O CPF/CNPJ do certificado A1 não corresponde ao titular selecionado.");
  return {pem,documento,vencimento:certificado.validity.notAfter.toISOString().slice(0,10),
    validoDe:certificado.validity.notBefore.toISOString(),validoAte:certificado.validity.notAfter.toISOString(),
    fingerprint:new X509Certificate(pem.cert).fingerprint256.replace(/:/g,"").toLowerCase(),serial:certificado.serialNumber};
}

export interface CandidatoCertificadoA1 {
  fazendaId: string;
  caminho: string;
  senha: string;
}

const caminhoValido = (c?: string) => !!c && !c.startsWith("http") && /\.(pfx|p12)$/i.test(c);

/**
 * Certificados que servem para a consulta cadastral: qualquer um válido do cliente, os da fazenda pedida primeiro.
 * Não depende de quem é o emitente. Um caminho sem senha da mesma configuração não é um par utilizável.
 */
export function candidatosParaConsulta(
  modulos: { fazenda_id: string; modulo: string; config: Record<string, string> | null }[],
  _envios: { config: Record<string, string> | null }[],
  fazendaId: string,
): CandidatoCertificadoA1[] {
  const lista: CandidatoCertificadoA1[] = [];
  for (const m of modulos) {
    const senha = m.config?.cert_a1_senha;
    if (!senha) continue;
    const caminho = caminhoValido(m.config?.cert_a1_path) ? m.config!.cert_a1_path : undefined;
    if (caminho) lista.push({ fazendaId: m.fazenda_id, caminho, senha });
  }
  return [...lista.filter(c => c.fazendaId === fazendaId), ...lista.filter(c => c.fazendaId !== fazendaId)];
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
