import test from "node:test";
import assert from "node:assert/strict";
import { ehCfopCompra, montarComprasPorProduto, type ItemCompra, type NfCompra } from "./compras-produto.ts";

const nf = (id: string, o: Partial<NfCompra> = {}): NfCompra => ({
  id, fazenda_id: "f1", numero: id, serie: "1", emitente_nome: "AGRO X", data_emissao: "2026-10-01", data_entrada: null,
  status: "processada", tipo_entrada: "insumos", cfop: null, ...o,
});
const item = (nfId: string, o: Partial<ItemCompra> = {}): ItemCompra => ({
  id: `${nfId}-${Math.random()}`, nf_entrada_id: nfId, insumo_id: null, descricao_produto: "Glifosato 20L", unidade: "L",
  quantidade: 10, valor_total: 100, cfop: "5102", tipo_apropiacao: "estoque", ...o,
});
const base = { insumos: new Map(), fazendas: new Map([["f1", "Fazenda A"]]) };

test("CFOP de compra: venda, ST, combustível, cupom e entrega futura física; fora o simples faturamento e as demais", () => {
  for (const c of ["5102", "6102", "5101", "5405", "6403", "5656", "5667", "5929", "5117", "1102", "2102"]) assert.ok(ehCfopCompra(c), c);
  for (const c of ["5922", "6922", "5152", "5906", "5905", "5910", "5949", "5201", "5556", "1202"]) assert.ok(!ehCfopCompra(c), c);
  assert.ok(ehCfopCompra(null));
});

test("só NF processada de compra; remessa, devolução e simples faturamento não entram", () => {
  const nfs = [nf("a"), nf("b", { status: "pendente" }), nf("c", { tipo_entrada: "remessa" }), nf("d", { tipo_entrada: "devolucao_compra" }), nf("e"), nf("t", { status: "transferencia" })];
  const itens = [item("a"), item("b"), item("c"), item("d"), item("e", { cfop: "5922" }), item("t"), item("a", { tipo_apropiacao: "remessa" })];
  const r = montarComprasPorProduto({ ...base, nfs, itens });
  assert.equal(r.length, 1);
  assert.equal(r[0].quantidade, 10);
  assert.equal(r[0].nfs, 1);
});

test("agrupa pelo produto do cadastro; sem cadastro, pela descrição normalizada e unidade", () => {
  const insumos = new Map([["i1", { nome: "GLIFOSATO", unidade: "L", grupo: "Defensivos" }]]);
  const nfs = [nf("a", { data_entrada: "2026-10-05" }), nf("b", { emitente_nome: "AGRO Y", data_emissao: "2026-10-09" })];
  const itens = [
    item("a", { insumo_id: "i1", descricao_produto: "GLIFOSATO NORTOX", quantidade: 20, valor_total: 400 }),
    item("b", { insumo_id: "i1", descricao_produto: "Glifosato Atar", quantidade: 10, valor_total: 300 }),
    item("a", { descricao_produto: "Óleo  diesel S10", unidade: "L", quantidade: 100, valor_total: 600, tipo_apropiacao: "direto" }),
    item("b", { descricao_produto: "OLEO DIESEL S10", unidade: "l", quantidade: 50, valor_total: 310, tipo_apropiacao: "direto" }),
  ];
  const r = montarComprasPorProduto({ ...base, insumos, nfs, itens });
  assert.deepEqual(r.map(p => [p.produto, p.quantidade, p.valorTotal, p.nfs, p.fornecedores]), [
    ["GLIFOSATO", 30, 700, 2, 2],
    ["Óleo  diesel S10", 150, 910, 2, 2],
  ]);
  const gli = r[0];
  assert.equal(gli.doCadastro, true);
  assert.equal(gli.grupo, "Defensivos");
  assert.ok(Math.abs(gli.precoMedio - 700 / 30) < 1e-9);
  assert.equal(gli.ultimaData, "2026-10-09");
  assert.equal(gli.ultimoPreco, 30);
  assert.deepEqual(gli.movimentos.map(m => [m.data, m.fornecedor, m.fazenda]), [["2026-10-05", "AGRO X", "Fazenda A"], ["2026-10-09", "AGRO Y", "Fazenda A"]]);
});

test("filtros de produto, fornecedor, grupo, apropriação e só cadastro", () => {
  const insumos = new Map([["i1", { nome: "UREIA", unidade: "KG", grupo: "Fertilizantes" }]]);
  const nfs = [nf("a"), nf("b", { emitente_nome: "Posto Sol" })];
  const itens = [item("a", { insumo_id: "i1", descricao_produto: "UREIA 45%" }), item("b", { descricao_produto: "Diesel", tipo_apropiacao: "direto" })];
  const p = { ...base, insumos, nfs, itens };
  assert.deepEqual(montarComprasPorProduto({ ...p, filtroProduto: "uréia 45" }).map(x => x.produto), ["UREIA"]);
  assert.deepEqual(montarComprasPorProduto({ ...p, filtroFornecedor: "posto" }).map(x => x.produto), ["Diesel"]);
  assert.deepEqual(montarComprasPorProduto({ ...p, filtroGrupo: "Fertilizantes" }).map(x => x.produto), ["UREIA"]);
  assert.deepEqual(montarComprasPorProduto({ ...p, filtroApropriacao: "direto" }).map(x => x.produto), ["Diesel"]);
  assert.deepEqual(montarComprasPorProduto({ ...p, soCadastro: true }).map(x => x.produto), ["UREIA"]);
});
