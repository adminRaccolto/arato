import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { DENSITY_KEY, LAYOUT_CHOICE_KEY, LAYOUT_KEY, LAYOUT_SCRIPT, OPERATIONAL_UI_KEY, hasClientWorkspace, isClientLayout, isPublicLayout, preferenceKey, savedLayout, validDensity, validLayout } from "./layout-preferences";
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
    assert.equal(root.dataset.layoutWorkspace, "false");
  }
});
test("primeiro acesso e ativação automática anterior conservam o modelo atual", () => {
  for (const migrated of [false, true]) {
    const root = { dataset: {} as Record<string, string> };
    runInNewContext(LAYOUT_SCRIPT, { document: { documentElement: root }, localStorage: { getItem: (key: string) => key === OPERATIONAL_UI_KEY ? migrated ? "1" : null : key === LAYOUT_KEY && migrated ? "new" : null } });
    assert.equal(root.dataset.layout, "current");
    assert.equal(root.dataset.layoutWorkspace, "false");
  }
});
test("escolha explícita é respeitada antes da hidratação, inclusive depois do rollout automático", () => {
  for (const choice of ["new", "current"]) {
    const root = { dataset: {} as Record<string, string> };
    runInNewContext(LAYOUT_SCRIPT, { document: { documentElement: root }, localStorage: { getItem: (key: string) => key === LAYOUT_CHOICE_KEY ? choice : key === OPERATIONAL_UI_KEY ? "1" : key === LAYOUT_KEY ? "new" : null } });
    assert.equal(root.dataset.layout, choice);
  }
});
test("ativação automática e densidade compacta não representam escolha do usuário", () => {
  const email = "cliente@exemplo.com";
  const values = new Map([[preferenceKey(email, OPERATIONAL_UI_KEY), "1"], [preferenceKey(email, LAYOUT_KEY), "new"], [preferenceKey(email, DENSITY_KEY), "compact"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null };
  assert.equal(savedLayout(storage, email), "current");
  values.set(preferenceKey(email, LAYOUT_CHOICE_KEY), "new");
  assert.equal(savedLayout(storage, email), "new");
  values.set(preferenceKey(email, LAYOUT_CHOICE_KEY), "current");
  assert.equal(savedLayout(storage, email), "current");
});
test("a escolha de um usuário não ativa o novo modelo para outro", () => {
  const first = "primeiro@exemplo.com", second = "segundo@exemplo.com";
  const values = new Map([[LAYOUT_CHOICE_KEY, "new"], [LAYOUT_KEY, "new"], [preferenceKey(first, LAYOUT_CHOICE_KEY), "new"]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null };
  assert.equal(savedLayout(storage, first), "new");
  assert.equal(savedLayout(storage, second), "current");
});
test("uma escolha manual anterior à ativação automática permanece válida", () => {
  const email = "legado@exemplo.com";
  assert.equal(savedLayout({ getItem: key => key === preferenceKey(email, LAYOUT_KEY) ? "new" : null }, email), "new");
});
test("seleção e gestão interna usam o layout original mesmo com cliente anterior selecionado", () => {
  for (const path of ["/seletor-cliente", "/raccotlo", "/admin", "/admin/clientes", "/bpo/seletor-cliente", "/bpo/admin", "/campo", "/login"]) {
    assert.equal(isClientLayout(path), false, path);
    assert.equal(hasClientWorkspace(path, "gestor@exemplo.com", "conta-anterior", "fazenda-anterior"), false, path);
  }
});
test("navegação exige contexto autenticado de cliente e reaparece ao entrar no ambiente", () => {
  assert.equal(hasClientWorkspace("/financeiro/pagar", null, "conta", "fazenda"), false);
  assert.equal(hasClientWorkspace("/financeiro/pagar", "cliente@exemplo.com", null, null), false);
  assert.equal(hasClientWorkspace("/financeiro/pagar", "cliente@exemplo.com", "conta", null), true);
  assert.equal(hasClientWorkspace("/cadastros", "cliente@exemplo.com", null, "fazenda"), true);
});
test("documentos e páginas públicas não recebem a navegação operacional", () => {
  assert.equal(isPublicLayout("/comercial/faturamento/danfe/123"), true);
  assert.equal(isPublicLayout("/auth/nova-senha"), true);
  assert.equal(isPublicLayout("/login"), true);
  assert.equal(isPublicLayout("/cadastros"), false);
  assert.equal(isPublicLayout("/financeiro/pagar"), false);
});
