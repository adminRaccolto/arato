import assert from "node:assert/strict";
import test from "node:test";
import { motivoBloqueioExclusao } from "./bloqueio-exclusao.ts";

test("título de nota processada é bloqueado e a mensagem ensina o caminho (desfazer baixa, estornar)", () => {
  const m = motivoBloqueioExclusao({ tipo: "NF", numero: "2503", status: "processada" });
  assert.ok(m && m.includes("NF 2503") && m.includes("desfaça a baixa") && m.includes("estorne"));
  assert.equal(motivoBloqueioExclusao({ tipo: "NFS-e", numero: "88", status: "pendente" }), null);
  assert.equal(motivoBloqueioExclusao(null), null);
});
