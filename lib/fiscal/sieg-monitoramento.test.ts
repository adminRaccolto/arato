import { test } from "node:test";
import assert from "node:assert/strict";
import { atualizarFalhas, documentosMonitorados, falhasParaTentar, janelaDaEmissao, type FalhaRodada } from "./sieg-monitoramento.ts";

test("documentos: lista configurada + cadastros, só dígitos, sem repetir e só CPF/CNPJ", () => {
  assert.deepEqual(documentosMonitorados(["495.675.351-91", "52076061000136"], ["52.076.061/0001-36", "09.494.971/0001-00", "", "123", null]),
    ["49567535191", "52076061000136", "09494971000100"]);
});

const f = (chave: string, erro = "erro"): FalhaRodada => ({ chave, tipo: "nfe", numero: "1", emitente: "X", destino: "52076061000136", emissao: "2026-11-09", erro });
const C1 = "1".repeat(44), C2 = "2".repeat(44), C3 = "3".repeat(44);

test("falhas: nova entra, repetida soma tentativa, gravada sai", () => {
  let l = atualizarFalhas([], [f(C1), f(C2)], [], "2026-11-10T10:00");
  assert.equal(l.length, 2);
  l = atualizarFalhas(l, [f(C1, "outro erro")], [C2], "2026-11-10T16:00");
  assert.deepEqual(l.map(x => [x.chave, x.tentativas, x.erro, x.primeira]), [[C1, 2, "outro erro", "2026-11-10T10:00"]]);
  l = atualizarFalhas(l, [f(C3)], [C1], "2026-11-11T10:00");
  assert.deepEqual(l.map(x => x.chave), [C3]);
});

test("tentar de novo: só nota com chave, emissão e destino válidos, menos tentativas primeiro", () => {
  const l = atualizarFalhas(atualizarFalhas([], [f(C1), f(C2)], [], "a"), [f(C1)], [], "b");
  const ruim = { ...f(C3), destino: "123" };
  const lista = falhasParaTentar([...l, { ...ruim, tentativas: 1, primeira: "a", ultima: "a" }], "nfe");
  assert.deepEqual(lista.map(x => x.chave), [C2, C1]);
  assert.equal(falhasParaTentar(l, "cte").length, 0);
  assert.deepEqual(janelaDaEmissao("2026-11-09T14:33:00-04:00"), { inicio: "2026-11-08T00:00:00.000Z", fim: "2026-11-10T23:59:59.999Z" });
});
