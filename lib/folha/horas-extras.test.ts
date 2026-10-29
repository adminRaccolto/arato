import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularHorasExtras, diasDaCompetencia, feriadosNacionais } from "./horas-extras.ts";

test("dias úteis e de descanso da competência (domingos + feriados nacionais)", () => {
  // Outubro/2026: 4 domingos + 12/10 (segunda) = 5 de descanso; 26 úteis
  assert.deepEqual(diasDaCompetencia("2026-10"), { uteis: 26, descanso: 5 });
  // Abril/2026: Sexta-feira Santa 03/04 e Tiradentes 21/04 + 4 domingos
  assert.ok(feriadosNacionais(2026).has("2026-04-03"));
  assert.deepEqual(diasDaCompetencia("2026-04"), { uteis: 24, descanso: 6 });
});

test("horas extras 50% e 100% sobre o valor da hora (salário ÷ 220) e DSR", () => {
  const c = calcularHorasExtras({ salario_base: 2200, horas_50: 10, horas_100: 4, competencia: "2026-10" });
  assert.equal(c.valor_hora, 10);
  assert.equal(c.valor_50, 150);
  assert.equal(c.valor_100, 80);
  assert.equal(c.he_valor, 230);
  assert.equal(c.he_dsr, 44.23);     // 230 ÷ 26 × 5
  assert.deepEqual(calcularHorasExtras({ salario_base: 2200, competencia: "2026-10" }).he_dsr, 0);
});
