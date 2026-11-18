import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { OperationalPresentation } from "../../components/arato-layout/presentation-mode";
import {
  TabelaResultados,
  linhasDemonstrativo,
  linhasVisiveis,
  type ColunaResultado,
} from "../../components/resultados/TabelaResultados";
const coluna: ColunaResultado = {
  id: "c1",
  nome: "Soja 2026",
  fazenda: "Fazenda A",
  area: 10,
  sacas: 100,
  areaColhida: 10,
  precoOrcado: null,
  produtividadeOrcada: null,
  itens: [
    {
      id: "c",
      descricao: "Custo",
      fonte: "lancamentos",
      fazenda_id: "f",
      ciclo_id: "c1",
      grupo: "desp_adm",
      valor: 1000,
    },
  ],
};
test("comparativo apresenta ciclos de fazendas distintas, total e pendentes nos dois layouts", () => {
  for (const active of [false, true]) {
    const html = renderToStaticMarkup(
      <OperationalPresentation active={active}>
        <TabelaResultados
          colunas={[
            coluna,
            { ...coluna, id: "c2", fazenda: "Fazenda B" },
            { ...coluna, id: "sem", nome: "Sem ciclo / rateio pendente" },
            { ...coluna, id: "total", nome: "Total consolidado" },
          ]}
          modo="dre"
          unidade="total"
        />
      </OperationalPresentation>,
    );
    assert.match(html, /Fazenda A/);
    assert.match(html, /Fazenda B/);
    assert.match(html, /Total consolidado/);
    assert.match(html, /Sem ciclo \/ rateio pendente/);
    assert.match(html, /-R\$ 1\.000,00/);
    assert.match(html, /EBITDA/);
  }
});
test("resultado negativo mantém sinal em total, por hectare e em percentual", () => {
  const linha = linhasDemonstrativo("dre").find((l) => l.id === "resultado")!;
  const c = {
    ...coluna,
    itens: [
      ...coluna.itens,
      { ...coluna.itens[0], id: "receita", grupo: "receita_bruta", valor: 100 },
    ],
  };
  assert.equal(linha.valor(c, "total"), -900);
  assert.equal(linha.valor(c, "ha"), -90);
  assert.equal(linha.valor(c, "percentual"), -900);
});
test("todos os grupos da composição aparecem no demonstrativo e ausência de área é travessão", () => {
  const html = renderToStaticMarkup(
    <TabelaResultados
      colunas={[{ ...coluna, area: 0 }]}
      modo="custoha"
      unidade="ha"
    />,
  );
  assert.match(html, /—/);
  assert.ok(!html.includes("NaN"));
  assert.ok(!html.includes("Infinity"));
  const linhas = linhasDemonstrativo("dre");
  assert.ok(linhas.find((l) => l.id === "receita_financeira"));
  assert.ok(linhas.find((l) => l.id === "cpv_insumos"));
});

test("linhas zeradas são opcionais sem esconder custos quando falta base por hectare", () => {
  assert.ok(
    !linhasVisiveis("dre", [coluna], "total", true).find(
      (l) => l.id === "sementes",
    ),
  );
  assert.ok(
    linhasVisiveis("dre", [coluna], "total", false).find(
      (l) => l.id === "sementes",
    ),
  );
  assert.ok(
    linhasVisiveis("dre", [{ ...coluna, area: 0 }], "ha", true).find(
      (l) => l.id === "desp_adm",
    ),
  );
});

test("Custos Totais tem categorias e três bases sem receitas ou indicadores de lucro", () => {
  const c = {
    ...coluna,
    itens: [
      ...coluna.itens,
      {
        ...coluna.itens[0],
        id: "prev",
        grupo: "sementes",
        valor: 200,
        previsto: true,
      },
      { ...coluna.itens[0], id: "desc", grupo: "descontos", valor: 50 },
      { ...coluna.itens[0], id: "rec", grupo: "receita_bruta", valor: 10000 },
    ],
  };
  for (const active of [false, true]) {
    const html = renderToStaticMarkup(
      <OperationalPresentation active={active}>
        <TabelaResultados colunas={[c]} modo="custostotais" unidade="total" />
      </OperationalPresentation>,
    );
    assert.match(html, /Categoria de custo \/ despesa/);
    assert.match(html, />Realizado<\/th>/);
    assert.match(html, />Previsto<\/th>/);
    assert.match(html, />Realizado \+ previsto<\/th>/);
    assert.match(html, /colspan="3"/i);
    assert.match(html, /rowspan="2"/i);
    assert.match(html, /R\$ 950,00/);
    assert.match(html, /R\$ 200,00/);
    assert.match(html, /R\$ 1\.150,00/);
    assert.doesNotMatch(
      html,
      /Receita|receita|EBITDA|Margem bruta|Resultado gerencial/,
    );
  }
  const total = linhasDemonstrativo("custostotais").find(
    (l) => l.id === "custo",
  )!;
  assert.deepEqual(
    [
      total.valor(c, "total", "realizado"),
      total.valor(c, "total", "previsto"),
      total.valor(c, "total", "total"),
    ],
    [950, 200, 1150],
  );
  assert.deepEqual(
    total.itens!(c, "previsto").map((i) => i.id),
    ["prev"],
  );
  assert.equal(
    total.itens!(c, "total").some((i) => i.grupo.startsWith("receita")),
    false,
  );
  assert.ok(
    linhasVisiveis("custostotais", [c], "total", true).some(
      (l) => l.id === "sementes",
    ),
    "Categoria somente prevista não desaparece",
  );
});

