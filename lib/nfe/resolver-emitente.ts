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
  // Config fiscal é do titular (CPF/CNPJ), não da fazenda — existindo em QUALQUER fazenda do
  // mesmo cliente já é suficiente pra usar essa chave (buscarConfEmitente resolve o resto,
  // inclusive puxando o certificado de onde ele estiver dentro da mesma conta).
  const { data: fazAtual } = await adm.from("fazendas").select("conta_id").eq("id", fazendaId).maybeSingle();
  let fazendaIdsConta = [fazendaId];
  if (fazAtual?.conta_id) {
    const { data: fzsConta } = await adm.from("fazendas").select("id").eq("conta_id", fazAtual.conta_id);
    if (fzsConta && fzsConta.length > 0) fazendaIdsConta = fzsConta.map((f: { id: string }) => f.id);
  }
  const { data: cfg } = await adm
    .from("configuracoes_modulo")
    .select("modulo")
    .in("fazenda_id", fazendaIdsConta)
    .eq("modulo", key)
    .limit(1)
    .maybeSingle();
  return cfg ? key : null;
}

// Resolve qual config fiscal usar pra uma fazenda QUANDO NÃO HÁ CPF/CNPJ explícito — funciona
// como default/sugestão. fazendas.cpf_cnpj_fiscal é o titular fiscal PADRÃO dessa fazenda
// (Entidade Contábil por Fazenda) — usa ele primeiro; cai no "qualquer um" só se a fazenda não
// tiver isso configurado.
//
// Certificado/CPF/CNPJ é do PRODUTOR (ou da empresa), não da fazenda — a fazenda é só onde ele
// opera. Achado real 23/09/2026: essa função buscava o módulo fiscal só na fazenda recebida; uma
// fazenda sem cadastro fiscal PRÓPRIO (só o card por-IE, que não carrega CPF nem certificado)
// caía no fallback, que também só olhava a mesma fazenda — sem achar nada, mesmo o emitente já
// tendo certificado configurado (repetidas vezes) em OUTRA fazenda do mesmo cliente. E pior: o
// fallback conseguia "achar" e devolver a própria chave por-IE (bate no LIKE "fiscal_pf_%") como
// se fosse a chave principal — buscarConfEmitente() não sabe re-mesclar uma chave por-IE já
// resolvida, então o resultado ficava sem CPF/certificado nenhum. Agora resolve pela CONTA
// inteira (qualquer fazenda do mesmo cliente) e nunca escolhe uma chave por-IE como principal.
export async function resolverModuloKeyFiscal(
  fazendaId: string,
  adm: SupabaseClient = sb(),
): Promise<string> {
  const { data: faz } = await adm
    .from("fazendas")
    .select("cpf_cnpj_fiscal, entidade_contabil, conta_id")
    .eq("id", fazendaId)
    .maybeSingle();

  let fazendaIdsConta = [fazendaId];
  if (faz?.conta_id) {
    const { data: fzsConta } = await adm.from("fazendas").select("id").eq("conta_id", faz.conta_id);
    if (fzsConta && fzsConta.length > 0) fazendaIdsConta = fzsConta.map((f: { id: string }) => f.id);
  }

  const digits = ((faz?.cpf_cnpj_fiscal as string | null) ?? "").replace(/\D/g, "");
  if (digits) {
    const prefix = faz?.entidade_contabil === "pj" || digits.length === 14 ? "fiscal_emp_" : "fiscal_pf_";
    const key = `${prefix}${digits}`;
    // Fazenda certa primeiro (config local pode ter dados específicos dela); senão qualquer
    // fazenda da conta que já tenha esse emitente configurado.
    const { data: cfgLocal } = await adm
      .from("configuracoes_modulo").select("modulo").eq("fazenda_id", fazendaId).eq("modulo", key).maybeSingle();
    if (cfgLocal) return key;
    const { data: cfgConta } = await adm
      .from("configuracoes_modulo").select("modulo").in("fazenda_id", fazendaIdsConta).eq("modulo", key).limit(1).maybeSingle();
    if (cfgConta) return key;
  }

  // "Qualquer módulo fiscal válido" — nunca uma chave por-IE (__ie_): essa é um detalhe interno
  // que buscarConfEmitente() mescla sozinho a partir da chave BASE; devolvida direto, fica sem
  // CPF/CNPJ/certificado nenhum (todos esses campos só existem na config base).
  const { data: cfgs } = await adm
    .from("configuracoes_modulo")
    .select("modulo, fazenda_id")
    .in("fazenda_id", fazendaIdsConta)
    .or("modulo.like.fiscal_emp_%,modulo.like.fiscal_pf_%,modulo.eq.fiscal")
    .not("modulo", "like", "%__ie_%");
  if (cfgs && cfgs.length > 0) {
    // Prefere um módulo cadastrado na própria fazenda pedida; senão qualquer um da conta.
    const local = cfgs.find((c: { fazenda_id: string }) => c.fazenda_id === fazendaId);
    return (local ?? cfgs[0]).modulo;
  }
  return "";
}

// Combina os três, nessa ordem de preferência: ID do produtor (mais confiável — não depende de uma
// busca assíncrona no cliente ter terminado a tempo, como o CPF/CNPJ digitado dependia; achado real:
// clicar em "Emitir Devolução" antes da busca de CPF terminar mandava o hint vazio e caía no titular
// padrão da fazenda, uma pessoa errada), CPF/CNPJ explícito, e por último o default da fazenda.
export async function resolverModuloKey(
  fazendaId: string,
  cpfCnpjHint?: string | null,
  adm: SupabaseClient = sb(),
  produtorIdHint?: string | null,
): Promise<string> {
  if (produtorIdHint) {
    const { data: prod } = await adm.from("produtores").select("cpf_cnpj").eq("id", produtorIdHint).maybeSingle();
    if (prod?.cpf_cnpj) {
      const porId = await resolverModuloKeyPorCpfCnpj(fazendaId, prod.cpf_cnpj, adm);
      if (porId) return porId;
    }
  }
  if (cpfCnpjHint) {
    const porCpf = await resolverModuloKeyPorCpfCnpj(fazendaId, cpfCnpjHint, adm);
    if (porCpf) return porCpf;
  }
  return resolverModuloKeyFiscal(fazendaId, adm);
}
