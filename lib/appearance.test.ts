import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { PALETTES, APPEARANCE_SCRIPT, themeVariables, validMode, validPalette, resolveMode, type PaletteId } from "./appearance";

function luminance(hex: string) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = rgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function contrast(a: string, b: string) {
  const [min, max] = [luminance(a), luminance(b)].sort((a, b) => a - b);
  return (max + .05) / (min + .05);
}

test("todas as oito paletas mantêm contraste de texto, botões e campos nos dois modos", () => {
  for (const [id, palette] of Object.entries(PALETTES)) {
    for (const mode of ["light", "dark"] as const) {
      const c = palette[mode];
      for (const fg of ["text", "secondary", "muted"] as const) {
        for (const bg of ["surface", "input", "page", "hover"] as const) {
          assert.ok(contrast(c[fg], c[bg]) >= 4.5, `${id}/${mode}: ${fg}/${bg} = ${contrast(c[fg], c[bg])}`);
        }
      }
      assert.ok(contrast(c.primary, c.onPrimary) >= 4.5, `${id}/${mode}: botão`);
      assert.ok(contrast(c.control, c.input) >= 3, `${id}/${mode}: campo`);
      const vars = themeVariables(id as PaletteId, mode);
      for (const tone of ["success", "warning", "danger", "info", "violet"]) {
        assert.ok(contrast(vars[`--status-${tone}-text`], vars[`--status-${tone}-bg`]) >= 4.5, `${id}/${mode}: ${tone}`);
      }
    }
  }
});

test("preferências inválidas e nomes de propriedades do objeto não são aceitos como paletas", () => {
  for (const value of [null, "desconhecida", "__proto__", "constructor"]) assert.equal(validPalette(value), "default");
  assert.equal(validPalette("alto"), "alto");
  assert.equal(validMode("inválido"), "light");
});

test("Automático acompanha o dispositivo; escolhas explícitas prevalecem", () => {
  assert.equal(resolveMode("system", true), "dark");
  assert.equal(resolveMode("system", false), "light");
  assert.equal(resolveMode("light", true), "light");
  assert.equal(resolveMode("dark", false), "dark");
});

function bootstrap(palette: string | null, mode: string | null, prefersDark = false, blockedStorage = false) {
  const properties: Record<string, string> = {};
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "", setProperty: (name: string, value: string) => { properties[name] = value; } } };
  runInNewContext(APPEARANCE_SCRIPT, {
    document: { documentElement: root },
    localStorage: { getItem: (key: string) => { if (blockedStorage) throw new Error("Storage bloqueado"); return key === "arato-palette" ? palette : mode; } },
    matchMedia: () => ({ matches: prefersDark }),
  });
  return { root, properties };
}

test("script inicial restaura paleta, luminosidade e cores antes da hidratação", () => {
  const { root, properties } = bootstrap("safra", "system", true);
  assert.equal(root.dataset.palette, "safra");
  assert.equal(root.dataset.appearance, "system");
  assert.equal(root.dataset.theme, "dark");
  assert.equal(properties["--bg-page"], PALETTES.safra.dark.page);
  assert.equal(properties["--text-1"], PALETTES.safra.dark.text);
  assert.equal(root.style.colorScheme, "dark");
});

test("script inicial continua funcionando sem localStorage e com preferências antigas inválidas", () => {
  const blocked = bootstrap(null, null, false, true);
  assert.equal(blocked.root.dataset.theme, "light");
  assert.equal(blocked.properties["--bg-card"], PALETTES.default.light.surface);
  const invalid = bootstrap("__proto__", "noite");
  assert.equal(invalid.root.dataset.palette, "default");
  assert.equal(invalid.root.dataset.theme, "light");
});
