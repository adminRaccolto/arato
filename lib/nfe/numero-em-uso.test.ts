import { test } from "node:test";
import assert from "node:assert/strict";
import { maiorNumeroDaSerie, mensagemNumeroEmUso, numeroJaEmUso } from "./numero-em-uso.ts";

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

test("maior número usado considera só o mesmo documento e a mesma série", () => {
  const chaves = [
    "51261000001614596174559210000001521111111118", // CPF, série 921, nº 152
    "51261000001614596174559210000001311111111118", // CPF, série 921, nº 131
    "51261000001614596174559200000013271111111118", // CPF, série 920
    "51261000006368435640559210000009991111111118", // outro CPF
    null, "curta",
  ];
  assert.equal(maiorNumeroDaSerie(chaves, "016.145.961-74", 921), 152);
  assert.equal(maiorNumeroDaSerie(chaves, "01614596174", "920"), 1327);
  assert.equal(maiorNumeroDaSerie(chaves, "01614596174", 922), 0);
});
