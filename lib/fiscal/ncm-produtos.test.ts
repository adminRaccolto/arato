import { test } from "node:test";
import assert from "node:assert/strict";
import { ncmPadraoDoProduto, produtoDoContrato, fmtNcm, itemDoProdutoAgricola } from "./ncm-produtos.ts";

test("NCM de grão (não de semente) pelo nome", () => {
  assert.equal(ncmPadraoDoProduto("Milho")?.ncm, "1005.90.10");
  assert.equal(ncmPadraoDoProduto("Milho 2ª (Safrinha)")?.ncm, "1005.90.10");
  assert.equal(ncmPadraoDoProduto("Soja Transgênica")?.ncm, "1201.90.00");
  assert.equal(ncmPadraoDoProduto("Sorgo")?.ncm, "1007.90.00");
  assert.equal(ncmPadraoDoProduto("Algodão em Pluma")?.ncm, "5201.00.10");
  assert.equal(ncmPadraoDoProduto("Caroço de Algodão")?.ncm, "1207.29.00");
  assert.equal(ncmPadraoDoProduto("Semente de soja"), null);
  assert.equal(ncmPadraoDoProduto("Brachiaria"), null);
});

test("produto do contrato pelo id ou pelo nome", () => {
  const ps = [{ id: "a", nome: "Soja" }, { id: "b", nome: "Milho" }, { id: "c", nome: "Algodão em Pluma" }];
  assert.equal(produtoDoContrato(ps, "b", "Soja")?.id, "b");
  assert.equal(produtoDoContrato(ps, null, "SOJA")?.id, "a");
  assert.equal(produtoDoContrato(ps, null, "Milho 1ª")?.id, "b");
  assert.equal(produtoDoContrato(ps, null, "Trigo"), undefined);
  assert.equal(fmtNcm("10059010"), "1005.90.10");
});

test("item da NF de venda pelo produto agrícola do cadastro", () => {
  assert.deepEqual(itemDoProdutoAgricola({ nome: "MILHO", ncm: "10059010", unidade: "kg" }), { item: "MILHO", ncm: "1005.90.10", unidade: "kg", aviso: "" });
  const semNcm = itemDoProdutoAgricola({ nome: "Soja em grão", ncm: null, unidade: "sc" });
  assert.equal(semNcm.ncm, "1201.90.00"); assert.equal(semNcm.unidade, "sc"); assert.match(semNcm.aviso, /referência/);
  assert.equal(itemDoProdutoAgricola({ nome: "Gergelim", ncm: "", unidade: "t" }).ncm, "");
  assert.equal(itemDoProdutoAgricola({ nome: "Gergelim", ncm: "", unidade: "t" }).unidade, "ton");
  assert.equal(itemDoProdutoAgricola({ nome: "Feijão", ncm: "07133319", unidade: null }).unidade, "kg");
});
