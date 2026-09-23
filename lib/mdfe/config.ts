/**
 * lib/mdfe/config.ts
 * Resolve a config de emissão de MDF-e (mdfe_emp_{CNPJ} + fiscal_emp_{CNPJ}/certificado) —
 * mesmo padrão já usado pro CT-e (lib/cte/config.ts): parâmetros de emitente são da conta
 * inteira, não de uma fazenda específica.
 */
import { createClient } from "@supabase/supabase-js";

export interface ConfigMDFeResolvida {
  mdfeConfig: Record<string, string>;
  mdfeConfigEncontrada: boolean;
  mdfeFazendaId: string;   // fazenda_id onde o registro mdfe_emp_* realmente está gravado
  fiscalConfig: Record<string, string>;
  mdfeModulo: string;
  fiscalModulo: string;
  emitenteDigits: string;
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function somenteDigitos(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function moduloFiscalPorDocumento(digits: string): string {
  return digits.length === 14 ? `fiscal_emp_${digits}` : `fiscal_pf_${digits}`;
}

async function idsFazendasDaConta(fazendaId: string): Promise<string[]> {
  const { data: faz } = await sb().from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  if (!faz?.conta_id) return [fazendaId];
  const { data: fzs } = await sb().from("fazendas").select("id").eq("conta_id", faz.conta_id);
  return fzs?.length ? fzs.map(f => f.id as string) : [fazendaId];
}

async function buscarConfigContaWide(
  idsConta: string[],
  fazendaPreferida: string,
  modulo: string,
): Promise<{ config: Record<string, string>; fazendaId: string } | null> {
  const { data } = await sb()
    .from("configuracoes_modulo")
    .select("fazenda_id, config")
    .in("fazenda_id", idsConta)
    .eq("modulo", modulo);

  if (!data || data.length === 0) return null;
  const preferido = data.find(r => r.fazenda_id === fazendaPreferida);
  const linha = preferido ?? data[0];
  return { config: (linha.config as Record<string, string>) ?? {}, fazendaId: linha.fazenda_id as string };
}

async function buscarPrimeiroMdfePorEmitente(idsConta: string[]) {
  const { data } = await sb()
    .from("configuracoes_modulo")
    .select("modulo, config, fazenda_id")
    .in("fazenda_id", idsConta)
    .like("modulo", "mdfe_emp_%");

  return (data ?? []).find(row => row.modulo.replace("mdfe_emp_", "").length > 0) ?? null;
}

async function resolverCertificadoPorMeta(
  idsConta: string[],
  fiscalConfig: Record<string, string>,
  emitenteDigits: string,
): Promise<Record<string, string>> {
  const certPath = fiscalConfig.cert_a1_path ?? "";
  const certPathValido = certPath && !certPath.startsWith("http") && /\.(pfx|p12)$/i.test(certPath);
  if (certPathValido) return fiscalConfig;

  const { data: certRows } = await sb()
    .from("configuracoes_modulo")
    .select("config")
    .in("fazenda_id", idsConta)
    .like("modulo", "certificado_a1_%");

  const certMeta = (certRows ?? []).find(row => {
    const cfg = row.config as Record<string, string>;
    return somenteDigitos(cfg?.cpf_cnpj) === emitenteDigits && cfg?.storage_path;
  });

  const cfg = certMeta?.config as Record<string, string> | undefined;
  if (!cfg?.storage_path) return fiscalConfig;

  return {
    ...fiscalConfig,
    cert_a1_path: cfg.storage_path,
    cert_a1_vencimento: cfg.data_vencimento ?? fiscalConfig.cert_a1_vencimento,
  };
}

export async function resolverConfigMDFe(
  fazendaId: string,
  emitenteCnpj?: string | null,
): Promise<ConfigMDFeResolvida | null> {
  const idsConta = await idsFazendasDaConta(fazendaId);

  let emitenteDigits = somenteDigitos(emitenteCnpj);
  let mdfeModulo = emitenteDigits ? `mdfe_emp_${emitenteDigits}` : "mdfe";
  let achado = await buscarConfigContaWide(idsConta, fazendaId, mdfeModulo);
  let mdfeConfig = achado?.config ?? null;
  let mdfeConfigEncontrada = !!mdfeConfig;
  let mdfeFazendaId = achado?.fazendaId ?? fazendaId;

  if (!mdfeConfig && !emitenteDigits) {
    const primeiro = await buscarPrimeiroMdfePorEmitente(idsConta);
    if (primeiro) {
      mdfeModulo = primeiro.modulo;
      mdfeConfig = (primeiro.config as Record<string, string> | undefined) ?? {};
      mdfeConfigEncontrada = true;
      mdfeFazendaId = primeiro.fazenda_id as string;
      emitenteDigits = somenteDigitos(mdfeModulo.replace("mdfe_emp_", ""));
    }
  }

  if (!mdfeConfig && emitenteDigits) {
    mdfeConfig = {};
    mdfeFazendaId = fazendaId;
  }

  if (!mdfeConfig) return null;

  const fiscalModulo = emitenteDigits
    ? moduloFiscalPorDocumento(emitenteDigits)
    : "fiscal";

  const fiscalConfigBase =
    (await buscarConfigContaWide(idsConta, fazendaId, fiscalModulo))?.config
    ?? {};

  const fiscalConfig = await resolverCertificadoPorMeta(idsConta, fiscalConfigBase, emitenteDigits);

  return {
    mdfeConfig,
    mdfeConfigEncontrada,
    mdfeFazendaId,
    fiscalConfig,
    mdfeModulo,
    fiscalModulo,
    emitenteDigits,
  };
}
