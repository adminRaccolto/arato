import test from "node:test";
import assert from "node:assert/strict";
import {
  agruparApoio, chavePessoa, diasNaPosicao, entraNoApoio, filtrarApoio, resumoApoio, situacaoNaPosicao, statusApoioDe, valorColuna,
  type FiltroApoio, type LinhaApoio,
} from "./apoio-relatorio.ts";

const l = (o: Partial<LinhaApoio>): LinhaApoio => ({
  id: Math.random().toString(36), origem: "oficial", tipo: "pagar", descricao: "x", valor: 100, moeda: "BRL", vencimento: "2026-12-01",
  dataBaixa: null, baixadoPor: null, pessoa: "", documento: "", produtor: "", safra: "", categoria: "", contaBaixa: "", observacao: "", ...o,
});
const filtro = (o: Partial<FiltroApoio> = {}): FiltroApoio => ({
  periodoPor: "vencimento", de: "", ate: "", posicao: "2026-11-24", tipo: "todos",
  origens: new Set(), situacoes: new Set(), categorias: new Set(), pessoas: new Set(), produtores: new Set(), ...o,
});

test("status do oficial: baixa do Apoio vale mais que a oficial; cancelado e cartão fora", () => {
  assert.equal(statusApoioDe("em_aberto", false), "aberto");
  assert.equal(statusApoioDe("baixado", false), "baixado_oficial");
  assert.equal(statusApoioDe("baixado", true), "baixado_apoio");
  assert.equal(entraNoApoio("cancelado"), false);
  assert.equal(entraNoApoio("cartao"), false);
  assert.equal(entraNoApoio("vencido"), true);
});

test("situação e dias na data da posição", () => {
  const pago = l({ baixadoPor: "apoio", dataBaixa: "2026-11-20", vencimento: "2026-11-10" });
  assert.equal(situacaoNaPosicao(pago, "2026-11-24"), "baixado");
  assert.equal(situacaoNaPosicao(pago, "2026-11-15"), "vencido");   // na posição de 15/11 ainda não tinha sido baixado
  assert.equal(diasNaPosicao(pago, "2026-11-15"), -5);
  assert.equal(diasNaPosicao(pago, "2026-11-24"), null);
  assert.equal(situacaoNaPosicao(l({ vencimento: "2026-12-01" }), "2026-11-24"), "a_vencer");
  assert.equal(diasNaPosicao(l({ vencimento: "2026-12-01" }), "2026-11-24"), 7);
  assert.equal(situacaoNaPosicao(l({ baixadoPor: "oficial", dataBaixa: null }), "2020-01-01"), "baixado");
});

test("filtros: período por vencimento ou baixa, origem, situação, pessoa por documento", () => {
  const ls = [
    l({ vencimento: "2026-10-01", pessoa: "AGRO X", documento: "12.345.678/0001-90" }),
    l({ vencimento: "2026-12-10", origem: "exclusivo", tipo: "receber" }),
    l({ vencimento: "2026-09-01", baixadoPor: "oficial", dataBaixa: "2026-11-02" }),
  ];
  assert.equal(filtrarApoio(ls, filtro({ de: "2026-10-01", ate: "2026-12-31" })).length, 2);
  assert.equal(filtrarApoio(ls, filtro({ periodoPor: "baixa", de: "2026-11-01", ate: "2026-11-30" })).length, 1);
  assert.equal(filtrarApoio(ls, filtro({ origens: new Set(["exclusivo"]) })).length, 1);
  assert.equal(filtrarApoio(ls, filtro({ situacoes: new Set(["vencido"]) })).length, 1);
  assert.equal(filtrarApoio(ls, filtro({ pessoas: new Set([chavePessoa({ documento: "12345678000190", pessoa: "" })]) })).length, 1);
  assert.equal(filtrarApoio(ls, filtro({ tipo: "receber" })).length, 1);
});

test("agrupamento com subtotal por nível e total geral; saldo em aberto receber − pagar", () => {
  const ls = [
    l({ tipo: "receber", valor: 1000, vencimento: "2026-12-05", categoria: "Grãos" }),
    l({ valor: 300, vencimento: "2026-11-01", categoria: "Insumos" }),
    l({ valor: 200, vencimento: "2026-12-20", categoria: "Insumos", baixadoPor: "apoio", dataBaixa: "2026-11-10" }),
  ];
  const { itens, geral } = agruparApoio(ls, ["mes", "categoria"], "2026-11-24");
  assert.deepEqual(geral, { receber: 1000, pagar: 500, saldo: 700, n: 3 });
  const grupos = itens.filter(i => i.t === "grupo").map(i => (i as { rot: string }).rot);
  assert.deepEqual(grupos, ["Mês de vencimento: 11/2026", "Categoria: Insumos", "Mês de vencimento: 12/2026", "Categoria: Grãos", "Categoria: Insumos"]);
  const subDez = itens.find(i => i.t === "sub" && i.rot === "Subtotal — 12/2026") as { tot: { saldo: number } };
  assert.equal(subDez.tot.saldo, 1000);
  assert.equal(itens.filter(i => i.t === "linha").length, 3);
  assert.equal(agruparApoio(ls, [], "2026-11-24").itens.map(i => i.t).join(), "linha,linha,linha");
});

test("colunas e resumo na posição", () => {
  const venc = l({ valor: 300, vencimento: "2026-11-01" });
  assert.equal(valorColuna("situacao", venc, "2026-11-24"), "Vencido");
  assert.equal(valorColuna("saldo", venc, "2026-11-24"), -300);
  assert.equal(valorColuna("receber", venc, "2026-11-24"), null);
  assert.equal(valorColuna("data_baixa", l({ baixadoPor: "apoio", dataBaixa: "2026-12-01" }), "2026-11-24"), "");
  const r = resumoApoio([venc, l({ tipo: "receber", valor: 50 })], "2026-11-24");
  assert.deepEqual(r, { receberAberto: 50, pagarAberto: 300, saldo: -250, receberVencido: 0, pagarVencido: 300 });
});
