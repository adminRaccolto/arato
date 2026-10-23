import assert from "node:assert/strict";
import test from "node:test";
import { motivosBloqueio, mensagemBloqueio } from "./titulos-nf.ts";

test("estorno de nota: título pago, parcial, conciliado ou em borderô bloqueia; em aberto não", () => {
  const t = (p: Partial<{ status: string; conciliado: boolean; lote_id: string }>) => ({ id: "x", status: "em_aberto", conciliado: false, lote_id: null, valor: 100, ...p });
  assert.deepEqual(motivosBloqueio([t({})], "produtor"), []);
  assert.equal(motivosBloqueio([t({ status: "baixado" }), t({ status: "parcial" })], "produtor").length, 2);
  assert.match(motivosBloqueio([t({ status: "pago" })], "empresa")[0], /título da Empresa de R\$ 100\.00 já pago/);
  assert.equal(motivosBloqueio([t({ status: "pendente" })], "empresa").length, 0);
  assert.match(motivosBloqueio([t({ conciliado: true })], "produtor")[0], /conciliado/);
  assert.match(motivosBloqueio([t({ lote_id: "b1" })], "empresa")[0], /borderô/);
  assert.equal(mensagemBloqueio([]), null);
  assert.match(mensagemBloqueio(["título a pagar de R$ 1.00 já baixado"], "a NFS-e")!, /^Não dá para desfazer a NFS-e: .*Estorne a baixa/);
});
