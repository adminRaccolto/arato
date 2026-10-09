import assert from "node:assert/strict";
import test from "node:test";
import { dataLocalAgora, dataParaIso, exibirData, mascararData } from "./input-data";

test("digitação contínua acrescenta barras sem exigir mudança de segmento", () => {
  const etapas = ["0", "09", "09/1", "09/10", "09/10/2", "09/10/20", "09/10/202", "09/10/2026"];
  for (let i = 1; i <= 8; i++) {
    const display = mascararData("09102026".slice(0, i));
    assert.equal(display, etapas[i - 1]);
    assert.equal(dataParaIso(display), i === 8 ? "2026-10-09" : "");
  }
  assert.equal(mascararData("09/10/2026"), "09/10/2026");
});

test("datas digitadas e selecionadas no calendário usam o mesmo valor ISO", () => {
  for (const iso of ["2026-10-09", "2028-02-29", "2000-02-29", "2026-12-31"]) {
    assert.equal(dataParaIso(exibirData(iso)), iso);
  }
  assert.equal(exibirData(""), "");
  assert.equal(dataParaIso(""), "");
});

test("dias inexistentes, anos não bissextos e datas incompletas não são enviados", () => {
  for (const data of ["31/04/2026", "29/02/2026", "29/02/1900", "00/10/2026", "09/00/2026", "09/13/2026", "09/10/0000", "09/10/202"]) {
    assert.equal(dataParaIso(data), "", data);
  }
});

test("data e hora permitem digitação contínua e preservam a hora local sem conversão UTC", () => {
  const display = mascararData("091020261430", "datetime-local");
  assert.equal(display, "09/10/2026 14:30");
  assert.equal(dataParaIso(display, "datetime-local"), "2026-10-09T14:30");
  assert.equal(exibirData("2026-10-09T14:30", "datetime-local"), display);
  for (const invalida of ["09/10/2026 24:00", "09/10/2026 23:60", "09/10/2026 14:3"]) {
    assert.equal(dataParaIso(invalida, "datetime-local"), "");
  }
});

test("Hoje e Agora usam a data e a hora locais do usuário", () => {
  const agora = new Date(2026, 9, 9, 23, 45);
  assert.equal(dataLocalAgora("date", agora), "2026-10-09");
  assert.equal(dataLocalAgora("datetime-local", agora), "2026-10-09T23:45");
});

test("competência mensal aceita digitação contínua e mantém o formato ISO sem dia", () => {
  assert.equal(mascararData("102026", "month"), "10/2026");
  assert.equal(dataParaIso("10/2026", "month"), "2026-10");
  assert.equal(exibirData("2026-10", "month"), "10/2026");
  for (const invalida of ["00/2026", "13/2026", "10/0000", "10/202"]) {
    assert.equal(dataParaIso(invalida, "month"), "");
  }
  assert.equal(dataLocalAgora("month", new Date(2026, 9, 9)), "2026-10");
});
