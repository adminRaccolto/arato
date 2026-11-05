/**
 * Telas de configuração: quem vê é decidido pelo grupo de usuários, não pelo plano. Diferente dos outros módulos, aqui
 * "não marcado" é sem acesso: grupo sem o módulo, com a lista vazia ou usuário sem grupo não entram. A equipe Raccolto
 * e o BPO têm acesso a tudo e nem passam por esta regra.
 */

export function ehConfiguracaoPorGrupo(modulo: string): boolean {
  return modulo.startsWith("conf_") && modulo !== "conf_raccotlo";
}

export function grupoLiberaConfiguracao(permissao: unknown): boolean {
  if (Array.isArray(permissao)) return permissao.includes("visualizar");
  return permissao === "leitura" || permissao === "escrita";
}

// Só as telas que existem apenas como configuração. Classificação e Regras de Rateio também abrem por Comercial e
// Resultados, para quem trabalha com notas e custos, e por isso não entram aqui.
const TELAS: [string, string][] = [
  ["/configuracoes/modulos", "conf_fiscal"],
  ["/configuracoes/operacoes-gerenciais", "conf_financeiro"],
  ["/configuracoes/plano-contas", "conf_financeiro"],
  ["/configuracoes/financeiras", "conf_financeiro"],
  ["/configuracoes/contabilidade", "conf_contabilidade"],
];

export function moduloDaTelaDeConfiguracao(caminho: string | null | undefined): string | null {
  if (!caminho) return null;
  return TELAS.find(([t]) => caminho === t || caminho.startsWith(`${t}/`))?.[1] ?? null;
}
