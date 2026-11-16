/**
 * Regras centrais de acesso para usuários Raccotlo.
 * Exceto gino@raccolto.com.br, o acesso é definido pelo role no banco (perfis.role).
 * Domínio @raccolto.com.br por si só NÃO concede mais privilégios automaticamente.
 */

export const RACCOTLO_SUPERADMIN = "gino@raccolto.com.br";

/** true = tem acesso ao painel admin (Gestão Arato) + seletor de clientes */
export function isRaccotloAdmin(role: string | null | undefined, email: string | null | undefined): boolean {
  if ((email ?? "").toLowerCase() === RACCOTLO_SUPERADMIN) return true;
  return role === "raccotlo" || role === "raccotlo_gestor";
}

/** true = qualquer nível de acesso raccotlo (inclui seletor e operacional) */
export function isRaccotloAny(role: string | null | undefined, email: string | null | undefined): boolean {
  if ((email ?? "").toLowerCase() === RACCOTLO_SUPERADMIN) return true;
  return role === "raccotlo" || role === "raccotlo_gestor" || role === "raccotlo_seletor" || role === "raccotlo_operacional";
}

export type HubAcesso = "raccotlo_gestor" | "raccotlo_operacional" | "raccotlo_seletor" | "client";

export const HUB_ACESSO_LABEL: Record<HubAcesso, string> = {
  raccotlo_gestor:      "Hub Completo (Gestão + Seletor)",
  raccotlo_operacional: "Operacional (Seletor + BI, sem Gestão)",
  raccotlo_seletor:     "Seletor de Clientes",
  client:               "Sem Acesso Interno",
};

/** Papéis que a tela de equipe pode dar. "raccotlo" (superadmin) nunca é atribuído por tela ou rota. */
export function ehHubAcessoValido(v: unknown): v is HubAcesso {
  return typeof v === "string" && v in HUB_ACESSO_LABEL;
}
