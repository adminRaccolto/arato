import test from "node:test";
import assert from "node:assert/strict";
import { camposDaReceita, camposPeloCep, mesmoMunicipio, situacaoInativa } from "./completar.ts";

test("cidade é comparada sem acento nem caixa", () => {
  assert.equal(mesmoMunicipio("LUCAS DO RIO VERDE", "Lucas do Rio Verde"), true);
  assert.equal(mesmoMunicipio("Sao Jose", "São José"), true);
  assert.equal(mesmoMunicipio("Sorriso", "Sinop"), false);
});

test("CEP preenche IBGE; cidade diferente é divergência e nada é gravado", () => {
  const cep = { ibge: "5107925", localidade: "Sorriso", uf: "MT", bairro: "Centro" };
  assert.deepEqual(camposPeloCep({ id: "1", municipio: "SORRISO", estado: "MT", bairro: "Jardim" }, cep), { campos: { municipio_ibge: "5107925" } });
  assert.deepEqual(camposPeloCep({ id: "1" }, cep), { campos: { municipio_ibge: "5107925", municipio: "Sorriso", estado: "MT", bairro: "Centro" } });
  assert.deepEqual(camposPeloCep({ id: "1", municipio: "Sinop" }, cep), { divergente: "CEP é de Sorriso, cadastro diz Sinop" });
  assert.equal(camposPeloCep({ id: "1" }, {}), null);
});

const receita = {
  razao_social: "ACME LTDA", logradouro: "RUA A", numero: "10", bairro: "CENTRO", municipio: "SINOP", uf: "MT", cep: "78550000",
  email: "CONTATO@ACME.COM", ddd_telefone_1: "6533334444", cnae_fiscal_descricao: "Comércio", descricao_porte: "ME", descricao_situacao_cadastral: "ATIVA",
};

test("cadastro vazio recebe tudo, com o estado da Receita mesmo que o padrão seja outro", () => {
  const c = camposDaReceita({ id: "1", estado: "SP" }, receita, "5107909");
  assert.equal(c.logradouro, "RUA A");
  assert.equal(c.cep, "78550-000");
  assert.equal(c.municipio, "SINOP");
  assert.equal(c.estado, "MT");
  assert.equal(c.municipio_ibge, "5107909");
  assert.equal(c.email, "contato@acme.com");
  assert.equal(c.telefone, "(65) 3333-4444");
  assert.equal(c.nome, "ACME LTDA");
});

test("o que já foi digitado nunca é trocado", () => {
  const c = camposDaReceita({ id: "1", nome: "Acme Armazém", logradouro: "Av. Própria", email: "x@y.com", telefone: "1", cnae: "z", municipio: "SINOP", estado: "MT" }, receita, "5107909");
  assert.equal(c.nome, undefined);
  assert.equal(c.logradouro, undefined);
  assert.equal(c.email, undefined);
  assert.equal(c.municipio, undefined);
  assert.equal(c.municipio_ibge, "5107909");
});

test("outra cidade ou outro CEP no cadastro: endereço e IBGE da Receita não entram", () => {
  for (const p of [{ id: "1", municipio: "Sorriso" }, { id: "1", cep: "78890-000" }]) {
    const c = camposDaReceita(p, receita, "5107909");
    assert.equal(c.logradouro, undefined);
    assert.equal(c.municipio_ibge, undefined);
    assert.equal(c.cnae, "Comércio");
  }
});

test("situação cadastral acompanha a Receita e marca quem não está ativa", () => {
  assert.equal(camposDaReceita({ id: "1", situacao_cadastral: "ATIVA" }, { descricao_situacao_cadastral: "BAIXADA" }).situacao_cadastral, "BAIXADA");
  assert.equal(situacaoInativa("BAIXADA"), true);
  assert.equal(situacaoInativa("ATIVA"), false);
  assert.equal(situacaoInativa(""), false);
});
