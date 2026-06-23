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

/** true = qualquer nível de acesso raccotlo (inclui seletor) */
export function isRaccotloAny(role: string | null | undefined, email: string | null | undefined): boolean {
  if ((email ?? "").toLowerCase() === RACCOTLO_SUPERADMIN) return true;
  return role === "raccotlo" || role === "raccotlo_gestor" || role === "raccotlo_seletor";
}

export type HubAcesso = "raccotlo_gestor" | "raccotlo_seletor" | "client";

export const HUB_ACESSO_LABEL: Record<HubAcesso, string> = {
  raccotlo_gestor:  "Hub Completo (Gestão + Seletor)",
  raccotlo_seletor: "Seletor de Clientes",
  client:           "Sem Acesso Interno",
};
