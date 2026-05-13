// ─────────────────────────────────────────────────────────────────────────────
// Seed — Operações Gerenciais (Plano de Contas Gerencial)
//
// Estrutura de classificação gerencial — 5 níveis:
//   1.xx.xx.xx.xxx  RECEITAS
//   2.xx.xx.xx.xxx  DESPESAS
//   3.xx            ENTRADAS ECONÔMICAS
//   4.xx            SAÍDAS ECONÔMICAS
//
// historico_tesouraria_id:
//   1 = PAGAMENTO CONTAS
//   2 = COMPENSAÇÃO CHEQUE PRÓPRIO
//   3 = RECEBIMENTO CONTAS
//   4 = DEPÓSITO BANCÁRIO
//   345 = TRANSF. VALORES
//   386 = IMPLANTAÇÃO DE SALDO D
//   387 = IMPLANTAÇÃO DE SALDO C
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";
import type { OperacaoGerencial } from "./supabase";

type SeedOp = Omit<OperacaoGerencial, "id" | "created_at" | "fazenda_id">;

// ── Builders ──────────────────────────────────────────────────────────────────

function grp(classificacao: string, descricao: string, tipo: "receita" | "despesa"): SeedOp {
  return {
    classificacao, descricao, tipo, inativo: false, informa_complemento: false,
    permite_notas_fiscais: false, permite_cp_cr: false, permite_adiantamentos: false,
    permite_tesouraria: false, permite_baixas: false, permite_custo_produto: false,
    permite_contrato_financeiro: false, permite_estoque: false,
    permite_pedidos_venda: false, permite_manutencao: false,
    marcar_fiscal_padrao: false, permite_energia_eletrica: false,
    operacao_estoque: undefined, tipo_custo_estoque: "nenhum",
    gerar_financeiro: false, gerar_financeiro_gerencial: false,
    valida_propriedade: false, custo_absorcao: false, custo_abc: false,
    atualizar_custo_estoque: false, manutencao_reparos: false, gerar_depreciacao: false,
    impostos: [],
  };
}

function rec(classificacao: string, descricao: string, opts: Partial<SeedOp> = {}): SeedOp {
  return {
    classificacao, descricao, tipo: "receita",
    inativo: false, informa_complemento: false,
    permite_notas_fiscais: false, permite_cp_cr: true,
    permite_adiantamentos: false, permite_tesouraria: false, permite_baixas: true,
    permite_custo_produto: false, permite_contrato_financeiro: false,
    permite_estoque: false, permite_pedidos_venda: false,
    permite_manutencao: false, marcar_fiscal_padrao: false, permite_energia_eletrica: false,
    operacao_estoque: undefined, tipo_custo_estoque: "nenhum",
    gerar_financeiro: true, gerar_financeiro_gerencial: true, valida_propriedade: false,
    custo_absorcao: false, custo_abc: false, atualizar_custo_estoque: false,
    manutencao_reparos: false, gerar_depreciacao: false, impostos: [],
    historico_tesouraria_id: 3, historico_tesouraria_nome: "RECEBIMENTO CONTAS",
    ...opts,
  };
}

function desp(classificacao: string, descricao: string, opts: Partial<SeedOp> = {}): SeedOp {
  return {
    classificacao, descricao, tipo: "despesa",
    inativo: false, informa_complemento: false,
    permite_notas_fiscais: false, permite_cp_cr: true,
    permite_adiantamentos: false, permite_tesouraria: false, permite_baixas: true,
    permite_custo_produto: true, permite_contrato_financeiro: false,
    permite_estoque: false, permite_pedidos_venda: false,
    permite_manutencao: false, marcar_fiscal_padrao: false, permite_energia_eletrica: false,
    operacao_estoque: undefined, tipo_custo_estoque: "nenhum",
    gerar_financeiro: true, gerar_financeiro_gerencial: true, valida_propriedade: false,
    custo_absorcao: true, custo_abc: true, atualizar_custo_estoque: false,
    manutencao_reparos: false, gerar_depreciacao: false, impostos: [],
    historico_tesouraria_id: 1, historico_tesouraria_nome: "PAGAMENTO CONTAS",
    ...opts,
  };
}

// ── Plano completo ────────────────────────────────────────────────────────────

