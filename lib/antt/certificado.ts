// Certificado A1 do emitente (o mesmo da SEFAZ) para o mTLS da ANTT.
import { createClient } from "../supabase-servidor";
import { carregarCertificadoEmitente as carregarA1 } from "../nfe/certificado-emitente";
import { resolverConfigMDFe } from "../mdfe/config";
import type { CertificadoPem } from "./ciot";

export async function carregarCertificadoEmitente(fazendaId: string, cnpjEmitente: string): Promise<{ pem: CertificadoPem; rntrc?: string; pagPix?: string; ambienteMdfe?: string } | { erro: string }> {
  const resolved = await resolverConfigMDFe(fazendaId, cnpjEmitente);
  if (!resolved) return { erro: "Configuração do emitente não encontrada — configure em Parâmetros → MDF-e/Fiscal." };
  const confg = resolved.mdfeConfig;
  try {
    const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const {pem}=await carregarA1(db,fazendaId,cnpjEmitente);
    return { pem: { cert: pem.certChain ?? pem.cert, key: pem.key }, rntrc: confg.rntrc, pagPix: confg.pag_pix, ambienteMdfe: confg.ambiente };
  } catch (e) {
    return {erro:e instanceof Error ? e.message : "Não foi possível validar o certificado A1."};
  }
}
