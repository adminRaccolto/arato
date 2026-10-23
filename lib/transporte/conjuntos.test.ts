import { test } from "node:test";
import assert from "node:assert/strict";
import { validarConjunto, opcoesVeiculoDocumento, resolverSelecao, valorSelecao, placasDoConjunto, tpCarPorCarroceria, tpRodDoVeiculo, type VeiculoConjunto, type ConjuntoVeiculos } from "./conjuntos.ts";

const veiculos: VeiculoConjunto[] = [
  { id: "cav1", placa: "QBA1A11", categoria: "cavalo", tipo: "Bitrem", ativo: true },
  { id: "cav2", placa: "QBA2B22", categoria: "cavalo", tipo: "Toco", ativo: true },
  { id: "car1", placa: "QCA1C11", categoria: "implemento", tipo_carroceria: "Graneleiro", ativo: true },
  { id: "car2", placa: "QCA2C22", categoria: "implemento", ativo: true },
  { id: "legado", placa: "AAA0000", tipo: "Truck", ativo: true }, // sem categoria (cadastro antigo) = cavalo
];
const bitrem: ConjuntoVeiculos = { id: "j1", cavalo_id: "cav1", implemento_ids: ["car1", "car2"], ativo: true };

test("placas na ordem do engate", () => {
  assert.equal(placasDoConjunto(bitrem, veiculos), "QBA1A11 + QCA1C11 + QCA2C22");
});

test("conjunto válido e erros de montagem", () => {
  assert.equal(validarConjunto({ cavalo_id: "cav1", implemento_ids: ["car1"], ativo: true }, [], veiculos), null);
  assert.match(validarConjunto({ cavalo_id: "car1", implemento_ids: [], ativo: true }, [], veiculos)!, /implemento/);
  assert.match(validarConjunto({ cavalo_id: "cav1", implemento_ids: ["cav2"], ativo: true }, [], veiculos)!, /cavalo/);
  assert.match(validarConjunto({ cavalo_id: "cav1", implemento_ids: ["car1", "car1"], ativo: true }, [], veiculos)!, /duas vezes/);
  assert.match(validarConjunto({ cavalo_id: "cav1", implemento_ids: ["car1", "car2", "car1", "car2"], ativo: true }, [], veiculos)!, /máximo 3/);
});

test("implemento ou cavalo já engatado em outro conjunto ativo", () => {
  assert.match(validarConjunto({ cavalo_id: "cav2", implemento_ids: ["car2"], ativo: true }, [bitrem], veiculos)!, /QCA2C22 já está engatado/);
  assert.match(validarConjunto({ cavalo_id: "cav1", implemento_ids: [], ativo: true }, [bitrem], veiculos)!, /QBA1A11 já está em outro conjunto/);
  // editar o próprio conjunto ou outro desmontado não conflita
  assert.equal(validarConjunto({ ...bitrem }, [bitrem], veiculos), null);
  assert.equal(validarConjunto({ cavalo_id: "cav2", implemento_ids: ["car2"], ativo: true }, [{ ...bitrem, ativo: false }], veiculos), null);
});

test("seletor do documento: conjuntos + cavalos soltos, nunca implemento sozinho", () => {
  const op = opcoesVeiculoDocumento([bitrem], veiculos);
  assert.deepEqual(op.map(o => o.valor), ["c:j1", "v:cav2", "v:legado"]);
  assert.equal(op[0].rotulo, "QBA1A11 + QCA1C11 + QCA2C22");
});

test("seleção grava cavalo, conjunto e carretas", () => {
  assert.deepEqual(resolverSelecao("c:j1", [bitrem]), { veiculo_id: "cav1", conjunto_id: "j1", implemento_ids: ["car1", "car2"] });
  assert.deepEqual(resolverSelecao("v:cav2", [bitrem]), { veiculo_id: "cav2", conjunto_id: null, implemento_ids: [] });
  assert.equal(valorSelecao("cav1", "j1"), "c:j1");
  assert.equal(valorSelecao("cav2", null), "v:cav2");
});

test("códigos do MDF-e", () => {
  assert.equal(tpCarPorCarroceria("Graneleiro"), "03");
  assert.equal(tpCarPorCarroceria("Baú"), "02");
  assert.equal(tpCarPorCarroceria(undefined), "00");
  assert.equal(tpRodDoVeiculo("Bitrem", true), "03");
  assert.equal(tpRodDoVeiculo("Toco", false), "02");
  assert.equal(tpRodDoVeiculo("Truck", false), "01");
});
