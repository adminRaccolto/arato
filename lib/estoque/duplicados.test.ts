import { test } from "node:test";
import assert from "node:assert/strict";
import { gruposDuplicados, semelhanca, type InsumoCadastro } from "./duplicados.ts";

const ins = (id: string, nome: string, extra: Partial<InsumoCadastro> = {}): InsumoCadastro => ({ id, nome, tipo: "insumo", ativo: true, ...extra });

test("duplicado exato: acento, caixa e pontuação não contam", () => {
  const g = gruposDuplicados([ins("1", "GUNTER PRO 360"), ins("2", "Gunter  pro-360"), ins("3", "ROUNDUP")]);
  assert.equal(g.length, 1);
  assert.equal(g[0].criterio, "exato");
  assert.deepEqual(g[0].itens.map(i => i.id), ["1", "2"]);
});

test("semelhança: caso real SEM SOJA CG 7681 × SEMENTE SOJA CG 7681 × SEM: SOJA 7681", () => {
  const g = gruposDuplicados([ins("a", "SEM SOJA CG 7681"), ins("b", "SEMENTE SOJA CG 7681"), ins("c", "SEM: SOJA 7681"), ins("d", "SEMENTE SOJA CG 7682")]);
  const sim = g.find(x => x.criterio === "semelhanca");
  assert.ok(sim);
  assert.deepEqual(sim!.itens.map(i => i.id).sort(), ["a", "b", "c"]);
  // variedade diferente (7682) nunca entra
  assert.ok(!g.some(x => x.itens.some(i => i.id === "d")));
});

test("semelhança não junta produtos com concentração diferente nem tipo diferente", () => {
  const g = gruposDuplicados([ins("1", "GLIFOSATO 480"), ins("2", "GLIFOSATO 720"), ins("3", "SOJA", { tipo: "produto" }), ins("4", "SOJA")]);
  assert.equal(g.length, 0);
});

test("grupo já revisado fica de fora; inativo não conta", () => {
  assert.equal(gruposDuplicados([ins("1", "UREIA"), ins("2", "ureia")], new Set(["ureia"])).length, 0);
  assert.equal(gruposDuplicados([ins("1", "UREIA"), ins("2", "ureia", { ativo: false })]).length, 0);
});


test("semelhança de texto", () => {
  assert.ok(semelhanca("gunter pro 360", "gunter pro360") > 0.85);
  assert.ok(semelhanca("glifosato", "roundup") < 0.3);
});
