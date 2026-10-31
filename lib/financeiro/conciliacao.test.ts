import assert from "node:assert/strict";
import test from "node:test";
import { ajustarVinculosParaFk, caixaDoBordero, ehLinhaSaldo, linhaMudou, pagoSemExtrato } from "./conciliacao.ts";

test("título de Empresa (fora de lancamentos) vai só para lancamento_ids e lancamento_id fica nulo", () => {
  const rows = [{ lancamento_id: "emp-1", lancamento_ids: null as string[] | null }];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].lancamento_id, null);
  assert.deepEqual(rows[0].lancamento_ids, ["emp-1"]);
});

test("título do produtor mantém lancamento_id (FK válida)", () => {
  const rows = [{ lancamento_id: "prod-1", lancamento_ids: ["prod-1"] }];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].lancamento_id, "prod-1");
});

test("vários títulos com ids mistos: lancamento_ids existente é preservado", () => {
  const rows = [{ lancamento_id: "emp-1", lancamento_ids: ["emp-1", "prod-1"] }];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].lancamento_id, null);
  assert.deepEqual(rows[0].lancamento_ids, ["emp-1", "prod-1"]);
});

const ex = { valor: 100, conciliado: true, lancamento_id: "a", lancamento_ids: ["a"], lancamento_desc: "d", lancamento_valor: 100 };
const nova = { valor: 100, conciliado: true, lancamento_id: "a", lancamento_ids: ["a"], lancamento_desc: "d", lancamento_valor: 100 };

test("linha idêntica não é regravada; linha nova é", () => {
  assert.equal(linhaMudou(ex, nova, false), false);
  assert.equal(linhaMudou(undefined, nova, false), true);
});

test("mudança de vínculo, de valor ou de conciliado é detectada", () => {
  assert.equal(linhaMudou(ex, { ...nova, conciliado: false }, false), true);
  assert.equal(linhaMudou(ex, { ...nova, lancamento_ids: ["a", "b"] }, false), true);
  assert.equal(linhaMudou(ex, { ...nova, valor: 100.5 }, false), true);
  assert.equal(linhaMudou(ex, { ...nova, lancamento_id: "b" }, false), true);
});

test("ordem dos ids não conta como mudança", () => {
  assert.equal(linhaMudou({ ...ex, lancamento_ids: ["a", "b"] }, { ...nova, lancamento_ids: ["b", "a"] }, false), false);
});

test("origem/confiança só contam quando as colunas novas existem", () => {
  assert.equal(linhaMudou({ ...ex, origem_vinculo: "manual" }, { ...nova, origem_vinculo: "sugestao" }, false), false);
  assert.equal(linhaMudou({ ...ex, origem_vinculo: "manual" }, { ...nova, origem_vinculo: "sugestao" }, true), true);
});

test("sugestão de título de Empresa (fora de lancamentos) é anulada para não violar a FK na importação", () => {
  const rows = [
    { lancamento_id: null, lancamento_ids: null, sugestao_lancamento_id: "emp-9" as string | null },
    { lancamento_id: null, lancamento_ids: null, sugestao_lancamento_id: "prod-1" as string | null },
  ];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].sugestao_lancamento_id, null);
  assert.equal(rows[1].sugestao_lancamento_id, "prod-1");
});

test("borderô pago: caixa = principal + juros + multa − desconto", () => {
  assert.equal(caixaDoBordero({ status: "pago", valor_total: 8277.2, valor_pago: 8277.2, valor_juros: 833.23 }), 9110.43);
  assert.equal(caixaDoBordero({ status: "pago", valor_total: 10114.46, valor_pago: 10114.46, valor_desconto: 241.26 }), 9873.2);
  assert.equal(caixaDoBordero({ status: "pago", valor_total: 9182.71 }), 9182.71);
});

test("borderô pendente: o saldo em aberto", () => {
  assert.equal(caixaDoBordero({ status: "pendente", valor_total: 1000 }), 1000);
  assert.equal(caixaDoBordero({ status: "pendente", valor_total: 1000, valor_pago: 400 }), 600);
});

test("dois pagamentos parciais registrados no CP: cada linha cobre um pedaço", () => {
  assert.equal(pagoSemExtrato(10000, []), 10000);
  assert.equal(pagoSemExtrato(10000, [{ valor: -4000, titulos: 1 }]), 6000);
  assert.equal(pagoSemExtrato(10000, [{ valor: -4000, titulos: 1 }, { valor: -6000, titulos: 1 }]), 0);
});

test("linha ligada a vários títulos cobre o título inteiro", () => {
  assert.equal(pagoSemExtrato(500, [{ valor: -1500, titulos: 3 }]), 0);
});

test("reimportação com FITID novo: mesma transação não entra de novo, por contagem", async () => {
  const { linhasJaImportadas } = await import("./conciliacao.ts");
  const ex = [
    { data: "2026-09-10", valor: 20000, descricao: "PIX DEBITO PARA: SANTA RITA", tipo: "debito" },
    { data: "2026-09-10", valor: 500, descricao: "Tarifa", tipo: "debito" },
  ];
  const novas = [
    { id: "a", data: "2026-09-10", valor: 20000, descricao: "pix debito para:  santa rita", tipo: "debito" },
    { id: "b", data: "2026-09-10", valor: 500, descricao: "TARIFA", tipo: "debito" },
    { id: "c", data: "2026-09-10", valor: 500, descricao: "TARIFA", tipo: "debito" },   // segunda tarifa igual: nova
    { id: "d", data: "2026-09-11", valor: 20000, descricao: "PIX DEBITO PARA: SANTA RITA", tipo: "debito" },
    { id: "e", data: "2026-09-10", valor: 20000, descricao: "PIX DEBITO PARA: SANTA RITA", tipo: "credito" },
  ];
  assert.deepEqual([...linhasJaImportadas(novas, ex)].sort(), ["a", "b"]);
});

test("linha de saldo do extrato não é transação; descrições normais com 'saldo' continuam", () => {
  for (const d of ["SALDO TOTAL DISPONÍVEL DIA", "SALDO ANTERIOR", "Saldo Anterior", "SALDO DO DIA", "SDO CTA/APL"]) assert.equal(ehLinhaSaldo(d), true, d);
  for (const d of ["SALDO REFERENTE A ALUGUEL DA CAMIONETE", "PIX RECEBIDO SALDO", "PAGAMENTO SALDO DEVEDOR", "RESGATE APLICACAO", "", null]) assert.equal(ehLinhaSaldo(d), false, String(d));
});
