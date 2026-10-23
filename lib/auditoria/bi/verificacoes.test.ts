import { test } from "node:test";
import assert from "node:assert/strict";
import { unidadeDivergente, normalizarUnidade } from "./verificacoes.ts";
import type { InsumoCadastro } from "../../estoque/duplicados.ts";

const ins = (id: string, nome: string, extra: Partial<InsumoCadastro> = {}): InsumoCadastro => ({ id, nome, tipo: "insumo", ativo: true, ...extra });

test("unidade: mesma unidade escrita diferente não é divergência; sem fator é", () => {
  assert.equal(normalizarUnidade("Kgs"), "KG");
  assert.equal(normalizarUnidade("LT"), "L");
  const cad = ins("x", "OLEO", { unidade: "KG" });
  assert.equal(unidadeDivergente({ id: "i", nf_entrada_id: "n", insumo_id: "x", unidade_nf: "kg" }, cad), false);
  assert.equal(unidadeDivergente({ id: "i", nf_entrada_id: "n", insumo_id: "x", unidade_nf: "L" }, cad), true);
  assert.equal(unidadeDivergente({ id: "i", nf_entrada_id: "n", insumo_id: "x", unidade_nf: "TON", fator_conversao: 1000 }, cad), false);
  assert.equal(unidadeDivergente({ id: "i", nf_entrada_id: "n", insumo_id: "x", unidade_nf: "TON", fator_conversao: 1 }, cad), true);
});
