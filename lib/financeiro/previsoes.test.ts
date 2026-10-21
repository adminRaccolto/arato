import { test } from "node:test";
import assert from "node:assert/strict";
import { datasRecorrencia, resultadoConsumo, ogCasa, previsaoVencida, previstoRealizado } from "./previsoes.ts";

test("recorrência mensal mantém o dia e ajusta mês curto", () => {
  assert.deepEqual(datasRecorrencia("2026-01-31", 3), ["2026-01-31", "2026-02-28", "2026-03-31"]);
  assert.deepEqual(datasRecorrencia("2026-11-10", 3), ["2026-11-10", "2026-12-10", "2027-01-10"]);
  assert.deepEqual(datasRecorrencia("2026-01-05", 2, 3), ["2026-01-05", "2026-04-05"]);
});

test("consumo igual ao saldo: cumprida sem diferença", () => {
  assert.deepEqual(resultadoConsumo({ saldo: 1000, valorPrevisto: 1000, consumido: 1000 }), { status: "cumprida", diferenca: 0, dentroTolerancia: false });
});

test("gasto menor ou maior vai para decisão do gestor (sem tolerância)", () => {
  assert.equal(resultadoConsumo({ saldo: 10000, valorPrevisto: 10000, consumido: 6000 }).status, "pendente_decisao");
  assert.equal(resultadoConsumo({ saldo: 10000, valorPrevisto: 10000, consumido: 6000 }).diferenca, 4000);
  assert.equal(resultadoConsumo({ saldo: 10000, valorPrevisto: 10000, consumido: 12000 }).diferenca, -2000);
});

test("diferença dentro da tolerância é efetivada sozinha", () => {
  const r = resultadoConsumo({ saldo: 1000, valorPrevisto: 1000, consumido: 990, tolerancia: { pct: 2, valor: 0 } });
  assert.equal(r.status, "cumprida");
  assert.equal(r.dentroTolerancia, true);
  assert.equal(resultadoConsumo({ saldo: 1000, valorPrevisto: 1000, consumido: 900, tolerancia: { pct: 2, valor: 50 } }).status, "pendente_decisao");
});

test("OG filha casa com previsão de grupo, irmã não", () => {
  assert.equal(ogCasa("2.01.03", "2.01.03"), true);
  assert.equal(ogCasa("2.01.03", "2.01.03.002"), true);
  assert.equal(ogCasa("2.01.03", "2.01.030"), false);
  assert.equal(ogCasa("2.01.03", "2.01.04"), false);
});

test("vencida: aberta, com saldo e vencimento passado", () => {
  assert.equal(previsaoVencida({ status: "aberta", saldo: 10, data_vencimento: "2026-10-01" }, "2026-10-21"), true);
  assert.equal(previsaoVencida({ status: "cumprida", saldo: 0, data_vencimento: "2026-10-01" }, "2026-10-21"), false);
  assert.equal(previsaoVencida({ status: "aberta", saldo: 10, data_vencimento: "2026-10-21" }, "2026-10-21"), false);
});

test("previsto × realizado: título de OG filha cai na previsão de grupo; sem previsão aparece sozinho", () => {
  const linhas = previstoRealizado(
    [
      { og_classificacao: "2.01.03", data_vencimento: "2026-03-10", valor: 10000, status: "cumprida" },
      { og_classificacao: "2.01.03.001", data_vencimento: "2026-03-10", valor: 2000, status: "aberta" },
      { og_classificacao: "2.09", data_vencimento: "2026-03-10", valor: 500, status: "cancelada" },
    ],
    [
      { og_classificacao: "2.01.03.002", valor: 6000, data_vencimento: "2026-03-15" },
      { og_classificacao: "2.01.03.001", valor: 2500, data_vencimento: "2026-03-20" },
      { og_classificacao: "2.05.01", valor: 300, data_vencimento: "2026-03-01" },
    ],
  );
  const g = linhas.find(l => l.og === "2.01.03")!;
  assert.deepEqual([g.previsto, g.realizado, g.desvio], [10000, 6000, 4000]);
  const f = linhas.find(l => l.og === "2.01.03.001")!;
  assert.deepEqual([f.previsto, f.realizado, f.desvio], [2000, 2500, -500]);
  const s = linhas.find(l => l.og === "2.05.01")!;
  assert.equal(s.semPrevisao, true);
  assert.equal(linhas.some(l => l.og === "2.09"), false);
});

test("leitura de caixa usa data e valor da baixa", () => {
  const l = previstoRealizado([], [
    { og_classificacao: "2.01", valor: 1000, data_vencimento: "2026-03-10", data_baixa: "2026-04-02", valor_pago: 1010 },
    { og_classificacao: "2.01", valor: 500, data_vencimento: "2026-03-10", data_baixa: null },
  ], "caixa");
  assert.equal(l.length, 1);
  assert.deepEqual([l[0].mes, l[0].realizado], ["2026-04", 1010]);
});
