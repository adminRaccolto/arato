import test from "node:test";
import assert from "node:assert/strict";
import { ajusteDoTitulo, planejarAditivo, planejarSubstituicao, valorDoContrato, type PlanoAditivo } from "./aditivos.ts";

const base = { status: "parcial", preco: 120, quantidade_sc: 10000, entregue_sc: 4000, comprador: "Bunge", pessoa_id: "p1" };
const ok = (r: PlanoAditivo | { erro: string }) => { assert.ok(!("erro" in r), JSON.stringify(r)); return r as PlanoAditivo; };

test("preço novo vale só para o saldo sem NF: o exemplo de 10.000 sc", () => {
  const p = ok(planejarAditivo(base, 4000, { tipo: "preco", preco: 130 }));
  assert.equal(p.deltaCr, 60000);
  assert.equal(p.contrato.valor_ajuste_aditivo, -40000);
  assert.equal(valorDoContrato({ ...base, ...(p.contrato as object) }), 1260000);
});

test("romaneio ainda sem NF sai ao preço novo", () => {
  const p = ok(planejarAditivo(base, 1000, { tipo: "preco", preco: 130 }));
  assert.equal(p.deltaCr, 90000);
  assert.equal(p.contrato.valor_ajuste_aditivo, -10000);
});

test("segundo aditivo de preço soma o acerto do primeiro", () => {
  const p = ok(planejarAditivo({ ...base, preco: 130, valor_ajuste_aditivo: -40000 }, 6000, { tipo: "preco", preco: 140 }));
  assert.equal(p.contrato.valor_ajuste_aditivo, -100000);
  assert.equal(valorDoContrato({ ...base, ...(p.contrato as object) }), 4000 * 120 + 2000 * 130 + 4000 * 140);
});

test("preço não muda quando tudo já foi faturado, nem em contrato a fixar sem preço", () => {
  assert.ok("erro" in planejarAditivo(base, 10000, { tipo: "preco", preco: 130 }));
  assert.ok("erro" in planejarAditivo({ ...base, preco: 0, a_fixar: true }, 0, { tipo: "preco", preco: 130 }));
});

test("quantidade: não fica abaixo do entregue ou faturado, e reabre ou encerra o contrato", () => {
  assert.ok("erro" in planejarAditivo(base, 0, { tipo: "quantidade", quantidade_sc: 3000 }));
  assert.ok("erro" in planejarAditivo(base, 5000, { tipo: "quantidade", quantidade_sc: 4500 }));
  const reabre = ok(planejarAditivo({ ...base, status: "encerrado", quantidade_sc: 4000 }, 4000, { tipo: "quantidade", quantidade_sc: 5000 }));
  assert.equal(reabre.contrato.status, "parcial");
  assert.equal(reabre.deltaCr, 120000);
  assert.equal(ok(planejarAditivo(base, 4000, { tipo: "quantidade", quantidade_sc: 4000 })).contrato.status, "encerrado");
});

test("comprador só muda sem entrega nem NF", () => {
  const pessoa = { id: "p2", nome: "Cargill" };
  assert.ok("erro" in planejarAditivo(base, 0, { tipo: "comprador", pessoa }));
  assert.ok("erro" in planejarAditivo({ ...base, entregue_sc: 0 }, 100, { tipo: "comprador", pessoa }));
  assert.equal(ok(planejarAditivo({ ...base, entregue_sc: 0 }, 0, { tipo: "comprador", pessoa })).contrato.comprador, "Cargill");
});

test("volume e preço: o saldo vai para contrato novo e o original fica com o entregue", () => {
  const p = ok(planejarSubstituicao(base, 4000, "CTR-2026/099"));
  assert.equal(p.contrato.quantidade_sc, 4000);
  assert.equal(p.contrato.status, "encerrado");
  assert.equal(p.deltaCr, -720000);
  assert.equal(ok(planejarSubstituicao({ ...base, entregue_sc: 0 }, 0, "X")).contrato.status, "cancelado");
  assert.ok("erro" in planejarSubstituicao({ ...base, entregue_sc: 10000 }, 0, "X"));
});

test("título recebido, conciliado ou em borderô não muda sozinho", () => {
  assert.deepEqual(ajusteDoTitulo({ status: "em_aberto", valor: 1000 }, 500), { valor: 1500 });
  assert.deepEqual(ajusteDoTitulo({ status: "em_aberto", valor: 1000 }, -1000), { valor: 0, status: "cancelado" });
  for (const t of [{ status: "baixado" }, { status: "em_aberto", valor_pago: 10 }, { status: "em_aberto", lote_id: "l" }, { status: "em_aberto", conciliado: true }]) {
    assert.ok("aviso" in ajusteDoTitulo(t, 500));
  }
});
