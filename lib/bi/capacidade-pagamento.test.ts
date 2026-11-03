import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCapacidade, compromissosDoPeriodo, periodoCivil, situacaoCobertura, type CicloCap } from "./capacidade-pagamento.ts";

const soja: CicloCap = { id: "s", descricao: "Soja", unidade: "sc", area_ha: 1000, produtividade: 65, preco: 120, custo_ha: 5400, comprometido: 0 };

test("necessário por hectare, em reais e em sacas, e produtividade mínima", () => {
  const r = calcularCapacidade([soja], 3_000_000);
  assert.equal(r.necessario_ha, 3000);
  assert.equal(r.linhas[0].unidades_ha, 25);
  assert.equal(r.linhas[0].produtividade_minima, 70);
  assert.equal(r.caixa, 2_400_000);
  assert.equal(r.cobertura, 0.8);
  assert.equal(r.folga, -600_000);
  assert.equal(r.situacao, "deficit");
});

test("preço mínimo cobre custo e dívida sobre o que sobra para vender", () => {
  const r = calcularCapacidade([soja], 3_000_000);
  assert.equal(r.linhas[0].preco_minimo, 129.23);
});

test("sacas comprometidas saem da venda e sobem a produtividade mínima", () => {
  const r = calcularCapacidade([{ ...soja, comprometido: 5000 }], 3_000_000);
  assert.equal(r.receita, 7_200_000);
  assert.equal(r.linhas[0].produtividade_minima, 75);
});

test("dívida repartida pela receita de cada ciclo; sem receita, pela área", () => {
  const milho: CicloCap = { id: "m", descricao: "Milho", unidade: "sc", area_ha: 1000, produtividade: 100, preco: 26, custo_ha: 2600, comprometido: 0 };
  const r = calcularCapacidade([soja, milho], 1_060_000);
  assert.equal(r.linhas[0].parte_divida, 795_000);
  assert.equal(r.linhas[1].parte_divida, 265_000);
  const semPreco = calcularCapacidade([{ ...soja, preco: 0 }, { ...milho, preco: 0 }], 1000);
  assert.equal(semPreco.linhas[0].parte_divida, 500);
  assert.equal(semPreco.situacao, "sem_dados");
  assert.equal(semPreco.linhas[0].unidades_ha, null);
});

test("sem área não divide por zero", () => {
  const r = calcularCapacidade([{ ...soja, area_ha: 0 }], 1000);
  assert.equal(r.necessario_ha, 0);
  assert.equal(r.linhas[0].produtividade_minima, null);
});

const contratos = [
  { id: "a", tipo: "custeio", moeda: "BRL" }, { id: "b", tipo: "investimento", moeda: "USD" }, { id: "c", tipo: "cpr", moeda: "BRL", status: "refinanciado" },
];
const pc = (contrato_id: string, data_vencimento: string, amortizacao: number, juros = 0, status = "em_aberto") =>
  ({ contrato_id, data_vencimento, amortizacao, juros, despesas_acessorios: 0, valor_parcela: amortizacao + juros, status });

test("custeio entra por inteiro, dólar converte e fora do período não conta", () => {
  const l = compromissosDoPeriodo([pc("a", "2027-03-10", 1000, 100), pc("a", "2028-03-10", 999), pc("b", "2027-05-01", 100, 10)], contratos, [], periodoCivil(2027), 5);
  assert.deepEqual(l.find(x => x.grupo === "Custeio"), { grupo: "Custeio", principal: 1000, juros: 100, encargos: 0, total: 1100, pago: 0 });
  assert.equal(l.find(x => x.grupo === "Investimento")?.total, 550);
  assert.equal(l.length, 2);
});

test("contrato refinanciado só conta o que já foi pago", () => {
  const l = compromissosDoPeriodo([pc("c", "2027-01-10", 500), pc("c", "2027-02-10", 300, 0, "pago")], contratos, [], periodoCivil(2027), 5);
  assert.equal(l[0].total, 300);
  assert.equal(l[0].pago, 300);
});

test("parcela sem detalhe usa o valor da parcela, e outros compromissos somam no grupo", () => {
  const semDet = { contrato_id: "a", data_vencimento: "2027-01-10", amortizacao: 0, juros: 0, despesas_acessorios: 0, valor_parcela: 700, status: "pago" };
  const l = compromissosDoPeriodo([semDet], contratos, [{ grupo: "Compra de terra", data_vencimento: "2027-06-01", valor: 900, pago: false }], periodoCivil(2027), 5);
  assert.equal(l.find(x => x.grupo === "Custeio")?.pago, 700);
  assert.equal(l.find(x => x.grupo === "Compra de terra")?.total, 900);
});

test("faixas da cobertura", () => {
  assert.equal(situacaoCobertura(1.2, 10), "folga");
  assert.equal(situacaoCobertura(1, 10), "atencao");
  assert.equal(situacaoCobertura(0.99, 10), "deficit");
  assert.equal(situacaoCobertura(null, 10), "sem_dados");
});
