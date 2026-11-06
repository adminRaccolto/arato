import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarAbastecimentos, periodoAbastecimentos } from "./abastecimentos-leitura.ts";

type Registro = { id: string; fazenda_id: string; bomba_id: string; data: string; created_at?: string };
function banco(registros: Registro[], falha = false) {
  const consultas: { op: string; campo?: string; valor?: unknown }[] = [];
  const sb = { from(tabela: string) {
    assert.equal(tabela, "abastecimentos");
    let rows = [...registros];
    const q = {
      select() { return q; },
      in(campo: keyof Registro, valor: string[]) { consultas.push({ op: "in", campo, valor }); rows = rows.filter(r => valor.includes(r[campo] ?? "")); return q; },
      gte(campo: keyof Registro, valor: string) { consultas.push({ op: "gte", campo, valor }); rows = rows.filter(r => String(r[campo] ?? "") >= valor); return q; },
      lt(campo: keyof Registro, valor: string) { consultas.push({ op: "lt", campo, valor }); rows = rows.filter(r => String(r[campo] ?? "") < valor); return q; },
      eq(campo: keyof Registro, valor: string) { rows = rows.filter(r => r[campo] === valor); return q; },
      order(campo: keyof Registro) { consultas.push({ op: "order", campo }); return q; },
      range(de: number, ate: number) { return Promise.resolve(falha ? { data: null, error: new Error("Falha na consulta") } : { data: rows.slice(de, ate + 1), error: null }); },
    };
    return q;
  } } as unknown as SupabaseClient;
  return { sb, consultas };
}

test("mês usa início inclusivo e próximo mês exclusivo, sem criar dia 31 inexistente", () => {
  for (const [mes, fim] of [["2026-02", "2026-03-01"], ["2024-02", "2024-03-01"], ["2026-04", "2026-05-01"], ["2026-11", "2026-12-01"], ["2026-12", "2027-01-01"]]) {
    assert.deepEqual(periodoAbastecimentos(mes), { inicio: `${mes}-01`, fimExclusivo: fim });
  }
  for (const mes of ["", "2026-00", "2026-13", "2026-2"]) assert.throws(() => periodoAbastecimentos(mes), /mês válido/);
});

test("abastecimento em 30 de novembro aparece; outro mês e outro cliente ficam de fora", async () => {
  const rows: Registro[] = [
    { id: "ultimo-dia", fazenda_id: "faz1", bomba_id: "b1", data: "2026-11-30" },
    { id: "outra-fazenda-da-conta", fazenda_id: "faz2", bomba_id: "b2", data: "2026-11-01" },
    { id: "dezembro", fazenda_id: "faz1", bomba_id: "b1", data: "2026-12-01" },
    { id: "outro-cliente", fazenda_id: "faz3", bomba_id: "b3", data: "2026-11-20" },
  ];
  const { sb, consultas } = banco(rows);
  const lista = await buscarAbastecimentos<Registro>(sb, ["faz1", "faz2"], "2026-11");
  assert.deepEqual(lista.map(r => r.id), ["ultimo-dia", "outra-fazenda-da-conta"]);
  assert.ok(consultas.some(c => c.op === "lt" && c.valor === "2026-12-01"));
  assert.ok(consultas.some(c => c.op === "order" && c.campo === "id"));
});

test("fevereiro bissexto inclui 29 e o filtro da bomba respeita o cliente", async () => {
  const { sb } = banco([
    { id: "fev29", fazenda_id: "faz1", bomba_id: "b1", data: "2024-02-29" },
    { id: "outra-bomba", fazenda_id: "faz1", bomba_id: "b2", data: "2024-02-20" },
    { id: "marco", fazenda_id: "faz1", bomba_id: "b1", data: "2024-03-01" },
  ]);
  assert.deepEqual((await buscarAbastecimentos<Registro>(sb, ["faz1"], "2024-02", "b1")).map(r => r.id), ["fev29"]);
});

test("não esconde registros depois do limite de mil; falhas são propagadas", async () => {
  const rows = Array.from({ length: 2001 }, (_, i) => ({ id: String(i), fazenda_id: "faz1", bomba_id: "b1", data: "2026-11-06" }));
  const { sb } = banco(rows);
  assert.equal((await buscarAbastecimentos(sb, ["faz1"], "2026-11")).length, 2001);
  assert.deepEqual(await buscarAbastecimentos(sb, [], "2026-11"), []);
  await assert.rejects(() => buscarAbastecimentos(banco([], true).sb, ["faz1"], "2026-11"), /Falha na consulta/);
});
