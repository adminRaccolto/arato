// Certificado A1 do emitente (o mesmo da SEFAZ) para o mTLS da ANTT.
import { createClient } from "@supabase/supabase-js";
import { pfxParaPem } from "../nfe/signer";
import { resolverConfigMDFe } from "../mdfe/config";
import type { CertificadoPem } from "./ciot";

export async function carregarCertificadoEmitente(fazendaId: string, cnpjEmitente: string): Promise<{ pem: CertificadoPem; rntrc?: string; pagPix?: string } | { erro: string }> {
  const resolved = await resolverConfigMDFe(fazendaId, cnpjEmitente);
  if (!resolved) return { erro: "Configuração do emitente não encontrada — configure em Parâmetros → MDF-e/Fiscal." };
  const confg = resolved.mdfeConfig, fc = resolved.fiscalConfig;
  const certPath = confg.cert_a1_path ?? fc.cert_a1_path;
  const certSenha = confg.cert_a1_senha ?? fc.cert_a1_senha;
  if (!certPath || !certSenha) return { erro: "Certificado A1 do emitente não configurado (Parâmetros → Fiscal)." };
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: blob, error } = await db.storage.from("certificados").download(certPath);
  if (error || !blob) return { erro: `Certificado não encontrado: ${certPath}` };
  try {
    const pem = pfxParaPem(Buffer.from(await blob.arrayBuffer()), certSenha);
    return { pem: { cert: pem.certChain ?? pem.cert, key: pem.key }, rntrc: confg.rntrc, pagPix: confg.pag_pix };
  } catch (e) {
    return { erro: `Certificado inválido ou senha incorreta: ${e}` };
  }
}
