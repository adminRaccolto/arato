import { createClient } from "@supabase/supabase-js";

export interface ConfigCTeResolvida {
  cteConfig: Record<string, string>;
  cteConfigEncontrada: boolean;
  cteFazendaId: string;    // fazenda_id ONDE o registro cte_emp_* realmente está gravado (pode
                            // divergir da fazenda que está emitindo — ver comentário em resolverConfigCTe)
  cteContaId: string | null; // conta_id do cliente — chave real pra gravar de volta em TODAS as cópias
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

// ── Ids de todas as fazendas da mesma conta ────────────────────────────────
// Parâmetros de CT-e por emitente (cte_emp_*), Fiscal (fiscal_*) e Certificado A1 são da
// EMPRESA/cliente inteiro, não de uma fazenda específica — uma transportadora usada como
// emitente em mais de uma fazenda do mesmo cliente deve ter UM só registro, visível pra
// qualquer fazenda da conta (mesmo padrão já usado pra Fiscal em app/configuracoes/modulos).
// Achado real 28/09/2026 (mesma classe de bug corrigida no MDF-e): resolve o conta_id uma vez e
// lê/grava direto por ele (Seção 304 — conta_id populado e mantido em dia por trigger) em vez de
// montar a lista de fazendas toda vez.
async function contaIdDaFazenda(fazendaId: string): Promise<string | null> {
  const { data: faz } = await sb().from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  return (faz?.conta_id as string | null) ?? null;
}

async function idsFazendasDaConta(fazendaId: string): Promise<string[]> {
  const contaId = await contaIdDaFazenda(fazendaId);
  if (!contaId) return [fazendaId];
  const { data: fzs } = await sb().from("fazendas").select("id").eq("conta_id", contaId);
  return fzs?.length ? fzs.map(f => f.id as string) : [fazendaId];
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

// Busca um módulo em toda a conta, preferindo a fazenda que está emitindo agora (se ela mesma
// tiver o registro), senão pega o de qualquer outra fazenda da conta.
async function buscarConfigContaWide(
  idsConta: string[],
  fazendaPreferida: string,
  modulo: string,
): Promise<{ config: Record<string, string>; fazendaId: string } | null> {
  const contaId = await contaIdDaFazenda(fazendaPreferida);
  // Fallback duplo, por segurança: (1) sem conta_id resolvida (fazenda órfã); (2) a coluna
  // conta_id ainda não existe nesta base (Seção 304 não rodada) — a query por ela retorna erro
  // (42703 coluna inexistente) em vez de dado, e SEM checar o erro aqui "data" ficava sempre
  // vazio e a config nunca era achada (achado real 28/09/2026: cert A1 "não configurado" mesmo
  // com o certificado no banco, exatamente por causa disso). Sempre cai pro caminho antigo
  // (lista de fazendas da conta) se a busca por conta_id vier vazia OU der erro.
  let data: { fazenda_id: string; config: unknown }[] | null = null;
  if (contaId) {
    const r = await sb().from("configuracoes_modulo").select("fazenda_id, config").eq("conta_id", contaId).eq("modulo", modulo);
    if (!r.error && r.data && r.data.length > 0) data = r.data;
  }
  if (!data) {
    const r2 = await sb().from("configuracoes_modulo").select("fazenda_id, config").in("fazenda_id", idsConta).eq("modulo", modulo);
    data = r2.data;
  }

  if (!data || data.length === 0) return null;
  const preferido = data.find(r => r.fazenda_id === fazendaPreferida);
  const linha = preferido ?? data[0];
  return { config: (linha.config as Record<string, string>) ?? {}, fazendaId: linha.fazenda_id as string };
}

async function buscarPrimeiroCtePorEmitente(idsConta: string[]) {
  const { data } = await sb()
    .from("configuracoes_modulo")
    .select("modulo, config, fazenda_id")
    .in("fazenda_id", idsConta)
    .like("modulo", "cte_emp_%");

  return (data ?? []).find(row => row.modulo.replace("cte_emp_", "").length > 0) ?? null;
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

export async function resolverConfigCTe(
  fazendaId: string,
  emitenteCnpj?: string | null,
): Promise<ConfigCTeResolvida | null> {
  const [idsConta, cteContaId] = await Promise.all([idsFazendasDaConta(fazendaId), contaIdDaFazenda(fazendaId)]);

  let emitenteDigits = somenteDigitos(emitenteCnpj);
  let cteModulo = emitenteDigits ? `cte_emp_${emitenteDigits}` : "cte";
  let achado = await buscarConfigContaWide(idsConta, fazendaId, cteModulo);
  let cteConfig = achado?.config ?? null;
  let cteConfigEncontrada = !!cteConfig;
  let cteFazendaId = achado?.fazendaId ?? fazendaId;

  if (!cteConfig && !emitenteDigits) {
    const primeiro = await buscarPrimeiroCtePorEmitente(idsConta);
    if (primeiro) {
      cteModulo = primeiro.modulo;
      cteConfig = (primeiro.config as Record<string, string> | undefined) ?? {};
      cteConfigEncontrada = true;
      cteFazendaId = primeiro.fazenda_id as string;
      emitenteDigits = somenteDigitos(cteModulo.replace("cte_emp_", ""));
    }
  }

  if (!cteConfig && emitenteDigits) {
    cteConfig = {};
    cteFazendaId = fazendaId;
  }

  if (!cteConfig) {
    cteModulo = "cte";
    const achadoGenerico = await buscarConfigContaWide(idsConta, fazendaId, cteModulo);
    cteConfig = achadoGenerico?.config ?? null;
    cteConfigEncontrada = !!cteConfig;
    cteFazendaId = achadoGenerico?.fazendaId ?? fazendaId;
    emitenteDigits = somenteDigitos(cteConfig?.cpf_cnpj_emitente ?? emitenteCnpj);
  }

  if (!cteConfig) return null;

  const fiscalModulo = emitenteDigits
    ? moduloFiscalPorDocumento(emitenteDigits)
    : (cteConfig.modulo_fiscal_ref ?? "fiscal");

  const fiscalConfigBase =
    (await buscarConfigContaWide(idsConta, fazendaId, fiscalModulo))?.config
    ?? (await buscarConfigContaWide(idsConta, fazendaId, cteConfig.modulo_fiscal_ref ?? "fiscal"))?.config
    ?? {};

  const fiscalConfig = await resolverCertificadoPorMeta(idsConta, fiscalConfigBase, emitenteDigits);

  return {
    cteConfig,
    cteConfigEncontrada,
    cteFazendaId,
    cteContaId,
    fiscalConfig,
    cteModulo,
    fiscalModulo,
    emitenteDigits,
  };
}
