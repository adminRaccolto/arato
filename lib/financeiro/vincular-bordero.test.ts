import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarNumerosNF } from "./numeros-nf";
import { validarItensBordero, vincularItensBordero, type ItemBordero } from "./vincular-bordero";

type Row = Record<string, unknown>;
function banco() {
  const tabelas: Record<string, Row[]> = {
    lancamentos: [{ id: "nf1", tipo: "pagar", status: "em_aberto", lote_id: null }],
    empresa_lancamentos: [{ id: "nf2", tipo: "pagar", status: "pendente", lote_id: null }],
    pagamento_lotes: [{ id: "b1" }, { id: "b2" }], pagamento_lote_itens: [], nf_entradas: [],
  };
  const falhas = { inserirItens: false, liberar: false };
  function from(tabela: string) {
    let acao = "select";
    let payload: Row | Row[] = {};
    const filtros: ((r: Row) => boolean)[] = [];
    const query = {
      select() { return query; },
      update(p: Row) { acao = "update"; payload = p; return query; },
      insert(p: Row[]) { acao = "insert"; payload = p; return query; },
      delete() { acao = "delete"; return query; },
      eq(c: string, v: unknown) { filtros.push(r => r[c] === v); return query; },
      is(c: string, v: unknown) { filtros.push(r => (r[c] ?? null) === v); return query; },
      in(c: string, vs: unknown[]) { filtros.push(r => vs.includes(r[c])); return query; },
      then(resolve: (r: { data: Row[] | null; error: Error | null }) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve().then(() => {
          if ((falhas.inserirItens && tabela === "pagamento_lote_itens" && acao === "insert") ||
              (falhas.liberar && acao === "update" && !Array.isArray(payload) && payload.lote_id === null))
            return { data: null, error: new Error("Falha simulada") };
          const rows = tabelas[tabela].filter(r => filtros.every(f => f(r)));
          if (acao === "update") rows.forEach(r => Object.assign(r, payload));
          if (acao === "delete") tabelas[tabela] = tabelas[tabela].filter(r => !rows.includes(r));
          if (acao === "insert") tabelas[tabela].push(...payload as Row[]);
          return { data: rows, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  }
  return { db: { from } as unknown as SupabaseClient, tabelas, falhas };
}
const item: ItemBordero = { lancamento_id: "nf1", valor_pago: 100 };

test("valida repetição, seleção vazia e valores inválidos antes de criar", () => {
  for (const itens of [[], [item, item], [{ ...item, valor_pago: NaN }], [{ ...item, valor_pago: 0 }]])
    assert.throws(() => validarItensBordero(itens));
  assert.doesNotThrow(() => validarItensBordero([item, { ...item, origem_tabela: "empresa_lancamentos" }]));
});
test("reserva PF e PJ sem alterar status nem valor pago", async () => {
  const { db, tabelas } = banco();
  await vincularItensBordero(db, "b1", "pagar", [item, { lancamento_id: "nf2", origem_tabela: "empresa_lancamentos", valor_pago: 200 }]);
  assert.equal(tabelas.lancamentos[0].lote_id, "b1");
  assert.equal(tabelas.empresa_lancamentos[0].lote_id, "b1");
  assert.equal(tabelas.lancamentos[0].status, "em_aberto");
  assert.equal(tabelas.lancamentos[0].valor_pago, undefined);
  assert.equal(tabelas.pagamento_lote_itens.length, 2);
});
test("duas criações concorrentes agrupam o título apenas uma vez", async () => {
  const { db, tabelas } = banco();
  const resultados = await Promise.allSettled([
    vincularItensBordero(db, "b1", "pagar", [item]), vincularItensBordero(db, "b2", "pagar", [item]),
  ]);
  assert.equal(resultados.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(tabelas.pagamento_lote_itens.length, 1);
  assert.equal(tabelas.pagamento_lotes.length, 1);
  assert.equal(tabelas.lancamentos[0].lote_id, tabelas.pagamento_lote_itens[0].lote_id);
});
test("vínculo histórico nos itens impede nova inclusão mesmo sem lote_id no original", async () => {
  const { db, tabelas } = banco();
  tabelas.pagamento_lote_itens.push({ lote_id: "b1", lancamento_id: "nf1", origem_tabela: "lancamentos" });
  await assert.rejects(vincularItensBordero(db, "b2", "pagar", [item]), /já pertence/);
  assert.equal(tabelas.pagamento_lote_itens.length, 1);
  assert.deepEqual(tabelas.pagamento_lotes, [{ id: "b1" }]);
});
test("erro após reservar um título libera somente as reservas próprias", async () => {
  const { db, tabelas } = banco();
  tabelas.empresa_lancamentos[0].lote_id = "outro";
  await assert.rejects(vincularItensBordero(db, "b1", "pagar", [item, { lancamento_id: "nf2", origem_tabela: "empresa_lancamentos", valor_pago: 200 }]));
  assert.equal(tabelas.lancamentos[0].lote_id, null);
  assert.equal(tabelas.empresa_lancamentos[0].lote_id, "outro");
  assert.equal(tabelas.pagamento_lote_itens.length, 0);
});
test("falha ao inserir itens desfaz reservas e cabeçalho", async () => {
  const { db, tabelas, falhas } = banco();
  falhas.inserirItens = true;
  await assert.rejects(vincularItensBordero(db, "b1", "pagar", [item]), /Falha simulada/);
  assert.equal(tabelas.lancamentos[0].lote_id, null);
  assert.deepEqual(tabelas.pagamento_lotes, [{ id: "b2" }]);
});
test("título baixado ou de CR não pode ser agrupado em CP", async () => {
  for (const alteracao of [{ status: "baixado" }, { tipo: "receber" }]) {
    const { db, tabelas } = banco();
    Object.assign(tabelas.lancamentos[0], alteracao);
    await assert.rejects(vincularItensBordero(db, "b1", "pagar", [item]));
    assert.equal(tabelas.lancamentos[0].lote_id, null);
  }
});
test("falha na liberação conserva cabeçalho para recuperação e informa o usuário", async () => {
  const { db, tabelas, falhas } = banco();
  falhas.inserirItens = true; falhas.liberar = true;
  await assert.rejects(vincularItensBordero(db, "b1", "pagar", [item]), /cancele o borderô/);
  assert.equal(tabelas.lancamentos[0].lote_id, "b1");
  assert.equal(tabelas.pagamento_lotes.length, 2);
});


test("carrega o número da NF vinculada para PF e PJ mesmo quando o relatório está vazio ou desatualizado", async () => {
  const { db, tabelas } = banco();
  Object.assign(tabelas.lancamentos[0], { nf_entrada_id: "fiscal1", nfe_numero: null });
  Object.assign(tabelas.empresa_lancamentos[0], { nf_entrada_id: "fiscal2", numero_documento: "antigo" });
  tabelas.nf_entradas.push({ id: "fiscal1", numero: "12345" }, { id: "fiscal2", numero: "98765" });
  const originais = [
    { id: "nf1", origem_tabela: "lancamentos", nfe_numero: null },
    { id: "nf2", origem_tabela: "empresa_lancamentos", nfe_numero: "desatualizado" },
  ];
  const resultado = await carregarNumerosNF(db, originais);
  assert.deepEqual(resultado.map(t => t.nfe_numero), ["12345", "98765"]);
  assert.deepEqual(originais.map(t => t.nfe_numero), [null, "desatualizado"]);
});
test("carrega todas as NFs em blocos e conserva títulos manuais sem inventar um número fiscal", async () => {
  const { db, tabelas } = banco();
  const titulos = Array.from({ length: 401 }, (_, i) => ({ id: `titulo${i}`, origem_tabela: "lancamentos", nfe_numero: null }));
  tabelas.lancamentos = titulos.map((t, i) => ({ id: t.id, nfe_numero: i === 400 ? "NF400" : null, numero: i }));
  const resultado = await carregarNumerosNF(db, titulos);
  assert.equal(resultado.length, 401);
  assert.equal(resultado[0].nfe_numero, null);
  assert.equal(resultado[400].nfe_numero, "NF400");
});
