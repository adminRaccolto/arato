import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarLancamentosConciliacao } from "./conciliacao-leitura.ts";
import { avaliarLinhas } from "../conciliacao-match.ts";
import { ajustarVinculosParaFk, caixaDoBordero, ehLinhaSaldo, linhaMudou, linhasAlteradas, pagoSemExtrato } from "./conciliacao.ts";

test("título de Empresa (fora de lancamentos) vai só para lancamento_ids e lancamento_id fica nulo", () => {
  const rows = [{ lancamento_id: "emp-1", lancamento_ids: null as string[] | null }];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].lancamento_id, null);
  assert.deepEqual(rows[0].lancamento_ids, ["emp-1"]);
});

test("título do produtor mantém lancamento_id (FK válida)", () => {
  const rows = [{ lancamento_id: "prod-1", lancamento_ids: ["prod-1"] }];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].lancamento_id, "prod-1");
});

test("vários títulos com ids mistos: lancamento_ids existente é preservado", () => {
  const rows = [{ lancamento_id: "emp-1", lancamento_ids: ["emp-1", "prod-1"] }];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].lancamento_id, null);
  assert.deepEqual(rows[0].lancamento_ids, ["emp-1", "prod-1"]);
});

const ex = { valor: 100, conciliado: true, lancamento_id: "a", lancamento_ids: ["a"], lancamento_desc: "d", lancamento_valor: 100 };
const nova = { valor: 100, conciliado: true, lancamento_id: "a", lancamento_ids: ["a"], lancamento_desc: "d", lancamento_valor: 100 };

test("linha idêntica não é regravada; linha nova é", () => {
  assert.equal(linhaMudou(ex, nova, false), false);
  assert.equal(linhaMudou(undefined, nova, false), true);
});

test("mudança de vínculo, de valor ou de conciliado é detectada", () => {
  assert.equal(linhaMudou(ex, { ...nova, conciliado: false }, false), true);
  assert.equal(linhaMudou(ex, { ...nova, lancamento_ids: ["a", "b"] }, false), true);
  assert.equal(linhaMudou(ex, { ...nova, valor: 100.5 }, false), true);
  assert.equal(linhaMudou(ex, { ...nova, lancamento_id: "b" }, false), true);
});

test("ordem dos ids não conta como mudança", () => {
  assert.equal(linhaMudou({ ...ex, lancamento_ids: ["a", "b"] }, { ...nova, lancamento_ids: ["b", "a"] }, false), false);
});

test("origem/confiança só contam quando as colunas novas existem", () => {
  assert.equal(linhaMudou({ ...ex, origem_vinculo: "manual" }, { ...nova, origem_vinculo: "sugestao" }, false), false);
  assert.equal(linhaMudou({ ...ex, origem_vinculo: "manual" }, { ...nova, origem_vinculo: "sugestao" }, true), true);
});

test("sugestão de título de Empresa (fora de lancamentos) é anulada para não violar a FK na importação", () => {
  const rows = [
    { lancamento_id: null, lancamento_ids: null, sugestao_lancamento_id: "emp-9" as string | null },
    { lancamento_id: null, lancamento_ids: null, sugestao_lancamento_id: "prod-1" as string | null },
  ];
  ajustarVinculosParaFk(rows, new Set(["prod-1"]));
  assert.equal(rows[0].sugestao_lancamento_id, null);
  assert.equal(rows[1].sugestao_lancamento_id, "prod-1");
});

test("borderô pago: caixa = principal + juros + multa − desconto", () => {
  assert.equal(caixaDoBordero({ status: "pago", valor_total: 8277.2, valor_pago: 8277.2, valor_juros: 833.23 }), 9110.43);
  assert.equal(caixaDoBordero({ status: "pago", valor_total: 10114.46, valor_pago: 10114.46, valor_desconto: 241.26 }), 9873.2);
  assert.equal(caixaDoBordero({ status: "pago", valor_total: 9182.71 }), 9182.71);
});

test("borderô pendente: o saldo em aberto", () => {
  assert.equal(caixaDoBordero({ status: "pendente", valor_total: 1000 }), 1000);
  assert.equal(caixaDoBordero({ status: "pendente", valor_total: 1000, valor_pago: 400 }), 600);
});

test("dois pagamentos parciais registrados no CP: cada linha cobre um pedaço", () => {
  assert.equal(pagoSemExtrato(10000, []), 10000);
  assert.equal(pagoSemExtrato(10000, [{ valor: -4000, titulos: 1 }]), 6000);
  assert.equal(pagoSemExtrato(10000, [{ valor: -4000, titulos: 1 }, { valor: -6000, titulos: 1 }]), 0);
});

test("linha ligada a vários títulos cobre o título inteiro", () => {
  assert.equal(pagoSemExtrato(500, [{ valor: -1500, titulos: 3 }]), 0);
});

