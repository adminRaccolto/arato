import { test } from "node:test";
import assert from "node:assert/strict";
import { alocarRemessa, statusSaldoVef } from "./entrega-futura.ts";

const saldos = [
  { id: "s2", nf_entrada_id: "vef2", insumo_id: "I", quantidade_saldo: 100, created_at: "2026-09-10" },
  { id: "s1", nf_entrada_id: "vef1", insumo_id: "I", quantidade_saldo: 30, created_at: "2026-08-01" },
  { id: "s3", nf_entrada_id: "vef1", insumo_id: "J", quantidade_saldo: 50, created_at: "2026-08-01" },
];

test("remessa baixa do faturamento mais antigo e passa ao próximo", () => {
  const r = alocarRemessa(saldos, [{ item_id: "a", insumo_id: "I", quantidade: 50 }]);
  assert.deepEqual(r.baixas.map(b => [b.estoque_terceiro_id, b.quantidade]), [["s1", 30], ["s2", 20]]);
  assert.equal(r.sobras.length, 0);
});

test("faturamento escolhido: só ele é baixado; o que passar vira sobra", () => {
  const r = alocarRemessa(saldos, [{ item_id: "a", insumo_id: "I", quantidade: 50 }], ["vef1"]);
  assert.deepEqual(r.baixas.map(b => [b.vef_nf_entrada_id, b.quantidade]), [["vef1", 30]]);
  assert.deepEqual(r.sobras, [{ item_id: "a", insumo_id: "I", quantidade: 20 }]);
});

test("produto sem saldo vira sobra; status do saldo", () => {
  assert.equal(alocarRemessa(saldos, [{ item_id: "b", insumo_id: "K", quantidade: 5 }]).sobras[0].quantidade, 5);
  assert.equal(statusSaldoVef(100, 0), "encerrado");
  assert.equal(statusSaldoVef(100, 40), "parcial");
  assert.equal(statusSaldoVef(100, 100), "aberto");
});
