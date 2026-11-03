import { test } from "node:test";
import assert from "node:assert/strict";
import { rotuloPagamentoFolha, tituloDaLinha } from "./titulo-linha.ts";

test("título novo vence o id antigo, que era o que deixava o título solto", () => {
  assert.equal(tituloDaLinha("apagado", "novo", new Set()), "novo");
});

test("id de título que não existe mais não é mantido", () => {
  assert.equal(tituloDaLinha("apagado", null, new Set()), null);
  assert.equal(tituloDaLinha(null, undefined, new Set()), null);
});

test("título existente continua ligado", () => {
  assert.equal(tituloDaLinha("t1", undefined, new Set(["t1"])), "t1");
});

test("folha só aparece como paga com todos os salários baixados", () => {
  assert.deepEqual(rotuloPagamentoFolha(12, 12), { txt: "Pago", quitada: true });
  assert.deepEqual(rotuloPagamentoFolha(12, 8), { txt: "Fechado · 8 de 12 pagos", quitada: false });
  assert.equal(rotuloPagamentoFolha(0, 0).quitada, false);
});
