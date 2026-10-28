import { test } from "node:test";
import assert from "node:assert/strict";
import { montarFluxo, parearTransferencias, type MovRastreio } from "./rastreio-fluxo.ts";

let n = 0;
const mov = (tipo: string, q: number, dep: string, extra: Partial<MovRastreio> = {}): MovRastreio =>
  ({ id: `m${++n}`, tipo, quantidade: q, data: "2026-10-01", created_at: "2026-10-01T10:00:00Z", motivo: null, deposito_id: dep, ...extra });
const nome = (id: string | null) => ({ A: "Galpão A", B: "Armazém B" } as Record<string, string>)[id ?? ""] ?? "?";

test("NF entra no depósito A, metade vai para B, parte é consumida, o resto fica em saldo", () => {
  const movs = [
    mov("entrada", 100, "A", { nf_entrada_id: "nf1", emitente_nome: "AGROCETE" }),
    mov("saida", 50, "A", { motivo: "Transferência TRF-1 → destino" }), mov("entrada", 50, "B", { motivo: "Transferência TRF-1 ← origem" }),
    mov("saida", 30, "B", { ciclo_descricao: "SOJA 26/27" }),
  ];
  const f = montarFluxo(movs, [], nome);
  const elo = (de: string, para: string) => f.elos.find(e => e.de === de && e.para === para)?.quantidade;
  assert.equal(elo("o:forn:AGROCETE", "dep:A"), 100);
  assert.equal(elo("dep:A", "dep:B"), 50);
  assert.equal(elo("dep:B", "d:ciclo:SOJA 26/27"), 30);
  assert.equal(elo("dep:A", "s:A"), 50);
  assert.equal(elo("dep:B", "s:B"), 20);
  assert.deepEqual(f.saldos.map(s => [s.nome, s.final]), [["Galpão A", 50], ["Armazém B", 20]]);
});

test("transferência sem referência pareia pela gravação conjunta; saldo anterior vira origem", () => {
  const ant = [mov("entrada", 40, "A", { motivo: "estoque_inicial" })];
  const movs = [
    mov("saida", 10, "A", { motivo: "transferencia", observacao: "Transferência entre depósitos → Armazém B", created_at: "2026-10-02T10:00:00Z", data: "2026-10-02" }),
    mov("entrada", 10, "B", { motivo: "transferencia", observacao: "Transferência entre depósitos ← Galpão A", created_at: "2026-10-02T10:00:01Z", data: "2026-10-02" }),
  ];
  assert.equal(parearTransferencias(movs).pares.length, 1);
  const f = montarFluxo(movs, ant, nome);
  assert.equal(f.elos.find(e => e.de === "o:anterior")?.quantidade, 40);
  assert.equal(f.elos.find(e => e.de === "dep:A" && e.para === "dep:B")?.quantidade, 10);
  assert.equal(f.saldos.find(s => s.deposito_id === "A")?.final, 30);
});

test("transferência cancelada não deixa elo entre depósitos e os saldos voltam", () => {
  const movs = [
    mov("entrada", 20, "A", { motivo: "compra" }),
    mov("saida", 20, "A", { motivo: "Transferência TRF-9 → destino" }), mov("entrada", 20, "B", { motivo: "Transferência TRF-9 ← origem" }),
    mov("saida", 20, "B", { motivo: "Cancelamento — Transferência TRF-9" }), mov("entrada", 20, "A", { motivo: "Cancelamento — Transferência TRF-9" }),
  ];
  const f = montarFluxo(movs, [], nome);
  assert.equal(f.elos.some(e => e.de.startsWith("dep:") && e.para.startsWith("dep:")), false);
  assert.equal(f.saldos.find(s => s.deposito_id === "A")?.final, 20);
  assert.equal(f.saldos.find(s => s.deposito_id === "B")?.final, 0);
});
