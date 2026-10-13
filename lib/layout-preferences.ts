export type LayoutMode = "current" | "new";
export type GridDensity = "comfortable" | "compact";
export const LAYOUT_EVENT = "arato-layout-change";
export const LAYOUT_KEY = "arato-layout";
export const DENSITY_KEY = "arato-grid-density";
export function validLayout(value: unknown): LayoutMode { return value === "new" ? "new" : "current"; }
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
export const LAYOUT_SCRIPT = `(${function bootstrap() {
  const root = document.documentElement;
  let layout = "current", density = "comfortable";
  try { layout = localStorage.getItem("arato-layout") || layout; density = localStorage.getItem("arato-grid-density") || density; } catch { /* Preferência local pode estar bloqueada. */ }
  // Operational chrome starts only after the authenticated client context is ready.
  root.dataset.layoutWorkspace = "false";
  root.dataset.layout = layout === "new" ? "new" : "current";
  root.dataset.gridDensity = density === "compact" ? "compact" : "comfortable";
}.toString()})();`;
