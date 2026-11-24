import test from "node:test";
import assert from "node:assert/strict";
import { entraNoApoio, fluxoEmAberto, montarRelatorioApoio, statusApoioDe, type TituloExclusivoRel, type TituloOficialRel } from "./apoio-relatorio.ts";

const of = (o: Partial<TituloOficialRel>): TituloOficialRel => ({
  tipo: "pagar", descricao: "x", valor: 100, data_vencimento: "2026-12-01", data_baixa: null, status: "em_aberto", categoria: null,
  pessoa: "", documento: "", statusApoio: "aberto", dataBaixaApoio: null, contaBaixaApoio: "", ...o,
});
const ex = (o: Partial<TituloExclusivoRel>): TituloExclusivoRel => ({
  tipo: "pagar", descricao: "y", valor: 50, data_vencimento: "2026-12-05", data_baixa: null, baixado: false, pessoa: "", documento: "",
  produtor: "", safra: "", origem: "", categoria: "", observacao: "", ...o,
});

test("status: baixa do Apoio vale mais que a oficial", () => {
  assert.equal(statusApoioDe("em_aberto", false), "aberto");
  assert.equal(statusApoioDe("baixado", false), "baixado_oficial");
  assert.equal(statusApoioDe("baixado", true), "baixado_apoio");
  assert.equal(statusApoioDe("em_aberto", true), "baixado_apoio");
});

test("cancelado e cartão ficam fora do Apoio", () => {
  assert.equal(entraNoApoio("cancelado"), false);
  assert.equal(entraNoApoio("cartao"), false);
  assert.equal(entraNoApoio("vencido"), true);
});

test("fluxo projetado só com o que está em aberto, saldo acumulado por vencimento", () => {
  const f = fluxoEmAberto(
    [of({ tipo: "receber", valor: 1000, data_vencimento: "2026-12-10" }), of({ valor: 300, data_vencimento: "2026-12-01" }), of({ valor: 999, statusApoio: "baixado_oficial" })],
    [ex({ valor: 200, data_vencimento: "2026-12-20" }), ex({ valor: 7, baixado: true })],
  );
  assert.deepEqual(f.map(l => [l.data, l.saldo]), [["2026-12-01", -300], ["2026-12-10", 700], ["2026-12-20", 500]]);
});

test("relatório: resumo, quatro abas e filtros com período", () => {
  const r = montarRelatorioApoio({
    oficiais: [of({ valor: 100 }), of({ tipo: "receber", valor: 400, statusApoio: "baixado_apoio" })],
    exclusivos: [ex({ valor: 50 })],
    periodo: { de: "2026-01-01", ate: "2026-12-31" }, filtros: [{ rotulo: "Tipo", valor: "" }],
  });
  assert.deepEqual(r.planilhas!.map(p => p.nome), ["Resumo", "CP-CR Oficial", "Apoio Exclusivo", "Fluxo Projetado"]);
  assert.equal(r.filtros![0].valor, "01/01/2026 a 31/12/2026");
  assert.equal(r.filtros!.length, 1);
  assert.equal(r.secoes[0].total![2], -150);
  assert.equal(r.secoes[1].colunas.some(c => c.rotulo === "Moeda"), false);
  const usd = montarRelatorioApoio({ oficiais: [of({ moeda: "USD" })], exclusivos: [], periodo: { de: "2026-01-01", ate: "2026-12-31" } });
  assert.equal(usd.secoes[1].colunas.some(c => c.rotulo === "Moeda"), true);
  assert.equal(usd.secoes[1].linhas[0].length, usd.secoes[1].colunas.length);
});