export const OPERACOES_GERENCIAIS_PADRAO: SeedOp[] = [

  // ═══════════════════════════════════════════════════════════
  // 1 — RECEITAS
  // ═══════════════════════════════════════════════════════════
  grp("1",            "RECEITAS",                         "receita"),
  grp("1.01",         "RECEITAS OPERACIONAIS",            "receita"),
  grp("1.01.01",      "RECEITAS DE PRODUÇÃO",             "receita"),

  // 1.01.01.01 — Produção Agrícola
  grp("1.01.01.01",   "PRODUÇÃO AGRÍCOLA",               "receita"),
  rec("1.01.01.01.001", "VENDA DE SOJA", {
    permite_notas_fiscais: true, permite_pedidos_venda: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1", marcar_fiscal_padrao: true,
    impostos: ["funrural", "fethab1", "fethab2", "senar"],
    obs_legal: "ICMS DIFERIDO CONFORME ART. 1º DO ANEXO V DO RICMS/MT",
    natureza_receita: "VENDA DE PRODUÇÃO RURAL - SOJA",
    conta_debito: "1.1.2.1", conta_credito: "4.1.1",
    ref_id: 17,
  }),
  rec("1.01.01.01.002", "VENDA DE MILHO", {
    permite_notas_fiscais: true, permite_pedidos_venda: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1",
    impostos: ["funrural", "fethab1", "fethab2", "senar"],
    obs_legal: "ICMS DIFERIDO CONFORME ART. 1º DO ANEXO V DO RICMS/MT",
    natureza_receita: "VENDA DE PRODUÇÃO RURAL - MILHO",
    conta_debito: "1.1.2.1", conta_credito: "4.1.1",
    ref_id: 19,
  }),
  rec("1.01.01.01.003", "VENDA DE ALGODÃO", {
    permite_notas_fiscais: true, permite_pedidos_venda: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1",
    impostos: ["funrural", "senar"],
    natureza_receita: "VENDA DE PRODUÇÃO RURAL - ALGODÃO",
    conta_debito: "1.1.2.1", conta_credito: "4.1.1",
    ref_id: 698,
  }),
  rec("1.01.01.01.004", "VENDA DE SORGO", {
    permite_notas_fiscais: true, permite_pedidos_venda: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1", impostos: ["funrural", "senar"],
    natureza_receita: "VENDA DE PRODUÇÃO RURAL - SORGO",
    ref_id: 700,
  }),
  rec("1.01.01.01.005", "VENDA DE TRIGO", {
    permite_notas_fiscais: true, permite_pedidos_venda: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1", impostos: ["funrural", "senar"],
    natureza_receita: "VENDA DE PRODUÇÃO RURAL - TRIGO",
  }),
  rec("1.01.01.01.006", "VENDA A FIXAR", {
    permite_notas_fiscais: true, permite_pedidos_venda: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1", impostos: ["funrural", "senar"],
    obs_legal: "VENDA A FIXAR - PREÇO A SER DEFINIDO CONFORME CONTRATO",
    ref_id: 648,
  }),
  rec("1.01.01.01.007", "VENDA P/ BARTER", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1", impostos: ["funrural", "senar"],
    ref_id: 821,
  }),
  rec("1.01.01.01.008", "VENDA DE SOJA PJ", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1", impostos: ["funrural", "senar"],
    natureza_receita: "VENDA DE PRODUÇÃO RURAL - SOJA (PJ)",
    ref_id: 908,
  }),
  rec("1.01.01.01.009", "VENDA DE MILHO PJ", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1", impostos: ["funrural", "senar"],
    natureza_receita: "VENDA DE PRODUÇÃO RURAL - MILHO (PJ)",
    ref_id: 909,
  }),
  rec("1.01.01.01.010", "REMESSA PARA ARMAZENAGEM", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    tipo_lcdpr: "1",
    obs_legal: "REMESSA DE PRODUÇÃO RURAL PARA ARMAZENAGEM - ICMS DIFERIDO",
    ref_id: 701,
  }),
  rec("1.01.01.01.011", "VENDA DE PRODUÇÃO PARA EXPORTAÇÃO", {
    permite_notas_fiscais: true, permite_pedidos_venda: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1",
    obs_legal: "SAÍDA PARA O EXTERIOR - IMUNE AO ICMS E PIS/COFINS",
    ref_id: 922,
  }),
  rec("1.01.01.01.012", "REMESSA POR CONTA E ORDEM", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    obs_legal: "REMESSA POR CONTA E ORDEM DE TERCEIROS",
    ref_id: 921,
  }),
  rec("1.01.01.01.013", "COLHEITA PRÓPRIA - ENTRADA ESTOQUE", {
    permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    atualizar_custo_estoque: true,
    conta_debito: "1.1.3.1", conta_credito: "1.1.4.1",
    ref_id: 38,
  }),

  // 1.01.01.02 — Produção Pecuária
  grp("1.01.01.02",   "PRODUÇÃO PECUÁRIA",               "receita"),
  rec("1.01.01.02.001", "VENDA DE BOVINOS", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1", impostos: ["funrural", "senar"],
    ref_id: 32,
  }),

  // 1.01.01.03 — Armazenagem
  grp("1.01.01.03",   "ARMAZENAGEM",                     "receita"),
  rec("1.01.01.03.001", "SECAGEM E ARMAZENAGEM", {
    permite_cp_cr: true, permite_tesouraria: false,
    tipo_lcdpr: "1", ref_id: 778,
  }),
  rec("1.01.01.03.002", "VENDA DE RESÍDUOS", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", ref_id: 622,
  }),
  rec("1.01.01.03.003", "RETORNO DE REMESSA PARA ARMAZENAGEM", {
    permite_notas_fiscais: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    ref_id: 765,
  }),

  // 1.01.01.05 — Deduções das Receitas
  grp("1.01.01.05",   "DEDUÇÕES DAS RECEITAS",           "despesa"),
  desp("1.01.01.05.001", "DEVOLUÇÃO DE VENDA", {
    tipo: "despesa",
    permite_notas_fiscais: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    tipo_lcdpr: "1", ref_id: 675,
    conta_debito: "4.1.1", conta_credito: "1.1.2.1",
  }),
  desp("1.01.01.05.003", "FETHAB", {
    permite_cp_cr: true, permite_notas_fiscais: false,
    custo_absorcao: false, tipo_lcdpr: "4",
    ref_id: 580,
    conta_debito: "4.2.2", conta_credito: "2.1.3.2",
  }),
  desp("1.01.01.05.004", "IAGRO", {
    permite_cp_cr: true, permite_notas_fiscais: false,
    custo_absorcao: false, tipo_lcdpr: "4",
    ref_id: 578,
    conta_debito: "4.2.2", conta_credito: "2.1.3.2",
  }),
  desp("1.01.01.05.005", "SENAR", {
    permite_cp_cr: true, permite_notas_fiscais: false,
    custo_absorcao: false, tipo_lcdpr: "4",
    ref_id: 809,
    conta_debito: "4.2.1", conta_credito: "2.1.3.1",
  }),
  desp("1.01.01.05.006", "FESA", {
    permite_cp_cr: true, permite_notas_fiscais: false,
    custo_absorcao: false, tipo_lcdpr: "4",
    ref_id: 817,
    conta_debito: "4.2.2", conta_credito: "2.1.3.2",
  }),
  desp("1.01.01.05.007", "GTA", {
    permite_cp_cr: true, permite_notas_fiscais: false,
    custo_absorcao: false, tipo_lcdpr: "4",
    ref_id: 818,
  }),
  desp("1.01.01.05.008", "INPECMT", {
    permite_cp_cr: true, permite_notas_fiscais: false,
    custo_absorcao: false, tipo_lcdpr: "4",
    ref_id: 819,
  }),

  // 1.01.02 — Receitas com Transportes
  grp("1.01.02",      "RECEITAS COM TRANSPORTES",        "receita"),
  grp("1.01.02.01",   "TRANSPORTES",                     "receita"),
  rec("1.01.02.01.001", "PRESTAÇÃO DE SERVIÇO DE FRETE (CT-E)", {
    permite_notas_fiscais: true, tipo_lcdpr: "1",
    ref_id: 914,
  }),
  rec("1.01.02.01.002", "SERVIÇO DE TERRAPLANAGEM", {
    permite_notas_fiscais: true, tipo_lcdpr: "1",
    ref_id: 915,
  }),

  // 1.02 — Receitas Não Operacionais
  grp("1.02",         "RECEITAS NÃO OPERACIONAIS",       "receita"),
  grp("1.02.01",      "OUTRAS RECEITAS",                 "receita"),
  grp("1.02.01.01",   "RECEITAS SECUNDÁRIAS",            "receita"),
  rec("1.02.01.01.001", "ARRENDAMENTO PARA TERCEIROS", {
    permite_cp_cr: true, tipo_lcdpr: "1", ref_id: 776,
  }),
  rec("1.02.01.01.002", "FRETE PARA TERCEIROS", {
    permite_notas_fiscais: true, tipo_lcdpr: "1", ref_id: 47,
  }),
  rec("1.02.01.01.003", "PRESTAÇÃO DE SERVIÇO", {
    permite_notas_fiscais: true, tipo_lcdpr: "1", ref_id: 520,
  }),
  rec("1.02.01.01.004", "ADIANTAMENTO DE CLIENTES", {
    permite_adiantamentos: true, tipo_lcdpr: "5", ref_id: 541,
  }),
  rec("1.02.01.01.005", "CRÉDITO COM FORNECEDOR", {
    permite_notas_fiscais: true, tipo_lcdpr: "5", ref_id: 338,
  }),
  rec("1.02.01.01.006", "OUTRAS RECEITAS", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "5", informa_complemento: true,
    conta_debito: "1.1.2.1", conta_credito: "4.3",
  }),

  // 1.02.01.02 — Venda Imobilizado
  grp("1.02.01.02",   "VENDA IMOBILIZADO",               "receita"),
  rec("1.02.01.02.001", "VENDA DE MÁQUINAS", {
    permite_notas_fiscais: true, tipo_lcdpr: "2", ref_id: 401,
    conta_debito: "1.1.1.2", conta_credito: "4.3",
  }),
  rec("1.02.01.02.002", "VENDA DE VEÍCULOS", {
    permite_notas_fiscais: true, tipo_lcdpr: "2", ref_id: 801,
  }),
  rec("1.02.01.02.003", "VENDA DE IMÓVEIS", {
    permite_cp_cr: true, tipo_lcdpr: "2", ref_id: 441,
  }),

  // 1.02.01.03 — Devoluções (entradas)
  grp("1.02.01.03",   "DEVOLUÇÕES",                      "receita"),
  rec("1.02.01.03.001", "DEVOLUÇÃO DE PEÇAS E INSUMOS", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    ref_id: 465,
  }),
  rec("1.02.01.03.002", "DEVOLUÇÃO DE ITENS DE CONSUMO", {
    permite_notas_fiscais: true, ref_id: 736,
  }),

  // 1.02.01.04 — Remessas e Transferências
  grp("1.02.01.04",   "REMESSAS E TRANSFERÊNCIAS",       "receita"),
  rec("1.02.01.04.001", "REMESSA PARA CONSERTO", {
    permite_notas_fiscais: true, ref_id: 759,
  }),
  rec("1.02.01.04.002", "SAÍDA DE GRÃOS DE TERCEIROS", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    ref_id: 767,
  }),
  rec("1.02.01.04.003", "ENTRADA DE GRÃOS DE TERCEIROS", {
    permite_notas_fiscais: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, ref_id: 766,
  }),
  rec("1.02.01.04.004", "OUTRAS SAÍDAS", {
    permite_notas_fiscais: true, informa_complemento: true, ref_id: 896,
  }),

  // 1.03 — Receitas Financeiras
  grp("1.03",         "RECEITAS FINANCEIRAS",            "receita"),
  grp("1.03.01",      "RECEBIMENTOS",                    "receita"),
  grp("1.03.01.01",   "EMPRÉSTIMOS",                     "receita"),
  rec("1.03.01.01.001", "RECEBIMENTO EGF", {
    permite_cp_cr: true, tipo_lcdpr: "3", ref_id: 396,
  }),
  rec("1.03.01.01.002", "RECEBIMENTO EMPRÉSTIMO", {
    permite_cp_cr: true, tipo_lcdpr: "3", ref_id: 66,
  }),
  grp("1.03.01.02",   "RESSARCIMENTOS",                  "receita"),
  rec("1.03.01.02.001", "CRÉDITO REF. REEMBOLSO DE FORNECEDOR", {
    permite_tesouraria: true, ref_id: 332,
  }),
  rec("1.03.01.02.002", "OUTROS DESCONTOS OBTIDOS", {
    permite_tesouraria: true, ref_id: 61,
  }),
  grp("1.03.01.03",   "RENDIMENTOS",                     "receita"),
  rec("1.03.01.03.001", "RENDIMENTO POUPANÇA", {
    permite_tesouraria: true, gerar_financeiro: false, ref_id: 69,
  }),
  rec("1.03.01.03.002", "RENDIMENTO APLICAÇÃO FINANCEIRA", {
    permite_tesouraria: true, gerar_financeiro: false, ref_id: 73,
  }),
  rec("1.03.01.03.003", "RESGATE DE TÍTULO DE CAPITALIZAÇÃO", {
    permite_cp_cr: true, ref_id: 620,
  }),
  rec("1.03.01.03.004", "OUTROS ACRÉSCIMOS RECEBIDOS", {
    permite_cp_cr: true, informa_complemento: true, ref_id: 254,
  }),
  rec("1.03.01.03.005", "CRÉDITO REF. TRANSF. DE VALORES", {
    permite_tesouraria: true,
    historico_tesouraria_id: 345, historico_tesouraria_nome: "TRANSF. VALORES",
    ref_id: 691,
  }),

  // ═══════════════════════════════════════════════════════════
  // 2 — DESPESAS
  // ═══════════════════════════════════════════════════════════
  grp("2",            "DESPESAS",                        "despesa"),
  grp("2.01",         "DESPESAS OPERACIONAIS",           "despesa"),
  grp("2.01.01",      "DESPESAS DE PRODUÇÃO",            "despesa"),

  // 2.01.01.01 — Insumos
  grp("2.01.01.01",   "INSUMOS",                         "despesa"),
  desp("2.01.01.01.001", "COMPRA DE DEFENSIVOS", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true, atualizar_custo_estoque: true,
    conta_debito: "5", conta_credito: "2.1.1.1",
    ref_id: 720,
  }),
  desp("2.01.01.01.002", "COMPRA DE CORRETIVOS", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true, atualizar_custo_estoque: true,
    ref_id: 722,
  }),
  desp("2.01.01.01.003", "COMPRA DE SEMENTES", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true, atualizar_custo_estoque: true,
    conta_debito: "5", conta_credito: "2.1.1.1",
    ref_id: 721,
  }),
  desp("2.01.01.01.004", "COMPRA DE ADUBOS E FERTILIZANTES", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true, atualizar_custo_estoque: true,
    conta_debito: "5", conta_credito: "2.1.1.1",
    ref_id: 87,
  }),
  desp("2.01.01.01.005", "COMPRA DE DEFENSIVOS - ENT. FUTURA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true,
    ref_id: 750,
  }),
  desp("2.01.01.01.006", "COMPRA DE CORRETIVOS - ENT. FUTURA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true,
    ref_id: 751,
  }),
  desp("2.01.01.01.007", "COMPRA DE SEMENTES - ENT. FUTURA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true,
    ref_id: 753,
  }),
  desp("2.01.01.01.008", "COMPRA DE ADUBOS E FERT. - ENT. FUTURA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true,
    ref_id: 752,
  }),
  desp("2.01.01.01.009", "BONIFICAÇÃO DE COMPRA", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    tipo_lcdpr: "1", ref_id: 723,
  }),
  desp("2.01.01.01.010", "GASTO DE INSUMOS (BAIXA ESTOQUE)", {
    permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "gasto",
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: true, custo_abc: true,
    conta_debito: "5", conta_credito: "1.1.3.4",
    ref_id: 783,
  }),

  // 2.01.01.02 — Combustíveis
  grp("2.01.01.02",   "COMBUSTÍVEIS",                    "despesa"),
  desp("2.01.01.02.001", "COMPRA DE COMBUSTÍVEIS", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true, atualizar_custo_estoque: true,
    conta_debito: "5.5", conta_credito: "2.1.1.1",
    ref_id: 728,
  }),
  desp("2.01.01.02.002", "COMPRA DE ADITIVOS E LUBRIFICANTES", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 729,
  }),
  desp("2.01.01.02.003", "COMPRA DE LENHA PARA SECADOR", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true,
    ref_id: 802,
  }),
  desp("2.01.01.02.099", "GASTO COMBUSTÍVEL - CUSTO FAZENDA", {
    permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "gasto",
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: true, custo_abc: true,
    ref_id: 264,
  }),

  // 2.01.01.03 — Manutenção e Reparos
  grp("2.01.01.03",   "MANUTENÇÃO E REPAROS",            "despesa"),
  desp("2.01.01.03.001", "MANUTENÇÃO DE MAQ. / EQUIP. / IMPLEM.", {
    permite_notas_fiscais: true, permite_manutencao: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true, manutencao_reparos: true,
    conta_debito: "5.5", conta_credito: "2.1.1.2",
    ref_id: 732,
  }),
  desp("2.01.01.03.002", "MANUTENÇÃO DE VEÍCULOS", {
    permite_notas_fiscais: true, permite_manutencao: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true, manutencao_reparos: true,
    ref_id: 823,
  }),
  desp("2.01.01.03.003", "MANUTENÇÃO DE INFRAESTRUTURA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 665,
  }),
  desp("2.01.01.03.004", "COMPRA DE PEÇAS PARA ESTOQUE", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true, atualizar_custo_estoque: true,
    ref_id: 562,
  }),
  desp("2.01.01.03.005", "MATERIAIS E FERRAMENTAS P/ OFICINA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 804,
  }),
  desp("2.01.01.03.006", "GASTO DE PEÇAS (BAIXA ESTOQUE)", {
    permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "gasto",
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: true, custo_abc: true, manutencao_reparos: true,
    ref_id: 260,
  }),

  // 2.01.01.04 — Despesas Agricultura
  grp("2.01.01.04",   "DESPESAS AGRICULTURA",            "despesa"),
  desp("2.01.01.04.001", "ARRENDAMENTO AGRÍCOLA", {
    permite_cp_cr: true, permite_contrato_financeiro: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true, valida_propriedade: true,
    conta_debito: "6.1", conta_credito: "2.1.1.3",
    ref_id: 125,
  }),
  desp("2.01.01.04.002", "ANÁLISE DE SEMENTES", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 117,
  }),
  desp("2.01.01.04.003", "ANÁLISE DE SOLOS", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 119,
  }),
  desp("2.01.01.04.004", "ASSESSORIA AMBIENTAL", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 626,
  }),
  desp("2.01.01.04.005", "ROYALTIES", {
    permite_cp_cr: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 123,
  }),
  desp("2.01.01.04.006", "ENERGIA ELÉTRICA IRRIGAÇÃO", {
    permite_cp_cr: true, permite_energia_eletrica: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 115,
  }),
  desp("2.01.01.04.007", "TAXA DE SECAGEM E ARMAZENAGEM", {
    permite_cp_cr: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 417,
  }),
  desp("2.01.01.04.008", "ASSESSORIA AGRONÔMICA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 870,
  }),
  desp("2.01.01.04.009", "SERVIÇOS TERCEIRIZADOS (LAVOURA)", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 874,
  }),
  desp("2.01.01.04.010", "CORRETAGEM", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 884,
  }),
  desp("2.01.01.04.011", "ENCERRAMENTO DE SAFRA - AJUSTE DE CAIXA", {
    permite_cp_cr: true, informa_complemento: true,
    tipo_lcdpr: "5", custo_absorcao: false,
    ref_id: 900,
  }),
  desp("2.01.01.04.012", "ANÁLISE DE FERTILIZANTES", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 905,
  }),
  desp("2.01.01.04.099", "OUTRAS DESPESAS DE PRODUÇÃO", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "5", custo_absorcao: true, informa_complemento: true,
  }),

  // 2.01.01.05 — Despesas Pecuárias
  grp("2.01.01.05",   "DESPESAS PECUÁRIAS",              "despesa"),
  desp("2.01.01.05.001", "COMPRA DE ANIMAIS", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true,
    ref_id: 670,
  }),
  desp("2.01.01.05.002", "VACINAS E MEDICAMENTOS P/ ANIMAIS", {
    permite_notas_fiscais: true, tipo_lcdpr: "1", custo_absorcao: true, ref_id: 659,
  }),
  desp("2.01.01.05.003", "RAÇÃO E SUPLEMENTAÇÃO P/ ANIMAIS", {
    permite_notas_fiscais: true, tipo_lcdpr: "1", custo_absorcao: true, ref_id: 663,
  }),
  desp("2.01.01.05.004", "ARRENDAMENTO PECUÁRIO", {
    permite_cp_cr: true, tipo_lcdpr: "1", custo_absorcao: true, ref_id: 411,
  }),

  // 2.01.01.06 — Produção de Sementes
  grp("2.01.01.06",   "PRODUÇÃO DE SEMENTES",            "despesa"),
  desp("2.01.01.06.001", "EMBALAGENS", {
    permite_notas_fiscais: true, tipo_lcdpr: "1", custo_absorcao: true, ref_id: 128,
  }),
  desp("2.01.01.06.002", "TAXAS DE SEMENTES", {
    permite_cp_cr: true, tipo_lcdpr: "1", custo_absorcao: true, ref_id: 142,
  }),

  // 2.01.01.07 — Fretes
  grp("2.01.01.07",   "FRETES",                          "despesa"),
  desp("2.01.01.07.001", "FRETES PRODUÇÃO", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    conta_debito: "5.5.4", conta_credito: "2.1.1.2",
    ref_id: 153,
  }),
  desp("2.01.01.07.002", "FRETES INSUMOS", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 768,
  }),
  desp("2.01.01.07.003", "FRETES CORRETIVOS", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 769,
  }),
  desp("2.01.01.07.004", "FRETES SEMENTES", {
    permite_notas_fiscais: true,
    operacao_estoque: "saida", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 770,
  }),
  desp("2.01.01.07.005", "FRETES DIVERSOS", {
    permite_cp_cr: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 771,
  }),

  // 2.01.01.08 — Máquinas Terceirizadas
  grp("2.01.01.08",   "MÁQUINAS TERCEIRIZADAS",          "despesa"),
  desp("2.01.01.08.001", "AVIAÇÃO AGRÍCOLA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    conta_debito: "5.5", conta_credito: "2.1.1.2",
    ref_id: 157,
  }),
  desp("2.01.01.08.002", "COLHEITA TERCEIRIZADA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 686,
  }),
  desp("2.01.01.08.003", "PLANTIO TERCEIRIZADO", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 687,
  }),
  desp("2.01.01.08.004", "LOCAÇÃO DE MAQ. / EQUIP. / IMPLEM.", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
    ref_id: 734,
  }),
  desp("2.01.01.08.005", "PULVERIZAÇÃO TERCEIRIZADA", {
    permite_notas_fiscais: true,
    tipo_lcdpr: "1", custo_absorcao: true, custo_abc: true,
  }),

  // 2.01.01.09 — Adiantamentos
  grp("2.01.01.09",   "ADIANTAMENTOS",                   "despesa"),
  desp("2.01.01.09.001", "ADIANTAMENTO PARA FORNECEDOR", {
    permite_adiantamentos: true,
    gerar_financeiro: true, custo_absorcao: false, ref_id: 328,
    historico_tesouraria_id: 1, historico_tesouraria_nome: "PAGAMENTO CONTAS",
  }),
  desp("2.01.01.09.002", "ADIANTAMENTO PARA FUNCIONÁRIO", {
    permite_adiantamentos: true,
    gerar_financeiro: true, custo_absorcao: false, ref_id: 324,
    historico_tesouraria_id: 1, historico_tesouraria_nome: "PAGAMENTO CONTAS",
  }),

  // 2.01.01.10 — Recursos Humanos - FAZ
  grp("2.01.01.10",   "RECURSOS HUMANOS - FAZ",          "despesa"),
  desp("2.01.01.10.001", "SALÁRIOS - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3",
    custo_absorcao: true, custo_abc: true,
    conta_debito: "5.6", conta_credito: "2.1.1.2",
    // ref_id: (não tinha SALARIOS-FAZ explícito, apenas 13º, rescisão, etc.)
  }),
  desp("2.01.01.10.002", "FÉRIAS - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3",
    custo_absorcao: true, custo_abc: true,
  }),
  desp("2.01.01.10.003", "13º SALÁRIO - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3",
    custo_absorcao: true, custo_abc: true,
    ref_id: 841,
  }),
  desp("2.01.01.10.004", "PRÊMIO FUNCIONÁRIOS - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "5",
    custo_absorcao: true, custo_abc: true,
    ref_id: 844,
  }),
  desp("2.01.01.10.005", "DIARISTAS - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 848,
  }),
  desp("2.01.01.10.006", "COMPLEMENTO SALARIAL - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 852,
  }),
  desp("2.01.01.10.007", "PLANO DE SAÚDE - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 847,
  }),
  desp("2.01.01.10.008", "RESCISÃO - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 842,
  }),
  desp("2.01.01.10.009", "UNIFORMES E EPIs - FAZ", {
    permite_notas_fiscais: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 846,
  }),
  desp("2.01.01.10.010", "MEDICINA E SEG. DO TRABALHO - FAZ", {
    permite_notas_fiscais: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 843,
  }),
  desp("2.01.01.10.011", "CONTRIBUIÇÃO SINDICAL - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 845,
  }),
  desp("2.01.01.10.012", "IRRF - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: true, ref_id: 854,
  }),
  desp("2.01.01.10.013", "FGTS - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 849,
  }),
  desp("2.01.01.10.014", "INSS EMPREGADOR - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 850,
  }),
  desp("2.01.01.10.015", "SAT/RAT - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true,
  }),
  desp("2.01.01.10.016", "SISTEMA S - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true,
  }),
  desp("2.01.01.10.017", "PROVISÃO 13º SALÁRIO - FAZ", {
    permite_cp_cr: true,
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: true, custo_abc: true, inativo: true,
  }),
  desp("2.01.01.10.018", "PROVISÃO FÉRIAS - FAZ", {
    permite_cp_cr: true,
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: true, custo_abc: true, inativo: true,
  }),
  desp("2.01.01.10.019", "FUNRURAL EMPREGADOR - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "4",
    custo_absorcao: true, custo_abc: true,
    conta_debito: "4.2.1", conta_credito: "2.1.3.1",
  }),
  desp("2.01.01.10.020", "SEGURO DE VIDA - FAZ", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: true, ref_id: 859,
    historico_tesouraria_id: undefined, historico_tesouraria_nome: undefined,
  }),

  // 2.02 — Despesas Não Operacionais / Administrativas
  grp("2.02",         "DESPESAS NÃO OPERACIONAIS",       "despesa"),
  grp("2.02.01",      "DESPESAS ADMINISTRATIVAS",        "despesa"),

  // 2.02.01.01 — Outras Despesas
  grp("2.02.01.01",   "OUTRAS DESPESAS",                 "despesa"),
  desp("2.02.01.01.001", "ÁGUA", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 433,
  }),
  desp("2.02.01.01.002", "ENERGIA ELÉTRICA", {
    permite_cp_cr: true, permite_energia_eletrica: true,
    tipo_lcdpr: "1", custo_absorcao: false,
    conta_debito: "6.4", conta_credito: "2.1.1.1",
    ref_id: 103,
  }),
  desp("2.02.01.01.003", "TELEFONE", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 99,
  }),
  desp("2.02.01.01.004", "CORREIOS", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 640,
  }),
  desp("2.02.01.01.005", "CARTÓRIOS", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 642,
  }),
  desp("2.02.01.01.006", "ALUGUÉIS E CONDOMÍNIOS", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 755,
  }),
  desp("2.02.01.01.007", "ASSINATURAS E MENSALIDADES", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 618,
  }),
  desp("2.02.01.01.008", "SEGURANÇA E VIGILÂNCIA", {
    permite_notas_fiscais: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 756,
  }),
  desp("2.02.01.01.009", "MATERIAL EXPEDIENTE", {
    permite_notas_fiscais: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 96,
  }),
  desp("2.02.01.01.010", "PROVEDOR DE INTERNET", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 920,
  }),
  desp("2.02.01.01.011", "DOAÇÃO", {
    permite_tesouraria: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 863,
  }),
  desp("2.02.01.01.012", "DÉBITO NO CAIXA REF. TROCO", {
    permite_tesouraria: true, custo_absorcao: false, ref_id: 508,
  }),
  desp("2.02.01.01.013", "OUTROS DESCONTOS CONCEDIDOS", {
    permite_notas_fiscais: true, custo_absorcao: false, ref_id: 364,
  }),

  // 2.02.01.02 — Serviços de Terceiros
  grp("2.02.01.02",   "SERVIÇOS DE TERCEIROS",           "despesa"),
  desp("2.02.01.02.001", "ASSESSORIA JURÍDICA", {
    permite_notas_fiscais: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 405,
  }),
  desp("2.02.01.02.002", "ASSESSORIA CONTÁBIL", {
    permite_notas_fiscais: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 159,
  }),
  desp("2.02.01.02.003", "ASSESSORIA SISTEMA", {
    permite_notas_fiscais: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 162,
  }),
  desp("2.02.01.02.004", "ASSISTÊNCIA TÉCNICA", {
    permite_notas_fiscais: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 407,
  }),
  desp("2.02.01.02.005", "CONSULTORIA FINANCEIRA", {
    permite_notas_fiscais: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 872,
  }),
  desp("2.02.01.02.006", "CONSULTORIAS", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 878,
  }),

  // 2.02.01.03 — Recursos Humanos ADM
  grp("2.02.01.03",   "RECURSOS HUMANOS - ADM",          "despesa"),
  desp("2.02.01.03.001", "SALÁRIOS - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false,
    conta_debito: "6.4.1", conta_credito: "2.1.1.2",
    ref_id: 129,
  }),
  desp("2.02.01.03.002", "FÉRIAS - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 131,
  }),
  desp("2.02.01.03.003", "13º SALÁRIO - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 134,
  }),
  desp("2.02.01.03.004", "PRÊMIO FUNCIONÁRIOS - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 409,
  }),
  desp("2.02.01.03.005", "DIARISTAS - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 431,
  }),
  desp("2.02.01.03.006", "COMPLEMENTO SALARIAL - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 382,
  }),
  desp("2.02.01.03.007", "PLANO DE SAÚDE - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 429,
  }),
  desp("2.02.01.03.008", "RESCISÃO - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 136,
  }),
  desp("2.02.01.03.009", "UNIFORMES E EPIs - ADM", {
    permite_notas_fiscais: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 427,
  }),
  desp("2.02.01.03.010", "MEDICINA E SEG. DO TRABALHO - ADM", {
    permite_notas_fiscais: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 141,
  }),
  desp("2.02.01.03.011", "CONTRIBUIÇÃO SINDICAL - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 421,
  }),
  desp("2.02.01.03.012", "IRRF - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 680,
  }),
  desp("2.02.01.03.013", "FGTS - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 449,
  }),
  desp("2.02.01.03.014", "INSS EMPREGADOR - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 451,
  }),
  desp("2.02.01.03.015", "SAT/RAT - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false,
  }),
  desp("2.02.01.03.016", "SISTEMA S - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false,
  }),
  desp("2.02.01.03.017", "PRÓ-LABORE", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 456,
  }),
  desp("2.02.01.03.018", "PROVISÃO 13º SALÁRIO - ADM", {
    permite_cp_cr: true, gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: false, inativo: true,
  }),
  desp("2.02.01.03.019", "PROVISÃO FÉRIAS - ADM", {
    permite_cp_cr: true, gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: false, inativo: true,
  }),
  desp("2.02.01.03.020", "FUNRURAL EMPREGADOR - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false,
  }),
  desp("2.02.01.03.021", "SEGURO DE VIDA - ADM", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 860,
  }),

  // 2.02.01.04 — Impostos e Taxas
  grp("2.02.01.04",   "IMPOSTOS E TAXAS",                "despesa"),
  desp("2.02.01.04.001", "ITR / CCIR", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false,
    conta_debito: "6.6.1", conta_credito: "2.1.3.4",
    ref_id: 350,
  }),
  desp("2.02.01.04.002", "IPTU", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 584,
  }),
  desp("2.02.01.04.003", "PIS", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 586,
  }),
  desp("2.02.01.04.004", "COFINS", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 573,
  }),
  desp("2.02.01.04.005", "CSLL", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 576,
  }),
  desp("2.02.01.04.006", "DIFAL", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 820,
  }),
  desp("2.02.01.04.007", "FUNRURAL (GUIA)", {
    permite_cp_cr: true, tipo_lcdpr: "4",
    custo_absorcao: false,
    conta_debito: "4.2.1", conta_credito: "2.1.3.1",
    ref_id: 121,
  }),
  desp("2.02.01.04.008", "TAXAS DIVERSAS", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 816,
  }),
  desp("2.02.01.04.009", "TARIFA BANCÁRIA", {
    permite_tesouraria: true,
    gerar_financeiro: true, custo_absorcao: false,
    conta_debito: "6.5.2", conta_credito: "1.1.1.2",
    ref_id: 876,
  }),
  desp("2.02.01.04.010", "ICMS", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 882,
  }),
  desp("2.02.01.04.011", "ALVARÁ", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 861,
  }),
  desp("2.02.01.04.012", "ITCD", {
    permite_cp_cr: true, tipo_lcdpr: "4", custo_absorcao: false, ref_id: 929,
  }),

  // 2.02.01.05 — Frota de Veículos
  grp("2.02.01.05",   "FROTA DE VEÍCULOS",               "despesa"),
  desp("2.02.01.05.001", "ABASTECIMENTO POSTO", {
    permite_notas_fiscais: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 730,
  }),
  desp("2.02.01.05.002", "IPVA / SEGURO OBRIG. / TAXAS", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 403,
  }),
  desp("2.02.01.05.003", "DESLOCAMENTO / VIAGEM", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 105,
  }),
  desp("2.02.01.05.004", "PEDÁGIO", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 868,
  }),
  desp("2.02.01.05.005", "MULTAS DE TRÂNSITO", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 865,
  }),

  // 2.03 — Despesas Financeiras
  grp("2.03",         "DESPESAS FINANCEIRAS",            "despesa"),
  grp("2.03.01",      "DESPESAS BANCÁRIAS",              "despesa"),
  grp("2.03.01.01",   "MOVIMENTOS",                      "despesa"),
  desp("2.03.01.01.001", "IOF", {
    permite_tesouraria: true, custo_absorcao: false, ref_id: 757,
  }),
  desp("2.03.01.01.002", "TARIFAS BANCÁRIAS", {
    permite_tesouraria: true,
    gerar_financeiro: true, custo_absorcao: false,
    conta_debito: "6.5.2", conta_credito: "1.1.1.2",
    ref_id: 147,
  }),
  desp("2.03.01.01.003", "TARIFA DE ESTUDO", {
    permite_tesouraria: true, custo_absorcao: false, ref_id: 504,
  }),
  desp("2.03.01.01.004", "COMPENSAÇÃO DE CHEQUE", {
    permite_tesouraria: true,
    historico_tesouraria_id: 2, historico_tesouraria_nome: "COMPENSAÇÃO CHEQUE PRÓPRIO",
    custo_absorcao: false, ref_id: 524,
  }),
  desp("2.03.01.01.005", "DÉBITO REF. TRANSF. DE VALORES", {
    permite_tesouraria: true,
    historico_tesouraria_id: 345, historico_tesouraria_nome: "TRANSF. VALORES",
    custo_absorcao: false, ref_id: 607,
  }),
  desp("2.03.01.01.006", "DÉBITO REF. APLICAÇÃO", {
    permite_tesouraria: true,
    historico_tesouraria_id: 345, historico_tesouraria_nome: "TRANSF. VALORES",
    custo_absorcao: false, ref_id: 791,
  }),

  // 2.03.01.02 — Financiamentos e Empréstimos
  grp("2.03.01.02",   "FINANCIAMENTOS E EMPRÉSTIMOS",    "despesa"),
  desp("2.03.01.02.001", "PAGAMENTO EGF", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 615,
    conta_debito: "2.1.4", conta_credito: "1.1.1.2", tipo_formula: "baixas",
  }),
  desp("2.03.01.02.002", "PAGAMENTO CUSTEIOS", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 250,
    conta_debito: "2.1.4", conta_credito: "1.1.1.2", tipo_formula: "baixas",
  }),
  desp("2.03.01.02.003", "PAGAMENTO CPR", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 613,
    tipo_formula: "baixas",
  }),
  desp("2.03.01.02.004", "PAGAMENTO FINAME", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 460,
    tipo_formula: "baixas",
  }),
  desp("2.03.01.02.005", "PAGAMENTO EMPRÉSTIMOS", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 252,
    tipo_formula: "baixas",
  }),
  desp("2.03.01.02.006", "TÍTULOS DE CAPITALIZAÇÃO", {
    permite_cp_cr: true, custo_absorcao: false, ref_id: 632,
  }),

  // 2.03.01.03 — Juros e Encargos
  grp("2.03.01.03",   "JUROS E ENCARGOS",                "despesa"),
  desp("2.03.01.03.001", "JUROS EGF", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 548,
    conta_debito: "6.5.1", conta_credito: "2.1.4",
  }),
  desp("2.03.01.03.002", "JUROS CUSTEIOS", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 156,
    conta_debito: "6.5.1", conta_credito: "2.1.4",
  }),
  desp("2.03.01.03.003", "JUROS CPR", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 546,
  }),
  desp("2.03.01.03.004", "JUROS FINAME", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 676,
  }),
  desp("2.03.01.03.005", "JUROS EMPRÉSTIMO", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 256,
  }),
  desp("2.03.01.03.006", "OUTROS ACRÉSCIMOS PAGOS", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false,
    informa_complemento: true, ref_id: 166,
  }),

  // 2.03.01.05 — Despesas Particulares
  grp("2.03.01.05",   "DESPESAS PARTICULARES",           "despesa"),
  desp("2.03.01.05.001", "DESPESAS PARTICULARES", {
    permite_cp_cr: true, tipo_lcdpr: "5",
    custo_absorcao: false, informa_complemento: true,
    ref_id: 898,
  }),

  // 2.03.02 — Despesas Patrimoniais
  grp("2.03.02",      "DESPESAS PATRIMONIAIS",           "despesa"),
  grp("2.03.02.01",   "INVESTIMENTOS",                   "despesa"),
  desp("2.03.02.01.001", "COMPRA DE IMÓVEIS", {
    permite_cp_cr: true, tipo_lcdpr: "2", custo_absorcao: false, ref_id: 630,
    conta_debito: "6.3.2", conta_credito: "2.1.1.2",
  }),
  desp("2.03.02.01.002", "CONSTRUÇÃO E REFORMA", {
    permite_notas_fiscais: true, tipo_lcdpr: "2", custo_absorcao: false, ref_id: 445,
  }),
  desp("2.03.02.01.003", "AQUISIÇÃO DE MAQ. / EQUIP. / IMPLEM.", {
    permite_notas_fiscais: true, tipo_lcdpr: "2", custo_absorcao: false, ref_id: 246,
    conta_debito: "6.3.1", conta_credito: "2.1.1.1", informa_complemento: true,
  }),
  desp("2.03.02.01.004", "AQUISIÇÃO DE VEÍCULOS", {
    permite_notas_fiscais: true, tipo_lcdpr: "2", custo_absorcao: false, ref_id: 248,
  }),
  desp("2.03.02.01.005", "AQUISIÇÃO DE MÓVEIS E UTENSÍLIOS", {
    permite_notas_fiscais: true, tipo_lcdpr: "2", custo_absorcao: false, ref_id: 735,
  }),
  desp("2.03.02.01.006", "CONSÓRCIOS NÃO CONTEMPLADOS", {
    permite_cp_cr: true, custo_absorcao: false, ref_id: 473,
  }),
  desp("2.03.02.01.007", "CONSÓRCIOS CONTEMPLADOS", {
    permite_cp_cr: true, custo_absorcao: false, ref_id: 866,
  }),
  desp("2.03.02.01.008", "TARIFAS CONSÓRCIOS", {
    permite_cp_cr: true, custo_absorcao: false, ref_id: 885,
  }),
  desp("2.03.02.01.009", "REFLORESTAMENTO", {
    permite_notas_fiscais: true, tipo_lcdpr: "2", custo_absorcao: false, ref_id: 793,
  }),

  // 2.03.02.02 — Depreciações e Perdas
  grp("2.03.02.02",   "DEPRECIAÇÕES E PERDAS",           "despesa"),
  desp("2.03.02.02.001", "DEPRECIAÇÃO BENFEITORIAS", {
    permite_cp_cr: false, permite_tesouraria: false,
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: false, gerar_depreciacao: true, inativo: true,
    conta_debito: "6.2.1", conta_credito: "1.2.2.1",
    ref_id: 342,
  }),
  desp("2.03.02.02.002", "DEPRECIAÇÃO MÁQUINAS", {
    permite_cp_cr: false, permite_tesouraria: false,
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: false, gerar_depreciacao: true, inativo: true,
    conta_debito: "6.2.1", conta_credito: "1.2.2.1",
    ref_id: 294,
  }),
  desp("2.03.02.02.003", "SAÍDA REF. AJUSTE DE ESTOQUE", {
    permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: false, ref_id: 435,
  }),

  // 2.03.02.03 — Seguros
  grp("2.03.02.03",   "SEGUROS",                         "despesa"),
  desp("2.03.02.03.001", "SEGUROS MÁQUINAS", {
    permite_cp_cr: true, tipo_lcdpr: "1",
    custo_absorcao: true, conta_debito: "6.7.1", conta_credito: "2.1.1.1",
    ref_id: 380,
  }),
  desp("2.03.02.03.002", "SEGUROS BENFEITORIAS", {
    permite_cp_cr: true, tipo_lcdpr: "1", custo_absorcao: true, ref_id: 378,
  }),
  desp("2.03.02.03.003", "SEGUROS VEÍCULOS", {
    permite_cp_cr: true, tipo_lcdpr: "5", custo_absorcao: false, ref_id: 692,
  }),
  desp("2.03.02.03.004", "SEGURO AGRÍCOLA (LAVOURA)", {
    permite_cp_cr: true, tipo_lcdpr: "1", custo_absorcao: true,
    conta_debito: "6.7.1", conta_credito: "2.1.1.1",
  }),

  // 2.03.02.04 — Juros sobre Patrimônio
  grp("2.03.02.04",   "JUROS SOBRE PATRIMÔNIO",          "despesa"),
  desp("2.03.02.04.001", "JUROS SOBRE BENFEITORIAS", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 356,
  }),
  desp("2.03.02.04.002", "JUROS SOBRE MÁQUINAS", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 358,
  }),
  desp("2.03.02.04.003", "JUROS SOBRE PROPRIEDADE", {
    permite_cp_cr: true, tipo_lcdpr: "3", custo_absorcao: false, ref_id: 360,
  }),

  // ═══════════════════════════════════════════════════════════
  // 3 — ENTRADAS ECONÔMICAS
  // ═══════════════════════════════════════════════════════════
  grp("3",     "ENTRADAS ECONÔMICAS",   "receita"),
  rec("3.01",  "RECEBIMENTO", {
    permite_baixas: true,
    tipo_formula: "baixas",
    historico_tesouraria_id: 3, historico_tesouraria_nome: "RECEBIMENTO CONTAS",
    gerar_financeiro: false, ref_id: 558,
  }),
  rec("3.02",  "ENTRADA REF. TAXA ARMAZÉM", {
    permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, ref_id: 781,
  }),
  rec("3.03",  "ENTRADA DE GRÃOS DE TERCEIROS", {
    permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, ref_id: 766,
  }),
  rec("3.04",  "RETORNO DE REMESSA P/ ARMAZENAGEM", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, ref_id: 765,
  }),
  rec("3.05",  "ENTRADA REF. TRANSF. DE DEPÓSITO", {
    permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, ref_id: 388,
  }),
  rec("3.06",  "IMPLANTAÇÃO DE SALDO CRÉDITO", {
    permite_tesouraria: true,
    historico_tesouraria_id: 387, historico_tesouraria_nome: "IMPLANTAÇÃO DE SALDO C",
    gerar_financeiro: false, ref_id: 346,
  }),
  rec("3.07",  "CRÉDITO REF. RESGATE DE APLICAÇÃO", {
    permite_tesouraria: true,
    historico_tesouraria_id: 345, historico_tesouraria_nome: "TRANSF. VALORES",
    gerar_financeiro: false, ref_id: 790,
  }),
  rec("3.08",  "RECEBIMENTO DE TERCEIROS", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, ref_id: 40,
  }),
  rec("3.09",  "SIMPLES REMESSA DE COMPRA", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, ref_id: 754,
  }),
  rec("3.10",  "TRANSFERÊNCIA CAIXA P/ ESTOQUE", {
    permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, ref_id: 384,
  }),

  // ═══════════════════════════════════════════════════════════
  // 4 — SAÍDAS ECONÔMICAS
  // ═══════════════════════════════════════════════════════════
  grp("4",     "SAÍDAS ECONÔMICAS",     "despesa"),
  desp("4.01", "PAGAMENTO", {
    permite_baixas: true,
    tipo_formula: "baixas",
    historico_tesouraria_id: 1, historico_tesouraria_nome: "PAGAMENTO CONTAS",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 560,
  }),
  desp("4.02", "SAÍDA REF. TAXA ARMAZÉM", {
    permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 780,
  }),
  desp("4.03", "SAÍDA DE GRÃOS DE TERCEIROS", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 763,
  }),
  desp("4.04", "REMESSA PARA ARMAZENAGEM (SAÍDA)", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 701,
  }),
  desp("4.05", "SAÍDA REF. TRANSF. DE DEPÓSITO", {
    permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 275,
  }),
  desp("4.06", "IMPLANTAÇÃO DE SALDO DÉBITO", {
    permite_tesouraria: true,
    historico_tesouraria_id: 386, historico_tesouraria_nome: "IMPLANTAÇÃO DE SALDO D",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 689,
  }),
  desp("4.07", "DÉBITO REF. APLICAÇÃO", {
    permite_tesouraria: true,
    historico_tesouraria_id: 345, historico_tesouraria_nome: "TRANSF. VALORES",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 791,
  }),
  desp("4.08", "SAQUES", {
    permite_tesouraria: true,
    historico_tesouraria_id: 1, historico_tesouraria_nome: "PAGAMENTO CONTAS",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 892,
  }),
  desp("4.09", "SAÍDA DO BANCO PARA DEPÓSITO EM CONTA", {
    permite_tesouraria: true,
    historico_tesouraria_id: 1, historico_tesouraria_nome: "PAGAMENTO CONTAS",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 498,
  }),
  desp("4.10", "SAÍDA DO BANCO PARA O CAIXA", {
    permite_tesouraria: true,
    historico_tesouraria_id: 1, historico_tesouraria_nome: "PAGAMENTO CONTAS",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 500,
  }),
  desp("4.11", "DIFERENÇA DE CLASSIFICAÇÃO NO ROMANEIO", {
    permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    custo_absorcao: false, gerar_financeiro: false, ref_id: 565,
  }),
  desp("4.12", "DISTRIBUIÇÃO DE LUCROS", {
    permite_cp_cr: true,
    custo_absorcao: false,
    historico_tesouraria_id: undefined, historico_tesouraria_nome: undefined,
    ref_id: 924,
  }),
];