test("reimportação com FITID novo: mesma transação não entra de novo, por contagem", async () => {
  const { linhasJaImportadas } = await import("./conciliacao.ts");
  const ex = [
    { data: "2026-09-10", valor: 20000, descricao: "PIX DEBITO PARA: SANTA RITA", tipo: "debito" },
    { data: "2026-09-10", valor: 500, descricao: "Tarifa", tipo: "debito" },
  ];
  const novas = [
    { id: "a", data: "2026-09-10", valor: 20000, descricao: "pix debito para:  santa rita", tipo: "debito" },
    { id: "b", data: "2026-09-10", valor: 500, descricao: "TARIFA", tipo: "debito" },
    { id: "c", data: "2026-09-10", valor: 500, descricao: "TARIFA", tipo: "debito" },   // segunda tarifa igual: nova
    { id: "d", data: "2026-09-11", valor: 20000, descricao: "PIX DEBITO PARA: SANTA RITA", tipo: "debito" },
    { id: "e", data: "2026-09-10", valor: 20000, descricao: "PIX DEBITO PARA: SANTA RITA", tipo: "credito" },
  ];
  assert.deepEqual([...linhasJaImportadas(novas, ex)].sort(), ["a", "b"]);
});

test("linha de saldo do extrato não é transação; descrições normais com 'saldo' continuam", () => {
  for (const d of ["SALDO TOTAL DISPONÍVEL DIA", "SALDO ANTERIOR", "Saldo Anterior", "SALDO DO DIA", "SDO CTA/APL"]) assert.equal(ehLinhaSaldo(d), true, d);
  for (const d of ["SALDO REFERENTE A ALUGUEL DA CAMIONETE", "PIX RECEBIDO SALDO", "PAGAMENTO SALDO DEVEDOR", "RESGATE APLICACAO", "", null]) assert.equal(ehLinhaSaldo(d), false, String(d));
});

test("linhasAlteradas: só a linha conciliada nesta ação é regravada, a de outro usuário fica como está", () => {
  const a = { id: "a", conciliado: false };
  const b = { id: "b", conciliado: false };
  const depois = [{ ...a }, { ...b, conciliado: true }];
  assert.deepEqual(linhasAlteradas([a, b], depois), [{ id: "b", conciliado: true }]);
  assert.deepEqual(linhasAlteradas([a, b], [a, b]), []);
  assert.deepEqual(linhasAlteradas([a], [a, b]), [b]);
});

// Exercita a leitura usada tanto pela carga da tela quanto pela importação do OFX.
type RegistroConciliacao = Record<string, unknown>;
function bancoConciliacao(tabelas: Record<string, RegistroConciliacao[]>, falha?: string) {
  const consultas: string[] = [];
  const separar = (s: string) => {
    let nivel = 0, inicio = 0;
    const partes: string[] = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") nivel++;
      if (s[i] === ")") nivel--;
      if (s[i] === "," && nivel === 0) { partes.push(s.slice(inicio, i)); inicio = i + 1; }
    }
    return [...partes, s.slice(inicio)];
  };
  const avaliar = (r: RegistroConciliacao, expressao: string): boolean => {
    if (expressao.startsWith("and(")) return separar(expressao.slice(4, -1)).every(x => avaliar(r, x));
    if (expressao.startsWith("or(")) return separar(expressao.slice(3, -1)).some(x => avaliar(r, x));
    const [campo, op, ...resto] = expressao.split(".");
    const valor = resto.join(".");
    if (op === "is") return r[campo] == null;
    if (r[campo] == null) return false;
    if (op === "neq") return r[campo] !== valor;
    if (op === "gte") return String(r[campo]) >= valor;
    if (op === "lte") return String(r[campo]) <= valor;
    throw new Error(`Operador não implementado: ${op}`);
  };
  return {
    consultas,
    sb: { from(tabela: string) {
      consultas.push(tabela);
      let rows = [...(tabelas[tabela] ?? [])], campos = "";
      const q = {
        select(c: string) { campos = c; return q; },
        in(c: string, valores: unknown[]) { rows = rows.filter(r => valores.includes(r[c])); return q; },
        neq(c: string, v: unknown) { rows = rows.filter(r => r[c] !== v); return q; },
        or(expressao: string) { rows = rows.filter(r => separar(expressao).some(x => avaliar(r, x))); return q; },
        order() { return q; },
        range(inicio: number, fim: number) {
          if (tabela === falha) return Promise.resolve({ data: null, error: new Error("Leitura negada") });
          return Promise.resolve({ data: rows.slice(inicio, fim + 1).map(r => Object.fromEntries(campos.split(",").map(c => [c, r[c]]))), error: null });
        },
      };
      return q;
    } } as unknown as SupabaseClient,
  };
}
const empresaBaixada = {
  id: "emp-cnpj", fazenda_id: "faz-1", tipo: "pagar", descricao: "NF Insumos",
  valor: "1200.00", valor_pago: "1200.00", data_vencimento: "2026-09-01",
  data_pagamento: "2026-11-05", status: "pago", conta_bancaria: "conta-cnpj",
  conciliado: false, moeda: "BRL", pessoa_id: "fornecedor", lote_id: null,
};