test("mesma base de custos mantém o sinal de despesa próprio de cada relatório", () => {
  const d = linhasDemonstrativo("dre").find((l) => l.id === "desp_adm")!;
  const c = linhasDemonstrativo("custostotais").find(
    (l) => l.id === "desp_adm",
  )!;
  assert.equal(d.valor(coluna, "total"), -1000);
  assert.equal(c.valor(coluna, "total", "realizado"), 1000);
  assert.equal(c.valor(coluna, "ha", "realizado"), 100);
  assert.equal(c.valor(coluna, "sc", "realizado"), 10);
  assert.equal(
    c.valor(coluna, "percentual", "realizado"),
    100,
    "Percentual usa o custo, independentemente da receita",
  );
  assert.equal(c.valor({ ...coluna, area: 0 }, "ha", "realizado"), null);
  assert.ok(linhasDemonstrativo("dre").some((l) => l.id === "resultado"));
  assert.ok(!linhasDemonstrativo("custoha").some((l) => l.id === "resultado"));
});

test("exportação e tabela de custos comparam cada ciclo e o consolidado nas mesmas bases", async () => {
  const { colunasDemonstrativo } = await import(
    "../../components/resultados/TabelaResultados"
  );
  const c2 = {
    ...coluna,
    id: "c2",
    fazenda: "Fazenda B",
    itens: [{ ...coluna.itens[0], id: "p", valor: 500, previsto: true }],
  };
  const total = {
    ...coluna,
    id: "total",
    nome: "Total consolidado",
    itens: [...coluna.itens, ...c2.itens],
  };
  const colunas = [coluna, c2, total];
  const campos = colunasDemonstrativo("custostotais", colunas);
  assert.equal(campos.length, 9);
  assert.ok(campos[0].titulo.endsWith("Realizado"));
  assert.ok(campos[1].titulo.endsWith("Previsto"));
  assert.ok(campos[2].titulo.endsWith("Realizado + previsto"));
  const linha = linhasDemonstrativo("custostotais").find(
    (l) => l.id === "custo",
  )!;
  assert.deepEqual(
    campos.map((c) => linha.valor(c.coluna, "total", c.base)),
    [1000, 0, 1000, 0, 500, 500, 1000, 500, 1500],
  );
  assert.equal(colunasDemonstrativo("dre", colunas).length, 3);
  const html = renderToStaticMarkup(
    <TabelaResultados colunas={colunas} modo="custostotais" unidade="total" />,
  );
  assert.match(html, /Fazenda B/);
  assert.match(html, /Total consolidado/);
  assert.equal((html.match(/colspan="3"/gi) ?? []).length, 3);
});

test("percentuais de previsto e realizado são calculados em suas próprias bases", () => {
  const c = {
    ...coluna,
    itens: [
      { ...coluna.itens[0], id: "s1", grupo: "sementes", valor: 100 },
      { ...coluna.itens[0], id: "a1", grupo: "desp_adm", valor: 100 },
      {
        ...coluna.itens[0],
        id: "s2",
        grupo: "sementes",
        valor: 100,
        previsto: true,
      },
      {
        ...coluna.itens[0],
        id: "a2",
        grupo: "desp_adm",
        valor: 300,
        previsto: true,
      },
    ],
  };
  const s = linhasDemonstrativo("custostotais").find(
    (l) => l.id === "sementes",
  )!;
  assert.equal(s.valor(c, "percentual", "realizado"), 50);
  assert.equal(s.valor(c, "percentual", "previsto"), 25);
  assert.equal(s.valor(c, "percentual", "total"), 100 / 3);
});
