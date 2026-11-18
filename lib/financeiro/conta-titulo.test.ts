import test from "node:test";
import assert from "node:assert/strict";
import { idDaContaDoTitulo } from "./conta-titulo";

const contas = [
  { id: "11111111-1111-4111-8111-111111111111", nome: "BANCO BRADESCO 111627" },
  { id: "22222222-2222-4222-8222-222222222222", nome: "SICREDI" },
  { id: "33333333-3333-4333-8333-333333333333", nome: "SICREDI" },
  { id: "44444444-4444-4444-8444-444444444444", nome: "", banco: "Banco do Brasil", agencia: "1234", conta: "5678-9" },
];

test("conta do título: ID, nome único, rótulo sem nome; ambíguo ou desconhecido = null", () => {
  assert.equal(idDaContaDoTitulo("22222222-2222-4222-8222-222222222222", contas), "22222222-2222-4222-8222-222222222222");
  assert.equal(idDaContaDoTitulo("banco bradesco  111627", contas), "11111111-1111-4111-8111-111111111111");
  assert.equal(idDaContaDoTitulo("Banco do Brasil Ag. 1234 C/C 5678-9", contas), "44444444-4444-4444-8444-444444444444");
  assert.equal(idDaContaDoTitulo("SICREDI", contas), null);
  assert.equal(idDaContaDoTitulo("CAIXA", contas), null);
  assert.equal(idDaContaDoTitulo(null, contas), null);
});
