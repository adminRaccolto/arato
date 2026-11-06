import assert from "node:assert/strict";
import test from "node:test";
import { creditoPago, principalPago, geraMovimentoBancario, saldoPagamentoAdiantamento } from "./adiantamentos-fornecedor.ts";

test("crédito exige dinheiro pago; programação não libera crédito", () => {
  assert.equal(creditoPago(100, 0, [{ valor: 100, status: "em_aberto" }]), 0);
  assert.equal(creditoPago(100, 10, [{ valor: 100, valor_pago: 40, status: "parcial" }]), 30);
  assert.equal(creditoPago(100, 0, [{ valor: 100, status: "cancelado", valor_pago: 100 }]), 0);
});
test("pagamento dividido soma partes e desconta o que já foi aplicado", () => {
  assert.equal(creditoPago(100, 20, [{ valor: 30, valor_pago: 30, status: "baixado" }, { valor: 70, valor_pago: 40, status: "parcial" }]), 50);
});
test("dólar exige cotação real; juros e multas não são crédito", () => {
  assert.equal(principalPago({ valor: 100, valor_pago: 530, valor_multa: 10, valor_juros: 20, moeda: "USD", cotacao_usd: 5, status: "baixado" }), 100);
  assert.equal(principalPago({ valor: 100, valor_pago: 500, moeda: "USD", status: "baixado" }), 0);
  assert.equal(principalPago({ valor: 100, valor_pago: 100, status: "baixado", forma_pagamento: "Compensação de adiantamento a fornecedor" }), 0);
});

test("fluxo realizado conta o pagamento do adiantamento e só o saldo bancário da NF", () => {
  const titulos = [{valor_pago:30,forma_pagamento:"PIX"},{valor_pago:30,forma_pagamento:"Compensação de adiantamento a fornecedor"},{valor_pago:70,forma_pagamento:"Boleto"}];
  assert.equal(titulos.filter(geraMovimentoBancario).reduce((s,l)=>s+l.valor_pago,0),100);
  assert.equal(principalPago({valor:100,status:"baixado",valor_desconto:10}),90);
});

test("saldo a pagar não é o crédito disponível e respeita a moeda da parte",()=>{
  assert.equal(saldoPagamentoAdiantamento({valor:100,status:"em_aberto"}),100);
  assert.equal(saldoPagamentoAdiantamento({valor:100,status:"parcial",valor_pago:150,moeda:"USD",cotacao_usd:5}),70);
  assert.equal(saldoPagamentoAdiantamento({valor:100,status:"baixado",valor_pago:80}),0);
  assert.equal(saldoPagamentoAdiantamento({valor:100,status:"cancelado"}),0);
  assert.equal(saldoPagamentoAdiantamento({valor:100,status:"parcial",valor_pago:150,moeda:"USD"}),null);
});