// ── Seeder principal ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedOperacoesGerenciais(fazenda_id: string, client?: any): Promise<{ inseridos: number }> {
  const db = client ?? supabase;

  const { error: delErr } = await db
    .from("operacoes_gerenciais")
    .delete()
    .eq("fazenda_id", fazenda_id);
  if (delErr) throw new Error(`Erro ao limpar: ${delErr.message}${delErr.details ? " — " + delErr.details : ""}`);

  const rows = OPERACOES_GERENCIAIS_PADRAO.map((op: SeedOp) => ({ ...op, fazenda_id }));

  for (let i = 0; i < rows.length; i += 30) {
    const lote = rows.slice(i, i + 30);
    const { error } = await db.from("operacoes_gerenciais").insert(lote);
    if (error) throw new Error(`Erro ao inserir lote ${i}–${i + lote.length}: ${error.message}${error.details ? " — " + error.details : ""}`);
  }

  return { inseridos: rows.length };
}

// ── Mapeamento classificação → categoria DRE ─────────────────────────────────
// Usado pelo DRE para agrupar lançamentos por código gerencial
export const DRE_GRUPOS: Record<string, { label: string; grupo: string; ordem: number }> = {
  "1.01.01.01": { label: "Venda Produção Agrícola",    grupo: "receita_bruta",         ordem: 1 },
  "1.01.01.02": { label: "Venda Produção Pecuária",    grupo: "receita_bruta",         ordem: 2 },
  "1.01.01.03": { label: "Armazenagem",                grupo: "receita_bruta",         ordem: 3 },
  "1.01.02":    { label: "Receitas Transportes",       grupo: "receita_bruta",         ordem: 4 },
  "1.02.01.01": { label: "Outras Receitas",            grupo: "receita_nao_op",        ordem: 5 },
  "1.02.01.02": { label: "Venda Imobilizado",          grupo: "receita_nao_op",        ordem: 6 },
  "1.03":       { label: "Receitas Financeiras",       grupo: "receita_financeira",    ordem: 7 },
  "1.01.01.05": { label: "Deduções Receita",           grupo: "deducoes",              ordem: 10 },
  "2.01.01.01": { label: "Insumos",                    grupo: "cpv_insumos",           ordem: 20 },
  "2.01.01.02": { label: "Combustíveis",               grupo: "cpv_combustivel",       ordem: 21 },
  "2.01.01.03": { label: "Manutenção e Reparos",       grupo: "cpv_manutencao",        ordem: 22 },
  "2.01.01.04": { label: "Despesas Agricultura",       grupo: "cpv_agricultura",       ordem: 23 },
  "2.01.01.05": { label: "Despesas Pecuárias",         grupo: "cpv_pecuaria",          ordem: 24 },
  "2.01.01.07": { label: "Fretes",                     grupo: "cpv_fretes",            ordem: 25 },
  "2.01.01.08": { label: "Máq. Terceirizadas",         grupo: "cpv_mecanizacao",       ordem: 26 },
  "2.01.01.09": { label: "Adiantamentos",              grupo: "cpv_outros",            ordem: 27 },
  "2.01.01.10": { label: "RH Fazenda",                 grupo: "cpv_rh_faz",            ordem: 28 },
  "2.02.01.01": { label: "Despesas Adm.",              grupo: "desp_adm",              ordem: 40 },
  "2.02.01.02": { label: "Serviços Terceiros",         grupo: "desp_adm",              ordem: 41 },
  "2.02.01.03": { label: "RH Administrativo",          grupo: "desp_rh_adm",           ordem: 42 },
  "2.02.01.04": { label: "Impostos e Taxas",           grupo: "desp_impostos",         ordem: 43 },
  "2.02.01.05": { label: "Frota de Veículos",          grupo: "desp_frota",            ordem: 44 },
  "2.03.01.02": { label: "Financiamentos / Custeio",   grupo: "juros_custeio",         ordem: 50 },
  "2.03.01.03": { label: "Juros e Encargos",           grupo: "desp_financeira",       ordem: 51 },
  "2.03.02.01": { label: "Investimentos",              grupo: "patrimonial",           ordem: 60 },
  "2.03.02.02": { label: "Depreciações e Perdas",      grupo: "patrimonial",           ordem: 61 },
  "2.03.02.03": { label: "Seguros",                    grupo: "desp_adm",              ordem: 45 },
  // ── Classificações específicas com grupo próprio no DRE (mais específico que a entrada pai) ──
  "2.01.01.04.001": { label: "Arrendamento Agrícola",   grupo: "arrendamento",          ordem: 35 },
  "2.01.01.05.004": { label: "Arrendamento Pecuário",   grupo: "arrendamento",          ordem: 36 },
  "2.03.02.03.004": { label: "Seguro Agrícola (Lavoura)", grupo: "seguro_lavoura",      ordem: 46 },
  "2.02.01.02.004": { label: "Assistência Técnica",     grupo: "assistencia_tecnica",   ordem: 47 },
};

