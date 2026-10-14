export type LayoutMode = "current" | "new";
export type GridDensity = "comfortable" | "compact";
export const LAYOUT_EVENT = "arato-layout-change";
export const LAYOUT_KEY = "arato-layout";
export const DENSITY_KEY = "arato-grid-density";
export const OPERATIONAL_UI_KEY = "arato-operational-ui-v1";
export const LAYOUT_CHOICE_KEY = "arato-layout-explicit-choice";
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
/** An automatic rollout marker is not consent. Preserve older manual choices only when no rollout ran. */
export function savedLayout(storage: Pick<Storage, "getItem">, email: string | null): LayoutMode {
  const choice = storage.getItem(preferenceKey(email, LAYOUT_CHOICE_KEY));
  if (choice === "new" || choice === "current") return choice;
  const autoActivated = storage.getItem(preferenceKey(email, OPERATIONAL_UI_KEY)) === "1";
  return !autoActivated && storage.getItem(preferenceKey(email, LAYOUT_KEY)) === "new" ? "new" : "current";
}
export const LAYOUT_SCRIPT = `(${function bootstrap() {
  const root = document.documentElement;
  let layout = "current", density = "comfortable";
  try {
    const choice = localStorage.getItem("arato-layout-explicit-choice");
    if (choice === "new" || choice === "current") layout = choice;
    else if (localStorage.getItem("arato-operational-ui-v1") !== "1" && localStorage.getItem("arato-layout") === "new") layout = "new";
    density = localStorage.getItem("arato-grid-density") || density;
  } catch { /* Preferência local pode estar bloqueada. */ }
  // Operational chrome starts only after the authenticated client context is ready.
  root.dataset.layoutWorkspace = "false";
  root.dataset.layout = layout === "new" ? "new" : "current";
  root.dataset.gridDensity = density === "compact" ? "compact" : "comfortable";
}.toString()})();`;
