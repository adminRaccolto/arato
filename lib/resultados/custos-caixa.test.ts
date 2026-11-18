import test from "node:test";
import assert from "node:assert/strict";
import {
  apurarCustosCaixa,
  classificarCustoCaixa,
  comporFaturasCaixa,
  resumirCustosCaixa,
  totalCustosCaixa,
  valorOperacionalPago,
  type RegistroCaixa,
} from "./custos-caixa";
const filtro = {
  inicio: "2026-09-01",
  fim: "2026-09-30",
  fazendaIds: ["f1", "f2"],
};
const titulo = (patch: RegistroCaixa = {}): RegistroCaixa => ({
  id: "a",
  fazenda_id: "f1",
  tipo: "pagar",
  moeda: "BRL",
  natureza: "real",
  status: "baixado",
  categoria: "Insumos",
  descricao: "Compra paga",
  data_baixa: "2026-09-10",
  data_vencimento: "2026-07-01",
  valor: 100,
  valor_pago: 100,
  ...patch,
});
const apurar = (linhas: RegistroCaixa[], ogs: RegistroCaixa[] = []) =>
  apurarCustosCaixa([{ origem: "lancamentos", linhas }], ogs, filtro);

test("regime de caixa usa baixa, não vencimento, safra ou ciclo; total inclui sem ciclo", () => {
  const r = apurar([
    titulo({
      id: "1",
      valor_pago: 100,
      ciclo_id: "c1",
      ano_safra_id: "anterior",
    }),
    titulo({ id: "2", fazenda_id: "f2", valor_pago: 200 }),
    titulo({
      id: "3",
      data_baixa: "2026-08-31",
      data_vencimento: "2026-09-10",
    }),
    titulo({ id: "4", data_baixa: "2026-10-01" }),
    titulo({ id: "5", status: "em_aberto", valor_pago: null }),
    titulo({ id: "6", status: "cancelado" }),
    titulo({ id: "7", natureza: "previsao" }),
    titulo({ id: "8", tipo: "receber" }),
    titulo({ id: "9", fazenda_id: "outra" }),
  ]);
  assert.equal(totalCustosCaixa(r.pagamentos), 300);
  assert.deepEqual(resumirCustosCaixa(r.pagamentos, "cicloId"), [
    { id: "__sem_ciclo__", valor: 200, quantidade: 1 },
    { id: "c1", valor: 100, quantidade: 1 },
  ]);
});

test("CP da empresa usa data_pagamento e não duplica a mesma linha por página ou borderô", () => {
  const a = titulo({ lote_id: "b", valor_pago: 100 });
  const r = apurarCustosCaixa(
    [
      {
        origem: "lancamentos",
        linhas: [
          a,
          a,
          titulo({ id: "b", lote_id: "b", valor: 200, valor_pago: 200 }),
        ],
      },
      {
        origem: "empresa_lancamentos",
        linhas: [
          titulo({
            status: "pago",
            data_baixa: null,
            data_pagamento: "2026-09-30",
            valor_pago: 300,
          }),
        ],
      },
    ],
    [],
    filtro,
  );
  assert.deepEqual(
    r.pagamentos.map((p) => p.valor),
    [100, 200, 300],
  );
  assert.equal(totalCustosCaixa(r.pagamentos), 600);
});

test("valores de baixa em reais: USD não reconverte valor_pago; desconto é aplicado uma única vez", () => {
  assert.deepEqual(
    valorOperacionalPago(
      titulo({
        moeda: "USD",
        cotacao_usd: 5,
        valor_pago: 490,
        valor_juros: 10,
        valor_multa: 5,
        valor_desconto: 25,
      }),
    ),
    { pago: 490, encargos: 15, valor: 475 },
  );
  assert.deepEqual(
    valorOperacionalPago(titulo({ valor_pago: 90, valor_desconto: 10 })),
    { pago: 90, encargos: 0, valor: 90 },
  );
  assert.deepEqual(
    valorOperacionalPago(
      titulo({ valor_pago: 105, valor_juros: 10, valor_desconto: 5 }),
    ),
    { pago: 105, encargos: 10, valor: 95 },
  );
});

