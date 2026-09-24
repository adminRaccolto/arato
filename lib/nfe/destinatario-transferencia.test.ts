import assert from "node:assert/strict";
import { test } from "node:test";
import { montarDestinatarioTransferencia as montar } from "./destinatario-transferencia";

const cpf = "12345678909";
const produtor = { id: "produtor-a", nome: "Produtor A", cpf_cnpj: "123.456.789-09" };
const ie = { produtor_id: produtor.id, inscricao_estadual: "13.123.456-7", estado: "MT", logradouro: "Estrada A", municipio: "Tapurah", municipio_ibge: "5108006" };
const configOutro = { cpf_cnpj_emitente: "98765432100", razao_social: "Produtor B", ie_emitente: "999999999", logradouro: "Estrada B", uf_emitente: "GO" };

test("CPF e IE selecionados determinam nome e endereço, sem usar o titular padrão", () => {
  const dest = montar(cpf, "131234567", configOutro, [produtor], [ie]);
  assert.equal(dest.nome, "Produtor A");
  assert.equal(dest.cpf_cnpj, cpf);
  assert.equal(dest.logradouro, "Estrada A");
  assert.equal(dest.uf, "MT");
  assert.equal(dest.cep, undefined);
});

test("não usa nome de outro CPF quando o produtor não está cadastrado", () => {
  assert.throws(() => montar(cpf, "131234567", configOutro, [], []), /nome do titular/);
});

test("não usa endereço de outra IE nem inscrição pertencente a outro produtor", () => {
  assert.throws(() => montar(cpf, "999999999", configOutro, [produtor], [ie]), /IE de destino/);
  assert.throws(() => montar(cpf, "131234567", configOutro, [produtor], [{ ...ie, produtor_id: "outro" }]), /IE de destino/);
});

test("configuração fiscal é suficiente quando CPF e IE coincidem", () => {
  const config = { ...configOutro, cpf_cnpj_emitente: "123.456.789-09", razao_social: "Produtor A", ie_emitente: "13.123.456-7" };
  assert.equal(montar(cpf, "131234567", config, [], []).nome, "Produtor A");
  assert.throws(() => montar(cpf, "111111111", config, [], []), /IE de destino/);
});
