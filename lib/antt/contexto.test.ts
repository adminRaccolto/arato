import assert from "node:assert/strict";
import { test } from "node:test";
import { ambienteCiotDaOperacao, emitenteCiot } from "./contexto";

test("MDF-e de produção continua em produção quando a aba antiga envia homologação", () => {
  assert.equal(ambienteCiotDaOperacao({ ambienteMdfe: "producao", ambienteSolicitado: "homologacao" }), "producao");
});
test("MDF-e usa o ambiente salvo mesmo sem ambiente no navegador", () => {
  assert.equal(ambienteCiotDaOperacao({ origem: "mdfe", ambienteMdfe: "producao" }), "producao");
});
test("MDF-e configurado para testes não usa produção solicitada pelo navegador", () => {
  assert.equal(ambienteCiotDaOperacao({ ambienteMdfe: "homologacao", ambienteSolicitado: "producao" }), "homologacao");
});
test("configuração ausente ou inválida não escolhe homologação silenciosamente", () => {
  assert.equal(ambienteCiotDaOperacao({ ambienteSolicitado: "homologacao" }), null);
  assert.equal(ambienteCiotDaOperacao({ ambienteMdfe: "", ambienteSolicitado: "producao" }), null);
});
test("CT-e mantém seu ambiente próprio, independente do MDF-e", () => {
  assert.equal(ambienteCiotDaOperacao({ origem: "cte", ambienteMdfe: "homologacao", ambienteSolicitado: "producao" }), "producao");
  assert.equal(ambienteCiotDaOperacao({ origem: "cte", ambienteMdfe: "producao", ambienteSolicitado: "homologacao" }), "homologacao");
});
test("transportadora selecionada vence o CT-e e a primeira empresa da conta", () => {
  assert.equal(emitenteCiot("21.016.959/0001-95", "11111111000111", "22222222000122"), "21016959000195");
});
test("emitente automático segue o CT-e; sem CT-e usa a empresa padrão", () => {
  assert.equal(emitenteCiot(null, "21.016.959/0001-95", "22222222000122"), "21016959000195");
  assert.equal(emitenteCiot(null, null, "21.016.959/0001-95"), "21016959000195");
});
