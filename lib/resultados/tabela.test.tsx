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
