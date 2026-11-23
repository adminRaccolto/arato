import test from "node:test";
import assert from "node:assert/strict";
import { camposDivergentes, camposParaGravar, escolhaInicial, previaFusao, problemasFusao, sugerirDestino, type ProdutoFusao } from "./fundir-produtos.ts";

const p = (id: string, o: Partial<ProdutoFusao> = {}): ProdutoFusao => ({
  id, nome: "SEMENTE SOJA CG 7681", unidade: "kg", tipo: "insumo", categoria: "semente", subgrupo: null, grupo_id: "g1",
  fabricante: null, ncm: "12019000", principio_ativo_id: null, cultura_id: null, estoque_minimo: null, deposito_padrao_id: null,
  foto_url: null, estoque: 0, custo_medio: 0, ativo: true, created_at: "2026-01-01", movimentos: 0, itensNf: 0, ...o,
});

test("só funde com a mesma unidade e o mesmo tipo, e pelo menos dois cadastros", () => {
  assert.deepEqual(problemasFusao([p("a"), p("b", { unidade: " KG " })]), []);
  assert.match(problemasFusao([p("a"), p("b", { unidade: "bag" })])[0], /Unidades diferentes/);
  assert.match(problemasFusao([p("a"), p("b", { tipo: "produto" })])[0], /Tipos diferentes/);
  assert.match(problemasFusao([p("a")])[0], /dois cadastros/);
});

test("campos que divergem e escolha inicial pelo cadastro que fica (vazio cede ao preenchido)", () => {
  const itens = [p("a", { nome: "SEM SOJA CG 7681", ncm: null }), p("b", { fabricante: "GDM" })];
  assert.deepEqual(camposDivergentes(itens), ["nome", "ncm", "fabricante"]);
  assert.deepEqual(escolhaInicial(itens, "a"), { nome: "a", ncm: "b", fabricante: "b" });
});

test("grava só o que veio de outro cadastro e é diferente", () => {
  const itens = [p("a", { nome: "SEM SOJA", ncm: null }), p("b", { nome: "SEMENTE SOJA CG 7681", fabricante: "GDM" })];
  assert.deepEqual(camposParaGravar(itens, "a", { nome: "b", ncm: "b", fabricante: "a" }), { nome: "SEMENTE SOJA CG 7681", ncm: "12019000" });
  assert.deepEqual(camposParaGravar(itens, "b", { nome: "b", ncm: "a" }), { ncm: null });
});

test("sugestão do cadastro que fica e prévia de saldo e custo médio", () => {
  const itens = [
    p("a", { estoque: 52000, custo_medio: 9, movimentos: 3, created_at: "2026-02-01" }),
    p("b", { estoque: 190755, custo_medio: 10, movimentos: 10, itensNf: 4 }),
    p("c", { estoque: -100, custo_medio: 50, movimentos: 1 }),
  ];
  assert.equal(sugerirDestino(itens), "b");
  const r = previaFusao(itens, "b");
  assert.equal(r.saldo, 242655);
  assert.ok(Math.abs((r.custoMedio ?? 0) - (52000 * 9 + 190755 * 10) / 242755) < 1e-9);
  assert.deepEqual([r.movimentos, r.itensNf], [4, 0]);
});
