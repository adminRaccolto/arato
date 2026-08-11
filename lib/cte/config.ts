import { createClient } from "@supabase/supabase-js";

export interface ConfigCTeResolvida {
  cteConfig: Record<string, string>;
  cteConfigEncontrada: boolean;
  fiscalConfig: Record<string, string>;
  cteModulo: string;
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

async function buscarConfig(fazendaId: string, modulo: string): Promise<Record<string, string> | null> {
  const { data } = await sb()
    .from("configuracoes_modulo")
    .select("config")
    .eq("fazenda_id", fazendaId)
    .eq("modulo", modulo)
    .maybeSingle();

  return (data?.config as Record<string, string> | undefined) ?? null;
}

async function buscarPrimeiroCtePorEmitente(fazendaId: string) {
  const { data } = await sb()
    .from("configuracoes_modulo")
    .select("modulo, config")
    .eq("fazenda_id", fazendaId)
    .like("modulo", "cte_emp_%");

  return (data ?? []).find(row => row.modulo.replace("cte_emp_", "").length > 0) ?? null;
}

async function resolverCertificadoPorMeta(
  fazendaId: string,
  fiscalConfig: Record<string, string>,
  emitenteDigits: string,
): Promise<Record<string, string>> {
  const certPath = fiscalConfig.cert_a1_path ?? "";
  const certPathValido = certPath && !certPath.startsWith("http") && /\.(pfx|p12)$/i.test(certPath);
  if (certPathValido) return fiscalConfig;

  const { data: certRows } = await sb()
    .from("configuracoes_modulo")
    .select("config")
    .eq("fazenda_id", fazendaId)
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

export async function resolverConfigCTe(
  fazendaId: string,
  emitenteCnpj?: string | null,
): Promise<ConfigCTeResolvida | null> {
  let emitenteDigits = somenteDigitos(emitenteCnpj);
  let cteModulo = emitenteDigits ? `cte_emp_${emitenteDigits}` : "cte";
  let cteConfig = await buscarConfig(fazendaId, cteModulo);
  let cteConfigEncontrada = !!cteConfig;

  if (!cteConfig && !emitenteDigits) {
    const primeiro = await buscarPrimeiroCtePorEmitente(fazendaId);
    if (primeiro) {
      cteModulo = primeiro.modulo;
      cteConfig = (primeiro.config as Record<string, string> | undefined) ?? {};
      cteConfigEncontrada = true;
      emitenteDigits = somenteDigitos(cteModulo.replace("cte_emp_", ""));
    }
  }

  if (!cteConfig && emitenteDigits) {
    cteConfig = {};
  }

  if (!cteConfig) {
    cteModulo = "cte";
    cteConfig = await buscarConfig(fazendaId, cteModulo);
    cteConfigEncontrada = !!cteConfig;
    emitenteDigits = somenteDigitos(cteConfig?.cpf_cnpj_emitente ?? emitenteCnpj);
  }

  if (!cteConfig) return null;

  const fiscalModulo = emitenteDigits
    ? moduloFiscalPorDocumento(emitenteDigits)
    : (cteConfig.modulo_fiscal_ref ?? "fiscal");

  const fiscalConfigBase =
    await buscarConfig(fazendaId, fiscalModulo)
    ?? await buscarConfig(fazendaId, cteConfig.modulo_fiscal_ref ?? "fiscal")
    ?? {};

  const fiscalConfig = await resolverCertificadoPorMeta(fazendaId, fiscalConfigBase, emitenteDigits);

  return {
    cteConfig,
    cteConfigEncontrada,
    fiscalConfig,
    cteModulo,
    fiscalModulo,
    emitenteDigits,
  };
}
