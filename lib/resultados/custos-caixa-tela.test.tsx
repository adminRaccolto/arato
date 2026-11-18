import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { OperationalPresentation } from "../../components/arato-layout/presentation-mode";
import {
  linhasPagamentosCaixa,
  PainelCustosCaixa,
} from "../../components/resultados/PainelCustosCaixa";
import { apurarCustosCaixa, type CustosCaixa } from "./custos-caixa";
import type { ReferenciasResultado } from "./carregar";
const ref: ReferenciasResultado = {
  fazendas: [{ id: "f", nome: "Fazenda A" }],
  anos: [],
  ciclos: [
    { id: "c", fazenda_id: "f", ano_safra_id: "a", descricao: "Soja 2026" },
  ],
};
const dados = (): CustosCaixa =>
  apurarCustosCaixa(
    [
      {
        origem: "lancamentos",
        linhas: [
          {
            id: "1",
            fazenda_id: "f",
            tipo: "pagar",
            categoria: "Insumos",
            descricao: "Sementes pagas",
            data_baixa: "2026-09-10",
            status: "baixado",
            valor_pago: 100,
            ciclo_id: "c",
          },
          {
            id: "2",
            fazenda_id: "f",
            tipo: "pagar",
            categoria: "Despesas administrativas",
            descricao: "Serviço pago",
            data_baixa: "2026-09-20",
            status: "baixado",
            valor_pago: 200,
          },
        ],
      },
    ],
    [],
    { inicio: "2026-09-01", fim: "2026-09-30", fazendaIds: ["f"] },
  );
test("Custos Totais tem painel operacional próprio; DRE mantém a rota e o demonstrativo anteriores", () => {
  const rota = readFileSync(
    new URL("../../app/custos/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    rota,
    /modo === "custostotais"\s*\?\s*\(?\s*<RelatorioCustosCaixa/,
  );
  assert.match(rota, /<RelatorioResultados modo=\{modo\}/);
});
test("painel sem estrutura DRE mostra categorias, caixa total e sem ciclo nos dois layouts", () => {
  for (const active of [false, true]) {
    const html = renderToStaticMarkup(
      <OperationalPresentation active={active}>
        <PainelCustosCaixa dados={dados()} referencias={ref} visao="total" />
      </OperationalPresentation>,
    );
    assert.match(html, /Em que foi gasto/);
    assert.match(html, /Pagamentos do período/);
    assert.match(html, /R\$ 300,00/);
    assert.match(html, /R\$ 200,00/);
    assert.match(html, /Incluído no total geral/);
    assert.match(html, /Soja 2026/);
    assert.doesNotMatch(
      html,
      /Previsto|Realizado|EBITDA|Lucro|Receita bruta|Depreciação/,
    );
  }
});
test("por ciclo mantém o grupo sem ciclo e permite conferir só seus pagamentos", () => {
  const html = renderToStaticMarkup(
    <PainelCustosCaixa
      dados={dados()}
      referencias={ref}
      visao="ciclos"
      ciclo="__sem_ciclo__"
    />,
  );
  assert.match(html, /Todos os ciclos \+ sem ciclo/);
  assert.match(html, /Soja 2026 · Fazenda A/);
  assert.match(html, /Serviço pago/);
  assert.doesNotMatch(html, /Sementes pagas/);
});
test("exportação conserva ciclo, data, categoria, total pago e encargos; impressão inclui todas as páginas", () => {
  const d = dados();
  const linhas = linhasPagamentosCaixa(d.pagamentos, ref);
  assert.equal(linhas[1].Ciclo, "Sem ciclo");
  assert.equal(linhas[1]["Desembolso operacional (R$)"], 200);
  assert.equal(linhas[0]["Data da baixa"], "10/09/2026");
  d.pagamentos = Array.from({ length: 51 }, (_, i) => ({
    ...d.pagamentos[0],
    id: String(i),
    descricao: `Pagamento ${i}`,
  }));
  const normal = renderToStaticMarkup(
    <PainelCustosCaixa dados={d} referencias={ref} visao="total" />,
  );
  const print = renderToStaticMarkup(
    <PainelCustosCaixa
      dados={d}
      referencias={ref}
      visao="total"
      formato="detalhado"
      impressao
    />,
  );
  assert.doesNotMatch(normal, /Pagamento 50</);
  assert.match(print, /Pagamento 50</);
  assert.match(normal, /Página 1 de 2/);
});
test("impressão sintética é o padrão e preserva totais sem listar pagamentos, pendências ou exclusões individuais", () => {
  const d = dados();
  d.pendencias.push({
    id: "p",
    descricao: "Pagamento a conferir individual",
    motivo: "Classificação pendente",
    valor: 50,
  });
  d.excluidos.push({
    id: "e",
    descricao: "Pagamento excluído individual",
    motivo: "Investimento",
    valor: 500,
  });
  for (const active of [false, true]) {
    for (const visao of ["total", "ciclos"] as const) {
      const html = renderToStaticMarkup(
        <OperationalPresentation active={active}>
          <PainelCustosCaixa
            dados={d}
            referencias={ref}
            visao={visao}
            impressao
          />
        </OperationalPresentation>,
      );
      assert.match(html, /R\$ 300,00/);
      assert.match(html, /Em que foi gasto/);
      assert.doesNotMatch(
        html,
        /precisam de conferência|fora do escopo operacional|Ver pagamentos a conferir/,
      );
      assert.doesNotMatch(
        html,
        /Pagamentos do período|Documento \/ pagamento|Sementes pagas|Serviço pago|Pagamento a conferir individual|Pagamento excluído individual/,
      );
    }
  }
});
test("escolher detalhado imprime os pagamentos selecionados e a relação de conferência", () => {
  const d = dados();
  d.pendencias.push({
    id: "p",
    descricao: "Pagamento a conferir individual",
    motivo: "Classificação pendente",
    valor: 50,
  });
  d.excluidos.push({
    id: "e",
    descricao: "Pagamento excluído individual",
    motivo: "Investimento",
    valor: 500,
  });
  for (const active of [false, true]) {
    const html = renderToStaticMarkup(
      <OperationalPresentation active={active}>
        <PainelCustosCaixa
          dados={d}
          referencias={ref}
          visao="ciclos"
          ciclo="__sem_ciclo__"
          formato="detalhado"
          impressao
        />
      </OperationalPresentation>,
    );
    assert.match(html, /Documento \/ pagamento/);
    assert.match(html, /Serviço pago/);
    assert.match(html, /Pagamento a conferir individual/);
    assert.match(html, /precisam de conferência/);
    assert.match(
      html,
      /Pagamento excluído individual|fora do escopo operacional/,
    );
    assert.doesNotMatch(html, /Sementes pagas/);
  }
});
test("pendências explicam pagamentos sem classificação; não ocultam o pagamento nem o motivo", () => {
  const d = dados();
  d.pendencias.push({
    id: "p",
    descricao: "Pagamento a revisar",
    motivo: "Sem valor pago registrado",
    valor: null,
  });
  const html = renderToStaticMarkup(
    <PainelCustosCaixa dados={d} referencias={ref} visao="total" />,
  );
  assert.match(html, /1 pagamentos precisam de conferência/);
  assert.match(html, /Pagamento a revisar/);
  assert.match(html, /Sem valor pago registrado/);
});