test("baixa do CNPJ preserva conta, data e valor do CP e pode casar com o extrato", async () => {
  const { sb } = bancoConciliacao({ empresa_lancamentos: [empresaBaixada] });
  const [titulo] = await buscarLancamentosConciliacao(sb, ["faz-1"], { de: "2026-11-01", ate: "2026-11-10" });
  assert.equal(titulo.conta_bancaria, "conta-cnpj");
  assert.equal(titulo.data_baixa, "2026-11-05");
  assert.equal(titulo.status, "baixado");
  assert.equal(titulo.valor_pago, 1200);
  assert.equal(titulo.origem_tabela, "empresa_lancamentos");
  const linha = { id: "ofx", data: "2026-11-05", descricao: "PAGAMENTO NF INSUMOS", valor: 1200, tipo: "debito" as const };
  const mesmaConta = avaliarLinhas([linha], [titulo], { conta: { id: "conta-cnpj", titulares: [] } });
  assert.equal(mesmaConta.get("ofx")?.lancamento?.id, "emp-cnpj");
  const outraConta = avaliarLinhas([linha], [titulo], { conta: { id: "outra-conta", titulares: [] } });
  assert.equal(outraConta.get("ofx")?.nivel, "bloqueado");
});

test("atualização lê produtor e empresa, exclui outro cliente, cancelados e previsões", async () => {
  const produtor = { ...empresaBaixada, id: "cpf", status: "baixado", data_baixa: "2026-11-05", produtor_id: "prod-1", natureza: "real" };
  const { sb, consultas } = bancoConciliacao({
    lancamentos: [produtor, { ...produtor, id: "previsao", natureza: "previsao" }, { ...produtor, id: "legado", natureza: null }],
    empresa_lancamentos: [empresaBaixada, { ...empresaBaixada, id: "outro", fazenda_id: "outro-cliente" }, { ...empresaBaixada, id: "cancelado", status: "cancelado" }],
  });
  const titulos = await buscarLancamentosConciliacao(sb, ["faz-1"]);
  assert.deepEqual(titulos.map(t => t.id), ["cpf", "legado", "emp-cnpj"]);
  assert.equal(titulos[0].produtor_id, "prod-1");
  assert.deepEqual(consultas, ["lancamentos", "empresa_lancamentos"]);
});

test("período aceita vencimento ou baixa, sem trazer títulos fora das duas datas", async () => {
  const { sb } = bancoConciliacao({
    empresa_lancamentos: [empresaBaixada, { ...empresaBaixada, id: "a-vencer", status: "pendente", data_pagamento: null, data_vencimento: "2026-11-08" }, { ...empresaBaixada, id: "antigo", data_pagamento: "2026-09-03" }],
    lancamentos: [{ ...empresaBaixada, id: "prod-pago", natureza: "real", status: "baixado", data_baixa: "2026-11-03" }, { ...empresaBaixada, id: "prev", natureza: "previsao", data_baixa: "2026-11-03" }],
  });
  const titulos = await buscarLancamentosConciliacao(sb, ["faz-1"], { de: "2026-11-01", ate: "2026-11-10" });
  assert.deepEqual(titulos.map(t => t.id), ["prod-pago", "emp-cnpj", "a-vencer"]);
});

test("pagamento parcial da empresa mantém status, valor pago e borderô", async () => {
  const { sb } = bancoConciliacao({ empresa_lancamentos: [{ ...empresaBaixada, status: "parcial", valor_pago: "300", lote_id: "bordero" }] });
  const [titulo] = await buscarLancamentosConciliacao(sb, ["faz-1"]);
  assert.equal(titulo.status, "parcial");
  assert.equal(titulo.valor_pago, 300);
  assert.equal(titulo.lote_id, "bordero");
});

test("leitura paginada não perde baixas de empresa depois dos primeiros mil títulos", async () => {
  const { sb } = bancoConciliacao({ empresa_lancamentos: Array.from({ length: 1002 }, (_, i) => ({ ...empresaBaixada, id: `emp-${i}` })) });
  const titulos = await buscarLancamentosConciliacao(sb, ["faz-1"]);
  assert.equal(titulos.length, 1002);
  assert.equal(new Set(titulos.map(t => t.id)).size, 1002);
});

test("sem fazendas não consulta; falha na empresa não retorna uma lista incompleta", async () => {
  const { sb, consultas } = bancoConciliacao({}, "empresa_lancamentos");
  assert.deepEqual(await buscarLancamentosConciliacao(sb, []), []);
  assert.deepEqual(consultas, []);
  await assert.rejects(() => buscarLancamentosConciliacao(sb, ["faz-1"]), /Leitura negada/);
});


test("compensação de fornecedor não é saída bancária para conciliar", async () => {
  const { sb } = bancoConciliacao({ lancamentos: [
    { ...empresaBaixada, id: "compensado", data_baixa: "2026-11-05", status: "baixado", forma_pagamento: "Compensação de adiantamento a fornecedor" },
    { ...empresaBaixada, id: "adiantamento-pago", data_baixa: "2026-11-05", status: "baixado", forma_pagamento: "PIX" },
  ] });
  const titulos = await buscarLancamentosConciliacao(sb, ["faz-1"]);
  assert.deepEqual(titulos.map(t => t.id), ["adiantamento-pago"]);
});
