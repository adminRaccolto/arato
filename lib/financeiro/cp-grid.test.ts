import assert from "node:assert/strict";
import test from "node:test";
import type { PagamentoLote } from "../supabase";
import { filtrarBordero, filtrarTitulo, itensDoBordero, numeroNF, tituloVinculado, vinculosBorderos, type FiltrosCP, type TituloGrid } from "./cp-grid.ts";

test("filtro de documento encontra o controle automático do borderô", () => {
  const b = { id:"b1",numero_titulo:"BD000123",valor_total:100,status:"pendente",itens:[] } as unknown as PagamentoLote;
  const f: FiltrosCP = {origens:new Set(),status:new Set(),busca:"",numero:"bd000123",de:"",ate:"",hoje:"2026-11-17"};
  assert.equal(filtrarBordero(b,[],f),true);
  assert.equal(filtrarBordero(b,[],{...f,numero:"BD000999"}),false);
});

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
test("pagamento parcial PF/PJ aparece em Baixados e conserva a posição em aberto", () => {
  for (const origem_tabela of ["lancamentos", "empresa_lancamentos"]) {
    const parcial = { ...titulo, origem_tabela, status_normalizado: "parcial", valor_pago: 940.03 };
    for (const status of ["baixado", "em_aberto", "parcial"]) {
      assert.equal(filtrarTitulo(parcial, filtros({ status: new Set([status]) })), true);
    }
    assert.equal(filtrarTitulo(parcial, filtros()), true);
    assert.equal(parcial.status_normalizado, "parcial");
    assert.equal(parcial.valor_pago, 940.03);
    assert.equal(filtrarTitulo({ ...parcial, valor_pago: 0 }, filtros({ status: new Set(["baixado"]) })), false);
    assert.equal(filtrarTitulo({ ...parcial, valor_pago: null }, filtros({ status: new Set(["baixado"]) })), false);
    assert.equal(filtrarTitulo({ ...parcial, status_normalizado: "cancelado" }, filtros({ status: new Set(["baixado"]) })), false);
    assert.equal(filtrarTitulo(parcial, filtros({ status: new Set(["baixado"]), nf: "outra" })), false);
  }
});
test("borderô parcialmente pago aparece em Baixados preservando os filtros", () => {
  const parcial = { ...pendente, valor_total: 1150, valor_pago: 940.03 };
  for (const status of ["baixado", "em_aberto", "parcial"]) {
    assert.equal(filtrarBordero(parcial, [titulo], filtros({ status: new Set([status]) })), true);
  }
  assert.equal(filtrarBordero(parcial, [titulo], filtros({ status: new Set(["baixado"]), de: "2026-10-16" })), false);
  assert.equal(filtrarBordero(parcial, [titulo], filtros({ status: new Set(["baixado"]), busca: "outro" })), false);
  assert.equal(tituloVinculado(titulo, vinculosBorderos([parcial])), true);
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
test("busca só por fornecedor; NF tem filtro próprio; borderô é achado pelos membros; origem PF/PJ não se confunde", () => {
  assert.equal(filtrarBordero(pendente, [titulo], filtros({ busca: "dipagro" })), true);
  assert.equal(filtrarTitulo(titulo, filtros({ busca: "dipagro" })), true);
  for (const busca of ["123", "combustivel", "insumos", "inexistente"]) {
    assert.equal(filtrarBordero(pendente, [titulo], filtros({ busca })), false);
    assert.equal(filtrarTitulo(titulo, filtros({ busca })), false);
  }
  assert.equal(filtrarTitulo(titulo, filtros({ nf: "123" })), true);
  const semCadastro = { ...titulo, pessoa_nome: null, descricao: "NFS-e 286 — RETITURBO COMERCIO" };
  assert.equal(filtrarTitulo(semCadastro, filtros({ busca: "retiturbo" })), true);
  // título PJ: a empresa tomadora não é o fornecedor
  const pj = { ...titulo, origem_tabela: "empresa_lancamentos", pessoa_nome: "A B COMERCIO DE PNEUS", empresa_nome: "MURIANA TRANSPORTES" };
  assert.equal(filtrarTitulo(pj, filtros({ busca: "a b comer" })), true);
  assert.equal(filtrarTitulo(pj, filtros({ busca: "muriana" })), false);
  // cadastro repetido com outro nome: o emitente da NF na descrição também acha o título
  const nfOutroNome = { ...pj, pessoa_nome: "ROSICLER S. B. VENSON", descricao: "NF 23791 — BATERIAS VENSON LTDA" };
  assert.equal(filtrarTitulo(nfOutroNome, filtros({ busca: "baterias venson" })), true);
  assert.equal(filtrarTitulo(nfOutroNome, filtros({ busca: "rosicler" })), true);
  assert.equal(filtrarBordero(pendente, [titulo], filtros({ nf: "123" })), true);
  assert.equal(filtrarBordero(pendente, [titulo], filtros({ nf: "999" })), false);
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

test("borderô pago sem vencimento nem títulos aparece pela data do pagamento", () => {
  const fantasma = { ...pago, id: "b9", data_vencimento: null, data_pagamento: "2026-09-01", itens: [] } as unknown as PagamentoLote;
  const f: FiltrosCP = { origens: new Set(), status: new Set(["baixado"]), busca: "", nf: "", de: "", ate: "2026-12-31", hoje: "2026-11-04" };
  assert.equal(filtrarBordero(fantasma, [], f), true);
  assert.equal(filtrarBordero(fantasma, [], { ...f, ate: "2026-08-31" }), false);
});

test("valor do borderô encontra o total de 300,00, sem confundir com títulos de 100,00 e 200,00", () => {
  for (const tipo of ["pagar", "receber"] as const) {
    const b = { ...pendente, tipo, valor_total: 300, itens: [
      { id: "i1", lote_id: "b1", lancamento_id: "nf1", valor_pago: 100 },
      { id: "i2", lote_id: "b1", lancamento_id: "nf2", valor_pago: 200, origem_tabela: "empresa_lancamentos" as const },
    ] };
    const titulos = [{ ...titulo, valor: 100 }, { ...titulo, id: "nf2", origem_tabela: "empresa_lancamentos", valor: 200 }];
    const antes = structuredClone({ b, titulos });
    assert.equal(filtrarBordero(b, titulos, filtros({ valor: "R$ 300,00" })), true);
    assert.equal(filtrarBordero(b, titulos, filtros({ valor: "100,00" })), false);
    assert.equal(filtrarBordero(b, titulos, filtros({ valor: "200,00" })), false);
    assert.deepEqual({ b, titulos }, antes, "filtrar não altera títulos ou borderô");
  }
});

test("valor agregado aceita centavos, maior, menor e faixa no formato brasileiro", () => {
  const b = { ...pendente, valor_total: 1500.50 };
  for (const valor of ["1.500,50", ">1500", "<1501", "1.400,00-1.600,00", "1500,50 até 1600", ""]) {
    assert.equal(filtrarBordero(b, [titulo], filtros({ valor })), true, valor);
  }
  for (const valor of ["1.500,51", ">1500,50", "<1500,50", "1.400,00-1.500,49"]) {
    assert.equal(filtrarBordero(b, [titulo], filtros({ valor })), false, valor);
  }
});

test("pago e saldo usam o resumo exibido: aberto, parcial e quitado legado", () => {
  const aberto = { ...pendente, valor_total: 300 };
  const parcial = { ...aberto, valor_pago: 120, valor_juros: 15, valor_multa: 5, valor_desconto: 10 };
  const quitado = { ...aberto, status: "pago" as const, valor_pago: null as unknown as number }; // legado gravou null
  assert.equal(filtrarBordero(aberto, [titulo], filtros({ valor: "300", pago: "0", saldo: "300" })), true);
  assert.equal(filtrarBordero(parcial, [titulo], filtros({ valor: "300", pago: "120", saldo: "180" })), true);
  assert.equal(filtrarBordero(parcial, [titulo], filtros({ pago: "130" })), false, "encargos não mudam o valor da coluna Pago");
  assert.equal(filtrarBordero(parcial, [titulo], filtros({ saldo: "300" })), false);
  assert.equal(filtrarBordero(quitado, [titulo], filtros({ pago: "300", saldo: "0" })), true);
  assert.equal(filtrarBordero(quitado, [titulo], filtros({ pago: "0" })), false);
});

test("valor do borderô é combinado com período, status, fornecedor, documento e origem", () => {
  const b = { ...pendente, valor_total: 300 };
  const f = filtros({ valor: "300", saldo: ">200", busca: "dipagro", nf: "123", numero: "987",
    origens: new Set(["lancamentos"]), status: new Set(["em_aberto"]), de: "2026-10-10", ate: "2026-10-20" });
  assert.equal(filtrarBordero(b, [titulo], f), true);
  for (const outro of [{ valor: "100" }, { pago: ">0" }, { saldo: "100" }, { busca: "outro" }, { nf: "999" },
    { numero: "999" }, { origens: new Set(["empresa_lancamentos"]) }, { status: new Set(["baixado"]) }, { ate: "2026-10-14" }]) {
    assert.equal(filtrarBordero(b, [titulo], { ...f, ...outro }), false);
  }
});
