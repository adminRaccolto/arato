import test from "node:test";
import assert from "node:assert/strict";
import { colunasSemMoeda, htmlRelatorio, linhasPlanilha, nomeAba, textoCelula, type TabelaExport } from "./tabela-exportavel";

const tab: TabelaExport = {
  colunas: [{ rotulo: "Item" }, { rotulo: "Data", tipo: "data" }, { rotulo: "Saldo", tipo: "numero" }, { rotulo: "Valor", tipo: "moeda" }, { rotulo: "%", tipo: "percentual" }],
  linhas: [["ACTIMAX <K>", "2026-11-18", 1500.5, 15600, 44.04], ["2,4D", null, -40, 0, 0]],
  total: ["TOTAL", "", 1460.5, 15600, 100],
};

test("texto das células na impressão", () => {
  assert.equal(textoCelula(15600, "moeda"), "R$ 15.600,00");
  assert.equal(textoCelula(44.04, "percentual"), "44,0%");
  assert.equal(textoCelula(1500.5, "numero"), "1.500,5");
  assert.equal(textoCelula("2026-11-18", "data"), "18/11/2026");
  assert.equal(textoCelula(null), "");
});

test("HTML escapa texto, marca negativo e traz o total", () => {
  const h = htmlRelatorio({ titulo: "T", tipoArquivo: "X", secoes: [{ ...tab, titulo: "Seção" }], resumo: [{ rotulo: "Total", valor: "R$ 1" }] });
  assert.match(h, /ACTIMAX &lt;K&gt;/);
  assert.match(h, /color:#B42318;">-40</);
  assert.match(h, /<tfoot>.*TOTAL/);
  assert.match(h, /Seção/);
});

test("planilha: número continua número, data vira dd/mm/aaaa e o total entra no fim", () => {
  const l = linhasPlanilha(tab);
  assert.equal(l.length, 3);
  assert.deepEqual(l[0], { Item: "ACTIMAX <K>", Data: "18/11/2026", Saldo: 1500.5, Valor: 15600, "%": 44.04 });
  assert.equal(l[2].Item, "TOTAL");
  assert.deepEqual(colunasSemMoeda(tab), ["Saldo", "%"]);
  assert.equal(nomeAba("Depósito: Santa Rita / Frei Galvão [principal] e outros"), "Depósito- Santa Rita - Frei Gal");
});
