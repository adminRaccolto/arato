/**
 * Resolve qual emitente fiscal (fiscal_pf_<cpf>/fiscal_emp_<cnpj>) usar numa emissão de NF-e,
 * quando quem chama não escolheu um explicitamente. Extraído de app/api/campo/transferencia-acao
 * (onde foi corrigido em 21/09/2026) para ser reaproveitado por qualquer rota que emita NF-e —
 * antes, cada tela reimplementava essa escolha à sua maneira, e a maioria pegava "o primeiro
 * módulo fiscal que aparecer" (`fiscalModulos[0]`), o que é arbitrário: uma fazenda com vários
 * emitentes configurados (vários produtores/empresas) podia cair ora num ora noutro a cada
 * emissão, inclusive num que nunca teve a senha do certificado preenchida — mesmo com o
 * certificado CERTO, do emitente CERTO daquela operação, configurado e visível na tela.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function sb(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Resolve moduloKey a partir de um CPF/CNPJ EXPLÍCITO — o titular fiscal real daquela operação
// (ex: o produtor dono da NF de origem numa devolução/remessa). Só retorna a chave se a config
// realmente existir pra essa fazenda — senão quem chamou cai no default (resolverModuloKeyFiscal).
export async function resolverModuloKeyPorCpfCnpj(
  fazendaId: string,
  cpfCnpj: string,
  adm: SupabaseClient = sb(),
): Promise<string | null> {
  const digits = cpfCnpj.replace(/\D/g, "");
  if (!digits) return null;
  const key = `${digits.length === 14 ? "fiscal_emp_" : "fiscal_pf_"}${digits}`;
  const { data: cfg } = await adm
    .from("configuracoes_modulo")
    .select("modulo")
    .eq("fazenda_id", fazendaId)
    .eq("modulo", key)
    .maybeSingle();
  return cfg ? key : null;
}

// Resolve qual config fiscal usar pra uma fazenda QUANDO NÃO HÁ CPF/CNPJ explícito — funciona
// como default/sugestão. fazendas.cpf_cnpj_fiscal é o titular fiscal PADRÃO dessa fazenda
// (Entidade Contábil por Fazenda) — usa ele primeiro; cai no "qualquer um" só se a fazenda não
// tiver isso configurado.
export async function resolverModuloKeyFiscal(
  fazendaId: string,
  adm: SupabaseClient = sb(),
): Promise<string> {
  const { data: faz } = await adm
    .from("fazendas")
    .select("cpf_cnpj_fiscal, entidade_contabil")
    .eq("id", fazendaId)
    .maybeSingle();
  const digits = ((faz?.cpf_cnpj_fiscal as string | null) ?? "").replace(/\D/g, "");
  if (digits) {
    const prefix = faz?.entidade_contabil === "pj" || digits.length === 14 ? "fiscal_emp_" : "fiscal_pf_";
    const key = `${prefix}${digits}`;
    const { data: cfg } = await adm
      .from("configuracoes_modulo")
      .select("modulo")
      .eq("fazenda_id", fazendaId)
      .eq("modulo", key)
      .maybeSingle();
    if (cfg) return key;
  }
  const { data: cfgs } = await adm
    .from("configuracoes_modulo")
    .select("modulo")
    .eq("fazenda_id", fazendaId)
    .or("modulo.like.fiscal_emp_%,modulo.like.fiscal_pf_%,modulo.eq.fiscal")
    .limit(1);
  return cfgs && cfgs.length > 0 ? cfgs[0].modulo : "";
}

// Combina os dois: prefere o CPF/CNPJ explícito quando informado e existir config pra ele;
// cai no default da fazenda caso contrário.
export async function resolverModuloKey(
  fazendaId: string,
  cpfCnpjHint?: string | null,
  adm: SupabaseClient = sb(),
): Promise<string> {
  if (cpfCnpjHint) {
    const porCpf = await resolverModuloKeyPorCpfCnpj(fazendaId, cpfCnpjHint, adm);
    if (porCpf) return porCpf;
  }
  return resolverModuloKeyFiscal(fazendaId, adm);
}
