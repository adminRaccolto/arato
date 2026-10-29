import { test } from "node:test";
import assert from "node:assert/strict";
import { tipoMaquinaDaDescricao, aquisicaoParaAtualizar } from "./da-nf.ts";

test("tipo da máquina pela descrição da NF", () => {
  assert.equal(tipoMaquinaDaDescricao("COLHEITADEIRA JOHN DEERE S790 USADA"), "colheitadeira");
  assert.equal(tipoMaquinaDaDescricao("Trator Massey Ferguson 8737"), "trator");
  assert.equal(tipoMaquinaDaDescricao("SEMI-REBOQUE GRANELEIRO 3 EIXOS"), "carreta");
  assert.equal(tipoMaquinaDaDescricao("CAMINHÃO VOLVO FH 540"), "caminhao");
  assert.equal(tipoMaquinaDaDescricao("Plataforma de milho 18 linhas"), "implemento");
  assert.equal(tipoMaquinaDaDescricao("GERADOR 150 KVA"), "outro");
});

test("máquina já cadastrada só recebe o que está vazio", () => {
  assert.deepEqual(aquisicaoParaAtualizar({ nr_nf_aquisicao: "", data_aquisicao: "2024-01-01", valor_aquisicao: 0 }, { numero: "157115", data: "2026-09-24", valor: 500000 }),
    { nr_nf_aquisicao: "157115", valor_aquisicao: 500000 });
});
