import test from "node:test";
import assert from "node:assert/strict";
import { ehCompraDeInsumo, ehPrevisaoAberta, entraNoCusto } from "./titulos-custo";

test("entra no custo: tira cancelado, previsão, tesouraria e principal de empréstimo; juros fica", () => {
  assert.equal(entraNoCusto({ status: "cancelado", categoria: "Insumos" }), false);
  assert.equal(entraNoCusto({ status: "em_aberto", categoria: "Despesas Administrativas", natureza: "previsao" }), false);
  assert.equal(entraNoCusto({ status: "baixado", categoria: "Ajuste de Saldo", origem_lancamento: "tesouraria" }), false);
  assert.equal(entraNoCusto({ status: "em_aberto", categoria: "Pagamento de Custeio" }), false);
  assert.equal(entraNoCusto({ status: "em_aberto", categoria: "Pagamento de Financiamento" }), false);
  assert.equal(entraNoCusto({ status: "em_aberto", categoria: "Juros de Custeio" }), true);
  assert.equal(entraNoCusto({ status: "baixado", categoria: "COLHEITA TERCEIRIZADA" }), true);
  assert.equal(entraNoCusto({ status: "em_aberto", categoria: "Despesas Administrativas" }), true);
});

test("compra de insumo (inclusive a categoria genérica 'Insumos') não soma de novo", () => {
  assert.equal(ehCompraDeInsumo("Insumos"), true);
  assert.equal(ehCompraDeInsumo("Insumos — Defensivos"), true);
  assert.equal(ehCompraDeInsumo("Fertilizantes"), true);
  assert.equal(ehCompraDeInsumo("Serviços Agrícolas"), false);
  assert.equal(ehCompraDeInsumo(null), false);
});

test("previsão efetivada (natureza real, origem previsão) é gasto feito; previsão aberta vai para a linha Previsto", () => {
  assert.equal(entraNoCusto({ status: "baixado", categoria: "Manutenção", natureza: "real", origem_lancamento: "previsao" }), true);
  assert.equal(entraNoCusto({ status: "em_aberto", categoria: "Manutenção", natureza: "previsao", origem_lancamento: "previsao" }), false);
  assert.equal(ehPrevisaoAberta({ status: "em_aberto", natureza: "previsao" }), true);
  assert.equal(ehPrevisaoAberta({ status: "cancelado", natureza: "previsao" }), false);
  assert.equal(ehPrevisaoAberta({ status: "baixado", natureza: "previsao" }), false);
  assert.equal(ehPrevisaoAberta({ status: "em_aberto", natureza: "real", origem_lancamento: "previsao" }), false);
});

test("movimento entre contas fica fora do DRE e do Custos mesmo com origem manual (26/11/2026)", () => {
  for (const categoria of ["Transferência entre Contas", "Resgate de Aplicação", "Resgate de Aplicação Financeira", "Aplicação Financeira", "Aporte em Aplicação Financeira", "Ajuste de Saldo"])
    assert.equal(entraNoCusto({ status: "baixado", categoria, origem_lancamento: "manual" }), false, categoria);
  assert.equal(entraNoCusto({ status: "baixado", categoria: "Taxa Bancária", origem_lancamento: "manual" }), true);
  assert.equal(entraNoCusto({ status: "baixado", categoria: "IOF — Aplicação Financeira" }), true, "IOF é custo financeiro");
});
