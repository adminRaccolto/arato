import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  carregarResultadoAgricola,
  repositorioResultados,
  type ReferenciasResultado,
} from "./carregar";
import { totaisResultado } from "./apuracao";
type Row = Record<string, unknown>;
function banco(
  tabelas: Record<string, Row[]>,
  falha?: { tabela: string; pagina?: number },
) {
  const consultas: { tabela: string; de: number; ate: number }[] = [];
  class Consulta {
    tabela: string;
    filtros: ((r: Row) => boolean)[] = [];
    de = 0;
    ate = 999;
    constructor(tabela: string) {
      this.tabela = tabela;
    }
    select() {
      return this;
    }
    order() {
      return this;
    }
    returns() {
      return this;
    }
    eq(c: string, v: unknown) {
      this.filtros.push((r) => r[c] === v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filtros.push((r) => vs.includes(r[c]));
      return this;
    }
    gte(c: string, v: string) {
      this.filtros.push((r) => String(r[c] ?? "") >= v);
      return this;
    }
    lte(c: string, v: string) {
      this.filtros.push((r) => String(r[c] ?? "") <= v);
      return this;
    }
    or(expr: string) {
      const ids =
        expr.match(/ano_safra_id.in.\(([^)]+)\)/)?.[1].split(",") ?? [];
      const ciclos =
        expr.match(/ciclo_id.in.\(([^)]+)\)/)?.[1].split(",") ?? [];
      const periodo = [
        ...expr.matchAll(/(?:data_vencimento|data)\.(gte|lte)\.([^,)]+)/g),
      ];
      this.filtros.push(
        (r) =>
          ciclos.includes(String(r.ciclo_id)) ||
          ids.includes(String(r.ano_safra_id)) ||
          (periodo.length > 0 &&
            r.ano_safra_id == null &&
            periodo.every((m) =>
              m[1] === "gte"
                ? String(r.data_vencimento ?? r.data) >= m[2]
                : String(r.data_vencimento ?? r.data) <= m[2],
            )),
      );
      return this;
    }
    range(de: number, ate: number) {
      this.de = de;
      this.ate = ate;
      return this;
    }
    then(
      resolve: (r: {
        data: Row[] | null;
        error: { message: string } | null;
      }) => unknown,
    ) {
      consultas.push({ tabela: this.tabela, de: this.de, ate: this.ate });
      const erro =
        falha?.tabela === this.tabela &&
        (falha.pagina == null || this.de === falha.pagina);
      return Promise.resolve(
        resolve({
          data: erro
            ? null
            : (tabelas[this.tabela] ?? [])
                .filter((r) => this.filtros.every((f) => f(r)))
                .slice(this.de, this.ate + 1),
          error: erro ? { message: "falha simulada" } : null,
        }),
      );
    }
  }
  return {
    db: {
      from: (table: string) => new Consulta(table),
    } as unknown as SupabaseClient,
    consultas,
  };
}
const referencias = (): ReferenciasResultado => ({
  fazendas: [{ id: "f", nome: "Fazenda A" }],
  anos: [
    {
      id: "a",
      descricao: "2026/2027",
      data_inicio: "2026-07-01",
      data_fim: "2027-06-30",
    },
  ],
  ciclos: [
    {
      id: "c",
      fazenda_id: "f",
      ano_safra_id: "a",
      descricao: "Soja",
      area_plantada_ha: 10,
    },
  ],
});
const titulo = (p: Row = {}) => ({
  id: "t",
  fazenda_id: "f",
  ano_safra_id: "a",
  ciclo_id: "c",
  moeda: "BRL",
  tipo: "pagar",
  valor: 100,
  categoria: "Despesas Administrativas",
  status: "em_aberto",
  ...p,
});
const gerar = (
  tabelas: Record<string, Row[]>,
  receita: "financeiro" | "contratada" | "estimada" = "financeiro",
) => {
  const b = banco(tabelas);
  return {
    ...b,
    resultado: carregarResultadoAgricola(b.db, {
      referencias: referencias(),
      fazendaIds: ["f"],
      contaId: "conta",
      anoLabel: "2026/2027",
      receita,
    }),
  };
};
test("integra títulos reais de produtor e empresa, mantém previsão separada e exclui principal/cancelados", async () => {
  const r = await gerar({
    lancamentos: [
      titulo(),
      titulo({
        id: "venda",
        tipo: "receber",
        categoria: "Venda Produção",
        moeda: "USD",
        cotacao_usd: 5,
        valor: 100,
      }),
      titulo({ id: "prev", natureza: "previsao", valor: 500 }),
      titulo({ id: "cancel", status: "cancelado", valor: 9999 }),
      titulo({
        id: "principal",
        categoria: "Pagamento de Custeio",
        valor: 9999,
      }),
    ],
    empresa_lancamentos: [titulo({ id: "emp", valor: 200 })],
  }).resultado;
  const t = totaisResultado(r.itens);
  assert.equal(t.receitas, 500);
  assert.equal(t.custo, 300);
  assert.equal(t.resultado, 200);
  assert.equal(t.previsto, 500);
});
test("mantém o custo histórico e não consulta o custo médio atual do insumo para reprificar plantio", async () => {
  const dados = {
    plantios: [
      {
        id: "p",
        fazenda_id: "f",
        ciclo_id: "c",
        status_campo: "aprovado",
        custo_sementes: 50,
      },
    ],
    insumos: [{ id: "i", custo_medio: 9999 }],
  };
  const a = gerar(dados);
  assert.equal(totaisResultado((await a.resultado).itens).custo, 50);
  assert.ok(!a.consultas.some((c) => c.tabela === "insumos"));
  dados.insumos[0].custo_medio = 1;
  assert.equal(totaisResultado((await gerar(dados).resultado).itens).custo, 50);
});
test("compra para estoque não duplica consumo; item direto entra somente pela parcela correspondente", async () => {
  const r = await gerar({
    lancamentos: [
      titulo({ id: "p1", valor: 100, nf_entrada_id: "n" }),
      titulo({ id: "p2", valor: 200, nf_entrada_id: "n" }),
    ],
    nf_entrada_itens: [
      {
        id: "i1",
        nf_entrada_id: "n",
        tipo_apropiacao: "estoque",
        valor_total: 200,
      },
      {
        id: "i2",
        nf_entrada_id: "n",
        tipo_apropiacao: "direto",
        valor_total: 100,
      },
    ],
  }).resultado;
  assert.equal(totaisResultado(r.itens).custo, 100);
  assert.equal(r.itens.length, 2);
});
test("devolução processada é deduzida uma vez entre as parcelas; devolução cancelada não reduz custo", async () => {
  const rs = {
    lancamentos: [
      titulo({ id: "p1", valor: 100, nf_entrada_id: "n" }),
      titulo({ id: "p2", valor: 200, nf_entrada_id: "n" }),
    ],
    nf_entrada_itens: [
      {
        id: "i",
        nf_entrada_id: "n",
        tipo_apropiacao: "direto",
        valor_total: 300,
      },
      { id: "d", nf_entrada_id: "ret", origem_item_id: "i", valor_total: 60 },
    ],
    nf_entradas: [{ id: "ret", status: "processada" }],
  };
  assert.equal(totaisResultado((await gerar(rs).resultado).itens).custo, 240);
  rs.nf_entradas[0].status = "cancelada";
  assert.equal(totaisResultado((await gerar(rs).resultado).itens).custo, 300);
});
test("NFS-e da máquina é custo pela manutenção e não reaparece pelas parcelas do CP", async () => {
  const r = await gerar({
    lancamentos: [
      titulo({ id: "s1", agrupador: "serv", origem_lancamento: "nf_servico" }),
      titulo({ id: "s2", agrupador: "serv", origem_lancamento: "nf_servico" }),
    ],
    historico_manutencao: [
      {
        id: "m",
        fazenda_id: "f",
        data: "2026-11-01",
        custo: 200,
        nf_servico_id: "s",
      },
    ],
    nf_servicos: [{ id: "s", lancamento_id: "s1" }],
  }).resultado;
  assert.equal(totaisResultado(r.itens).custo, 200);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].fonte, "historico_manutencao");
});
test("folha fechada considera bruto + complemento + encargos, sem duplicar seus títulos", async () => {
  const r = await gerar({
    folha_pagamento: [
      {
        id: "fol",
        fazenda_id: "f",
        competencia: "2026-11",
        status: "fechado",
        cp_fgts_id: "fgts",
      },
    ],
    folha_funcionarios: [
      {
        id: "func",
        folha_id: "fol",
        nome_funcionario: "Funcionário",
        salario_bruto: 100,
        complemento_salarial: 50,
        fgts: 8,
        inss_patronal: 20,
        cp_lancamento_id: "sal",
      },
    ],
    lancamentos: [titulo({ id: "sal" }), titulo({ id: "fgts" })],
  }).resultado;
  assert.equal(totaisResultado(r.itens).custo, 178);
  assert.equal(r.itens.length, 1);
});
test("contratos convertem dólar, incorporam aditivo e não somam CR quando a base é contratada", async () => {
  const r = await gerar(
    {
      contratos: [
        {
          id: "ct",
          fazenda_id: "f",
          ano_safra_id: "a",
          ciclo_id: "c",
          confirmado: true,
          status: "ativo",
          tipo: "venda",
          moeda: "USD",
          cotacao_usd: 5,
          preco: 10,
          quantidade_sc: 100,
          valor_ajuste_aditivo: -50,
        },
      ],
      lancamentos: [
        titulo({ tipo: "receber", categoria: "Venda Produção", valor: 9999 }),
      ],
    },
    "contratada",
  ).resultado;
  assert.equal(totaisResultado(r.itens).receitas, 4750);
});
test("sem preço do orçamento não usa preço padrão nem troca receita por estimativa silenciosa", async () => {
  const rs = {
    colheitas: [
      {
        id: "col",
        fazenda_id: "f",
        ciclo_id: "c",
        status_campo: "aprovado",
        total_sacas: 100,
        area_ha: 10,
      },
    ],
  };
  const r = await gerar(rs, "financeiro").resultado;
  assert.equal(totaisResultado(r.itens).receitas, 0);
  assert.equal(r.producao.c.sacas, 100);
  const estimado = await gerar(rs, "estimada").resultado;
  assert.equal(totaisResultado(estimado.itens).receitas, 0);
  assert.ok(
    estimado.avisos.some((a) => a.descricao.includes("preço esperado")),
  );
});
test("câmbio ou custo ausente aparece como pendência explícita em vez de estimativa", async () => {
  const r = await gerar({
    lancamentos: [titulo({ moeda: "USD" })],
    plantios: [
      { id: "p", fazenda_id: "f", ciclo_id: "c", status_campo: "aprovado" },
    ],
  }).resultado;
  assert.equal(r.itens.length, 0);
  assert.ok(r.avisos.some((a) => a.descricao.includes("cotação")));
  assert.ok(r.avisos.some((a) => a.descricao.includes("custo histórico")));
});
test("mais de mil títulos são carregados e erro na segunda página invalida a consulta inteira", async () => {
  const rs = Array.from({ length: 1001 }, (_, i) =>
    titulo({ id: `t${i}`, valor: 1 }),
  );
  const r = await gerar({ lancamentos: rs }).resultado;
  assert.equal(totaisResultado(r.itens).custo, 1001);
  const b = banco({ lancamentos: rs }, { tabela: "lancamentos", pagina: 1000 });
  await assert.rejects(
    repositorioResultados(b.db)("lancamentos", (q) => q),
    /Não foi possível carregar lancamentos/,
  );
});
test("qualquer falha de origem impede publicar o relatório", async () => {
  const b = banco(
    { lancamentos: [titulo()] },
    { tabela: "historico_manutencao" },
  );
  await assert.rejects(
    carregarResultadoAgricola(b.db, {
      referencias: referencias(),
      fazendaIds: ["f"],
      contaId: "conta",
      anoLabel: "2026/2027",
      receita: "financeiro",
    }),
    /historico_manutencao/,
  );
});
test("replantio não multiplica a área, pendentes não entram na produção e referências não são mutadas", async () => {
  const ref = referencias();
  ref.ciclos[0].area_plantada_ha = null;
  const b = banco({
    plantios: [
      {
        id: "p1",
        fazenda_id: "f",
        ciclo_id: "c",
        status_campo: "aprovado",
        talhao_id: "t",
        area_ha: 10,
        custo_sementes: 1,
      },
      {
        id: "p2",
        fazenda_id: "f",
        ciclo_id: "c",
        status_campo: "aprovado",
        talhao_id: "t",
        area_ha: 10,
        custo_sementes: 1,
      },
    ],
    colheitas: [
      {
        id: "col",
        fazenda_id: "f",
        ciclo_id: "c",
        status_campo: "pendente",
        total_sacas: 10000,
      },
    ],
  });
  const r = await carregarResultadoAgricola(b.db, {
    referencias: ref,
    fazendaIds: ["f"],
    contaId: "conta",
    anoLabel: "2026/2027",
    receita: "financeiro",
  });
  assert.equal(r.producao.c.area, 10);
  assert.equal(r.producao.c.sacas, 0);
  assert.equal(ref.ciclos[0].area_plantada_ha, null);
});

