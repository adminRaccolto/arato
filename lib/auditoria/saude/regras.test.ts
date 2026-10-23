import assert from "node:assert/strict";
import test from "node:test";
import { rodarRegras, regraNfSemTitulo, regraNfseSemTitulo, regrasPagamentosApagados, regraEstoqueNegativo, type Base, type NfE, type Tit, type NfS, type Excluido } from "./regras.ts";

const nf = (p: Partial<NfE>): NfE => ({ id: "nf1", fazenda_id: "f1", numero: "2503", emitente_nome: "A B COMERCIO", emitente_cnpj: "48078040000182", valor_total: 4600,
  status: "processada", chave_acesso: null, cfop: "5405", nf_origem_id: null, pessoa_id: "p1", lancamento_id: null, emp_lancamento_id: null, processado_por: "Wanessa",
  data_emissao: "2026-09-08", pedido_compra_id: null, ...p });
const tit = (p: Partial<Tit>): Tit => ({ id: "t1", tabela: "lancamentos", fazenda_id: "f1", tipo: "pagar", descricao: "X", valor: 100, valor_pago: null, status: "em_aberto",
  pessoa_id: null, nf_entrada_id: null, contrato_financeiro_id: null, data_vencimento: "2026-10-01", numero_documento: null, origem: "manual", num_parcela: null,
  moeda: "BRL", cotacao_usd: null, valor_multa: null, valor_juros: null, valor_desconto: null, ...p });
const base = (p: Partial<Base>): Base => ({ contaDaFazenda: () => "c1", nfs: [], cfopsItens: new Map(), nfse: [], titulos: [], excluidos: [], movs: [], espelhoPj: [],
  contagem: { lanc: 0, relLanc: 0, emp: 0, relEmp: 0 }, ...p });

test("NF 2503: processada sem título é achado; com título, devolução ou CFOP de remessa não", () => {
  assert.equal(regraNfSemTitulo(base({ nfs: [nf({})] })).length, 1);
  assert.equal(regraNfSemTitulo(base({ nfs: [nf({})], titulos: [tit({ tabela: "empresa_lancamentos", nf_entrada_id: "nf1" })] })).length, 0);
  assert.equal(regraNfSemTitulo(base({ nfs: [nf({ nf_origem_id: "orig" })] })).length, 0);
  assert.equal(regraNfSemTitulo(base({ nfs: [nf({ cfop: "5905" })], cfopsItens: new Map([["nf1", ["5905"]]]) })).length, 0);
  // título relançado à mão com "NF 2503 — ..." conta como título da nota
  assert.equal(regraNfSemTitulo(base({ nfs: [nf({})], titulos: [tit({ descricao: "NF 2503 — A B COMERCIO", pessoa_id: "p1" })] })).length, 0);
});

const nfs = (p: Partial<NfS>): NfS => ({ id: "s1", fazenda_id: "f1", numero_nf: "88", prestador_nome: "POSTO DE MOLAS BORRACHARIA LTDA", prestador_id: "pm", valor_liquido: 2650,
  valor_servico: 2650, empresa_id: "emp", lancamento_id: null, processado_por: "Wanessa", data_prestacao: "2026-07-31", status: "processada", ...p });

test("NFS-e 88 Posto de Molas: sem CP é achado mesmo havendo NFS-e 88 de outro prestador; guia da Receita vira guia_como_nfse", () => {
  const outroPrestador = tit({ tabela: "empresa_lancamentos", descricao: "NFS-e 88 — IVONETE", numero_documento: "88", pessoa_id: "iv", status: "pago" });
  assert.deepEqual(regraNfseSemTitulo(base({ nfse: [nfs({})], titulos: [outroPrestador] })).map(a => a.regra), ["nfse_sem_titulo"]);
  const certo = tit({ tabela: "empresa_lancamentos", descricao: "NFS-e 88 — POSTO DE MOLAS BORRACHARIA LTDA", numero_documento: "88", pessoa_id: "pm" });
  assert.equal(regraNfseSemTitulo(base({ nfse: [nfs({})], titulos: [certo] })).length, 0);
  assert.equal(regraNfseSemTitulo(base({ nfse: [nfs({ prestador_nome: "RECEITA FEDERAL", numero_nf: "07162619500487197" })] }))[0].regra, "guia_como_nfse");
});

