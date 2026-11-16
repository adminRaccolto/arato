import test from "node:test";
import assert from "node:assert/strict";
import { GRUPOS_LIMPEZA } from "./limpeza";

const itens = GRUPOS_LIMPEZA.flatMap(g => g.subitens);
const tabelasDe = (id: string) => itens.find(i => i.id === id)!.tabelas;

test("tabelas de movimento que ficavam para trás entram na limpeza (16/11/2026)", () => {
  const todas = new Set(itens.flatMap(i => i.tabelas));
  for (const t of ["transferencias_estoque", "faturas_fornecedor", "lcdpr_movimentos", "notas_proprias_externas", "fiscal_operacoes",
    "fiscal_eventos_operacoes", "ciots", "tarefas", "planejamento_tarefas", "simulacoes", "capacidade_cenarios", "regras_rateio",
    "pagamento_lote_baixas", "grupos_insumo", "subgrupos_insumo"]) assert.ok(todas.has(t), t);
});

test("filha que trava a exclusão vem antes da mãe no mesmo item", () => {
  const antes = (id: string, filha: string, mae: string) => {
    const t = tabelasDe(id);
    assert.ok(t.indexOf(filha) >= 0 && t.indexOf(filha) < t.indexOf(mae), `${id}: ${filha} antes de ${mae}`);
  };
  antes("expedicao", "ciots", "mdfes");
  antes("notas_saida", "fiscal_eventos_operacoes", "notas_fiscais");
  antes("recomendacoes", "tarefas", "recomendacoes_adubacao");
  antes("lancamentos", "pagamento_lote_baixas", "pagamento_lotes");
  antes("grupos_insumos", "subgrupos_insumo", "grupos_insumo");
  antes("regras_rateio", "regras_rateio_global", "regras_rateio");
});

test("ids de item únicos", () => {
  const ids = GRUPOS_LIMPEZA.flatMap(g => g.subitens.map(i => `${g.id}/${i.id}`));
  assert.equal(new Set(ids).size, ids.length);
});
