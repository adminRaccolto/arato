import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarCancelamentoNfse, decomporChaveNacional } from "./nfse-cancelamento.ts";

const nota = `<CompNfse><Nfse><InfNfse><Numero>123</Numero><DataEmissao>2026-10-01</DataEmissao></InfNfse></Nfse></CompNfse>`;

test("nota normal não é cancelada", () => {
  assert.equal(detectarCancelamentoNfse(nota).tipo, "nenhum");
});

test("ABRASF: bloco NfseCancelamento na nota", () => {
  const x = nota.replace("</Nfse>", "</Nfse><NfseCancelamento><Confirmacao><Pedido/><DataHora>2026-10-05T10:00:00</DataHora></Confirmacao></NfseCancelamento>");
  assert.equal(detectarCancelamentoNfse(x).tipo, "nota_cancelada");
});

test("ABRASF com namespace", () => {
  assert.equal(detectarCancelamentoNfse(`<ns2:CompNfse><ns2:NfseCancelamento Id="1"><ns2:Confirmacao/></ns2:NfseCancelamento></ns2:CompNfse>`).tipo, "nota_cancelada");
});

test("situação 2 ou texto Cancelada", () => {
  assert.equal(detectarCancelamentoNfse(`<Nfse><Situacao>2</Situacao></Nfse>`).tipo, "nota_cancelada");
  assert.equal(detectarCancelamentoNfse(`<Nfse><SituacaoNfse>Cancelada</SituacaoNfse></Nfse>`).tipo, "nota_cancelada");
  assert.equal(detectarCancelamentoNfse(`<Nfse><Situacao>1</Situacao></Nfse>`).tipo, "nenhum");
});

test("padrão nacional: evento 101101 com a chave", () => {
  const chave = "5106224" + "2" + "2" + "12345678000199" + "0000000000456" + "2610" + "123456789" + "0";
  const r = detectarCancelamentoNfse(`<pedRegEvento><infPedReg Id="PRE${chave}101101"><chNFSe>${chave}</chNFSe><e101101><xDesc>Cancelamento de NFS-e</xDesc></e101101></infPedReg></pedRegEvento>`);
  assert.equal(r.tipo, "evento");
  if (r.tipo === "evento") { assert.equal(r.prestadorCnpj, "12345678000199"); assert.equal(r.numero, "456"); }
});

test("chave nacional com CPF", () => {
  const chave = "NFS" + "5106224" + "2" + "1" + "00012345678901" + "0000000000007" + "2610" + "000000001" + "5";
  assert.deepEqual(decomporChaveNacional(chave), { prestadorCnpj: "12345678901", numero: "7" });
});
