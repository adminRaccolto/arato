import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarCustosCaixa } from "./carregar-custos-caixa";
import { totalCustosCaixa, type RegistroCaixa } from "./custos-caixa";
function banco(
  tabelas: Record<string, RegistroCaixa[]>,
  falha?: { tabela: string; pagina: number },
) {
  const consultas: {
    tabela: string;
    campos: string;
    de: number;
    filtros: string[];
  }[] = [];
  class Query {
    de = 0;
    ate = 999;
    campos = "";
    predicados: ((t: RegistroCaixa) => boolean)[] = [];
    filtros: string[] = [];
    constructor(readonly tabela: string) {}
    select(campos: string) {
      this.campos = campos;
      return this;
    }
    order(c: string) {
      assert.equal(c, "id");
      return this;
    }
    range(de: number, ate: number) {
      this.de = de;
      this.ate = ate;
      return this;
    }
    returns() {
      return this;
    }
    eq(c: string, v: unknown) {
      this.filtros.push(c);
      this.predicados.push((t) => t[c] === v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filtros.push(c);
      this.predicados.push((t) => vs.includes(t[c]));
      return this;
    }
    gte(c: string, v: string) {
      this.filtros.push(c);
      this.predicados.push((t) => t[c] != null && String(t[c]) >= v);
      return this;
    }
    lte(c: string, v: string) {
      this.filtros.push(c);
      this.predicados.push((t) => t[c] != null && String(t[c]) <= v);
      return this;
    }
    then(
      resolve: (r: {
        data: RegistroCaixa[] | null;
        error: { message: string } | null;
      }) => unknown,
    ) {
      consultas.push({
        tabela: this.tabela,
        campos: this.campos,
        de: this.de,
        filtros: this.filtros,
      });
      const erro = falha?.tabela === this.tabela && falha.pagina === this.de;
      return Promise.resolve(
        resolve({
          data: erro
            ? null
            : (tabelas[this.tabela] ?? [])
                .filter((t) => this.predicados.every((f) => f(t)))
                .sort((a, b) => String(a.id).localeCompare(String(b.id)))
                .slice(this.de, this.ate + 1),
          error: erro ? { message: "Falha simulada" } : null,
        }),
      );
    }
  }
  return {
    db: {
      from: (tabela: string) => new Query(tabela),
    } as unknown as SupabaseClient,
    consultas,
  };
}
const filtro = { inicio: "2026-09-01", fim: "2026-09-30", fazendaIds: ["f"] };
const linha = (id: string, patch: RegistroCaixa = {}): RegistroCaixa => ({
  id,
  fazenda_id: "f",
  tipo: "pagar",
  descricao: "Insumos",
  categoria: "Insumos",
  valor: 100,
  valor_pago: 100,
  status: "baixado",
  data_baixa: "2026-09-01",
  moeda: "BRL",
  ...patch,
});
test("carrega todas as páginas pelo período de baixa e somente produtores/empresas selecionados", async () => {
  const { db, consultas } = banco({
    lancamentos: [
      ...Array.from({ length: 1001 }, (_, i) => linha(String(i))),
      linha("fora", { fazenda_id: "outro" }),
      linha("venc", {
        data_baixa: "2026-08-31",
        data_vencimento: "2026-09-10",
      }),
    ],
    empresa_lancamentos: [
      linha("pj", {
        status: "pago",
        data_pagamento: "2026-09-30",
        data_baixa: null,
        valor_pago: 200,
      }),
    ],
  });
  const r = await carregarCustosCaixa(db, filtro);
  assert.equal(r.pagamentos.length, 1002);
  assert.equal(totalCustosCaixa(r.pagamentos), 100300);
  assert.ok(consultas.some((c) => c.tabela === "lancamentos" && c.de === 1000));
  assert.ok(consultas.every((c) => c.campos !== "*"));
  assert.ok(
    consultas
      .filter((c) => c.tabela === "empresa_lancamentos")
      .every((c) => c.filtros.includes("data_pagamento")),
  );
  assert.ok(
    consultas.every(
      (c) =>
        ![
          "plantios",
          "folha_funcionarios",
          "abastecimentos",
          "movimentacoes_estoque",
          "pagamento_lotes",
        ].includes(c.tabela),
    ),
  );
});
test("qualquer erro de origem ou página falha o relatório inteiro, não apresenta um falso zero", async () => {
  const { db } = banco(
    { lancamentos: Array.from({ length: 1001 }, (_, i) => linha(String(i))) },
    { tabela: "lancamentos", pagina: 1000 },
  );
  await assert.rejects(
    carregarCustosCaixa(db, filtro),
    /carregar lancamentos.*Falha simulada/,
  );
  const empresa = banco({}, { tabela: "empresa_lancamentos", pagina: 0 });
  await assert.rejects(
    carregarCustosCaixa(empresa.db, filtro),
    /empresa_lancamentos/,
  );
});
test("não exige safra nem ciclos cadastrados e permite custo operacional sem ciclo", async () => {
  const { db } = banco({
    lancamentos: [
      linha("x", { operacao_gerencial_id: "og", categoria: "Outra" }),
    ],
    operacoes_gerenciais: [
      { id: "og", classificacao: "2.01.01.04.001", descricao: "Arrendamento" },
    ],
  });
  const r = await carregarCustosCaixa(db, filtro);
  assert.equal(totalCustosCaixa(r.pagamentos), 100);
  assert.equal(r.pagamentos[0].cicloId, null);
  assert.equal(r.pagamentos[0].categoria, "Arrendamento");
});
test("fatura só busca os itens relacionados e dentro das fazendas autorizadas", async () => {
  const { db, consultas } = banco({
    lancamentos: [
      linha("pago", {
        origem_lancamento: "cartao_fatura",
        valor: 300,
        valor_pago: 300,
      }),
      linha("item1", {
        status: "cartao",
        fatura_cartao_id: "fat",
        ciclo_id: "c",
      }),
      linha("item2", { status: "cartao", valor: 200, fatura_cartao_id: "fat" }),
      linha("outro", {
        status: "cartao",
        fatura_cartao_id: "fat",
        fazenda_id: "outro",
      }),
    ],
    faturas_cartao: [{ id: "fat", lancamento_cp_id: "pago" }],
  });
  const r = await carregarCustosCaixa(db, filtro);
  assert.equal(r.pagamentos.length, 2);
  assert.equal(totalCustosCaixa(r.pagamentos), 300);
  assert.ok(
    consultas.some(
      (c) =>
        c.tabela === "lancamentos" &&
        c.filtros.includes("fatura_cartao_id") &&
        c.filtros.includes("fazenda_id"),
    ),
  );
});
test("períodos inválidos e ausência de fazendas impedem a consulta", async () => {
  const { db, consultas } = banco({});
  for (const p of [
    { ...filtro, inicio: "2026-10-01" },
    { ...filtro, inicio: "2026-02-31" },
    { ...filtro, fim: "" },
    { ...filtro, fazendaIds: [] },
  ])
    await assert.rejects(carregarCustosCaixa(db, p));
  assert.equal(consultas.length, 0);
});
