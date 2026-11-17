import test from "node:test";
import assert from "node:assert/strict";
import { descricaoSemParcela, documentoDoTitulo, juntarObservacoes, observacaoDigitada, parcelaDoTitulo } from "./origem-titulos";

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

test("parcela do título e descrição sem o trecho de parcela", () => {
  assert.equal(parcelaDoTitulo({ num: 11, total: 46, descricao: "AZUS — PARCELAS MENSAIS" }), "11/46");
  assert.equal(parcelaDoTitulo({ descricao: "Prêmio Seguro FF SEGUROS — Máquinas/Equip. — Parcela 4/8" }), "4/8");
  assert.equal(parcelaDoTitulo({ descricao: "Consórcio BB — Cota 5636 — Parcela 72/93" }), "72/93");
  assert.equal(parcelaDoTitulo({ descricao: "Cédula Sicredi — Parcela 3 — Juros", totalCronograma: 5 }), "3/5");
  assert.equal(parcelaDoTitulo({ descricao: "Cédula Sicredi — Parcela 3 — Juros" }), "3");
  assert.equal(parcelaDoTitulo({ descricao: "Parcela 7/7 — FAZENDA ALVORADA 2" }), "7/7");
  assert.equal(parcelaDoTitulo({ descricao: "LIQUIDACAO DE PARCELA-C50237321" }), null);
  assert.equal(parcelaDoTitulo({ descricao: "NF 529 — ATACADO" }), null);
  assert.equal(descricaoSemParcela("Prêmio Seguro ALIANÇA DO BRASIL — Vida — Parcela 6/12"), "Prêmio Seguro ALIANÇA DO BRASIL — Vida");
  assert.equal(descricaoSemParcela("Cédula Sicredi — Parcela 3 — Juros"), "Cédula Sicredi — Juros");
  assert.equal(descricaoSemParcela("Parcela 7/7 — FAZENDA ALVORADA 2"), "FAZENDA ALVORADA 2");
  assert.equal(descricaoSemParcela("AZUS - AQUISIÇÃO APARTAMENTO - PARCELAS MENSAIS"), "AZUS - AQUISIÇÃO APARTAMENTO - PARCELAS MENSAIS");
});