test("baixa antiga integral pode usar valor nominal e cotação histórica; jamais a cotação atual", () => {
  assert.deepEqual(
    valorOperacionalPago(
      titulo({
        valor_pago: null,
        moeda: "USD",
        cotacao_usd: 5,
        valor_juros: 10,
        valor_desconto: 30,
      }),
    ),
    { pago: 480, encargos: 10, valor: 470 },
  );
  assert.equal(
    typeof valorOperacionalPago(
      titulo({ moeda: "USD", cotacao_usd: null, valor_pago: null }),
    ),
    "string",
  );
  assert.deepEqual(
    valorOperacionalPago(
      titulo({ moeda: "USD", cotacao_usd: null, valor_pago: 500 }),
    ),
    { pago: 500, encargos: 0, valor: 500 },
  );
});

test("parcelas pagas separadas entram pelo valor pago; saldo aberto fica fora e parcial acumulado exige conferir datas", () => {
  const r = apurar([
    titulo({
      id: "p1",
      valor: 40,
      valor_pago: 40,
      pagamento_parcial: true,
      titulo_origem_id: "p1",
    }),
    titulo({
      id: "s1",
      valor: 60,
      valor_pago: null,
      status: "em_aberto",
      titulo_origem_id: "p1",
    }),
    titulo({ id: "legado", status: "parcial", valor_pago: 50 }),
  ]);
  assert.equal(totalCustosCaixa(r.pagamentos), 40);
  assert.equal(r.pendencias.length, 1);
  assert.equal(r.pendencias[0].valor, 50);
  assert.match(r.pendencias[0].motivo, /datas/);
});

test("considera somente custos e despesas acima do EBITDA, inclusive categorias administrativas", () => {
  for (const classificacao of [
    "2.01.01.01.001",
    "2.01.01.02.001",
    "2.01.01.03.002",
    "2.01.01.04.001",
    "2.01.01.10.001",
    "2.01.02.01.01.001",
    "2.01.02.01.04.007",
    "2.03.03.004",
  ]) {
    assert.ok("grupo" in classificarCustoCaixa(titulo(), { classificacao }));
  }
  for (const classificacao of [
    "2.03.02.001",
    "2.03.01.001",
    "2.03.04.001",
    "2.02.01.01.001",
    "2.02.01.02.001",
    "2.02.01.03.001",
    "2.01.02.01.04.005",
    "2.01.02.01.04.009",
    "2.01.02.01.04.013",
    "1.01.01.01.001",
  ]) {
    assert.ok(
      "fora" in classificarCustoCaixa(titulo(), { classificacao }),
      classificacao,
    );
  }
  for (const categoria of [
    "Depreciação",
    "Juros sobre empréstimos",
    "Pagamento de Custeio",
    "Transferência",
    "Aquisição de máquina",
    "IRPJ",
    "CSLL",
    "Imobilizado",
  ])
    assert.ok(
      "fora" in classificarCustoCaixa(titulo({ categoria })),
      categoria,
    );
  for (const categoria of [
    "Pessoal / Salários",
    "FGTS",
    "INSS Patronal",
    "Gratificações",
    "Despesas administrativas",
    "Serviços",
    "Fertilizantes",
    "Insumos",
  ])
    assert.ok(
      "grupo" in classificarCustoCaixa(titulo({ categoria })),
      categoria,
    );
});

test("OG prevalece sobre categoria genérica; itens sem classificação ficam visíveis para conferência", () => {
  const r = apurar(
    [
      titulo({ operacao_gerencial_id: "og", categoria: "Outros" }),
      titulo({ id: "sem", categoria: "Diversos" }),
    ],
    [{ id: "og", classificacao: "2.01.01.01.001", descricao: "Sementes" }],
  );
  assert.equal(totalCustosCaixa(r.pagamentos), 100);
  assert.equal(r.pagamentos[0].operacao, "Sementes");
  assert.equal(r.pendencias.length, 1);
  assert.equal(r.pendencias[0].descricao, "Compra paga");
});

