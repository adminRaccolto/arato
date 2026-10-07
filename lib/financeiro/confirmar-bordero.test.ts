import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PagamentoLote, PagamentoLoteItem } from "../supabase";
import { estornarBorderoComSaldo } from "./estornar-bordero";
import { confirmarBorderoComSaldo } from "./confirmar-bordero";
import { acumularPagamentoBordero, ratearMoeda, resumoBordero } from "./saldo-bordero";
import { filtrarBordero, vinculosBorderos } from "./cp-grid";

type Row = Record<string, unknown>;
function banco() {
  const tabelas: Record<string, Row[]> = { pagamento_lotes: [{ id: "b1", fazenda_id: "f1", tipo: "pagar", status: "pendente", valor_total: 4000,
    valor_pago: null, valor_juros: 0, valor_multa: 0, valor_desconto: 0, data_vencimento: "2026-10-15" }],
    pagamento_lote_itens: [], lancamentos: [], empresa_lancamentos: [] };
  for (let i = 0; i < 4; i++) {
    const origem = i === 3 ? "empresa_lancamentos" : "lancamentos";
    tabelas[origem].push({ id: `nf${i}`, lote_id: "b1", tipo: "pagar", status: i === 3 ? "pendente" : "em_aberto", valor: 1000, valor_pago: null,
      valor_juros: null, valor_multa: null, valor_desconto: null, conta_bancaria: null, data_baixa: null, data_pagamento: null });
    tabelas.pagamento_lote_itens.push({ id: `i${i}`, lote_id: "b1", lancamento_id: `nf${i}`, origem_tabela: origem, valor_pago: 1000 });
  }
  const falhas = { titulo: "", cabecalho: false };
  function from(tabela: string) {
    let acao = "select", unico = false, offset = 0, limite = Infinity;
    let payload: Row = {};
    const filtros: ((r: Row) => boolean)[] = [];
    const query = {
      select() { return query; }, single() { unico = true; return query; }, order() { return query; },
      range(de: number, ate: number) { offset = de; limite = ate - de + 1; return query; },
      update(p: Row) { acao = "update"; payload = p; return query; },
      delete() { acao = "delete"; return query; },
      eq(c: string, v: unknown) { filtros.push(r => r[c] === v); return query; },
      is(c: string, v: unknown) { filtros.push(r => (r[c] ?? null) === v); return query; },
      in(c: string, vs: unknown[]) { filtros.push(r => vs.includes(r[c])); return query; },
      then(resolve: (r: { data: Row | Row[] | null; error: Error | null }) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve().then(() => {
          const rows = tabelas[tabela].filter(r => filtros.every(f => f(r))).slice(offset, offset + limite);
          if (acao === "update" || acao === "delete") {
            if ((falhas.cabecalho && tabela === "pagamento_lotes") || rows.some(r => r.id === falhas.titulo))
              return { data: null, error: new Error("Falha simulada") };
            if (acao === "update") rows.forEach(r => Object.assign(r, payload));
            else {
              tabelas[tabela] = tabelas[tabela].filter(r => !rows.includes(r));
              if (tabela === "pagamento_lotes") tabelas.pagamento_lote_itens = tabelas.pagamento_lote_itens.filter(i => !rows.some(r => r.id === i.lote_id));
            }
          }
          const data = structuredClone(rows);
          return { data: unico ? data[0] ?? null : data, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  }
  return { db: { from } as unknown as SupabaseClient, tabelas, falhas, lote: () => tabelas.pagamento_lotes[0] as unknown as PagamentoLote,
    originais: () => [...tabelas.lancamentos, ...tabelas.empresa_lancamentos] };
}
const pagar = (db: SupabaseClient, valor: number, anterior?: number) => confirmarBorderoComSaldo(db, "b1", "2026-10-07", "conta1", { valor_pago: valor, principal_anterior: anterior });

test("caso do print: 4000 - 2500 mantém 1500 em CP, Parcial e Em Aberto, fora de Baixado", async () => {
  const b = banco(); await pagar(b.db, 2500, 0);
  assert.deepEqual(resumoBordero(b.lote()), { liquidado: 2500, saldo: 1500, status: "parcial" });
  assert.equal(b.lote().status, "pendente");
  for (const status of ["parcial", "em_aberto", "baixado"]) {
    assert.equal(filtrarBordero(b.lote(), [], { origens: new Set(), status: new Set([status]), busca: "", de: "", ate: "", hoje: "2026-10-07" }), status !== "baixado");
  }
  assert.equal(vinculosBorderos([{ ...b.lote(), itens: b.tabelas.pagamento_lote_itens as unknown as PagamentoLoteItem[] }]).size, 4);
  assert.deepEqual(b.originais().map(o => o.valor_pago), [625, 625, 625, 625]);
  assert.ok(b.originais().every(o => o.status === "parcial" && o.lote_id === "b1"));
});
test("pagar o saldo acumula 2500 + 1500, quita PF/PJ e conserva o mesmo borderô", async () => {
  const b = banco(); await pagar(b.db, 2500); await pagar(b.db, 1500, 2500);
  assert.deepEqual(resumoBordero(b.lote()), { liquidado: 4000, saldo: 0, status: "baixado" });
  assert.equal(b.lote().status, "pago");
  assert.equal(b.tabelas.pagamento_lotes.length, 1);
  assert.deepEqual(b.originais().map(o => o.valor_pago), [1000, 1000, 1000, 1000]);
  assert.deepEqual(b.originais().map(o => o.status), ["baixado", "baixado", "baixado", "pago"]);
  assert.deepEqual(b.tabelas.pagamento_lote_itens.map(i => i.valor_pago), [1000, 1000, 1000, 1000]);
  await assert.rejects(pagar(b.db, 1500), /já está quitado/);
});
test("borderô antigo marcado como pago com valor menor é reconhecido como parcial e pode quitar só o saldo", async () => {
  const b = banco(); await pagar(b.db, 2500);
  b.tabelas.pagamento_lotes[0].status = "pago";
  assert.equal(resumoBordero(b.lote()).status, "parcial");
  await pagar(b.db, 1500, 2500);
  assert.equal(resumoBordero(b.lote()).saldo, 0);
});
test("pagamentos com juros e desconto conservam principal, caixa e rateios acumulados", async () => {
  const b = banco();
  await confirmarBorderoComSaldo(b.db, "b1", "2026-10-07", "conta1", { valor_pago: 2500, valor_juros: 50, valor_desconto: 100 });
  assert.equal(resumoBordero(b.lote()).saldo, 1500);
  await confirmarBorderoComSaldo(b.db, "b1", "2026-10-08", "conta2", { valor_pago: 1500, valor_juros: 30, valor_desconto: 50 });
  assert.equal(b.lote().valor_pago, 4000); assert.equal(b.lote().valor_juros, 80); assert.equal(b.lote().valor_desconto, 150);
  assert.equal(b.originais().reduce((s, o) => s + Number(o.valor_pago), 0), 3930);
  assert.ok(b.originais().every(o => ["baixado", "pago"].includes(o.status as string)));
});
test("preserva pagamento anterior à criação do borderô", async () => {
  const b = banco();
  b.tabelas.lancamentos[0].valor = 1500; b.tabelas.lancamentos[0].valor_pago = 500;
  b.tabelas.lancamentos[0].status = "parcial";
  await pagar(b.db, 2500); await pagar(b.db, 1500);
  assert.equal(b.tabelas.lancamentos[0].valor_pago, 1500);
  assert.equal(b.lote().valor_pago, 4000);
});
test("falha em um título ou no cabeçalho desfaz as alterações desta confirmação", async () => {
  for (const falha of ["titulo", "cabecalho"]) {
    const b = banco(); const antes = structuredClone(b.tabelas);
    if (falha === "titulo") b.falhas.titulo = "nf1"; else b.falhas.cabecalho = true;
    await assert.rejects(pagar(b.db, 2500), /Falha simulada/);
    // A API grava ausências de encargos como NULL na reversão.
    for (const i of antes.pagamento_lote_itens) Object.assign(i, { valor_juros: null, valor_multa: null, valor_desconto: null });
    for (const i of b.tabelas.pagamento_lote_itens) for (const campo of ["valor_juros", "valor_multa", "valor_desconto"]) i[campo] ??= null;
    assert.deepEqual(b.tabelas, antes);
  }
});
test("rejeita pagamento com versão antiga ou saldo divergente antes de alterar títulos", async () => {
  const b = banco(); await pagar(b.db, 2500);
  const antes = structuredClone(b.tabelas);
  await assert.rejects(pagar(b.db, 1000, 0), /outro pagamento/);
  assert.deepEqual(b.tabelas, antes);
  b.tabelas.lancamentos[0].valor_pago = 700;
  await assert.rejects(pagar(b.db, 1000, 2500), /diverge/);
});
test("valida valores e mantém compatibilidade de borderôs legados sem valor_pago", () => {
  assert.equal(resumoBordero({ status: "pago", valor_total: 3500 }).saldo, 0);
  for (const valor_pago of [0, -1, Infinity, NaN, 4001])
    assert.throws(() => acumularPagamentoBordero({ id: "b", fazenda_id: "f", tipo: "pagar", status: "pendente", valor_total: 4000 }, { valor_pago }));
});
test("rateio em centavos conserva o total e não paga itens sem saldo", () => {
  assert.deepEqual(ratearMoeda(100, [1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.deepEqual(ratearMoeda(0.01, [0, 1, 1]), [0, 0.01, 0]);
});


test("confirmações concorrentes não duplicam o pagamento nem o principal do borderô", async () => {
  const b = banco();
  const resultados = await Promise.allSettled([pagar(b.db, 2500, 0), pagar(b.db, 2500, 0)]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(b.lote().valor_pago, 2500);
  assert.deepEqual(b.originais().map(o => o.valor_pago), [625, 625, 625, 625]);
});


test("estorno do borderô parcial libera PF/PJ e preserva pagamento feito antes de agrupar", async () => {
  const b = banco();
  Object.assign(b.tabelas.lancamentos[0], { valor: 1500, valor_pago: 500, status: "parcial" });
  await pagar(b.db, 2500);
  await estornarBorderoComSaldo(b.db, "b1");
  assert.equal(b.tabelas.pagamento_lotes.length, 0);
  assert.equal(b.tabelas.pagamento_lote_itens.length, 0);
  assert.deepEqual(b.originais().map(o => o.valor_pago), [500, 0, 0, 0]);
  assert.deepEqual(b.originais().map(o => o.status), ["parcial", "em_aberto", "em_aberto", "pendente"]);
  assert.ok(b.originais().every(o => o.lote_id === null));
});
test("estorno desfaz todos os pagamentos acumulados do borderô e seus encargos", async () => {
  const b = banco();
  await confirmarBorderoComSaldo(b.db, "b1", "2026-10-07", "conta1", { valor_pago: 2500, valor_juros: 50, valor_desconto: 100 });
  await confirmarBorderoComSaldo(b.db, "b1", "2026-10-08", "conta2", { valor_pago: 1500, valor_juros: 30, valor_desconto: 50 });
  await estornarBorderoComSaldo(b.db, "b1");
  assert.ok(b.originais().every(o => o.valor_pago === 0 && o.valor_juros === 0 && o.valor_desconto === 0 && o.conta_bancaria === null));
});
test("falha ao excluir o cabeçalho no estorno mantém os pagamentos e vínculos", async () => {
  const b = banco(); await pagar(b.db, 2500);
  const antes = structuredClone(b.tabelas); b.falhas.cabecalho = true;
  await assert.rejects(estornarBorderoComSaldo(b.db, "b1"), /Falha simulada/);
  assert.deepEqual(b.tabelas, antes);
});

test("baixa parcial atribui novo vencimento somente ao saldo do borderô", async () => {
  const b = banco();
  await confirmarBorderoComSaldo(b.db, "b1", "2026-10-07", "conta1", { valor_pago: 2500, novo_vencimento_saldo: "2026-11-15" });
  assert.equal(b.lote().data_vencimento, "2026-11-15");
  assert.equal(b.lote().data_pagamento, "2026-10-07");
  assert.equal(resumoBordero(b.lote()).saldo, 1500);
  const filtros = { origens: new Set<string>(), status: new Set(["parcial"]), busca: "", de: "2026-11-01", ate: "2026-11-30", hoje: "2026-10-07" };
  assert.equal(filtrarBordero(b.lote(), [], filtros), true);
  assert.equal(filtrarBordero(b.lote(), [], { ...filtros, de: "2026-10-01", ate: "2026-10-31" }), false);
  await pagar(b.db, 1500, 2500);
  assert.equal(b.lote().data_vencimento, "2026-11-15");
  assert.equal(resumoBordero(b.lote()).saldo, 0);
});
test("vencimento é opcional: pagamentos parciais sem nova data mantêm a data existente", async () => {
  for (const novo_vencimento_saldo of [undefined, "", "  "]) {
    const b = banco();
    await confirmarBorderoComSaldo(b.db, "b1", "2026-10-07", "conta1", { valor_pago: 2500, novo_vencimento_saldo });
    assert.equal(b.lote().data_vencimento, "2026-10-15");
  }
});
test("quitação integral não altera vencimento, mesmo com campo de nova data enviado", async () => {
  const b = banco();
  await confirmarBorderoComSaldo(b.db, "b1", "2026-10-07", "conta1", { valor_pago: 4000, novo_vencimento_saldo: "2026-11-15" });
  assert.equal(b.lote().data_vencimento, "2026-10-15");
});
test("data inexistente ou fora do formato é rejeitada antes de qualquer baixa", async () => {
  for (const novo_vencimento_saldo of ["2026-02-30", "2026-13-01", "15/11/2026", "inválida"]) {
    const b = banco(); const antes = structuredClone(b.tabelas);
    await assert.rejects(confirmarBorderoComSaldo(b.db, "b1", "2026-10-07", "conta1", { valor_pago: 2500, novo_vencimento_saldo }), /data válida/);
    assert.deepEqual(b.tabelas, antes);
  }
});
test("falha na baixa não publica a nova data do saldo", async () => {
  const b = banco(); b.falhas.cabecalho = true;
  await assert.rejects(confirmarBorderoComSaldo(b.db, "b1", "2026-10-07", "conta1", { valor_pago: 2500, novo_vencimento_saldo: "2026-11-15" }));
  assert.equal(b.lote().data_vencimento, "2026-10-15");
  assert.equal(b.lote().valor_pago, null);
});
