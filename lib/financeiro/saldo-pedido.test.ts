import assert from "node:assert/strict";
import test from "node:test";
import { saldoDoPedido, valorEntreguePorLinhas, valorCanceladoPorLinhas, resumoValorPedido, saldoAdiantamentosNaMoeda, motivoSaldoPedido, motivoDaObservacao, observacaoSemMotivo, ajustarSaldoPedidoNoFC, MARCA_SALDO_ZERADO } from "./saldo-pedido.ts";

test("saldo = total do pedido menos as NFs processadas", () => {
  assert.equal(saldoDoPedido(100000, 30000), 70000);
  assert.equal(saldoDoPedido(100000, 0), 100000);
});

test("NFs que cobrem ou passam o pedido zeram o saldo (nunca negativo)", () => {
  assert.equal(saldoDoPedido(8400, 8400), 0);
  assert.equal(saldoDoPedido(46500, 241758.15), 0);
});

test("arredonda em centavos", () => {
  assert.equal(saldoDoPedido(100, 33.33), 66.67);
});

test("pedido em dólar: NFs em reais convertidas pela PTAX do dia de cada uma", async () => {
  const { totalNfsNaMoeda } = await import("./saldo-pedido.ts");
  const ptax = async (d: string) => (d === "2026-10-20" ? 5.0 : d === "2026-10-21" ? 4.0 : null);
  assert.equal(await totalNfsNaMoeda([{ valor_total: 10000, data_emissao: "2026-10-20" }, { valor_total: 4000, data_emissao: "2026-10-21" }], "USD", ptax), 3000);
  assert.equal(await totalNfsNaMoeda([{ valor_total: 10000, data_emissao: "2026-10-20" }], "BRL", ptax), 10000);
  assert.equal(await totalNfsNaMoeda([{ valor_total: 10000, data_emissao: "2026-01-01" }], "USD", ptax), null);
});

test("valor entregue: quantidade entregue x valor líquido da linha", () => {
  const linhas = [{ quantidade: 10, qtd_entregue: 4, qtd_cancelada: 1, valor_unitario: 100, desconto_unitario: 10 }, { quantidade: 5, valor_unitario: 20 }];
  assert.equal(valorEntreguePorLinhas(linhas), 360);
  assert.equal(valorCanceladoPorLinhas(linhas), 90);
});
test("resumo de valor: saldo e % desconsideram o cancelado e nunca ficam negativos", () => {
  assert.deepEqual(resumoValorPedido(1000, 400), { total: 1000, entregue: 400, cancelado: 0, saldo: 600, pct: 40 });
  assert.deepEqual(resumoValorPedido(1000, 400, 200), { total: 1000, entregue: 400, cancelado: 200, saldo: 400, pct: 50 });
  assert.equal(resumoValorPedido(1000, 1200).saldo, 0);
  assert.equal(resumoValorPedido(0, 0).pct, 0);
});

test("adiantamento abate só o que não foi aplicado, na moeda do título", async () => {
  const ptax = async () => 5;
  assert.equal(await saldoAdiantamentosNaMoeda([{ valor: 30000, valor_aplicado: 10000, moeda: "BRL" }], "BRL", ptax), 20000);
  assert.equal(await saldoAdiantamentosNaMoeda([{ valor: 5000, moeda: "BRL", data_emissao: "2026-10-01" }], "USD", ptax), 1000);
  assert.equal(await saldoAdiantamentosNaMoeda([{ valor: 100, moeda: "USD", cotacao_usd: 6 }], "BRL", ptax), 600);
  assert.equal(await saldoAdiantamentosNaMoeda([{ valor: 5000, moeda: "BRL", data_emissao: "2026-10-01" }], "USD", async () => null), null);
});
test("motivo explica a redução e não apaga o texto do usuário", () => {
  const m = motivoSaldoPedido({ total: 100000, nfs: 40000, adiantamentos: 30000, saldo: 30000 })!;
  assert.equal(motivoDaObservacao(`Combinado com o gerente\n${m}`), "Total R$ 100.000,00 − NFs processadas R$ 40.000,00 − adiantamentos R$ 30.000,00 = R$ 30.000,00");
  assert.equal(observacaoSemMotivo(`Combinado com o gerente\n${MARCA_SALDO_ZERADO}\n${m}`), "Combinado com o gerente");
  assert.equal(motivoSaldoPedido({ total: 100, nfs: 0, adiantamentos: 0, saldo: 100 }), null);
});

function clienteFalso(d: { ped: object; lanc: object; nfs: object[]; adts: object[] | null }) {
  const updates: Record<string, unknown>[] = [];
  const from = (tabela: string) => {
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, neq: () => q,
      maybeSingle: async () => ({ data: tabela === "pedidos_compra" ? d.ped : d.lanc }),
      update: (u: Record<string, unknown>) => { updates.push(u); return { eq: async () => ({}) }; },
      then: (ok: (r: unknown) => void) => ok({ data: tabela === "nf_entradas" ? d.nfs : d.adts }),
    };
    return q;
  };
  return { cli: { from } as never, updates };
}
const pedBase = { id: "p", status: "aprovado", total_financeiro: 100000, lancamento_id: "l" };
const lancBase = { id: "l", valor: 100000, status: "em_aberto", moeda: "BRL", origem_lancamento: "pedido_compra", nf_entrada_id: null, observacao: null };

test("adiantamento ligado reduz o título do pedido e grava o motivo", async () => {
  const { cli, updates } = clienteFalso({ ped: pedBase, lanc: lancBase, nfs: [{ valor_total: 40000 }], adts: [{ valor: 30000, valor_aplicado: 0, moeda: "BRL" }] });
  await ajustarSaldoPedidoNoFC(cli, "p");
  assert.equal(updates[0].valor, 30000);
  assert.match(String(updates[0].observacao), /adiantamentos R\$ 30\.000,00 = R\$ 30\.000,00/);
});
test("adiantamento aplicado na NF não abate de novo: o caixa futuro continua certo", async () => {
  const { cli, updates } = clienteFalso({ ped: pedBase, lanc: lancBase, nfs: [{ valor_total: 40000 }], adts: [{ valor: 30000, valor_aplicado: 30000, moeda: "BRL" }] });
  await ajustarSaldoPedidoNoFC(cli, "p");
  assert.equal(updates[0].valor, 60000);
});
test("sem a Seção 419 vale só o abatimento das NFs", async () => {
  const { cli, updates } = clienteFalso({ ped: pedBase, lanc: lancBase, nfs: [{ valor_total: 40000 }], adts: null });
  await ajustarSaldoPedidoNoFC(cli, "p");
  assert.equal(updates[0].valor, 60000);
});
test("adiantamento cobrindo o pedido inteiro zera o título, com o motivo", async () => {
  const { cli, updates } = clienteFalso({ ped: pedBase, lanc: lancBase, nfs: [], adts: [{ valor: 100000, moeda: "BRL" }] });
  await ajustarSaldoPedidoNoFC(cli, "p");
  assert.equal(updates[0].status, "cancelado");
  assert.match(String(updates[0].observacao), /adiantamentos/);
});
