import { test } from "node:test";
import assert from "node:assert/strict";
import { rotularCiclos, tituloEntraNaVisao } from "./visao-cliente.ts";

const nomes: Record<string, string> = { P: "Fazenda Panorama", O: "Fazenda Oasis", S: "Fazenda Sapezal" };
const nome = (id: string) => nomes[id];

test("mesmo nome em fazendas diferentes fica distinguível", () => {
  const r = rotularCiclos([{ fazenda_id: "P", descricao: "Soja 2026/2027" }, { fazenda_id: "O", descricao: "Soja 2026/2027" }], nome);
  assert.deepEqual(r.map(c => c.rotulo), ["Soja 2026/2027 — Panorama", "Soja 2026/2027 — Oasis"]);
});

test("cliente com uma fazenda só não repete o nome dela", () => {
  assert.equal(rotularCiclos([{ fazenda_id: "P", descricao: "Soja" }], nome)[0].rotulo, "Soja");
});

test("nome que já diz a fazenda não repete, mesmo com acento e caixa diferentes", () => {
  const r = rotularCiclos([{ fazenda_id: "S", descricao: "SOJA Fazenda Sapezal 2026/2027" }, { fazenda_id: "P", descricao: "Milho" }], nome);
  assert.equal(r[0].rotulo, "SOJA Fazenda Sapezal 2026/2027");
});

test("sem descrição usa a cultura", () => {
  assert.equal(rotularCiclos([{ fazenda_id: "P", cultura: "Milho" }, { fazenda_id: "O", cultura: "Soja" }], nome)[0].rotulo, "Milho — Panorama");
});

const ciclos = new Set(["cP"]);
const fazendas = new Set(["P"]);
const donas = new Map([["cP", "P"], ["cO", "O"]]);

test("título do Armazém no ciclo da Panorama conta na Panorama", () => {
  assert.equal(tituloEntraNaVisao({ fazenda_id: "A", ciclo_id: "cP" }, ciclos, fazendas, donas), true);
});
test("título da Panorama no ciclo da Oasis não conta na Panorama", () => {
  assert.equal(tituloEntraNaVisao({ fazenda_id: "P", ciclo_id: "cO" }, ciclos, fazendas, donas), false);
});
test("título sem ciclo segue a fazenda", () => {
  assert.equal(tituloEntraNaVisao({ fazenda_id: "P", ciclo_id: null }, ciclos, fazendas, donas), true);
  assert.equal(tituloEntraNaVisao({ fazenda_id: "O", ciclo_id: null }, ciclos, fazendas, donas), false);
});
test("com todas as fazendas na visão, nada muda", () => {
  const todas = new Set(["P", "O"]);
  assert.equal(tituloEntraNaVisao({ fazenda_id: "P", ciclo_id: "cO" }, new Set(["cP", "cO"]), todas, donas), true);
  assert.equal(tituloEntraNaVisao({ fazenda_id: "O", ciclo_id: "outro-ano" }, new Set(["cP"]), todas, donas), true);
});
