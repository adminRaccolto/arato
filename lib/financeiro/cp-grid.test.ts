import assert from "node:assert/strict";
import test from "node:test";
import type { PagamentoLote } from "../supabase";
import { filtrarBordero, filtrarTitulo, itensDoBordero, numeroNF, tituloVinculado, vinculosBorderos, type FiltrosCP, type TituloGrid } from "./cp-grid";

const titulo: TituloGrid = { id: "nf1", origem_tabela: "lancamentos", lote_id: null,
  status_normalizado: "em_aberto", data_vencimento: "2026-10-01", descricao: "Insumos",
  pessoa_nome: "Dípagro", empresa_nome: null, nfe_numero: "123" };
const pendente: PagamentoLote = { id: "b1", fazenda_id: "f1", tipo: "pagar", status: "pendente",
  descricao: "Borderô combustível", numero_titulo: "987", data_vencimento: "2026-10-15", valor_total: 100,
  itens: [{ id: "i1", lote_id: "b1", lancamento_id: "nf1", valor_pago: 100 }] };
const pago: PagamentoLote = { ...pendente, id: "b2", status: "pago" };
const filtros = (f: Partial<FiltrosCP> = {}): FiltrosCP => ({ origens: new Set(), status: new Set(), busca: "", de: "", ate: "", hoje: "2026-10-07", ...f });

test("NFs de borderôs pendentes e pagos ficam fora do grid mesmo com lote_id desatualizado", () => {
  for (const b of [pendente, pago]) {
    const vinculos = vinculosBorderos([b]);
    assert.equal(tituloVinculado(titulo, vinculos), true);
    assert.equal(tituloVinculado({ ...titulo, origem_tabela: "empresa_lancamentos" }, vinculos), false);
    assert.equal(itensDoBordero(b, [titulo]).length, 1);
  }
  assert.equal(tituloVinculado({ ...titulo, lote_id: "ainda-não-carregado" }, new Set()), true);
});
test("Em Aberto exclui borderôs pagos; Baixado exclui pendentes; Todos restaura ambos", () => {
  assert.equal(filtrarBordero(pendente, [titulo], filtros({ status: new Set(["em_aberto"]) })), true);
  assert.equal(filtrarBordero(pago, [titulo], filtros({ status: new Set(["em_aberto"]) })), false);
  assert.equal(filtrarBordero(pago, [titulo], filtros({ status: new Set(["baixado"]) })), true);
  assert.equal(filtrarBordero(pendente, [titulo], filtros({ status: new Set(["baixado"]) })), false);
  assert.equal(filtrarBordero(pago, [titulo], filtros()), true);
  assert.equal(filtrarBordero(pendente, [titulo], filtros()), true);
});
test("período usa vencimento do borderô, inclusive quando já foi pago", () => {
  const f = filtros({ de: "2026-10-10", ate: "2026-10-20" });
  assert.equal(filtrarTitulo(titulo, f), false);
  assert.equal(filtrarBordero(pendente, [titulo], f), true);
  assert.equal(filtrarBordero({ ...pago, data_pagamento: "2026-09-01" }, [titulo], f), true);
  assert.equal(filtrarBordero(pendente, [titulo], filtros({ ate: "2026-10-14" })), false);
  assert.equal(filtrarBordero({ ...pendente, data_vencimento: undefined }, [titulo], f), false);
});
test("Vencido respeita vencimento próprio e exclui pagos", () => {
  const f = filtros({ status: new Set(["vencido"]) });
  assert.equal(filtrarTitulo(titulo, f), true);
  assert.equal(filtrarBordero(pendente, [titulo], f), false);
  assert.equal(filtrarBordero({ ...pendente, data_vencimento: "2026-10-01" }, [titulo], f), true);
  assert.equal(filtrarBordero({ ...pago, data_vencimento: "2026-10-01" }, [titulo], f), false);
});
test("busca por fornecedor, NF e título encontra borderô pelos membros; origem PF/PJ não se confunde", () => {
  for (const busca of ["dipagro", "123", "combustivel", "987"]) {
    assert.equal(filtrarBordero(pendente, [titulo], filtros({ busca })), true);
  }
  assert.equal(filtrarBordero(pendente, [titulo], filtros({ busca: "inexistente" })), false);
  assert.equal(filtrarBordero(pendente, [titulo], filtros({ origens: new Set(["empresa_lancamentos"]) })), false);
  assert.equal(filtrarBordero(pendente, [titulo], filtros({ origens: new Set(["lancamentos"]) })), true);
});
test("NF vem da nota fiscal vinculada, do lançamento ou do documento PJ; nunca do número interno PF", () => {
  assert.equal(numeroNF({ nfe_numero: "antigo" }, 12345, "lancamentos"), "12345");
  assert.equal(numeroNF({ nfe_numero: " 888 " }, null, "lancamentos"), "888");
  assert.equal(numeroNF({ numero_documento: "999" }, null, "empresa_lancamentos"), "999");
  assert.equal(numeroNF({ numero_documento: "CONTRATO123" }, null, "lancamentos"), null);
  assert.equal(numeroNF({ nfe_numero: " " }, null, "lancamentos", "777"), "777");
});
