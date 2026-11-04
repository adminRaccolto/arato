import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarLinhas, pontosDeNome, type LancMatch, type LinhaMatch } from "./conciliacao-match.ts";

const ctx = { conta: { id: "c1", titulares: ["p1"] } };
const sal = (id: string, nome: string, valor = 4000): LancMatch => ({ id, tipo: "pagar", descricao: `Salário Out/2026 — ${nome}`, valor, data_vencimento: "2026-11-03", status: "em_aberto", produtor_id: "p1", moeda: "BRL" });
const lin = (id: string, descricao: string, valor = 4000): LinhaMatch => ({ id, data: "2026-11-03", valor, tipo: "debito", descricao });

test("nome cortado pelo banco ainda confere; palavras do banco não contam", () => {
  assert.equal(pontosDeNome("PAGAMENTO PIX-CX368628 06340252109 ALEX DA PALMA SA", "Salário Out/2026 — ALEX DA PALMA SANTOS"), 2);
  assert.equal(pontosDeNome("PAGAMENTO PIX-PIX_DEB 01015174167 ODAIR APA", "Salário Out/2026 — JHONATHAN MARCOS SIQUEIRA"), 0);
});

test("cada PIX casa com o título do próprio nome, mesmo fora de ordem", () => {
  const r = avaliarLinhas(
    [lin("a", "PAGAMENTO PIX-CX1 ODAIR APARECIDO"), lin("b", "PAGAMENTO PIX-CX2 ALEX PALMA"), lin("c", "PAGAMENTO PIX-CX3 JHONATHAN MARCOS")],
    [sal("j", "JHONATHAN MARCOS SIQUEIRA"), sal("o", "ODAIR APARECIDO DE SOUZA"), sal("x", "ALEX DA PALMA SANTOS")], ctx);
  assert.equal(r.get("a")?.lancamento?.id, "o");
  assert.equal(r.get("b")?.lancamento?.id, "x");
  assert.equal(r.get("c")?.lancamento?.id, "j");
});

test("PIX de outra pessoa não recebe o título, e o título vai só para quem tem o nome", () => {
  const r = avaliarLinhas([lin("a", "PAGAMENTO PIX ALEX PALMA"), lin("b", "PAGAMENTO PIX ODAIR APARECIDO"), lin("c", "PAGAMENTO PIX JHONATHAN")], [sal("j", "JHONATHAN MARCOS SIQUEIRA")], ctx);
  assert.equal(r.get("c")?.lancamento?.id, "j");
  assert.equal(r.get("a")?.lancamento, undefined);
  assert.equal(r.get("b")?.lancamento, undefined);
  assert.equal(r.get("a")?.nivel, "bloqueado");
});

test("linhas sem nome: um título por linha e nada casa sozinho", () => {
  const r = avaliarLinhas([lin("a", "PIX EMITIDO OUTRA IF"), lin("b", "PIX EMITIDO OUTRA IF"), lin("c", "PIX EMITIDO OUTRA IF")], [sal("v", "VALDORI TABORDA", 3814.32)].map(t => ({ ...t, valor: 4000 })), ctx);
  const com = ["a", "b", "c"].filter(k => r.get(k)?.lancamento);
  assert.equal(com.length, 1);
  assert.equal(r.get(com[0])?.nivel, "media");
  assert.deepEqual(r.get(com[0])?.motivos, ["linha sem o nome do funcionário"]);
});

test("nome confirmado e título único concilia sozinho", () => {
  const r = avaliarLinhas([lin("a", "PAGAMENTO PIX JHONATHAN MARCOS")], [sal("j", "JHONATHAN MARCOS SIQUEIRA")], ctx);
  assert.equal(r.get("a")?.nivel, "alta");
});

test("título que não é salário não é bloqueado por nome", () => {
  const nf: LancMatch = { id: "n", tipo: "pagar", descricao: "NF 123 — AGRO INSUMOS", valor: 500, data_vencimento: "2026-11-03", status: "em_aberto", produtor_id: "p1", moeda: "BRL" };
  const r = avaliarLinhas([lin("a", "PAGAMENTO BOLETO FORNECEDOR XPTO", 500)], [nf], ctx);
  assert.equal(r.get("a")?.lancamento?.id, "n");
});
