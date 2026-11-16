import test from "node:test";
import assert from "node:assert/strict";
import { ehHubAcessoValido, isRaccotloAdmin, isRaccotloAny, RACCOTLO_SUPERADMIN } from "./raccotlo-auth";

test("Gestão Arato: só superadmin, raccotlo e gestor", () => {
  assert.ok(isRaccotloAdmin(null, RACCOTLO_SUPERADMIN.toUpperCase()));
  assert.ok(isRaccotloAdmin("raccotlo_gestor", "x@y"));
  for (const r of ["raccotlo_operacional", "raccotlo_seletor", "bpo", "client", null]) assert.equal(isRaccotloAdmin(r, "x@y"), false, String(r));
});

test("equipe interna inclui seletor e operacional", () => {
  for (const r of ["raccotlo", "raccotlo_gestor", "raccotlo_seletor", "raccotlo_operacional"]) assert.ok(isRaccotloAny(r, "x@y"), r);
  assert.equal(isRaccotloAny("client", "x@y"), false);
});

test("tela de equipe só atribui os quatro papéis da lista (nunca superadmin)", () => {
  for (const r of ["raccotlo_gestor", "raccotlo_operacional", "raccotlo_seletor", "client"]) assert.ok(ehHubAcessoValido(r), r);
  for (const r of ["raccotlo", "admin", "bpo", "", null, 1]) assert.equal(ehHubAcessoValido(r), false, String(r));
});