const exc = (antes: Record<string, unknown>, p: Partial<Excluido> = {}): Excluido => ({ audit_id: "a1", quando: "2026-09-23T16:57", quem: null, tabela: "lancamentos",
  antes: { id: "velho", fazenda_id: "f1", tipo: "pagar", status: "baixado", valor: 127.56, valor_pago: 127.56, data_baixa: "2026-09-21", origem_lancamento: "nf_entrada", ...antes }, ...p });

test("NF 12666 RJT: título pago apagado e recriado em aberto é baixa perdida; recriado pago não é achado", () => {
  const n = nf({ id: "rjt", numero: "12666", valor_total: 127.56 });
  const aberto = tit({ id: "novo", nf_entrada_id: "rjt", valor: 127.56, descricao: "NF 12666 — RJT MAQUINAS LTDA" });
  const r = regrasPagamentosApagados(base({ nfs: [n], titulos: [aberto], excluidos: [exc({ nf_entrada_id: "rjt", descricao: "NF 12666 — RJT MAQUINAS LTDA" })] }));
  assert.equal(r[0]?.regra, "baixa_perdida");
  assert.equal(r[0].detalhe.titulo_em_aberto_id, "novo");
  assert.equal(regrasPagamentosApagados(base({ nfs: [n], titulos: [{ ...aberto, status: "baixado" }], excluidos: [exc({ nf_entrada_id: "rjt" })] })).length, 0);
});

test("NF 14673 Luft: pago apagado e NF voltou a pendente é risco de pagar em dobro; NF reprocessada com outro valor e paga não é achado", () => {
  const pend = nf({ id: "luft", numero: "14673", status: "pendente", valor_total: 6000 });
  assert.equal(regrasPagamentosApagados(base({ nfs: [pend], excluidos: [exc({ nf_entrada_id: "luft", valor: 6000, valor_pago: 6000 })] }))[0]?.regra, "nf_pendente_ja_paga");
  const reproc = nf({ id: "l2", numero: "59781", valor_total: 840.53 });
  assert.equal(regrasPagamentosApagados(base({ nfs: [reproc], titulos: [tit({ nf_entrada_id: "l2", valor: 840.53, status: "baixado" })],
    excluidos: [exc({ nf_entrada_id: "l2", valor: 903.8, valor_pago: 903.8 })] })).length, 0);
});

test("liberação de contrato recebida e apagada é achado; parcela de contrato 'baixada' sem data de baixa (cronograma errado) não", () => {
  const lib = exc({ origem_lancamento: "contrato_financeiro", tipo: "receber", contrato_financeiro_id: "cf", valor: 1800000, valor_pago: 1800000, data_baixa: "2026-08-24", descricao: "BB Custeio — Liberação" });
  assert.equal(regrasPagamentosApagados(base({ excluidos: [lib] }))[0]?.regra, "liberacao_excluida");
  const lixo = exc({ origem_lancamento: "contrato_financeiro", contrato_financeiro_id: "cf", valor: 132816932, data_baixa: null });
  assert.equal(regrasPagamentosApagados(base({ excluidos: [lixo] })).length, 0);
});

test("estoque por fazenda dentro do depósito: saída da fazenda sem o produto fica negativa", () => {
  const movs = [{ fazenda_id: "frei", deposito_id: "santa", insumo_id: "brs", tipo: "entrada", quantidade: 125170 }, { fazenda_id: "santa", deposito_id: "santa", insumo_id: "brs", tipo: "saida", quantidade: 74045 }];
  const r = regraEstoqueNegativo(base({ movs }));
  assert.equal(r.length, 1);
  assert.equal(r[0].fazenda_id, "santa");
});

test("rodarRegras junta tudo sem quebrar com base vazia", () => {
  assert.deepEqual(rodarRegras(base({}), () => false), []);
});
