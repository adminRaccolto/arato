import { test } from "node:test";
import assert from "node:assert/strict";
import { sacasDaNf, valorAbatimento, vencimentoCarga, saldoGuardaChuva, kgSacaDoProduto } from "./recebimento-carga.ts";

test("sacas da NF pelas unidades dos itens", () => {
  assert.equal(sacasDaNf([{ unidade: "KG", quantidade: 37200 }]), 620);
  assert.equal(sacasDaNf([{ unidade: "SC", quantidade: 100 }, { unidade: "TON", quantidade: 6 }]), 200);
  assert.equal(sacasDaNf([{ unidade: "KG", quantidade: "1500" }], kgSacaDoProduto("Algodão em pluma")), 100);
  assert.equal(sacasDaNf([{ unidade: "UN", quantidade: 3 }]), null);
});

test("abatimento: sacas × preço na moeda do contrato; sem unidade, R$ usa o valor da NF e US$ não converte", () => {
  assert.equal(valorAbatimento({ preco: 120.5, moeda: "BRL" }, 620, 70000), 74710);
  assert.equal(valorAbatimento({ preco: 21.3, moeda: "USD" }, 620, 70000), 13206);
  assert.equal(valorAbatimento({ preco: 120, moeda: "BRL" }, null, 70000), 70000);
  assert.equal(valorAbatimento({ preco: 21, moeda: "USD" }, null, 70000), null);
});

test("vencimento da carga e saldo do guarda-chuva", () => {
  assert.equal(vencimentoCarga("2026-10-29", 5), "2026-11-03");
  assert.equal(vencimentoCarga("2026-10-29", null), "2026-10-29");
  assert.deepEqual(saldoGuardaChuva(100000, 30000), { valor: 70000, status: "em_aberto", excedente: 0 });
  assert.deepEqual(saldoGuardaChuva(20000, 30000), { valor: 0, status: "cancelado", excedente: 10000 });
  assert.deepEqual(saldoGuardaChuva(0, -30000), { valor: 30000, status: "em_aberto", excedente: 0 });
});
