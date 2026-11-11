import { test } from "node:test";
import assert from "node:assert/strict";
import { abertoUsd, contraparteDe, datasDescasadas, movimentosUsd, porContraparteUsd, porMesUsd, type TituloUsd } from "./cambio.ts";

const t = (p: Partial<TituloUsd>): TituloUsd => ({ id: "x", tipo: "pagar", moeda: "USD", status: "em_aberto", valor: 100, data_vencimento: "2027-03-30", ...p });

test("título em aberto: fora pagos, cancelados, cartão, previsões e BRL; parcial conta o que falta", () => {
  assert.equal(abertoUsd(t({})), 100);
  for (const status of ["baixado", "cancelado", "cartao"]) assert.equal(abertoUsd(t({ status })), 0);
  assert.equal(abertoUsd(t({ natureza: "previsao" })), 0);
  assert.equal(abertoUsd(t({ moeda: "BRL" })), 0);
  assert.equal(abertoUsd(t({ status: "parcial", valor_pago: 30 })), 70);
});

test("contraparte pelo cadastro ou pelo texto depois do travessão", () => {
  assert.equal(contraparteDe({ pessoas: { nome: "COFCO" }, descricao: "x" }), "COFCO");
  assert.equal(contraparteDe({ descricao: "Pedido de Compra nº 1 — CJ SELECTA S.A." }), "CJ SELECTA S.A.");
  assert.equal(contraparteDe({ descricao: "Pedido de Venda — COOP NOVA MUTUM (Contrato CTR-1)" }), "COOP NOVA MUTUM");
});

test("contrato com título ligado não conta de novo; sem título entra o saldo do item", () => {
  const contratos = [
    { id: "c1", moeda: "USD", status: "aberto", tipo: "venda", quantidade_sc: 20000, entregue_sc: 0, preco: 21, data_pagamento: "2027-04-30", numero: "CTR-1" },
    { id: "c2", moeda: "USD", status: "aberto", tipo: "venda", quantidade_sc: 1000, entregue_sc: 250, preco: 20, data_pagamento: "2027-05-30", numero: "CTR-2", comprador: "CARGILL" },
  ];
  const titulos = [t({ id: "r1", tipo: "receber", valor: 420000, contrato_id: "c1", data_vencimento: "2027-04-30" }), t({ id: "p1", valor: 5000, data_vencimento: "2026-03-30" })];
  const itens = [{ contrato_id: "c1", valor_total: 420000 }, { contrato_id: "c2", valor_total: 20000 }];
  const ms = movimentosUsd({ titulos, contratos, itens, cfContratos: [], cfParcelas: [], hoje: "2026-11-11" });
  const cr = ms.filter(m => m.tipo === "cr");
  assert.equal(cr.reduce((s, m) => s + m.valor, 0), 420000 + 15000);      // título do c1 + 75% do c2
  assert.equal(cr.find(m => m.origem === "contrato")!.contraparte, "CARGILL");
  assert.equal(ms.find(m => m.tipo === "cp")!.atraso, true);
});

test("parcelas de contrato financeiro em USD em aberto são saída", () => {
  const ms = movimentosUsd({ titulos: [], contratos: [], itens: [], hoje: "2026-01-01",
    cfContratos: [{ id: "f1", moeda: "USD", status: "ativo", descricao: "ACC Banco X" }, { id: "f2", moeda: "BRL", status: "ativo" }],
    cfParcelas: [{ contrato_id: "f1", data_vencimento: "2027-01-10", status: "pendente", amortizacao: 1000, juros: 50 }, { contrato_id: "f1", data_vencimento: "2026-06-10", status: "pago", amortizacao: 1000 }, { contrato_id: "f2", data_vencimento: "2027-01-10", amortizacao: 9 }] });
  assert.deepEqual(ms.map(m => [m.tipo, m.valor, m.origem]), [["cp", 1050, "financiamento"]]);
});

test("resumos por mês, contraparte e datas descasadas", () => {
  const ms = movimentosUsd({ hoje: "2027-01-15", contratos: [], itens: [], cfContratos: [], cfParcelas: [], titulos: [
    t({ id: "a", valor: 300, data_vencimento: "2027-01-10", descricao: "PC — COFCO" }), t({ id: "b", valor: 200, data_vencimento: "2027-02-10", descricao: "PC — COFCO" }),
    t({ id: "c", tipo: "receber", valor: 1000, data_vencimento: "2027-02-10", descricao: "PV — BUNGE" })] });
  assert.deepEqual(porMesUsd(ms), [{ mes: "2027-01", cp: 300, cr: 0, saldo: -300, acumulado: -300 }, { mes: "2027-02", cp: 200, cr: 1000, saldo: 800, acumulado: 500 }]);
  const cp = porContraparteUsd(ms).find(x => x.tipo === "cp")!;
  assert.deepEqual([cp.nome, cp.valor, cp.titulos, cp.atraso, cp.proximo], ["COFCO", 500, 2, 300, "2027-02-10"]);
  assert.deepEqual(datasDescasadas(ms), ["2027-01-10"]);
});
