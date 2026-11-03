import { test } from "node:test";
import assert from "node:assert/strict";
import { alvosFolha } from "./alvos-acesso.ts";

test("operação desconhecida é recusada", () => {
  assert.equal(alvosFolha("apagar_tudo", {}), null);
});

test("operação por id confere o registro, não só a fazenda informada", () => {
  const a = alvosFolha("delete_folha", { id: "folha-1", fazenda_id: "faz-1" })!;
  assert.deepEqual(a.folhas, ["folha-1"]);
  assert.deepEqual(a.fazendas, ["faz-1"]);
  assert.deepEqual(alvosFolha("excluir_premiacao", { id: "p" })!.premiacoes, ["p"]);
  assert.deepEqual(alvosFolha("cancelar_adiantamento", { id: "a" })!.adiantamentos, ["a"]);
});

test("linhas da folha: confere folhas e funcionários, sem repetir nem aceitar vazio", () => {
  const a = alvosFolha("insert_funcionarios", { rows: [{ folha_id: "f", funcionario_id: "x" }, { folha_id: "f", funcionario_id: null }] })!;
  assert.deepEqual(a.folhas, ["f"]);
  assert.deepEqual(a.funcionarios, ["x"]);
});

test("listas e referências da folha", () => {
  assert.deepEqual(alvosFolha("listar_folhas", { fazenda_ids: ["a", "b"] })!.fazendas, ["a", "b"]);
  const u = alvosFolha("upsert_folha", { fazenda_id: "a", empresa_id: "e", produtor_id: null })!;
  assert.deepEqual([u.fazendas, u.empresas, u.produtores], [["a"], ["e"], []]);
});
