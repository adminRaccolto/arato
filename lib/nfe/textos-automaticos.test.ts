import { test } from "node:test";
import assert from "node:assert/strict";
import { cfopDeVenda, usaTextosDeVenda } from "./textos-automaticos.ts";

test("venda de produção, mercadoria, entrega futura e exportação levam os textos", () => {
  for (const c of ["5101", "6.101", "5102", "6102", "5116", "6117", "5401", "6501", "5922"]) assert.equal(cfopDeVenda(c), true, c);
});

test("remessa, retorno, transferência e devolução não levam", () => {
  for (const c of ["5905", "6906", "6.555", "5555", "6554", "5152", "6151", "5908", "5915", "5202", "6556", "5949", "7101", "", null]) assert.equal(cfopDeVenda(c), false, String(c));
});

test("finalidade de devolução nunca leva, e nota mista leva se tiver item de venda", () => {
  assert.equal(usaTextosDeVenda(["6101"], "4"), false);
  assert.equal(usaTextosDeVenda(["6101"], "2"), true);
  assert.equal(usaTextosDeVenda(["5905", "5101"]), true);
  assert.equal(usaTextosDeVenda(["5905"]), false);
});
