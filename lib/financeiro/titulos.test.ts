import assert from "node:assert/strict";
import test from "node:test";
import { dedupeTitulos, filtrarTitulos, hojeLocal, statusEfetivo, type TituloBase } from "./titulos.ts";

const HOJE = "2026-10-14";
const t = (o: Partial<TituloBase> & { id: string }): TituloBase => ({ tipo: "pagar", status: "em_aberto", data_vencimento: "2026-10-01", ...o });

const base: TituloBase[] = [
  t({ id: "1", tipo: "pagar", status: "em_aberto", data_vencimento: "2026-09-19" }),   // CP vencido
  t({ id: "2", tipo: "pagar", status: "baixado", data_vencimento: "2026-09-21" }),     // CP baixado
  t({ id: "3", tipo: "receber", status: "baixado", data_vencimento: "2026-09-21" }),   // CR baixado
  t({ id: "4", tipo: "receber", status: "em_aberto", data_vencimento: "2026-09-20" }), // CR vencido
  t({ id: "5", tipo: "pagar", status: "em_aberto", data_vencimento: "2026-11-01" }),   // CP a vencer
  t({ id: "6", tipo: "pagar", status: "em_aberto", data_vencimento: HOJE }),           // CP vence hoje
];

test("CP + Vencidos no período: não traz CR, baixados nem a vencer", () => {
  const r = filtrarTitulos(base, { inicio: "2026-09-01", fim: "2026-09-30", tipo: "pagar", status: new Set(["vencido"]) }, undefined, HOJE);
  assert.deepEqual(r.map(x => x.id), ["1"]);
});

test("filtro de tipo sozinho separa CP de CR", () => {
  assert.deepEqual(filtrarTitulos(base, { tipo: "receber" }, undefined, HOJE).map(x => x.id), ["3", "4"]);
  assert.equal(filtrarTitulos(base, { tipo: "todos" }, undefined, HOJE).length, base.length);
});

test("status efetivo: baixado/parcial intocados, vencido e vencendo pela data, previsão não vence", () => {
  assert.equal(statusEfetivo({ status: "baixado", data_vencimento: "2020-01-01" }, HOJE), "baixado");
  assert.equal(statusEfetivo({ status: "parcial", data_vencimento: "2020-01-01" }, HOJE), "parcial");
  assert.equal(statusEfetivo({ status: "em_aberto", data_vencimento: "2026-10-13" }, HOJE), "vencido");
  assert.equal(statusEfetivo({ status: "em_aberto", data_vencimento: HOJE }, HOJE), "vencendo");
  assert.equal(statusEfetivo({ status: "em_aberto", data_vencimento: "2026-12-01" }, HOJE), "em_aberto");
  assert.equal(statusEfetivo({ status: "previsto", natureza: "previsao", data_vencimento: "2020-01-01" }, HOJE), "previsto");
});

test("barter fica fora por padrão e entra quando pedido", () => {
  const com = [...base, t({ id: "7", moeda: "barter" })];
  assert.equal(filtrarTitulos(com, {}, undefined, HOJE).some(x => x.id === "7"), false);
  assert.equal(filtrarTitulos(com, { incluirBarter: true }, undefined, HOJE).some(x => x.id === "7"), true);
});

test("fornecedor, categoria e produtor combinam (E, não OU)", () => {
  const rows = [
    t({ id: "a", descricao: "NORS CAMINHOES", categoria: "Manutenção", produtor_id: "p1" }),
    t({ id: "b", descricao: "NORS CAMINHOES", categoria: "Combustível", produtor_id: "p1" }),
    t({ id: "c", descricao: "OUTRO", categoria: "Manutenção", produtor_id: "p2" }),
  ];
  const r = filtrarTitulos(rows, { fornecedor: "nors", categorias: new Set(["Manutenção"]), produtores: new Set(["p1"]) }, undefined, HOJE);
  assert.deepEqual(r.map(x => x.id), ["a"]);
});

test("dedupe: o mesmo id nunca aparece duas vezes", () => {
  const r = dedupeTitulos([{ id: "x", v: 1 }, { id: "y", v: 2 }, { id: "x", v: 3 }]);
  assert.equal(r.length, 2);
  assert.equal(r.find(a => a.id === "x")!.v, 3);
});

test("hojeLocal usa o dia local, não o UTC", () => {
  assert.equal(hojeLocal(new Date(2026, 9, 14, 22, 30)), "2026-10-14");
});
