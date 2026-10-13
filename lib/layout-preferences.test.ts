import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { DENSITY_KEY, LAYOUT_KEY, LAYOUT_SCRIPT, isPublicLayout, preferenceKey, validDensity, validLayout } from "./layout-preferences";
import { NAV, type NavItem } from "./navigation";
import { activeDestination, canShowLink, modernNavigation } from "./modern-navigation";
function destinations(source: NavItem[]): Set<string> {
  const paths = new Set<string>();
  for (const item of source) {
    if (item.type !== "group") paths.add(item.path);
    else for (const child of item.children) {
      if (child.type === "subgroup") child.children.forEach(link => paths.add(link.path));
      else if (child.type !== "divider") paths.add(child.path);
    }
  }
  return paths;
}
test("novo menu conserva todos os destinos e as abas existentes", () => {
  const modernPaths = new Set(modernNavigation().flatMap(g => g.links.map(l => l.path)));
  for (const path of destinations(NAV)) assert.ok(modernPaths.has(path), path);
  assert.ok(modernPaths.has("/lavoura/execucao"));
  for (const group of modernNavigation()) assert.equal(new Set(group.links.map(l => l.id)).size, group.links.length);
});
test("permissões de grupo, módulo, subgrupo e plano permanecem respeitadas", () => {
  const groups = modernNavigation([{ id: "financeiro", type: "group", minStep: 3, label: "Financeiro", children: [{ id: "tesouraria", type: "subgroup", label: "Tesouraria", moduleId: "fin_tesouraria", children: [{ id: "mutuo", label: "Mútuo", path: "/financeiro/tesouraria/mutuo", moduleId: "fin_contratos" }] }] }]);
  const link = groups[0].links[0];
  assert.equal(link.minStep, 3);
  assert.deepEqual(link.modules, ["fin_tesouraria", "fin_contratos"]);
  assert.equal(canShowLink(link, () => true, () => true), true);
  assert.equal(canShowLink(link, m => m !== "fin_tesouraria", () => true), false);
  assert.equal(canShowLink(link, () => true, m => m !== "fin_contratos", true), false);
  assert.equal(canShowLink(link, () => false, () => true), false);
});
test("destino ativo considera todos os parâmetros relevantes", () => {
  assert.equal(activeDestination("/financeiro?aba=fluxo&origem=empresa", "/financeiro", "aba=fluxo&origem=produtor"), false);
  assert.equal(activeDestination("/financeiro?aba=fluxo&origem=empresa", "/financeiro", "origem=empresa&aba=fluxo&extra=1"), true);
  assert.equal(activeDestination("/cadastros?tab=produtores", "/cadastros", "tab=empresas"), false);
});
test("layout, cores e densidade são preferências independentes; padrão é Atual", () => {
  assert.equal(validLayout("new"), "new");
  for (const v of [null, "constructor", "dark", "default"]) assert.equal(validLayout(v), "current");
  assert.equal(validDensity("compact"), "compact");
  assert.equal(validDensity("new"), "comfortable");
  assert.equal(preferenceKey(" Cliente@Exemplo.com ", LAYOUT_KEY), "arato-layout:cliente@exemplo.com");
  assert.notEqual(preferenceKey("outro@exemplo.com", LAYOUT_KEY), preferenceKey("cliente@exemplo.com", LAYOUT_KEY));
});
test("bootstrap restaura o modelo antes da hidratação e suporta storage bloqueado", () => {
  for (const blocked of [false, true]) {
    const root = { dataset: {} as Record<string, string> };
    runInNewContext(LAYOUT_SCRIPT, { document: { documentElement: root }, localStorage: { getItem: (key: string) => { if (blocked) throw new Error("blocked"); return key === LAYOUT_KEY ? "new" : key === DENSITY_KEY ? "compact" : null; } } });
    assert.equal(root.dataset.layout, blocked ? "current" : "new");
    assert.equal(root.dataset.gridDensity, blocked ? "comfortable" : "compact");
  }
});
test("documentos e páginas públicas não recebem a navegação operacional", () => {
  assert.equal(isPublicLayout("/comercial/faturamento/danfe/123"), true);
  assert.equal(isPublicLayout("/auth/nova-senha"), true);
  assert.equal(isPublicLayout("/login"), true);
  assert.equal(isPublicLayout("/cadastros"), false);
  assert.equal(isPublicLayout("/financeiro/pagar"), false);
});
