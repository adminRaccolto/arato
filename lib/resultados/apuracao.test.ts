import test from "node:test";
import assert from "node:assert/strict";
import {
  distribuir,
  emReais,
  metrica,
  ratearResultados,
  totaisResultado,
  ultimoDiaMes,
  type ItemResultado,
  type CicloResultado,
  type RegraResultado,
} from "./apuracao";
import { estatisticasAplicacoes } from "./aplicacoes";
import { apurarEmpresa } from "./empresa";
const item = (p: Partial<ItemResultado> = {}): ItemResultado => ({
  id: "t",
  fonte: "lancamentos",
  descricao: "Despesa",
  grupo: "desp_adm",
  valor: 1000,
  fazenda_id: "f1",
  centro_custo_id: "adm",
  ano_safra_id: "a",
  ...p,
});
const ciclos: CicloResultado[] = [
  { id: "c1", fazenda_id: "f1", ano_safra_id: "a", area_plantada_ha: 10 },
  { id: "c2", fazenda_id: "f1", ano_safra_id: "a", area_plantada_ha: 20 },
  { id: "c3", fazenda_id: "f2", ano_safra_id: "b", area_plantada_ha: 30 },
];
const regra: RegraResultado = {
  id: "r",
  nome: "Administração por área",
  fazenda_id: "f1",
  ano_safra_id: "a",
  centro_custo_id: "adm",
  tipo: "area_plantada",
  linhas: [
    { ciclo_id: "c1", percentual: 0 },
    { ciclo_id: "c2", percentual: 0 },
  ],
};

