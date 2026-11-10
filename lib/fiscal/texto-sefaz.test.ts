import { test } from "node:test";
import assert from "node:assert/strict";
import { textoLivreSefaz } from "./texto-sefaz.ts";

test("quebra de linha, tabulação e espaços repetidos viram um espaço (SEFAZ 588)", () => {
  assert.equal(textoLivreSefaz("POR FAVOR CONSIDERAR A IE 214\nENDERECO  RODOVIA\r\nCEP 16204240\tBAIRRO \n"), "POR FAVOR CONSIDERAR A IE 214 ENDERECO RODOVIA CEP 16204240 BAIRRO");
  assert.equal(textoLivreSefaz(null), "");
});