test("apontamento explícito ao ciclo não some por divergência do ano no título", async () => {
  const r = await gerar({ lancamentos: [titulo({ ano_safra_id: "antigo" })] })
    .resultado;
  assert.equal(totaisResultado(r.itens).custo, 100);
  assert.equal(r.itens[0].ciclo_id, "c");
});
test("despesa da empresa sem safra/ciclo não é misturada à atividade agrícola por mera data", async () => {
  const r = await gerar({
    empresa_lancamentos: [
      titulo({
        ano_safra_id: null,
        ciclo_id: null,
        data_vencimento: "2026-11-01",
      }),
    ],
  }).resultado;
  assert.equal(r.itens.length, 0);
});

test("juros da baixa continuam como custo financeiro mesmo quando o principal é empréstimo ou folha", async () => {
  const r = await gerar({
    lancamentos: [
      titulo({
        id: "divida",
        status: "baixado",
        categoria: "Pagamento de Custeio",
        valor: 10000,
        valor_juros: 100,
      }),
      titulo({
        id: "sal",
        status: "baixado",
        origem_lancamento: "folha",
        valor_juros: 20,
      }),
    ],
  }).resultado;
  assert.equal(totaisResultado(r.itens).custo, 120);
  assert.equal(r.itens.length, 2);
});
test("juros recebidos e desconto concedido no CR têm o sinal correto no resultado", async () => {
  const r = await gerar({
    lancamentos: [
      titulo({
        tipo: "receber",
        categoria: "Venda Produção",
        status: "baixado",
        valor: 1000,
        valor_juros: 50,
        valor_desconto: 10,
      }),
    ],
  }).resultado;
  const t = totaisResultado(r.itens);
  assert.equal(t.receitas, 1050);
  assert.equal(t.deducoes, 10);
  assert.equal(t.resultado, 1040);
  assert.equal(t.ebitda, 990);
});

test("NFS-e da empresa só retira CP do mesmo número, empresa e prestador já apropriado", async () => {
  const r = await gerar({
    empresa_lancamentos: [
      titulo({
        id: "serv1",
        origem: "nf_servico",
        empresa_id: "emp",
        numero_documento: "15",
        pessoa_id: "p1",
      }),
      titulo({
        id: "serv2",
        origem: "nf_servico",
        empresa_id: "emp",
        numero_documento: "15",
        pessoa_id: "outro",
      }),
    ],
    historico_manutencao: [
      {
        id: "m",
        fazenda_id: "f",
        data: "2026-11-01",
        custo: 100,
        nf_servico_id: "s",
      },
    ],
    nf_servicos: [
      { id: "s", numero_nf: "15", empresa_id: "emp", prestador_id: "p1" },
    ],
  }).resultado;
  assert.equal(totaisResultado(r.itens).custo, 200);
  assert.ok(r.itens.some((i) => i.origem_id === "serv2"));
  assert.ok(!r.itens.some((i) => i.origem_id === "serv1"));
});
