import test from "node:test";
import assert from "node:assert/strict";
import { grupoPermite } from "./permissoes-grupo";

test("usuário sem grupo vê tudo, menos configuração", () => {
  assert.equal(grupoPermite({}, "estoque"), true);
  assert.equal(grupoPermite(null, "folha", "reprocessar"), true);
  assert.equal(grupoPermite({}, "conf_fiscal"), false);
});

test("grupo legado: ausente ou lista vazia = liberado (como era)", () => {
  const g = { estoque: [], custos: ["visualizar"], contratos: ["exportar"], lavoura_pulv: "nenhum" };
  assert.equal(grupoPermite(g, "estoque"), true);
  assert.equal(grupoPermite(g, "folha"), true);
  assert.equal(grupoPermite(g, "custos"), true);
  assert.equal(grupoPermite(g, "custos", "exportar"), false);
  assert.equal(grupoPermite(g, "contratos"), false);
  assert.equal(grupoPermite(g, "lavoura_pulv"), false);
});

test("grupo v2: vale o que está marcado; módulo novo entra bloqueado", () => {
  const g = { _v2: true, estoque: ["visualizar", "criar"], folha: [] };
  assert.equal(grupoPermite(g, "estoque"), true);
  assert.equal(grupoPermite(g, "estoque", "excluir"), false);
  assert.equal(grupoPermite(g, "folha"), false);
  assert.equal(grupoPermite(g, "maquinas"), false, "módulo que o grupo ainda não marcou");
});

test("configuração segue 'não marcado = sem acesso' nos dois formatos", () => {
  assert.equal(grupoPermite({ conf_fiscal: [] }, "conf_fiscal"), false);
  assert.equal(grupoPermite({ _v2: true, conf_fiscal: ["visualizar"] }, "conf_fiscal"), true);
  assert.equal(grupoPermite({ conf_fiscal: "leitura" }, "conf_fiscal"), true);
  assert.equal(grupoPermite({ conf_fiscal: "leitura" }, "conf_fiscal", "editar"), false);
});
