import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { comTravaDaFolha, TRAVA_TENTATIVAS, type Reserva } from "./trava-previsoes.ts";

const semEspera = async () => {};

test("reserva, executa e libera", async () => {
  const passos: string[] = [];
  const r = await comTravaDaFolha(async () => "reservada", async () => passos.push("liberou"), async () => { passos.push("rodou"); return 7; }, semEspera);
  assert.equal(r, 7);
  assert.deepEqual(passos, ["rodou", "liberou"]);
});

test("ocupada espera a outra terminar e depois roda", async () => {
  const fila: Reserva[] = ["ocupada", "ocupada", "reservada"];
  let rodou = 0;
  await comTravaDaFolha(async () => fila.shift()!, async () => {}, async () => { rodou++; }, semEspera);
  assert.equal(rodou, 1);
  assert.equal(fila.length, 0);
});

test("erro na execução ainda libera a folha", async () => {
  let liberou = false;
  await assert.rejects(comTravaDaFolha(async () => "reservada", async () => { liberou = true; }, async () => { throw new Error("x"); }, semEspera), /x/);
  assert.equal(liberou, true);
});

test("sempre ocupada desiste com aviso, sem rodar", async () => {
  let n = 0, rodou = false;
  await assert.rejects(comTravaDaFolha(async () => { n++; return "ocupada"; }, async () => {}, async () => { rodou = true; }, semEspera), /sendo atualizada/);
  assert.equal(n, TRAVA_TENTATIVAS);
  assert.equal(rodou, false);
});

test("sem a coluna no banco, roda sem trava e sem liberar", async () => {
  let liberou = false, rodou = false;
  await comTravaDaFolha(async () => "sem_coluna", async () => { liberou = true; }, async () => { rodou = true; }, semEspera);
  assert.equal(rodou, true);
  assert.equal(liberou, false);
});

test("abrir a lista de folhas nunca refaz previsões", () => {
  const src = readFileSync("app/api/folha/salvar/route.ts", "utf8");
  const ini = src.indexOf('operacao === "listar_folhas"');
  const fim = src.indexOf('operacao === "upsert_folha"');
  assert.ok(ini > 0 && fim > ini);
  assert.doesNotMatch(src.slice(ini, fim), /sincronizarPrevisoesFolha/);
});
