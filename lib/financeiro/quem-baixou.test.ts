import assert from "node:assert/strict";
import test from "node:test";
import { ultimaBaixa } from "./quem-baixou-regra.ts";

test("quem baixou: última alteração que virou baixado/pago ou mudou o valor pago", () => {
  const m = ultimaBaixa([
    { registro_id: "a", usuario_app: "Jaqueline", created_at: "2026-10-01T10:00:00Z", dados_antes: { status: "em_aberto", valor_pago: null }, dados_depois: { status: "parcial", valor_pago: 100 } },
    { registro_id: "a", usuario_app: "Samily", created_at: "2026-10-05T10:00:00Z", dados_antes: { status: "parcial", valor_pago: 100 }, dados_depois: { status: "baixado", valor_pago: 300 } },
    { registro_id: "a", usuario_app: "Gino", created_at: "2026-10-06T10:00:00Z", dados_antes: { status: "baixado", valor_pago: 300 }, dados_depois: { status: "baixado", valor_pago: 300, operacao_gerencial_id: "x" } },
    { registro_id: "b", usuario_app: null, created_at: "2026-10-02T10:00:00Z", dados_antes: { status: "pendente" }, dados_depois: { status: "pago", valor_pago: 50 } },
    { registro_id: "c", usuario_app: "Gino", created_at: "2026-10-02T10:00:00Z", dados_antes: { status: "em_aberto" }, dados_depois: { status: "em_aberto", descricao: "x" } },
  ]);
  assert.equal(m.get("a")?.nome, "Samily");
  assert.equal(m.get("b")?.nome, null);
  assert.equal(m.has("c"), false);
});
