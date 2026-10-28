import { test } from "node:test";
import assert from "node:assert/strict";
import { auditarFiscalFisico, situacaoLinha, type MovAud, type NfItemAud } from "./auditoria-fiscal.ts";

const nf = (q: number, extra: Partial<NfItemAud> = {}): NfItemAud => ({ nf_entrada_id: "nf1", fazenda_id: "F", insumo_id: "I", quantidade: q, tipo_apropiacao: "estoque", cfop: "5101", ...extra });
const mov = (tipo: string, q: number, extra: Partial<MovAud> = {}): MovAud => ({ fazenda_id: "F", insumo_id: "I", tipo, quantidade: q, motivo: null, nf_entrada_id: null, ...extra });

test("compra por NF e consumo em operação: diferença é o consumo, sem alerta", () => {
  const [l] = auditarFiscalFisico([nf(100)], [mov("entrada", 100, { nf_entrada_id: "nf1" }), mov("saida", 30, { operacao: "herbicida" })], []);
  assert.equal(l.fiscal, 100); assert.equal(l.fisico, 70); assert.equal(l.diferenca, -30);
  assert.equal(l.categorias.consumo, -30); assert.equal(l.nao_explicado, 0);
  assert.equal(situacaoLinha(l), "ok");
});

test("NF processada sem movimento de estoque vira erro", () => {
  const [l] = auditarFiscalFisico([nf(100)], [], []);
  assert.equal(l.categorias.nf_divergente, -100); assert.equal(situacaoLinha(l), "erro");
});

test("entrada sem NF deixa o físico acima do fiscal (atenção)", () => {
  const [l] = auditarFiscalFisico([], [mov("entrada", 50, { motivo: "compra" })], []);
  assert.equal(l.categorias.entrada_sem_nf, 50); assert.equal(situacaoLinha(l), "atencao");
});

test("apropriação direta entra no fiscal e não no físico", () => {
  const [l] = auditarFiscalFisico([nf(40, { tipo_apropiacao: "direto" })], [], []);
  assert.equal(l.fiscal, 40); assert.equal(l.fisico, 0); assert.equal(l.categorias.apropriacao_direta, -40);
  assert.equal(situacaoLinha(l), "ok");
});

test("NF de retorno de armazém não entra no fiscal; remessa+retorno no físico se anulam", () => {
  const ls = auditarFiscalFisico([nf(100), nf(20, { nf_entrada_id: "ret", cfop: "5906" })], [
    mov("entrada", 100, { nf_entrada_id: "nf1" }),
    mov("saida", 20, { motivo: "Remessa NF 3118 → LUFT" }), mov("entrada", 20, { motivo: "Remessa NF 3118 → LUFT" }),
    mov("saida", 20, { motivo: "Retorno NF 900" }), mov("entrada", 20, { nf_entrada_id: "ret" }),
  ], []);
  const l = ls[0];
  assert.equal(l.fiscal, 100); assert.equal(l.fisico, 100); assert.equal(l.diferenca, 0); assert.equal(situacaoLinha(l), "ok");
});

test("transferência entre fazendas com NF move o fiscal; sem NF fica como transferência sem NF", () => {
  const movs = [
    mov("entrada", 100, { nf_entrada_id: "nf1" }),
    mov("saida", 30, { motivo: "Transferência TRF-1 → destino" }), mov("entrada", 30, { fazenda_id: "G", motivo: "Transferência TRF-1 ← origem" }),
    mov("saida", 10, { motivo: "Transferência TRF-2 → destino" }), mov("entrada", 10, { fazenda_id: "G", motivo: "Transferência TRF-2 ← origem" }),
  ];
  const ls = auditarFiscalFisico([nf(100)], movs, [
    { numero: "TRF-1", status: "emitida", com_nf: true, fazenda_origem_id: "F", fazenda_destino_id: "G", insumo_id: "I", quantidade: 30 },
    { numero: "TRF-2", status: "cancelada", com_nf: false, fazenda_origem_id: "F", fazenda_destino_id: "G", insumo_id: "I", quantidade: 10 },
  ]);
  const f = ls.find(l => l.fazenda_id === "F")!, g = ls.find(l => l.fazenda_id === "G")!;
  assert.equal(f.fiscal, 70); assert.equal(f.fisico, 60); assert.equal(f.categorias.transferencia_sem_nf, -10); assert.equal(f.categorias.nf_divergente, 0);
  assert.equal(g.fiscal, 30); assert.equal(g.fisico, 40); assert.equal(g.categorias.transferencia_sem_nf, 10);
});