test("desembolso operacional de adiantamento entra uma vez e a compensação não movimenta caixa", () => {
  const r = apurar([
    titulo({
      id: "adi",
      categoria: "Adiantamento a Fornecedores",
      valor_pago: 40,
    }),
    titulo({ id: "nf", valor_pago: 60 }),
    titulo({
      id: "comp",
      valor_pago: 40,
      forma_pagamento: "Compensação de adiantamento a fornecedor",
    }),
    titulo({ id: "barter", moeda: "barter" }),
  ]);
  assert.equal(totalCustosCaixa(r.pagamentos), 100);
  assert.equal(r.excluidos.length, 2);
});

test("não usa custos por consumo, folha em competência ou previsões para completar caixa", () => {
  const r = apurar([
    titulo({
      id: "sal",
      categoria: "Pessoal / Salários",
      origem_lancamento: "folha",
      valor_pago: 70,
    }),
    titulo({ id: "prev", natureza: "previsao", origem_lancamento: "folha" }),
    titulo({
      id: "real",
      natureza: "real",
      origem_lancamento: "previsao",
      valor_pago: 30,
    }),
  ]);
  assert.equal(totalCustosCaixa(r.pagamentos), 100);
});

test("valores não finitos ou encargos incoerentes são pendência e nunca viram zero silencioso", () => {
  for (const patch of [
    { valor_pago: NaN },
    { valor_pago: Infinity },
    { valor_pago: -1 },
    { valor_pago: 10, valor_juros: 20 },
    { valor_juros: -1 },
  ]) {
    const r = apurar([titulo(patch)]);
    assert.equal(r.pagamentos.length, 0);
    assert.equal(r.pendencias.length, 1);
  }
});

test("fatura quitada atribui valores exatos aos itens e ciclos; não soma o cabeçalho nem compras sem desembolso", () => {
  const header = titulo({
    id: "fatura-cp",
    origem_lancamento: "cartao_fatura",
    valor: 300,
    valor_pago: 300,
  });
  const compras = [
    titulo({
      id: "a",
      status: "cartao",
      valor: 100,
      fatura_cartao_id: "fatura",
      ciclo_id: "c1",
    }),
    titulo({
      id: "b",
      status: "cartao",
      valor: 200,
      fatura_cartao_id: "fatura",
      ciclo_id: null,
    }),
  ];
  const linhas = comporFaturasCaixa(
    [header],
    [{ id: "fatura", lancamento_cp_id: header.id }],
    compras,
  );
  const r = apurar([...linhas, ...compras]);
  assert.equal(totalCustosCaixa(r.pagamentos), 300);
  assert.deepEqual(
    r.pagamentos.map((p) => p.valor).sort((a, b) => a - b),
    [100, 200],
  );
  assert.equal(
    resumirCustosCaixa(r.pagamentos, "cicloId").find(
      (c) => c.id === "__sem_ciclo__",
    )?.valor,
    200,
  );
});

test("fatura mista respeita classificações dos itens: patrimônio e juros ficam fora", () => {
  const header = titulo({
    id: "fatura-cp",
    origem_lancamento: "cartao_fatura",
    valor: 300,
    valor_pago: 300,
  });
  const compras = [
    titulo({
      id: "a",
      status: "cartao",
      valor: 100,
      fatura_cartao_id: "fatura",
    }),
    titulo({
      id: "b",
      status: "cartao",
      valor: 200,
      categoria: "Imobilizado",
      fatura_cartao_id: "fatura",
    }),
  ];
  const r = apurar(
    comporFaturasCaixa(
      [header],
      [{ id: "fatura", lancamento_cp_id: header.id }],
      compras,
    ),
  );
  assert.equal(totalCustosCaixa(r.pagamentos), 100);
  assert.equal(r.excluidos.length, 1);
});

test("fatura incompleta ou divergente não inventa distribuição", () => {
  const t = titulo({ origem_lancamento: "cartao_fatura", valor_pago: 300 });
  const r = apurar(
    comporFaturasCaixa(
      [t],
      [{ id: "f", lancamento_cp_id: t.id }],
      [titulo({ fatura_cartao_id: "f", status: "cartao" })],
    ),
  );
  assert.equal(r.pagamentos.length, 0);
  assert.equal(r.pendencias.length, 1);
});
