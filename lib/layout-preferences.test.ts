import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { DENSITY_KEY, LAYOUT_SCRIPT, hasClientWorkspace, isClientLayout, isPublicLayout, preferenceKey, retireAlternativeLayout, validDensity } from "./layout-preferences";

const retiredKeys = ["arato-layout", "arato-layout-explicit-choice", "arato-operational-ui-v1"];
test("escolhas antigas nunca reativam o layout removido antes da hidratação", () => {
  for (const choice of ["new", "current", null]) {
    const root = { dataset: {} as Record<string, string> };
    const values = new Map<string, string>([[DENSITY_KEY, "compact"], ["arato-palette", "branco"]]);
    if (choice) for (const key of retiredKeys) values.set(key, choice);
    runInNewContext(LAYOUT_SCRIPT, { document: { documentElement: root }, localStorage: { getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) } });
    assert.equal(root.dataset.layout, "current");
    assert.equal(root.dataset.gridDensity, "compact");
    assert.equal(root.dataset.layoutWorkspace, "false");
    for (const key of retiredKeys) assert.equal(values.has(key), false);
    assert.equal(values.get("arato-palette"), "branco");
  }
});
test("armazenamento bloqueado mantém o layout Anterior e a densidade padrão", () => {
  const root = { dataset: {} as Record<string, string> };
  runInNewContext(LAYOUT_SCRIPT, { document: { documentElement: root }, localStorage: { getItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } } });
  assert.equal(root.dataset.layout, "current");
  assert.equal(root.dataset.gridDensity, "comfortable");
});
test("limpeza das escolhas antigas preserva densidade e cores globais e por usuário", () => {
  const email = "cliente@exemplo.com", other = "outro@exemplo.com";
  const values = new Map<string, string>([[DENSITY_KEY, "compact"], [preferenceKey(email, DENSITY_KEY), "compact"], ["arato-palette", "branco"], ["arato-mode", "dark"]]);
  for (const key of retiredKeys) {
    values.set(key, "new"); values.set(preferenceKey(email, key), "new"); values.set(preferenceKey(other, key), "new");
  }
  const storage = { removeItem: (key: string) => { values.delete(key); } };
  retireAlternativeLayout(storage, email);
  for (const key of retiredKeys) {
    assert.equal(values.has(key), false);
    assert.equal(values.has(preferenceKey(email, key)), false);
  }
  assert.equal(values.get(DENSITY_KEY), "compact");
  assert.equal(values.get(preferenceKey(email, DENSITY_KEY)), "compact");
  assert.equal(values.get("arato-palette"), "branco");
  assert.equal(values.get("arato-mode"), "dark");
  retireAlternativeLayout(storage, other);
  for (const key of retiredKeys) assert.equal(values.has(preferenceKey(other, key)), false);
});
test("falha ao apagar preferências antigas não bloqueia a inicialização", () => {
  assert.doesNotThrow(() => retireAlternativeLayout({ removeItem: () => { throw new Error("blocked"); } }, "cliente@exemplo.com"));
});
test("densidade é independente do layout e continua separada por usuário", () => {
  assert.equal(validDensity("compact"), "compact");
  for (const value of [null, "new", "comfortable", "constructor"]) assert.equal(validDensity(value), "comfortable");
  assert.equal(preferenceKey(" Cliente@Exemplo.com ", DENSITY_KEY), "arato-grid-density:cliente@exemplo.com");
  assert.notEqual(preferenceKey("outro@exemplo.com", DENSITY_KEY), preferenceKey("cliente@exemplo.com", DENSITY_KEY));
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
