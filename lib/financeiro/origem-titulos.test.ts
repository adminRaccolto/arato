import test from "node:test";
import assert from "node:assert/strict";
import { documentoDoTitulo, juntarObservacoes, observacaoDigitada } from "./origem-titulos";

test("observação da origem: tira o texto automático do SIEG e fica o que foi digitado", () => {
  assert.equal(observacaoDigitada("Re-importado via Sieg DFe em 29/09/2026 — IE: 132267128"), "");
  assert.equal(observacaoDigitada("Importado via Sieg DFe em 20/08/2026 — IE: 132267128\nA VISTA"), "A VISTA");
  assert.equal(observacaoDigitada("Importado via Sieg DFe em 21/09/2026 — Tomador: 17679842949 · IE tomador: 136859909"), "");
  assert.equal(observacaoDigitada("Importado via Sieg DFe em 03/10/2026 — IE: 1234567 | ⚠ CANCELADA PELO EMITENTE NA SEFAZ — verifique se precisa estornar."),
    "⚠ CANCELADA PELO EMITENTE NA SEFAZ — verifique se precisa estornar.");
  assert.equal(observacaoDigitada("PLACA: RAO4B64"), "PLACA: RAO4B64");
  assert.equal(observacaoDigitada(null), "");
});

test("observação exibida junta título e origem sem repetir", () => {
  assert.equal(juntarObservacoes("", "PARCELADO EM 4X NO CARTÃO"), "PARCELADO EM 4X NO CARTÃO");
  assert.equal(juntarObservacoes("Pagar via PIX", "PLACA: RAO4B64"), "Pagar via PIX · PLACA: RAO4B64");
  assert.equal(juntarObservacoes("Pagar via PIX", "Re-importado via Sieg DFe em 29/09/2026 — IE: 1"), "Pagar via PIX");
  assert.equal(juntarObservacoes("SAFRA", "SAFRA"), "SAFRA");
  assert.equal(juntarObservacoes(null, null), null);
});

test("nº do documento: fiscal → origem → gravado no título (nunca o identificador interno)", () => {
  assert.equal(documentoDoTitulo({ nfNumero: "64293", numeroDocumento: "X" }), "64293");
  assert.equal(documentoDoTitulo({ numeroOrigem: "PC-120", numeroDocumento: null }), "PC-120");
  assert.equal(documentoDoTitulo({ numeroDocumento: "517720268Q620000925" }), "517720268Q620000925");   // apólice
  assert.equal(documentoDoTitulo({ numeroDocumento: "f9a8b52c-709b-462c-87bf-67866bc1be9c" }), null);  // uuid do contrato de terra
  assert.equal(documentoDoTitulo({ numeroOrigem: "CCT-7", numeroDocumento: "f9a8b52c-709b-462c-87bf-67866bc1be9c" }), "CCT-7");
  assert.equal(documentoDoTitulo({}), null);
});
