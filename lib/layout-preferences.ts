export type GridDensity = "comfortable" | "compact";
export const DENSITY_EVENT = "arato-grid-density-change";
export const DENSITY_KEY = "arato-grid-density";
const RETIRED_LAYOUT_KEYS = ["arato-layout", "arato-layout-explicit-choice", "arato-operational-ui-v1"];
export function validDensity(value: unknown): GridDensity { return value === "compact" ? "compact" : "comfortable"; }
export function isPublicLayout(path: string) {
  return ["/login", "/auth", "/cadastro", "/planos", "/pagamento", "/offline", "/alterar-senha", "/comercial/faturamento/danfe"].some(p => path === p || path.startsWith(p + "/"));
}
export function isClientLayout(path: string) {
  return !isPublicLayout(path) && !["/seletor-cliente", "/raccotlo", "/admin", "/bpo/seletor-cliente", "/bpo/admin", "/campo"].some(p => path === p || path.startsWith(p + "/"));
}
export function hasClientWorkspace(path: string, email: string | null, account: string | null, farm: string | null) {
  return isClientLayout(path) && !!email && !!(account || farm);
}
export function preferenceKey(email: string | null, key: string) { return email ? `${key}:${email.trim().toLowerCase()}` : key; }

/** Retired layout choices cannot override the original interface or other appearance preferences. */
export function retireAlternativeLayout(storage: Pick<Storage, "removeItem">, email: string | null) {
  try {
    for (const key of RETIRED_LAYOUT_KEYS) {
      storage.removeItem(key);
      if (email) storage.removeItem(preferenceKey(email, key));
    }
  } catch { /* The original interface is enforced even when storage is blocked. */ }
}
export const LAYOUT_SCRIPT = `(${function bootstrap() {
  const root = document.documentElement;
  root.dataset.layout = "current";
  root.dataset.layoutWorkspace = "false";
  let density = "comfortable";
  try { density = localStorage.getItem("arato-grid-density") || density; } catch { /* Storage may be blocked. */ }
  try {
    for (const key of ["arato-layout", "arato-layout-explicit-choice", "arato-operational-ui-v1"]) localStorage.removeItem(key);
  } catch { /* Saved layouts are never used, even when they cannot be removed. */ }
  root.dataset.gridDensity = density === "compact" ? "compact" : "comfortable";
}.toString()})();`;