// Retorna o grupo DRE de uma classificação (match por prefixo)
export function getDreGrupo(classificacao: string): string {
  // Tentar do mais específico ao mais geral
  const partes = classificacao.split(".");
  for (let n = partes.length; n >= 1; n--) {
    const prefix = partes.slice(0, n).join(".");
    if (DRE_GRUPOS[prefix]) return DRE_GRUPOS[prefix].grupo;
  }
  return "outros";
}

// ── CFOP Seed ────────────────────────────────────────────────────────────────
// 352 registros de vínculos CFOP x Operação Gerencial
// Chave: op_ref_id == operacoes_gerenciais.ref_id
type CfopRecord = {
  cfop: string;
  descricao_cfop: string;
  operacao_nf: string;
  tipo_pessoa: string;
  cst_pis: string | null;
  cst_cofins: string | null;
  ncm: string | null;
  fins_exportacao: boolean;
  compoe_faturamento: boolean;
};

const CFOP_SEED: Record<number, CfopRecord[]> = {
  17: [
    { cfop: "5132", descricao_cfop: "FIXAÇÃO DE PREÇO DE PRODUÇÃO", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "COMPLEMENTO DE VENDA DE GRÃOS", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6118", descricao_cfop: "VENDA DE PRODUÇÃO ENTREGUE POR CONTA E ORDEM DO ADQUIRENTE", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5118", descricao_cfop: "VENDA DE PRODUÇÃO ENTREGUE POR CONTA E ORDEM DO ADQUIRENTE", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "7101", descricao_cfop: "VENDA DE PRODUÇÃO DO ESTABELECIMENTO EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "6501", descricao_cfop: "REMESSA DE PRODUÇÃO COM FINS ESPECIFICO DE EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "5501", descricao_cfop: "REMESSA DE PRODUÇÃO COM FINS ESPECIFICO DE EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "5105", descricao_cfop: "VENDA DE PRODUÇÃO DO ESTAB. QUE NAO DEVA POR ELE TRANSITAR", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  19: [
    { cfop: "5901", descricao_cfop: "REMESSA PARA INDUSTRIALIZAçãO POR ENCOMENDA", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5132", descricao_cfop: "FIXAÇÃO DE PREÇO DE PRODUÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "COMPLEMENTO DE VENDA DE GRÃOS", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUÇÃO NO MERC. INTERNO P/ EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6118", descricao_cfop: "VENDA DE PRODUÇÃO ENTREGUE POR CONTA E ORDEM DO ADQUIRENTE", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5118", descricao_cfop: "VENDA DE PRODUÇÃO ENTREGUE POR CONTA E ORDEM DO ADQUIRENTE", operacao_nf: "Entrega Futura por Conta e Ordem", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "7101", descricao_cfop: "VENDA DE PRODUÇÃO DO ESTABELECIMENTO EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "5105", descricao_cfop: "VENDA DE PRODUÇÃO DO ESTAB. QUE NAO DEVA POR ELE TRANSITAR", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5501", descricao_cfop: "REMESSA DE PRODUÇÃO COM FINS ESPECIFICO DE EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "6501", descricao_cfop: "REMESSA DE PRODUÇÃO COM FINS ESPECIFICO DE EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "6101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  32: [
    { cfop: "6101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  38: [
    { cfop: "1151", descricao_cfop: "TRANSF. RECEBIDA DE PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  47: [
    { cfop: "6932", descricao_cfop: "PRESTAçãO DE SERVIçO DE TRANSPORTE INICIADA EM UNIDADE DA FEDERAçãO DIVERSA DAQU", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5932", descricao_cfop: "PRESTAçãO DE SERVIçO DE TRANSPORTE INICIADA EM UNIDADE DA FEDERAçãO DIVERSA DAQU", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6356", descricao_cfop: "PRESTAÇÃO DE SERVIÇO DE TRANSPORTE A PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5356", descricao_cfop: "PRESTAÇÃO DE SERVIÇO DE TRANSPORTE A PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  87: [
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  96: [
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  99: [
    { cfop: "2306", descricao_cfop: "AQUISIçãO DE SERVIçO DE COMUNICAçãO POR ESTABELECIMENTO DE PRODUTOR RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "70", cst_cofins: "70", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1306", descricao_cfop: "AQUISIçãO DE SERVIçO DE COMUNICAçãO POR ESTABELECIMENTO DE PRODUTOR RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "70", cst_cofins: "70", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  103: [
    { cfop: "1256", descricao_cfop: "COMPRA DE ENERGIA ELETRICA ESTABELIMENTO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "70", cst_cofins: "70", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  115: [
    { cfop: "2256", descricao_cfop: "COMPRA DE ENERGIA ELETRICA ESTABELIMENTO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1256", descricao_cfop: "COMPRA DE ENERGIA ELETRICA ESTABELIMENTO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  117: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  119: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  128: [
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  141: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  153: [
    { cfop: "2356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  157: [
    { cfop: "2555", descricao_cfop: "ENTRADA DE BEM DO ATIVO IMOBILIZADO DE TERCEIRO, REMETIDO PARA USO NO ESTABELECI", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1555", descricao_cfop: "ENTRADA DE BENS DO ATIVO IMOBILIZADO DE TERCEIROS", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  159: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  162: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  246: [
    { cfop: "2551", descricao_cfop: "COMPRA DE BENS P/ ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1551", descricao_cfop: "COMPRA DE BENS P/ ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  248: [
    { cfop: "2551", descricao_cfop: "COMPRA DE BENS P/ ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1551", descricao_cfop: "COMPRA DE BENS P/ ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  401: [
    { cfop: "6551", descricao_cfop: "VENDA DE BEM DO ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5551", descricao_cfop: "VENDA DO ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  405: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  407: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  413: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  423: [
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  425: [
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2306", descricao_cfop: "AQUISIçãO DE SERVIçO DE COMUNICAçãO POR ESTABELECIMENTO DE PRODUTOR RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "70", cst_cofins: "70", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1306", descricao_cfop: "AQUISIçãO DE SERVIçO DE COMUNICAçãO POR ESTABELECIMENTO DE PRODUTOR RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "70", cst_cofins: "70", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  427: [
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  433: [
    { cfop: "1949", descricao_cfop: "OUTRA ENTRADA DE MERC. OU SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "70", cst_cofins: "70", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  441: [
    { cfop: "6551", descricao_cfop: "VENDA DE BEM DO ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5551", descricao_cfop: "VENDA DO ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  445: [
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2555", descricao_cfop: "ENTRADA DE BEM DO ATIVO IMOBILIZADO DE TERCEIRO, REMETIDO PARA USO NO ESTABELECI", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1555", descricao_cfop: "ENTRADA DE BENS DO ATIVO IMOBILIZADO DE TERCEIROS", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: null, cst_cofins: null, ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  465: [
    { cfop: "5412", descricao_cfop: "DEVOLUÇÃO DE BEM DO ATIVO SUBST. TRIBUTARIO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6413", descricao_cfop: "DEVOLUÇÃO DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6553", descricao_cfop: "DEVOLUçãO DE COMPRA DE BEM DO ATIVO IMOBILIZADO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6556", descricao_cfop: "DEVOLUçãO DE COMPRA DE MATERIAL DE USO OU CONSUMO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6412", descricao_cfop: "DEVOLUÇÃO DE BEM DO ATIVO SUBST. TRIBUTARIO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5413", descricao_cfop: "DEVOLUÇÃO DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5553", descricao_cfop: "DEVOLUCAO DE COMPRA DE BENS DO ATIVO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5556", descricao_cfop: "DEVOLUCAO DE MATERIAL DE USO CONSUMO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6201", descricao_cfop: "DEVOLUÇÃO DE COMPRA PARA PRODUÇÃO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5201", descricao_cfop: "DEVOLUÇÃO DE COMPRA PARA PRODUÇÃO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  520: [
    { cfop: "5933", descricao_cfop: "PRESTAçãO DE SERVIçO TRIBUTADO PELO ISSQN", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  562: [
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  626: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  648: [
    { cfop: "5131", descricao_cfop: "REMESSA DE PRODUÇÃO DE MILHO COM PREVISÃO DE AJUSTE", operacao_nf: "A Fixar", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5131", descricao_cfop: "REMESSA DE PRODUÇÃO DE SOJA COM PREVISÃO DE AJUSTE", operacao_nf: "A Fixar", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  659: [
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  663: [
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  665: [
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  667: [
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  670: [
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  675: [
    { cfop: "1213", descricao_cfop: "DEVOLUÇÃO DE REMESSA DE PRODUÇÃO COM PREVISÃO DE AJUSTE", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "999", descricao_cfop: "ESTORNO DE NFE NÃO CANCELADA NO PRAZO LEGAL", operacao_nf: "Estorno", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2201", descricao_cfop: "DEVOLUCAO DE VENDA DA PRODUCAO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "1201", descricao_cfop: "DEVOLUCAO DE VENDA DA PRODUCAO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  686: [
    { cfop: "2555", descricao_cfop: "ENTRADA DE BEM DO ATIVO IMOBILIZADO DE TERCEIRO, REMETIDO PARA USO NO ESTABELECI", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1555", descricao_cfop: "ENTRADA DE BENS DO ATIVO IMOBILIZADO DE TERCEIROS", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  687: [
    { cfop: "2555", descricao_cfop: "ENTRADA DE BEM DO ATIVO IMOBILIZADO DE TERCEIRO, REMETIDO PARA USO NO ESTABELECI", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1555", descricao_cfop: "ENTRADA DE BENS DO ATIVO IMOBILIZADO DE TERCEIROS", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  698: [
    { cfop: "5101", descricao_cfop: "COMPLEMENTO DE VENDA DE GRÃOS", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6501", descricao_cfop: "REMESSA DE PRODUÇÃO COM FINS ESPECIFICO DE EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "5501", descricao_cfop: "REMESSA DE PRODUÇÃO COM FINS ESPECIFICO DE EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "7101", descricao_cfop: "VENDA DE PRODUÇÃO DO ESTABELECIMENTO EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  699: [
    { cfop: "5101", descricao_cfop: "COMPLEMENTO DE VENDA DE GRÃOS", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5105", descricao_cfop: "VENDA DE PRODUÇÃO DO ESTAB. QUE NAO DEVA POR ELE TRANSITAR", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  700: [
    { cfop: "5101", descricao_cfop: "COMPLEMENTO DE VENDA DE GRÃOS", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5105", descricao_cfop: "VENDA DE PRODUÇÃO DO ESTAB. QUE NAO DEVA POR ELE TRANSITAR", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  701: [
    { cfop: "6131", descricao_cfop: "REMESSA DE PRODUÇÃO DE SOJA COM PREVISÃO DE AJUSTE FORA DO MT", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5131", descricao_cfop: "REMESSA DE PRODUÇÃO DE SOJA COM PREVISÃO DE AJUSTE", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6905", descricao_cfop: "REMESSA DE MERC. PARA DEPÓSITO", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6934", descricao_cfop: "REMESSA SIMBÓLICA DE MERC. PARA DEPÓSITO", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5934", descricao_cfop: "REMESSA SIMBÓLICA DE MERC. PARA DEPÓSITO", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5905", descricao_cfop: "REMESSA DE MERC. PARA DEPÓSITO", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  702: [
    { cfop: "6101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  713: [
    { cfop: "5101", descricao_cfop: "COMPLEMENTO VALOR DE VENDA BOVINO REGISTRADO P.O", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "COMPLEMENTO VALOR DE VENDA BOVINO", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  720: [
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  721: [
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  722: [
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  723: [
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  728: [
    { cfop: "2653", descricao_cfop: "COMPRA DE COMBUSTíVEL E LUBRIFICANTE POR CONSUMIDOR OU USUáRIO FINAL.", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1653", descricao_cfop: "COMPRA DE COMBUSTÍVEL OU LUBRIFICANTE POR CONSUMIDOR OU USUÁRIO FINAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  729: [
    { cfop: "1653", descricao_cfop: "COMPRA DE COMBUSTÍVEL OU LUBRIFICANTE POR CONSUMIDOR OU USUÁRIO FINAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  730: [
    { cfop: "2653", descricao_cfop: "COMPRA DE COMBUSTíVEL E LUBRIFICANTE POR CONSUMIDOR OU USUáRIO FINAL.", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "1653", descricao_cfop: "COMPRA DE COMBUSTÍVEL OU LUBRIFICANTE POR CONSUMIDOR OU USUÁRIO FINAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  732: [
    { cfop: "6915", descricao_cfop: "REMESSA DE MERCADORIA OU BEM PARA CONSERTO OU REPARO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  734: [
    { cfop: "2555", descricao_cfop: "ENTRADA DE BEM DO ATIVO IMOBILIZADO DE TERCEIRO, REMETIDO PARA USO NO ESTABELECI", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1555", descricao_cfop: "ENTRADA DE BENS DO ATIVO IMOBILIZADO DE TERCEIROS", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  735: [
    { cfop: "1406", descricao_cfop: "COMPRA DE BEM PARA O ATIVO IMOBILIZADO SUBST. TRIBUTARIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2406", descricao_cfop: "COMPRA DE BEM PARA O ATIVO IMOBILIZADO SUBST. TRIBUTARIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2551", descricao_cfop: "COMPRA DE BENS P/ ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1551", descricao_cfop: "COMPRA DE BENS P/ ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  736: [
    { cfop: "5412", descricao_cfop: "DEVOLUÇÃO DE BEM DO ATIVO SUBST. TRIBUTARIO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6413", descricao_cfop: "DEVOLUÇÃO DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6553", descricao_cfop: "DEVOLUçãO DE COMPRA DE BEM DO ATIVO IMOBILIZADO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6556", descricao_cfop: "DEVOLUçãO DE COMPRA DE MATERIAL DE USO OU CONSUMO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6412", descricao_cfop: "DEVOLUÇÃO DE BEM DO ATIVO SUBST. TRIBUTARIO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5413", descricao_cfop: "DEVOLUÇÃO DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5553", descricao_cfop: "DEVOLUCAO DE COMPRA DE BENS DO ATIVO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5556", descricao_cfop: "DEVOLUCAO DE MATERIAL DE USO CONSUMO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6201", descricao_cfop: "DEVOLUÇÃO DE COMPRA PARA PRODUÇÃO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5201", descricao_cfop: "DEVOLUÇÃO DE COMPRA PARA PRODUÇÃO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  750: [
    { cfop: "2922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  751: [
    { cfop: "2922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  752: [
    { cfop: "2922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  753: [
    { cfop: "2922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  754: [
    { cfop: "2116", descricao_cfop: "REMESSA DE MERC. ORIGINADA DE COMPRA P/ RECEB. FUTURO", operacao_nf: "Remessa", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1116", descricao_cfop: "REMESSA DE MERC. ORIGINADA DE COMPRA P/ RECEB. FUTURO", operacao_nf: "Remessa", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  756: [
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  758: [
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  759: [
    { cfop: "6949", descricao_cfop: "OUTRA SAÍDA DE MERC. OU SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5949", descricao_cfop: "OUTRA SAÍDA DE MERC. OU SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6915", descricao_cfop: "REMESSA DE MERCADORIA OU BEM PARA CONSERTO OU REPARO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5915", descricao_cfop: "REMESSA DE MERCADORIA OU BEM PARA CONSERTO OU REPARO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  760: [
    { cfop: "2949", descricao_cfop: "OUTRA ENTRADA DE MERC. OU SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1949", descricao_cfop: "OUTRA ENTRADA DE MERC. OU SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2916", descricao_cfop: "RETORNO DE MERCADORIA OU BEM REMETIDO PARA CONSERTO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1916", descricao_cfop: "RETORNO DE MERCADORIA OU BEM REMETIDO PARA CONSERTO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  765: [
    { cfop: "2906", descricao_cfop: "RETORNO DE MERC. REMETIDA PARA DEPÓSITO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2907", descricao_cfop: "RETORNO SIMBÓLICO DE MERC. REMETIDA PARA DEPÓSITO", operacao_nf: "Transferência", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1906", descricao_cfop: "RETORNO DE MERC. REMETIDA PARA DEPÓSITO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1907", descricao_cfop: "RETORNO SIMBÓLICO DE MERC. REMETIDA PARA DEPÓSITO", operacao_nf: "Transferência", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  766: [
    { cfop: "2934", descricao_cfop: "ENTRADA SIMBÓLICA DE MERC. PARA DEPÓSITO", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1934", descricao_cfop: "ENTRADA SIMBÓLICA DE MERC. PARA DEPÓSITO", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2905", descricao_cfop: "ENTRADA DE MERC. PARA DEPÓSITO", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1905", descricao_cfop: "ENTRADA DE MERC. PARA DEPÓSITO", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  767: [
    { cfop: "6907", descricao_cfop: "RETORNO SIMBÓLICO DE MERC. REMETIDA PARA DEPÓSITO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5907", descricao_cfop: "RETORNO SIMBÓLICO DE MERC. REMETIDA PARA DEPÓSITO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "6906", descricao_cfop: "RETORNO DE MERC. REMETIDA PARA DEPÓSITO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5906", descricao_cfop: "RETORNO DE MERC. REMETIDA PARA DEPÓSITO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  768: [
    { cfop: "2356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  769: [
    { cfop: "2356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  770: [
    { cfop: "2356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  771: [
    { cfop: "2356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1356", descricao_cfop: "AQUISIÇÃO DE SERVIÇO DE TRANSPORTE POR PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  772: [
    { cfop: "6555", descricao_cfop: "DEVOLUÇÃO DE BEM DE TERCEIRO, PARA USO NO ESTABELECIMENTO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5555", descricao_cfop: "DEVOLUÇÃO DE BEM DE TERCEIRO, PARA USO NO ESTABELECIMENTO", operacao_nf: "Devolução", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  784: [
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  785: [
    { cfop: "6923", descricao_cfop: "REMESSA DE MERCADORIA POR CONTA E ORDEM DE TERCEIROS", operacao_nf: "Remessa", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5923", descricao_cfop: "REMESSA DE MERCADORIA POR CONTA E ORDEM DE TERCEIROS", operacao_nf: "Remessa", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  786: [
    { cfop: "5151", descricao_cfop: "TRANSF. DE PRODUCAO", operacao_nf: "Transferência", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  788: [
    { cfop: "2912", descricao_cfop: "ENTRADA DE MERCADORIA OU BEM RECEBIDO PARA DEMONSTRAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1912", descricao_cfop: "ENTRADA DE MERCADORIA OU BEM RECEBIDO PARA DEMONSTRAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  789: [
    { cfop: "5913", descricao_cfop: "RETORNO DE MERCADORIA OU BEM RECEBIDO PARA DEMONSTRAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6913", descricao_cfop: "RETORNO DE MERCADORIA OU BEM RECEBIDO PARA DEMONSTRAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  793: [
    { cfop: "2555", descricao_cfop: "ENTRADA DE BEM DO ATIVO IMOBILIZADO DE TERCEIRO, REMETIDO PARA USO NO ESTABELECI", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1555", descricao_cfop: "ENTRADA DE BENS DO ATIVO IMOBILIZADO DE TERCEIROS", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  797: [
    { cfop: "6206", descricao_cfop: "ANULAçãO DE VALOR RELATIVO à AQUISIçãO DE SERVIçO DE TRANSPORTE", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5206", descricao_cfop: "ANULAçãO DE VALOR RELATIVO à AQUISIçãO DE SERVIçO DE TRANSPORTE", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  801: [
    { cfop: "6551", descricao_cfop: "VENDA DE BEM DO ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5551", descricao_cfop: "VENDA DO ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  802: [
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  804: [
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2551", descricao_cfop: "COMPRA DE BENS P/ ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1551", descricao_cfop: "COMPRA DE BENS P/ ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  805: [
    { cfop: "5552", descricao_cfop: "TRANSF. DE BENS DO ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  807: [
    { cfop: "5152", descricao_cfop: "TRANSF. DE MERC. ADQUIRIDA DE TERCEIROS", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  808: [
    { cfop: "5456", descricao_cfop: "SAIDA REFERENTE REMUNERACAO PRODUTOR - SISTEMA DE INTEGRACA E PARCERIA RURA", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5151", descricao_cfop: "TRANSF. DE PRODUCAO DE SORGO", operacao_nf: "Transferência", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5151", descricao_cfop: "TRANSF. DE PRODUCAO DE MILHETO", operacao_nf: "Transferência", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5151", descricao_cfop: "TRANSF. DE PRODUCAO DE MILHO", operacao_nf: "Transferência", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5151", descricao_cfop: "TRANSF. DE PRODUCAO DE SOJA", operacao_nf: "Transferência", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  814: [
    { cfop: "5949", descricao_cfop: "OUTRA SAÍDA DE MERC. OU SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  815: [
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  821: [
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  822: [
    { cfop: "6920", descricao_cfop: "REMESSA DE VASILHAME OU SACARIA", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5920", descricao_cfop: "REMESSA DE VASILHAME OU SACARIA", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  823: [
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  843: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  846: [
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  853: [
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  855: [
    { cfop: "2922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1922", descricao_cfop: "FATURAMENTO DE COMPRA PARA RECEBIMENTO FUTURO", operacao_nf: "Entrega Futura", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  857: [
    { cfop: "1653", descricao_cfop: "COMPRA DE COMBUSTÍVEL OU LUBRIFICANTE POR CONSUMIDOR OU USUÁRIO FINAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  858: [
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  864: [
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  872: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: null, cst_cofins: null, ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  874: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  884: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  887: [
    { cfop: "5901", descricao_cfop: "REMESSA P/ INDUSTRIALIZACAO DE SOJA", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5901", descricao_cfop: "REMESSA P/ INDUSTRIALIZACAO DE MILHO", operacao_nf: "Depósito", tipo_pessoa: "Indiferente", cst_pis: "07", cst_cofins: "07", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  896: [
    { cfop: "5949", descricao_cfop: "OUTRA SAÍDA DE MERC. OU SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  899: [
    { cfop: "5551", descricao_cfop: "VENDA DO ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "6551", descricao_cfop: "VENDA DE BEM DO ATIVO IMOBILIZADO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  905: [
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  908: [
    { cfop: "5501", descricao_cfop: "REMESSA DE PRODUÇÃO COM FINS ESPECIFICO DE EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "6101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "09", cst_cofins: "09", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "09", cst_cofins: "09", ncm: null, fins_exportacao: true, compoe_faturamento: true },
  ],
  909: [
    { cfop: "6501", descricao_cfop: "REMESSA DE PRODUÇÃO COM FINS ESPECIFICO DE EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "5501", descricao_cfop: "VENDA DE PRODUÇÃO PARA EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUÇÃO NO MERC. INTERNO P/ EXPORTAÇÃO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: true, compoe_faturamento: true },
    { cfop: "6101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "01", cst_cofins: "01", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "01", cst_cofins: "01", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  914: [
    { cfop: "6356", descricao_cfop: "PRESTAÇÃO DE SERVIÇO DE TRANSPORTE A PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "01", cst_cofins: "01", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5360", descricao_cfop: "PRESTAçãO DE SERVIçO DE TRANSPORTE A CONTRIBUINTE SUBSTITUTO EM RELAçãO AO SERVI", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "01", cst_cofins: "01", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5352", descricao_cfop: "PRESTAçãO DE SERVIçO DE TRANSPORTE A ESTABELECIMENTO INDUSTRIAL.", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "01", cst_cofins: "01", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5356", descricao_cfop: "PRESTAÇÃO DE SERVIÇO DE TRANSPORTE A PRODUTOR RURAL", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "01", cst_cofins: "01", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  915: [
    { cfop: "9101", descricao_cfop: "PRESTAÇÕES DE SERVIÇO REALIZADAS PARA TOMADOR OU DESTINATÁRIO ESTABELECIDO", operacao_nf: "Prestação de Serviço", tipo_pessoa: "Indiferente", cst_pis: "01", cst_cofins: "01", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  916: [
    { cfop: "6118", descricao_cfop: "VENDA DE PRODUÇÃO ENTREGUE POR CONTA E ORDEM DO ADQUIRENTE", operacao_nf: "Entrega Futura por Conta e Ordem", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5118", descricao_cfop: "VENDA DE PRODUÇÃO ENTREGUE POR CONTA E ORDEM DO ADQUIRENTE", operacao_nf: "Entrega Futura por Conta e Ordem", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  917: [
    { cfop: "6923", descricao_cfop: "REMESSA DE MERCADORIA POR CONTA E ORDEM DE TERCEIROS", operacao_nf: "Remessa por Conta e Ordem", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5923", descricao_cfop: "REMESSA DE MERCADORIA POR CONTA E ORDEM DE TERCEIROS", operacao_nf: "Remessa por Conta e Ordem", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  918: [
    { cfop: "6101", descricao_cfop: "COMPLEMENTO VALOR DE VENDA", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5101", descricao_cfop: "COMPLEMENTO DE VALOR", operacao_nf: "Complemento", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  919: [
    { cfop: "1101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "2101", descricao_cfop: "COMPRA PARA PRODUCAO RURAL", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "98", cst_cofins: "98", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  921: [
    { cfop: "6923", descricao_cfop: "REMESSA DE MERCADORIA POR CONTA E ORDEM DE TERCEIROS", operacao_nf: "Remessa por Conta e Ordem", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "5923", descricao_cfop: "REMESSA DE MERCADORIA POR CONTA E ORDEM DE TERCEIROS", operacao_nf: "Remessa por Conta e Ordem", tipo_pessoa: "Indiferente", cst_pis: "08", cst_cofins: "08", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
  922: [
    { cfop: "6101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
    { cfop: "5101", descricao_cfop: "VENDA DE PRODUCAO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "49", cst_cofins: "49", ncm: null, fins_exportacao: false, compoe_faturamento: true },
  ],
  935: [
    { cfop: "1407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2407", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO SUBST. TRIBUTRIO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1933", descricao_cfop: "AQUISIÇÃO DE SERVIÇO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "2556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
    { cfop: "1556", descricao_cfop: "COMPRA DE MATERIAL P/ USO OU CONSUMO", operacao_nf: "Normal (Compra e Venda)", tipo_pessoa: "Indiferente", cst_pis: "99", cst_cofins: "99", ncm: null, fins_exportacao: false, compoe_faturamento: false },
  ],
};

// Importa CFOPs padrão para a tabela operacao_cfop_fiscal
// Deve ser chamada APÓS seedOperacoesGerenciais (pois precisa dos UUIDs)
export async function seedCfopsFiscais(fazenda_id: string): Promise<{ inseridos: number; ignorados: number }> {
  const db = supabase;

  // 1. Buscar mapeamento ref_id → uuid das operações desta fazenda
  const { data: ops, error: opErr } = await db
    .from("operacoes_gerenciais")
    .select("id, ref_id")
    .eq("fazenda_id", fazenda_id)
    .not("ref_id", "is", null);
  if (opErr) throw new Error(`Erro ao buscar operações: ${opErr.message}`);

  const refToUuid: Record<number, string> = {};
  for (const op of ops ?? []) {
    if (op.ref_id) refToUuid[op.ref_id] = op.id;
  }

  // 2. Limpar registros anteriores desta fazenda
  await db.from("operacao_cfop_fiscal").delete().eq("fazenda_id", fazenda_id);

  // 3. Montar rows a inserir
  const rows: object[] = [];
  let ignorados = 0;
  for (const [opIdStr, cfops] of Object.entries(CFOP_SEED)) {
    const refId = Number(opIdStr);
    const uuid = refToUuid[refId];
    if (!uuid) { ignorados += cfops.length; continue; }
    for (const c of cfops) {
      rows.push({
        operacao_gerencial_id: uuid,
        fazenda_id,
        cfop:              c.cfop,
        descricao_cfop:    c.descricao_cfop,
        operacao_nf:       c.operacao_nf,
        tipo_pessoa:       c.tipo_pessoa,
        cst_pis:           c.cst_pis,
        cst_cofins:        c.cst_cofins,
        ncm:               c.ncm,
        fins_exportacao:   c.fins_exportacao,
        compoe_faturamento: c.compoe_faturamento,
        ativo: true,
      });
    }
  }

  // 4. Inserir em lotes de 50
  for (let i = 0; i < rows.length; i += 50) {
    const lote = rows.slice(i, i + 50);
    const { error } = await db.from("operacao_cfop_fiscal").insert(lote);
    if (error) throw new Error(`Erro ao inserir CFOPs (lote ${i}): ${error.message}`);
  }

  return { inseridos: rows.length, ignorados };
}