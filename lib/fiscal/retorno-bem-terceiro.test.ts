import { test } from "node:test";
import assert from "node:assert/strict";
import { RETORNO_DE_REMESSA, ehRetornoBemTerceiro, finalidadeDoRetorno, naturezaDoRetorno } from "./retorno-bem-terceiro.ts";
import { cstExibicaoPorCfop } from "../nfe/cst-por-cfop.ts";

test("remessa de comodato recebida (6908) volta como 6909, sem CR e NF normal", () => {
  assert.equal(RETORNO_DE_REMESSA["6908"], "6909");
  assert.equal(RETORNO_DE_REMESSA["1554"], "5555");
  assert.equal(ehRetornoBemTerceiro("6909"), true);
  assert.equal(ehRetornoBemTerceiro("5202"), false);
  assert.equal(naturezaDoRetorno(["6909"]), "Retorno de bem recebido em comodato");
  assert.equal(naturezaDoRetorno(["6909", "5202"]), null);
  assert.equal(finalidadeDoRetorno(["6909"]), "1");
  assert.equal(finalidadeDoRetorno(["6555"]), "4");
  assert.equal(cstExibicaoPorCfop("6909"), "041");
  assert.equal(cstExibicaoPorCfop("5916"), "050");
});
