import { NAV, NAV_MODULE_MAP, type NavItem, type NavLink } from "./navigation";
export interface ModernLink extends NavLink { section: string; source: string; minStep: number; modules: string[]; }
export interface ModernGroup { id: string; label: string; icon: string; links: ModernLink[]; }
const GROUPS = [
  ["inicio", "Início", "home"], ["producao", "Produção", "leaf"], ["compras", "Compras", "cart"],
  ["estoque", "Estoque", "box"], ["financeiro", "Financeiro", "wallet"], ["comercial", "Comercial e contratos", "file"],
  ["fiscal", "Fiscal e documentos", "receipt"], ["resultados", "Resultados e relatórios", "chart"],
  ["cadastros", "Cadastros", "people"], ["configuracoes", "Configurações", "settings"], ["ajuda", "Ajuda", "help"],
];
function destination(link: ModernLink): string {
  const path = link.path.split("?")[0];
  if (path === "/") return "inicio";
  if (path.startsWith("/compras") || path === "/financeiro/pendencias-nf" || path === "/relatorios/pedidos-compra") return "compras";
  if (path.startsWith("/estoque") && path !== "/estoque/romaneio-entrada") return "estoque";
  if (path.startsWith("/lavoura") || path.startsWith("/algodao") || path === "/mapa" || path === "/estoque/romaneio-entrada") return "producao";
  if (path === "/financeiro/empresas") return "resultados";
  if (path === "/relatorios/manutencao") return "producao";
  if (path.startsWith("/financeiro") || path.startsWith("/empresas") || path === "/relatorios/financeiro-classificacao") return "financeiro";
  if (path.startsWith("/fiscal") || ["/lcdpr", "/ibs", "/parcerias", "/transporte/cte", "/transporte/mdfe"].includes(path)) return "fiscal";
  if (path.startsWith("/contratos") || path.startsWith("/comercial") || path.startsWith("/expedicao") || path.startsWith("/transporte") || path.startsWith("/balanca")) return "comercial";
  if (path.startsWith("/cadastros")) return "cadastros";
  if (path.startsWith("/configuracoes") || path.startsWith("/admin")) return "configuracoes";
  if (["/learning", "/suporte", "/atualizacoes"].includes(path)) return "ajuda";
  return link.source === "resultados" || path.startsWith("/relatorios") ? "resultados" : link.source;
}
export function modernNavigation(source: NavItem[] = NAV): ModernGroup[] {
  const groups = GROUPS.map(([id, label, icon]) => ({ id, label, icon, links: [] as ModernLink[] }));
  const add = (link: NavLink, parent: NavItem, section: string, modules: string[] = []) => {
    const value: ModernLink = { ...link, section, source: parent.id, minStep: parent.minStep ?? 0, modules: [...modules, ...(link.moduleId ? [link.moduleId] : [])] };
    const group = groups.find(g => g.id === destination(value)) ?? groups.find(g => g.id === "resultados")!;
    // Preserve distinct query-string views; identical destinations only need one menu entry.
    if (!group.links.some(l => l.path === value.path && l.modules.join() === value.modules.join())) group.links.push(value);
  };
  for (const parent of source) {
    if (parent.type !== "group") { add(parent, parent, ""); continue; }
    let section = "";
    for (const child of parent.children) {
      if (child.type === "divider") section = child.label.replace(/^Cadastros\s*[—–-]\s*/, "");
      else if (child.type === "subgroup") child.children.forEach(link => add(link, parent, child.label, child.moduleId ? [child.moduleId] : []));
      else add(child, parent, section);
    }
  }
  if (source === NAV) {
    const finance = groups.find(g => g.id === "financeiro")!;
    finance.links.unshift({ id: "modern-cash-flow", label: "Fluxo de Caixa", path: "/financeiro/relatorios", source: "financeiro", section: "Fluxo de Caixa", minStep: 6, modules: ["fin_relatorios"] });
    finance.links.push({ id: "modern-dfc", label: "DFC — Demonstrativo", path: "/financeiro/relatorios?aba=dfc", source: "financeiro", section: "Fluxo de Caixa", minStep: 6, modules: ["fin_relatorios"] });
    for (const link of finance.links) if (link.id === "fin-fluxo-prev" || link.id === "fin-fluxo-real") link.section = "Fluxo de Caixa";
    const priority = ["Contas a Pagar / Receber", "Fluxo de Caixa", "Tesouraria", "Complemento Financeiro", "Cartões de Crédito", "Relatórios Financeiros"];
    finance.links.sort((a, b) => { const rank = (s: string) => { const i = priority.indexOf(s); return i < 0 ? 99 : i; }; return rank(a.section) - rank(b.section); });
    const production = groups.find(g => g.id === "producao")!;
    for (const link of [{ id: "modern-production-overview", label: "Safras e operações", path: "/lavoura" }, { id: "modern-production-tasks", label: "Tarefas de campo", path: "/lavoura/execucao" }]) {
      if (!production.links.some(l => l.path === link.path)) production.links.unshift({ ...link, section: "Planejamento", source: "producao", minStep: 3, modules: [] });
    }
  }
  return groups.filter(g => g.links.length);
}
export function canShowLink(link: ModernLink, allowed: (module: string) => boolean, plan: (module: string) => boolean, staff = false) {
  if (!link.modules.every(m => allowed(m) && plan(m))) return false;
  const gates = NAV_MODULE_MAP[link.source];
  return staff || !gates || gates.some(allowed);
}
export function activeDestination(href: string, pathname: string, query: string): boolean {
  const [path, search = ""] = href.split("?");
  if (path !== pathname) return false;
  const wanted = new URLSearchParams(search), actual = new URLSearchParams(query);
  return [...wanted].every(([key, value]) => actual.get(key) === value);
}
export function menuBreadcrumb(pathname: string, query: string): string[] {
  const groups = modernNavigation();
  // Prefer the most specific matching query, then the plain destination.
  for (const group of groups) {
    const candidates = group.links.filter(link => activeDestination(link.path, pathname, query)).sort((a, b) => b.path.length - a.path.length);
    if (candidates.length) return [group.label, candidates[0].label];
  }
  return [];
}
