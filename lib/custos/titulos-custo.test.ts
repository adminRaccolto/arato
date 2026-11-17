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