test("conversão histórica soma BRL e USD sem reprificar barter ou usar câmbio atual", () => {
  assert.equal(
    emReais({ valor: 100, moeda: "BRL" })! +
      emReais({ valor: 100, moeda: "USD", cotacao_usd: 5 })!,
    600,
  );
  assert.equal(emReais({ valor: 100, moeda: "USD" }), null);
  assert.equal(emReais({ valor: 100, moeda: "USD", cotacao_usd: -5 }), null);
  assert.equal(emReais({ valor: "NaN" }), null);
  assert.equal(emReais({ valor: 100, moeda: "barter" }), 100);
});
test("período mensal usa o dia real do calendário, inclusive bissexto", () => {
  assert.equal(ultimoDiaMes("2026-11"), "2026-11-30");
  assert.equal(ultimoDiaMes("2024-02"), "2024-02-29");
  assert.equal(ultimoDiaMes("2026-02"), "2026-02-28");
  assert.throws(() => ultimoDiaMes("2026-13"));
});
test("rateio conserva todos os centavos, inclusive descontos e muitos ciclos", () => {
  assert.deepEqual(distribuir(100, [1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.deepEqual(distribuir(-0.01, [1, 1]), [-0.01, 0]);
  for (const valor of [0.01, 49.99, 1000, -1.01])
    for (let n = 1; n < 200; n++)
      assert.equal(
        Math.round(
          distribuir(
            valor,
            Array.from({ length: n }, (_, i) => i + 1),
          ).reduce((s, v) => s + v, 0) * 100,
        ),
        Math.round(valor * 100),
      );
});
test("área usa o universo da regra mesmo ao comparar só um ciclo", () => {
  const r = ratearResultados([item()], ciclos, [regra]);
  assert.deepEqual(
    r.itens.map((i) => [i.ciclo_id, i.valor]),
    [
      ["c1", 333.33],
      ["c2", 666.67],
    ],
  );
  assert.equal(r.avisos.length, 0);
  assert.equal(
    r.itens.filter((i) => i.ciclo_id === "c1").reduce((s, i) => s + i.valor, 0),
    333.33,
  );
});
test("centro sem correspondência não desaparece quando outra regra existe", () => {
  const r = ratearResultados([item({ centro_custo_id: "outro" })], ciclos, [
    regra,
  ]);
  assert.equal(r.itens[0].valor, 1000);
  assert.equal(r.itens[0].ciclo_id, undefined);
  assert.equal(r.avisos.length, 1);
});
test("regra inativa, concorrente ou com percentual incompleto preserva o pendente", () => {
  for (const regras of [
    [{ ...regra, ativo: false }],
    [regra, { ...regra, id: "r2" }],
    [
      {
        ...regra,
        tipo: "atribuido",
        linhas: [{ ciclo_id: "c1", percentual: 50 }],
      },
    ],
  ]) {
    const r = ratearResultados([item()], ciclos, regras);
    assert.equal(r.itens.length, 1);
    assert.equal(r.itens[0].valor, 1000);
    assert.equal(r.avisos.length, 1);
  }
});
test("centro filho encontra a regra do ancestral", () => {
  const r = ratearResultados(
    [item({ centro_custo_id: "filho" })],
    ciclos,
    [regra],
    [],
    new Map([["filho", "adm"]]),
  );
  assert.equal(r.avisos.length, 0);
  assert.equal(r.itens.length, 2);
});
test("rateio global entre fazendas usa anos equivalentes pelo nome e então seus ciclos", () => {
  const global: RegraResultado = {
    id: "g",
    nome: "Global",
    centro_custo_id: "adm",
    ano_safra_id: "a",
    tipo: "area_ciclos",
    fazendas: [
      { fazenda_id: "f1", percentual: 0 },
      { fazenda_id: "f2", percentual: 0 },
    ],
  };
  const r = ratearResultados(
    [item({ escopo: "global", valor: 600 })],
    ciclos,
    [regra, { ...regra, id: "r2", fazenda_id: "f2", ano_safra_id: "b" }],
    [global],
    new Map(),
    new Map([
      ["a", "2026/27"],
      ["b", "2026/27"],
    ]),
  );
  assert.deepEqual(
    r.itens.map((i) => [i.ciclo_id, i.valor]),
    [
      ["c1", 100],
      ["c2", 200],
      ["c3", 300],
    ],
  );
  assert.equal(r.avisos.length, 0);
});
test("auxiliar absorve o percentual contratado e conserva o resíduo sem ciclo", () => {
  const r = ratearResultados(
    [item({ ciclo_id: "aux" })],
    [
      ...ciclos,
      {
        ...ciclos[0],
        id: "aux",
        is_auxiliar: true,
        ciclo_pai_id: "c1",
        absorcao_pct: 70,
      },
    ],
    [],
  );
  assert.deepEqual(
    r.itens.map((i) => [i.ciclo_id, i.valor]),
    [
      ["c1", 700],
      [null, 300],
    ],
  );
  assert.equal(r.avisos.length, 1);
});
test("resultado conserva prejuízo, separa previsão e retira depreciação apenas após EBITDA", () => {
  const t = totaisResultado([
    item({ grupo: "receita_bruta", valor: 100 }),
    item({ grupo: "sementes", valor: 150 }),
    item({ grupo: "depreciacao", valor: 20 }),
    item({ grupo: "desp_financeira", valor: 10 }),
    item({ grupo: "receita_financeira", valor: 5 }),
    item({ previsto: true, valor: 999 }),
  ]);
  assert.equal(t.ebitda, -50);
  assert.equal(t.operacional, -70);
  assert.equal(t.resultado, -75);
  assert.equal(t.previsto, 999);
  assert.equal(t.receitas - t.custo, t.resultado);
  assert.equal(
    metrica(t.resultado, "percentual", 0, 0, t.receitas),
    -75 / 1.05,
  );
});
test("total por hectare é ponderado e base ausente não vira um hectare fictício", () => {
  assert.equal(metrica(600, "ha", 30, 0, 0), 20);
  assert.equal(metrica(600, "ha", 0, 0, 0), null);
  assert.equal(metrica(600, "sc", 0, 0, 0), null);
});
test("aplicações contam operações e área por ciclo/talhão, sem multiplicar pelos insumos", () => {
  const a = {
    operacao_id: "a",
    tipo_op: "pulverizacao",
    ciclo_id: "c",
    talhao_id: "t",
    area_ha: 10,
    custo_total: 100,
  };
  const s = estatisticasAplicacoes([
    a,
    { ...a, custo_total: 200 },
    { ...a, operacao_id: "b" },
    { ...a, operacao_id: "c", talhao_id: undefined },
  ]);
  assert.equal(s.ops, 3);
  assert.equal(s.area, 10);
  assert.equal(s.custo, 500);
  assert.equal(s.custo_ha, 40);
  assert.equal(s.semArea, 1);
});
test("empresa exclui cancelados, previsão, principal e folha duplicada e soma bruto + complemento", () => {
  const t = (p: Record<string, unknown>) => ({
    tipo: "pagar",
    valor: 100,
    ...p,
  });
  const r = apurarEmpresa(
    [
      t({ status: "cancelado" }),
      t({ natureza: "previsao" }),
      t({ categoria: "Pagamento de Custeio" }),
      t({ operacao_gerencial_id: "principal" }),
      t({ origem: "folha" }),
      t({ tipo: "receber", moeda: "USD", cotacao_usd: 5 }),
      t({ categoria: "Combustíveis" }),
    ],
    [
      {
        salario_bruto: 50,
        complemento_salarial: 20,
        inss_patronal: 10,
        fgts: 5,
      },
    ],
    new Map([["principal", "2.02.01.02.002"]]),
  );
  assert.equal(r.receitas, 500);
  assert.equal(r.cogs, 100);
  assert.equal(r.salarios, 70);
  assert.equal(r.inss, 10);
  assert.equal(r.fgts, 5);
  assert.equal(r.operacionais, 0);
  assert.throws(
    () => apurarEmpresa([t({ moeda: "USD" })], [], new Map()),
    /cotação/,
  );
});

test("auxiliar sem principal válido ou encadeado não some da coluna sem ciclo", () => {
  for (const pai of [null, "aux2"]) {
    const r = ratearResultados(
      [item({ ciclo_id: "aux" })],
      [
        ...ciclos,
        { ...ciclos[0], id: "aux", is_auxiliar: true, ciclo_pai_id: pai },
        { ...ciclos[0], id: "aux2", is_auxiliar: true, ciclo_pai_id: "c1" },
      ],
      [],
    );
    assert.equal(r.itens[0].ciclo_id, null);
    assert.equal(r.itens[0].valor, 1000);
    assert.equal(r.avisos.length, 1);
  }
});
test("rateio global não envia saldo para uma fazenda fora do universo permitido", () => {
  const r = ratearResultados(
    [item({ escopo: "global" })],
    ciclos,
    [regra],
    [
      {
        id: "g",
        nome: "Inválida",
        centro_custo_id: "adm",
        tipo: "atribuido",
        fazendas: [{ fazenda_id: "externa", percentual: 100 }],
      },
    ],
  );
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].fazenda_id, "f1");
  assert.equal(r.itens[0].valor, 1000);
  assert.equal(r.avisos.length, 1);
});

test("empresa separa encargos e descontos da baixa do principal excluído da DRE", () => {
  const r = apurarEmpresa(
    [
      {
        tipo: "pagar",
        categoria: "Pagamento de Custeio",
        valor: 10000,
        status: "pago",
        valor_juros: 100,
        valor_desconto: 5,
      },
      {
        tipo: "receber",
        categoria: "Venda",
        valor: 1000,
        status: "pago",
        valor_juros: 50,
        valor_desconto: 10,
      },
    ],
    [],
    new Map(),
  );
  assert.equal(r.financeiras, 100);
  assert.equal(r.descontos, 5);
  assert.equal(r.receitas, 1000);
  assert.equal(r.receitasFinanceiras, 50);
  assert.equal(r.deducoes, 10);
});
