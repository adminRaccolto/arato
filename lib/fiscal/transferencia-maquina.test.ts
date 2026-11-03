import { test } from "node:test";
import assert from "node:assert/strict";
import { cfopPorDestino, destinatarioDaInscricao, mesmoEstabelecimento } from "./transferencia-maquina.ts";

test("CFOP muda só quando o destino é em outro estado", () => {
  assert.equal(cfopPorDestino("5552", "MT", "MT"), "5552");
  assert.equal(cfopPorDestino("5552", "MT", "go"), "6552");
  assert.equal(cfopPorDestino("5915", "MT", "GO"), "6915");
  assert.equal(cfopPorDestino("5552", "MT", null), "5552");
  assert.equal(cfopPorDestino("1908", "MT", "GO"), "1908");
});

const PRODUTOR = { nome: "Dirceu", cpf_cnpj: "176.798.429-49", logradouro: "Rua A", numero: "1", bairro: "Centro", municipio: "Nova Mutum", municipio_ibge: "5106224", estado: "MT", cep: "78450000" };

test("destinatário usa o endereço da IE", () => {
  const d = destinatarioDaInscricao(PRODUTOR, { inscricao_estadual: "13.123.456-7", logradouro: "Rod. BR-163", numero: "", municipio: "Sorriso", municipio_ibge: "5107925", estado: "MT", cep: "78890000" });
  assert.equal(d.ie, "131234567");
  assert.equal(d.logradouro, "Rod. BR-163");
  assert.equal(d.numero, undefined);
  assert.equal(d.municipio, "Sorriso");
  assert.equal(d.municipio_ibge, "5107925");
  assert.equal(d.cep, "78890000");
});

test("IE sem endereço cai no cadastro do produtor sem misturar município e IBGE", () => {
  const d = destinatarioDaInscricao(PRODUTOR, { inscricao_estadual: "131234567" });
  assert.equal(d.logradouro, "Rua A");
  assert.equal(d.numero, "1");
  assert.equal(d.municipio, "Nova Mutum");
  assert.equal(d.municipio_ibge, "5106224");
  const soNome = destinatarioDaInscricao(PRODUTOR, { inscricao_estadual: "131234567", municipio: "Sorriso" });
  assert.equal(soNome.municipio, "Sorriso");
  assert.equal(soNome.municipio_ibge, undefined);
});

test("mesma IE é o mesmo estabelecimento, sem contar pontuação", () => {
  assert.equal(mesmoEstabelecimento("13.123.456-7", "131234567"), true);
  assert.equal(mesmoEstabelecimento("131234567", "131234568"), false);
  assert.equal(mesmoEstabelecimento("", ""), false);
});
