import test from "node:test";
import assert from "node:assert/strict";
import { modulosDaRota } from "./rotas-permissao";

test("endereço do menu → módulo do item", () => {
  assert.deepEqual(modulosDaRota("/lavoura/plantio"), ["lavoura_plantio"]);
  assert.deepEqual(modulosDaRota("/financeiro/folha"), ["folha"]);
  assert.deepEqual(modulosDaRota("/estoque/abastecimento"), ["maquinas"]);
  assert.deepEqual(modulosDaRota("/estoque"), ["estoque"]);
  assert.deepEqual(modulosDaRota("/mapa"), ["propriedades"]);
});

test("subpágina fora do menu herda do item de caminho mais longo", () => {
  assert.deepEqual(modulosDaRota("/financeiro/folha/proposta"), ["folha"]);
  assert.deepEqual(modulosDaRota("/financeiro/folha/relatorios"), ["fin_relatorios"]);
  assert.deepEqual(modulosDaRota("/estoque/romaneio-entrada/123"), ["lavoura_colheita"]);
});

test("mesmo caminho com abas de módulos diferentes", () => {
  assert.deepEqual(modulosDaRota("/cadastros", "?tab=maquinas"), ["maquinas"]);
  assert.deepEqual(modulosDaRota("/cadastros", "?tab=fazendas"), ["propriedades"]);
  assert.deepEqual(modulosDaRota("/cadastros", "?tab=pessoas"), ["cadastros"]);
  // sem aba: qualquer um dos módulos da tela libera (a tela confere a aba)
  const todos = modulosDaRota("/cadastros")!;
  for (const m of ["cadastros", "maquinas", "propriedades", "lavoura_plan", "lavoura_colheita"]) assert.ok(todos.includes(m), m);
  assert.deepEqual(modulosDaRota("/relatorios/romaneios", "?aba=saida"), ["expedicao"]);
  assert.deepEqual(new Set(modulosDaRota("/configuracoes/rateio")), new Set(["conf_financeiro", "custos"]));
});

test("fora do menu ou livre: não bloqueia", () => {
  assert.equal(modulosDaRota("/"), null);
  assert.equal(modulosDaRota("/learning"), null);
  assert.equal(modulosDaRota("/seletor-cliente"), null);
  assert.equal(modulosDaRota("/admin/clientes"), null);
  assert.equal(modulosDaRota("/login"), null);
});
