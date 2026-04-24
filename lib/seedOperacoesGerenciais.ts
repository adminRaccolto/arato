// ─────────────────────────────────────────────────────────────────────────────
// Seed — Operações Gerenciais (Plano de Contas Gerencial Simplificado)
//
// Filosofia: granularidade vem do PRODUTO (grupo + subgrupo), não da operação.
// "Compra de Insumos" cobre sementes, fertilizantes e defensivos porque
// o produto já informa o subgrupo. A operação define apenas o comportamento
// financeiro e contábil.
//
// Estrutura:
//   1.xx  RECEITAS
//   2.xx  DESPESAS OPERACIONAIS
//   3.xx  DESPESAS FINANCEIRAS E PATRIMONIAIS
//   4.xx  ENTRADAS ECONÔMICAS
//   5.xx  SAÍDAS ECONÔMICAS
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";
import type { OperacaoGerencial } from "./supabase";

type SeedOp = Omit<OperacaoGerencial, "id" | "created_at" | "fazenda_id">;

// ── Helpers ───────────────────────────────────────────────────────────────────

function grupo(classificacao: string, descricao: string, tipo: "receita" | "despesa"): SeedOp {
  return {
    classificacao, descricao, tipo,
    inativo: false, informa_complemento: false,
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

function receita(classificacao: string, descricao: string, opts: Partial<SeedOp> = {}): SeedOp {
  return {
    classificacao, descricao, tipo: "receita",
    inativo: false, informa_complemento: false,
    permite_notas_fiscais: false, permite_cp_cr: true,
    permite_adiantamentos: false, permite_tesouraria: true, permite_baixas: true,
    permite_custo_produto: false, permite_contrato_financeiro: false,
    permite_estoque: false, permite_pedidos_venda: false,
    permite_manutencao: false, marcar_fiscal_padrao: false, permite_energia_eletrica: false,
    operacao_estoque: undefined, tipo_custo_estoque: "nenhum",
    gerar_financeiro: true, gerar_financeiro_gerencial: true, valida_propriedade: true,
    custo_absorcao: false, custo_abc: false, atualizar_custo_estoque: false,
    manutencao_reparos: false, gerar_depreciacao: false, impostos: [],
    ...opts,
  };
}

function despesa(classificacao: string, descricao: string, opts: Partial<SeedOp> = {}): SeedOp {
  return {
    classificacao, descricao, tipo: "despesa",
    inativo: false, informa_complemento: false,
    permite_notas_fiscais: false, permite_cp_cr: true,
    permite_adiantamentos: false, permite_tesouraria: true, permite_baixas: true,
    permite_custo_produto: true, permite_contrato_financeiro: false,
    permite_estoque: false, permite_pedidos_venda: false,
    permite_manutencao: false, marcar_fiscal_padrao: false, permite_energia_eletrica: false,
    operacao_estoque: undefined, tipo_custo_estoque: "nenhum",
    gerar_financeiro: true, gerar_financeiro_gerencial: true, valida_propriedade: true,
    custo_absorcao: true, custo_abc: true, atualizar_custo_estoque: false,
    manutencao_reparos: false, gerar_depreciacao: false, impostos: [],
    ...opts,
  };
}

// ── Plano simplificado ────────────────────────────────────────────────────────

export const OPERACOES_GERENCIAIS_PADRAO: SeedOp[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // 1 — RECEITAS
  // ═══════════════════════════════════════════════════════════════════════════
  grupo("1",    "RECEITAS",                  "receita"),
  grupo("1.01", "Receitas Operacionais",     "receita"),

  receita("1.01.001", "Venda de Produção Rural", {
    permite_notas_fiscais: true, permite_cp_cr: true, permite_pedidos_venda: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    tipo_lcdpr: "1",
    impostos: ["icms", "funrural", "fethab1", "fethab2", "senar"],
    obs_legal: "ICMS DIFERIDO CONFORME ART. 1º DO ANEXO V DO RICMS/MT",
    natureza_receita: "VENDA DE PRODUÇÃO RURAL",
    gerar_financeiro: true, gerar_financeiro_gerencial: true, valida_propriedade: true,
    conta_debito: "1.1.2.1", conta_credito: "4.1.1",
    marcar_fiscal_padrao: true,
    // Detalhe por cultura (soja/milho/algodão) fica no produto do contrato
  }),

  receita("1.01.002", "Prestação de Serviços Rurais", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "1",
    impostos: ["funrural", "senar"],
    natureza_receita: "PRESTAÇÃO DE SERVIÇOS RURAIS",
    gerar_financeiro: true,
    conta_debito: "1.1.2.1", conta_credito: "4.3.1",
  }),

  receita("1.01.003", "Prêmios e Bonificações", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "1",
    impostos: ["funrural", "senar"],
    gerar_financeiro: true,
    conta_debito: "1.1.2.1", conta_credito: "4.1.4",
  }),

  grupo("1.02", "Receitas Não Operacionais", "receita"),

  receita("1.02.001", "Venda de Imobilizado", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    gerar_financeiro: true,
    conta_debito: "1.1.1.2", conta_credito: "4.3",
  }),

  receita("1.02.002", "Indenização de Seguros", {
    permite_cp_cr: true,
    tipo_lcdpr: "5", gerar_financeiro: true,
    conta_debito: "1.1.1.2", conta_credito: "4.3",
  }),

  receita("1.02.003", "Outras Receitas", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "5", gerar_financeiro: true, informa_complemento: true,
    conta_debito: "1.1.1.2", conta_credito: "4.3",
  }),

  grupo("1.03", "Receitas Financeiras", "receita"),

  receita("1.03.001", "Rendimentos de Aplicações Financeiras", {
    permite_cp_cr: false, permite_tesouraria: true,
    gerar_financeiro: true,
    conta_debito: "1.1.1.2", conta_credito: "4.3.2",
  }),

  receita("1.03.002", "Juros Recebidos", {
    permite_cp_cr: false, permite_tesouraria: true,
    gerar_financeiro: true,
    conta_debito: "1.1.1.2", conta_credito: "4.3.2",
  }),

  receita("1.03.003", "Descontos Obtidos", {
    permite_cp_cr: false, permite_tesouraria: true, permite_baixas: true,
    gerar_financeiro: true,
    conta_debito: "2.1.1.1", conta_credito: "4.3",
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 2 — DESPESAS OPERACIONAIS
  // Granularidade vem do produto (grupo/subgrupo), não da operação.
  // ═══════════════════════════════════════════════════════════════════════════
  grupo("2",    "DESPESAS OPERACIONAIS",               "despesa"),

  despesa("2.01", "Compra de Insumos Agrícolas", {
    // Cobre: sementes, fertilizantes, defensivos, inoculantes, adjuvantes
    // Detalhe por subgrupo fica no produto da NF/pedido
    permite_notas_fiscais: true, permite_cp_cr: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true, atualizar_custo_estoque: true,
    conta_debito: "5", conta_credito: "2.1.1.1",
  }),

  despesa("2.02", "Compra de Combustíveis e Lubrificantes", {
    permite_notas_fiscais: true, permite_cp_cr: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true, atualizar_custo_estoque: true,
    conta_debito: "5.5", conta_credito: "2.1.1.1",
  }),

  despesa("2.03", "Manutenção de Máquinas e Implementos", {
    permite_notas_fiscais: true, permite_cp_cr: true, permite_manutencao: true,
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true, manutencao_reparos: true,
    conta_debito: "5.5", conta_credito: "2.1.1.2",
  }),

  despesa("2.04", "Serviços de Mecanização", {
    // Plantio / pulverização / colheita terceirizados
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true,
    conta_debito: "5.5", conta_credito: "2.1.1.2",
  }),

  despesa("2.05", "Serviços Gerais e Terceirizados", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true,
    conta_debito: "5.5", conta_credito: "2.1.1.2",
  }),

  despesa("2.06", "Arrendamento Rural", {
    permite_notas_fiscais: true, permite_cp_cr: true, permite_contrato_financeiro: true,
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true, valida_propriedade: true,
    conta_debito: "6.1", conta_credito: "2.1.1.3",
    // Em sc_soja/sc_milho/brl — detalhe fica no contrato de arrendamento
  }),

  despesa("2.07", "Mão de Obra Rural", {
    permite_cp_cr: true,
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true,
    conta_debito: "5.6", conta_credito: "2.1.1.2",
  }),

  despesa("2.08", "Energia Elétrica", {
    permite_notas_fiscais: true, permite_cp_cr: true, permite_energia_eletrica: true,
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true,
    conta_debito: "6.4", conta_credito: "2.1.1.1",
  }),

  despesa("2.09", "Frete e Transporte de Grãos", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true,
    conta_debito: "5.5.4", conta_credito: "2.1.1.2",
  }),

  despesa("2.10", "Classificação e Armazenagem", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "1",
    custo_absorcao: true, custo_abc: true,
    conta_debito: "5.5", conta_credito: "2.1.1.2",
  }),

  despesa("2.11", "Seguro Agrícola", {
    permite_cp_cr: true,
    tipo_lcdpr: "1",
    custo_absorcao: true,
    conta_debito: "6.7.1", conta_credito: "2.1.1.1",
  }),

  despesa("2.12", "Funrural / SENAR", {
    // Gerado automaticamente pela NF-e — inativo por padrão
    permite_cp_cr: false, permite_tesouraria: false, permite_baixas: false,
    gerar_financeiro: false, gerar_financeiro_gerencial: false,
    inativo: true,
    conta_debito: "4.2.1", conta_credito: "2.1.3.1",
  }),

  despesa("2.13", "ITR — Imposto Territorial Rural", {
    permite_cp_cr: true,
    tipo_lcdpr: "4",
    custo_absorcao: true,
    conta_debito: "6.6.1", conta_credito: "2.1.3.4",
  }),

  despesa("2.14", "Honorários e Serviços Administrativos", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "5",
    custo_absorcao: true,
    conta_debito: "6.4.1", conta_credito: "2.1.1.2",
  }),

  despesa("2.15", "Outras Despesas Operacionais", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "5",
    custo_absorcao: true, informa_complemento: true,
    conta_debito: "6.4", conta_credito: "2.1.1.1",
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 3 — DESPESAS FINANCEIRAS E PATRIMONIAIS
  // ═══════════════════════════════════════════════════════════════════════════
  grupo("3",    "DESPESAS FINANCEIRAS E PATRIMONIAIS",  "despesa"),

  despesa("3.01", "Compra de Máquinas e Implementos", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "2",
    gerar_financeiro: true, custo_absorcao: false,
    conta_debito: "6.3.1", conta_credito: "2.1.1.1",
    informa_complemento: true,
  }),

  despesa("3.02", "Benfeitorias e Construções", {
    permite_notas_fiscais: true, permite_cp_cr: true,
    tipo_lcdpr: "2",
    gerar_financeiro: true, custo_absorcao: false,
    conta_debito: "6.3.2", conta_credito: "2.1.1.2",
  }),

  despesa("3.03", "Juros e IOF de Financiamentos", {
    permite_cp_cr: true, permite_tesouraria: true,
    tipo_lcdpr: "3",
    gerar_financeiro: true, custo_absorcao: false,
    conta_debito: "6.5.1", conta_credito: "2.1.4",
  }),

  despesa("3.04", "Tarifas Bancárias", {
    permite_cp_cr: false, permite_tesouraria: true,
    gerar_financeiro: true, custo_absorcao: false,
    conta_debito: "6.5.2", conta_credito: "1.1.1.2",
  }),

  despesa("3.05", "Depreciação", {
    // Lançado automaticamente pelo sistema
    permite_cp_cr: false, permite_tesouraria: false,
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: false, gerar_depreciacao: true,
    inativo: true,
    conta_debito: "6.2.1", conta_credito: "1.2.2.1",
  }),

  despesa("3.06", "Amortização de Dívidas Rurais", {
    permite_cp_cr: true,
    tipo_lcdpr: "3",
    gerar_financeiro: true, custo_absorcao: false,
    conta_debito: "2.1.4", conta_credito: "1.1.1.2",
    tipo_formula: "baixas",
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 4 — ENTRADAS ECONÔMICAS
  // ═══════════════════════════════════════════════════════════════════════════
  grupo("4",    "ENTRADAS ECONÔMICAS",               "receita"),

  receita("4.01", "Entrada de Insumos no Estoque", {
    permite_notas_fiscais: true, permite_cp_cr: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    gerar_financeiro: true, atualizar_custo_estoque: true,
    conta_debito: "1.1.3.4", conta_credito: "2.1.1.1",
  }),

  receita("4.02", "Colheita — Entrada de Grãos no Estoque", {
    permite_estoque: true, operacao_estoque: "entrada", tipo_custo_estoque: "gasto",
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    atualizar_custo_estoque: true,
    conta_debito: "1.1.3.1", conta_credito: "1.1.4.1",
  }),

  receita("4.03", "Transferência entre Depósitos — Entrada", {
    permite_estoque: true, operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, gerar_financeiro_gerencial: false,
    conta_debito: "1.1.3.4", conta_credito: "1.1.3.4",
  }),

  receita("4.04", "Devolução de Compras", {
    permite_notas_fiscais: true, permite_cp_cr: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: true,
    conta_debito: "1.1.3.4", conta_credito: "2.1.1.1",
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // 5 — SAÍDAS ECONÔMICAS
  // ═══════════════════════════════════════════════════════════════════════════
  grupo("5",    "SAÍDAS ECONÔMICAS",                 "despesa"),

  despesa("5.01", "Consumo de Insumos na Lavoura", {
    permite_estoque: true, operacao_estoque: "saida", tipo_custo_estoque: "gasto",
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: true, custo_abc: true,
    conta_debito: "5", conta_credito: "1.1.3.4",
  }),

  despesa("5.02", "Saída de Grãos por Venda", {
    permite_notas_fiscais: true, permite_estoque: true,
    operacao_estoque: "saida", tipo_custo_estoque: "contrato",
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    conta_debito: "5.7", conta_credito: "1.1.3.1",
    marcar_fiscal_padrao: true,
  }),

  despesa("5.03", "Baixa de Estoque por Perda / Avaria", {
    permite_estoque: true, operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, gerar_financeiro_gerencial: true,
    custo_absorcao: false,
    conta_debito: "5.7", conta_credito: "1.1.3.4",
  }),

  despesa("5.04", "Transferência entre Depósitos — Saída", {
    permite_estoque: true, operacao_estoque: "saida", tipo_custo_estoque: "ajuste",
    gerar_financeiro: false, gerar_financeiro_gerencial: false,
    conta_debito: "1.1.3.4", conta_credito: "1.1.3.4",
  }),

  despesa("5.05", "Devolução de Vendas", {
    permite_notas_fiscais: true, permite_cp_cr: true, permite_estoque: true,
    operacao_estoque: "entrada", tipo_custo_estoque: "ajuste",
    gerar_financeiro: true,
    conta_debito: "1.1.2.1", conta_credito: "4.1.1",
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
