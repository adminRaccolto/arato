import { test } from "node:test";
import assert from "node:assert/strict";
import { numeroDaTransferencia, ordenarCronologico, textoDoMotivo } from "./rotulo-transferencia.ts";

const deps = new Map([["TRF-011848", { origem: "Depósito Santa Rita", destino: "Depósito Insumos - Oasis" }]]);

test("entrada diz de onde veio e saída diz para onde foi", () => {
  assert.equal(textoDoMotivo("Transferência TRF-011848 ← origem", deps), "Transferência TRF-011848 — recebido de Depósito Santa Rita");
  assert.equal(textoDoMotivo("Transferência TRF-011848 → destino", deps), "Transferência TRF-011848 — enviado para Depósito Insumos - Oasis");
});

test("transferência sem depósito conhecido não inventa nome", () => {
  assert.equal(textoDoMotivo("Transferência TRF-9 ← origem", deps), "Transferência TRF-9 — recebido de origem não informada");
  assert.equal(textoDoMotivo("Transferência TRF-9 → destino", deps), "Transferência TRF-9 — enviado para destino não informado");
});

test("outros motivos não mudam, inclusive o cancelamento", () => {
  assert.equal(textoDoMotivo("compra", deps), "compra");
  assert.equal(textoDoMotivo(null, deps), null);
  const cancel = "Cancelamento — Transferência TRF-044428";
  assert.equal(textoDoMotivo(cancel, deps), cancel);
  assert.equal(numeroDaTransferencia(cancel), null);
});

test("caso do print: saldo 320, sai 40 e entra 40, sem passar por 360", () => {
  const movs = [
    { id: "a", data: "2026-11-04", tipo: "entrada", quantidade: 40, motivo: "Transferência TRF-011848 ← origem", created_at: "2026-11-04T11:18:37" },
    { id: "b", data: "2026-11-04", tipo: "saida", quantidade: 40, motivo: "Transferência TRF-011848 → destino", created_at: "2026-11-04T11:18:37" },
  ];
  let saldo = 320;
  const saldos = ordenarCronologico(movs).map(m => (saldo += m.tipo === "saida" ? -m.quantidade : m.quantidade));
  assert.deepEqual(saldos, [280, 320]);
});

test("mesmo dia segue a hora de gravação e datas diferentes seguem a data", () => {
  const movs = [
    { id: "1", data: "2026-11-04", tipo: "entrada", motivo: "compra", created_at: "2026-11-04T15:00:00" },
    { id: "2", data: "2026-11-04", tipo: "saida", motivo: "baixa_uso", created_at: "2026-11-04T09:00:00" },
    { id: "3", data: "2026-11-03", tipo: "entrada", motivo: "compra", created_at: "2026-11-05T09:00:00" },
  ];
  assert.deepEqual(ordenarCronologico(movs).map(m => m.id), ["3", "2", "1"]);
});

test("cancelamento não troca a ordem de gravação", () => {
  const movs = [
    { id: "1", data: "2026-11-04", tipo: "entrada", motivo: "Cancelamento — Transferência TRF-1", created_at: "2026-11-04T10:00:00" },
    { id: "2", data: "2026-11-04", tipo: "saida", motivo: "Cancelamento — Transferência TRF-1", created_at: "2026-11-04T10:00:01" },
  ];
  assert.deepEqual(ordenarCronologico(movs).map(m => m.id), ["1", "2"]);
});
