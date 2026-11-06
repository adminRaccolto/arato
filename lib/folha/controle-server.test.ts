import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarControleFolha,
  validarPeriodoControle,
} from "./controle-server.ts";
import { alvosFolha } from "./alvos-acesso.ts";

type R = Record<string, unknown>;
function banco(falha?: { tabela: string; code: string }) {
  const tabelas: Record<string, R[]> = {
    folha_pagamento: [
      {
        id: "f1",
        fazenda_id: "cliente1",
        competencia: "2026-11",
        status: "fechado",
        cp_fgts_id: "fgts",
      },
      {
        id: "f2",
        fazenda_id: "cliente2",
        competencia: "2026-11",
        status: "fechado",
      },
    ],
    folha_funcionarios: [
      {
        id: "l1",
        folha_id: "f1",
        funcionario_id: "p1",
        nome_funcionario: "Cliente 1",
        cp_lancamento_id: "sal",
      },
      {
        id: "l2",
        folha_id: "f2",
        funcionario_id: "p2",
        nome_funcionario: "Cliente 2",
        cp_lancamento_id: "segredo",
      },
    ],
    funcionarios: [
      { id: "p1", fazenda_id: "cliente1", nome: "Cliente 1", ativo: false },
      { id: "p2", fazenda_id: "cliente2", nome: "Cliente 2" },
    ],
    funcionario_premiacoes: [
      { id: "prem-antiga", funcionario_id: "p1", fazenda_id: "cliente1", mes_referencia: "2026-11", valor: 500, descricao: "Premiação histórica", lancamento_id: "prem-cp" },
      { id: "prem-segredo", funcionario_id: "p2", fazenda_id: "cliente2", mes_referencia: "2026-11", valor: 9000, descricao: "Outro cliente" },
    ],
    lancamentos: [
      { id: "sal", fazenda_id: "cliente1", valor: 2000, status: "em_aberto" },
      {
        id: "parte",
        titulo_origem_id: "sal",
        fazenda_id: "cliente1",
        valor: 1000,
        status: "baixado",
        valor_pago: 1000,
      },
      { id: "segredo", fazenda_id: "cliente2", valor: 9000, status: "baixado" },
      { id: "prem-cp", fazenda_id: "cliente1", valor: 500, status: "baixado", valor_pago: 500 },
      { id: "avulso", fazenda_id: "cliente1", funcionario_id: "p1", valor: 700, status: "baixado", valor_pago: 700, descricao: "Salário Nov/2026 — Histórico" },
      { id: "avulso-segredo", fazenda_id: "cliente2", valor: 700, status: "baixado", descricao: "Salário Nov/2026 — Outro cliente" },
    ],
    funcionario_ferias: [
      {
        id: "fer",
        fazenda_id: "cliente1",
        funcionario_id: "p1",
        data_pagamento: "2026-11-30",
        lancamento_ids: ["fer-cp"],
      },
    ],
  };
  const consultas: { tabela: string; campos: string }[] = [];
  const db = {
    from(tabela: string) {
      let rows = [...(tabelas[tabela] ?? [])],
        limite: number | undefined;
      const q = {
        select(campos: string) {
          consultas.push({ tabela, campos });
          return q;
        },
        in(k: string, v: unknown[]) {
          rows = rows.filter((r) => v.includes(r[k]));
          return q;
        },
        ilike(k: string, v: string) {
          rows = rows.filter(r => String(r[k] ?? "").toLowerCase().startsWith(v.replace(/%$/, "").toLowerCase()));
          return q;
        },
        gte(k: string, v: unknown) {
          rows = rows.filter((r) => String(r[k] ?? "") >= String(v));
          return q;
        },
        lte(k: string, v: unknown) {
          rows = rows.filter((r) => String(r[k] ?? "") <= String(v));
          return q;
        },
        lt(k: string, v: unknown) {
          rows = rows.filter((r) => String(r[k] ?? "") < String(v));
          return q;
        },
        or(texto: string) {
          if (tabela === "lancamentos") {
            const ids =
              texto.match(/id\.in\.\(([^)]+)\)/)?.[1].split(",") ?? [];
            rows = rows.filter(
              (r) =>
                ids.includes(String(r.id)) ||
                ids.includes(String(r.titulo_origem_id)),
            );
          }
          return q;
        },
        order() {
          rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
          return q;
        },
        range(de: number, ate: number) {
          rows = rows.slice(de, ate + 1);
          return q;
        },
        limit(n: number) {
          limite = n;
          return q;
        },
        then(resolve: (r: { data: R[] | null; error: unknown }) => unknown) {
          return Promise.resolve(
            falha?.tabela === tabela
              ? { data: null, error: { code: falha.code, message: "erro" } }
              : {
                  data: limite === undefined ? rows : rows.slice(0, limite),
                  error: null,
                },
          ).then(resolve);
        },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, consultas };
}
test("controle lê somente fazendas e folhas autorizadas e mantém funcionários desligados", async () => {
  const { db } = banco();
  const d = await carregarControleFolha(db, ["cliente1"], "2026-11", "2026-11");
  assert.deepEqual(
    d.folhas.map((f) => f.id),
    ["f1"],
  );
  assert.deepEqual(
    d.linhas.map((l) => l.id),
    ["l1"],
  );
  assert.equal(d.funcionarios[0].ativo, false);
  assert.ok(d.titulos.some((t) => t.id === "parte"));
  assert.ok(!d.titulos.some((t) => t.id === "segredo"));
  assert.ok(d.vinculos.some((t) => t.titulo_id === "fer-cp"));
});
test("sem migração de conferência, os dados reais continuam disponíveis e o aviso é explícito", async () => {
  const { db } = banco({ tabela: "folha_conferencias", code: "42P01" });
  const d = await carregarControleFolha(db, ["cliente1"], "2026-11", "2026-11");
  assert.equal(d.conferenciaDisponivel, false);
  assert.ok(d.avisos.some((a) => a.includes("Seção 420")));
  assert.equal(d.linhas.length, 1);
});
test("premiações antigas e salários sem vínculo aparecem sem criar outra folha ou outro CP", async () => {
  const { db } = banco();
  const d = await carregarControleFolha(db, ["cliente1"], "2026-11", "2026-11");
  assert.equal(d.premios.length, 1);
  assert.equal(d.premios[0].origem_tabela, "funcionario_premiacoes");
  assert.equal(d.premios[0].lancamento_id, "prem-cp");
  const avulso = d.vinculos.find(v => v.titulo_id === "avulso");
  assert.equal(avulso?.sem_folha, true);
  assert.equal(avulso?.folha_id, undefined);
  assert.equal(d.folhas.length, 1);
  assert.ok(!d.titulos.some(t => t.id === "avulso-segredo"));
  assert.ok(d.avisos.some(a => a.includes("sem vínculo")));
});
test("erro de acesso não é disfarçado como ausência de migração", async () => {
  const { db } = banco({ tabela: "folha_conferencias", code: "42501" });
  await assert.rejects(
    carregarControleFolha(db, ["cliente1"], "2026-11", "2026-11"),
  );
});
test("período inválido e ausência de escopo são recusados; conferência valida a folha do alvo", async () => {
  assert.equal(validarPeriodoControle("2026-13", "2026-14"), false);
  assert.equal(validarPeriodoControle("2026-12", "2026-11"), false);
  assert.deepEqual(
    alvosFolha("conferir_funcionario", {
      folha_id: "f1",
      linha_id: "l1",
      fazenda_id: "outra",
    })?.folhas,
    ["f1"],
  );
  assert.deepEqual(
    alvosFolha("listar_controle", { fazenda_ids: ["f1", "f2"] })?.fazendas,
    ["f1", "f2"],
  );
  await assert.rejects(
    carregarControleFolha(banco().db, [], "2026-11", "2026-11"),
  );
});
