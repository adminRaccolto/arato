import { test } from "node:test";
import assert from "node:assert/strict";
import { mensagemNumeroEmUso, numeroJaEmUso } from "./numero-em-uso.ts";

const NOSSA = "51261100006368435640559220000000321111111118";
const ANTIGA = "51200300006368435640559220000000321679821632";

test("539 é sempre número em uso", () => {
  assert.equal(numeroJaEmUso("539", "Rejeição", NOSSA), true);
});

test("duplicidade citando outra chave é número em uso", () => {
  assert.equal(numeroJaEmUso("204", `Duplicidade de NF-e [chNFe:${ANTIGA}]`, NOSSA), true);
  assert.equal(numeroJaEmUso("204", "Duplicidade de NF-e", NOSSA), true);
});

test("duplicidade da própria chave não troca de número: a nota pode já estar autorizada", () => {
  assert.equal(numeroJaEmUso("204", `Duplicidade de NF-e [chNFe:${NOSSA}]`, NOSSA), false);
});

test("outras rejeições não trocam de número", () => {
  assert.equal(numeroJaEmUso("301", "Uso denegado", NOSSA), false);
  assert.equal(numeroJaEmUso("100", "Autorizado", NOSSA), false);
});

test("a mensagem diz que a nota não foi emitida", () => {
  assert.match(mensagemNumeroEmUso(922, 32, `Duplicidade [chNFe:${ANTIGA}]`), /NÃO foi emitida/);
});
