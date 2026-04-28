// ─────────────────────────────────────────────────────────────────────────────
// Plano de Contas — fonte única do Arato
//
// operacional: true  → aparece nos dropdowns dos módulos operacionais
//                       (financeiro, lavoura, estoque, contratos)
//
// operacional: false → back-office contábil apenas — contas que o sistema
//                       movimenta automaticamente (CMV, depreciação,
//                       transitórias) ou que pertencem ao balanço patrimonial
// ─────────────────────────────────────────────────────────────────────────────

export interface ContaContabil {
  codigo: string;
  nome: string;
  tipo: "ativo" | "passivo" | "pl" | "receita" | "custo" | "despesa";
  nivel: number;
  pai?: string;
  natureza?: "devedora" | "credora";
  transitoria?: boolean;   // zera ao encerrar o ciclo
  operacional?: boolean;   // visível para o operador nos lançamentos do dia a dia
  lcdpr?: string | null;   // código LCDPR (101-299) ou null = não entra
}

export const LCDPR_OPCOES = [
  { value: "",    label: "— não entra no LCDPR" },
  { value: "101", label: "101 — Venda rural" },
  { value: "102", label: "102 — Serviços rurais" },
  { value: "103", label: "103 — Financiamento rural" },
  { value: "104", label: "104 — Ressarcimento ITR" },
  { value: "199", label: "199 — Outras receitas rurais" },
  { value: "201", label: "201 — Custeio rural" },
  { value: "202", label: "202 — Investimento rural" },
  { value: "203", label: "203 — Amortização" },
  { value: "204", label: "204 — ITR" },
  { value: "299", label: "299 — Outras despesas rurais" },
];

export const LCDPR_LABELS: Record<string, string> = Object.fromEntries(
  LCDPR_OPCOES.filter(o => o.value).map(o => [o.value, o.label])
);

// ─── Plano completo ───────────────────────────────────────────────────────────

export const planoContasPadrao: ContaContabil[] = [

  // ── 1. ATIVO ─────────────────────────────────────────────────────────────
  // Patrimonial — back-office apenas
  { codigo: "1",       nome: "ATIVO",                               tipo: "ativo",   nivel: 0, natureza: "devedora"  },
  { codigo: "1.1",     nome: "Ativo Circulante",                    tipo: "ativo",   nivel: 1, natureza: "devedora"  },
  { codigo: "1.1.1",   nome: "Caixa e Equivalentes",                tipo: "ativo",   nivel: 2, natureza: "devedora"  },
  { codigo: "1.1.1.1", nome: "Caixa Geral",                         tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.1.1.2", nome: "Banco Conta Movimento",               tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.1.2",   nome: "Contas a Receber",                    tipo: "ativo",   nivel: 2, natureza: "devedora"  },
  { codigo: "1.1.2.1", nome: "Clientes — Venda de Grãos",           tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.1.2.2", nome: "Adiantamentos a Fornecedores",        tipo: "ativo",   nivel: 3, natureza: "devedora",  transitoria: true },
  { codigo: "1.1.3",   nome: "Estoques",                            tipo: "ativo",   nivel: 2, natureza: "devedora"  },
  { codigo: "1.1.3.1", nome: "Estoque de Grãos — Soja",             tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.1.3.2", nome: "Estoque de Grãos — Milho",            tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.1.3.3", nome: "Estoque de Grãos — Algodão",          tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.1.3.4", nome: "Estoque de Insumos",                  tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.1.4",   nome: "Produtos em Elaboração",              tipo: "ativo",   nivel: 2, natureza: "devedora",  transitoria: true },
  { codigo: "1.1.4.1", nome: "Safra em Andamento — Soja",           tipo: "ativo",   nivel: 3, natureza: "devedora",  transitoria: true },
  { codigo: "1.1.4.2", nome: "Safra em Andamento — Milho",          tipo: "ativo",   nivel: 3, natureza: "devedora",  transitoria: true },
  { codigo: "1.1.4.3", nome: "Safra em Andamento — Algodão",        tipo: "ativo",   nivel: 3, natureza: "devedora",  transitoria: true },
  { codigo: "1.1.5",   nome: "Despesas Antecipadas",                tipo: "ativo",   nivel: 2, natureza: "devedora",  transitoria: true },
  { codigo: "1.1.5.1", nome: "Seguro Agrícola Antecipado",          tipo: "ativo",   nivel: 3, natureza: "devedora",  transitoria: true },
  { codigo: "1.1.5.2", nome: "Arrendamento Antecipado",             tipo: "ativo",   nivel: 3, natureza: "devedora",  transitoria: true },
  { codigo: "1.2",     nome: "Ativo Não Circulante",                tipo: "ativo",   nivel: 1, natureza: "devedora"  },
  { codigo: "1.2.1",   nome: "Imobilizado",                         tipo: "ativo",   nivel: 2, natureza: "devedora"  },
  { codigo: "1.2.1.1", nome: "Máquinas e Implementos Agrícolas",    tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.2.1.2", nome: "Benfeitorias e Instalações",          tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.2.1.3", nome: "Veículos",                            tipo: "ativo",   nivel: 3, natureza: "devedora"  },
  { codigo: "1.2.2",   nome: "(-) Depreciação Acumulada",           tipo: "ativo",   nivel: 2, natureza: "credora"   },
  { codigo: "1.2.2.1", nome: "Depreciação — Máquinas",              tipo: "ativo",   nivel: 3, natureza: "credora"   },
  { codigo: "1.2.2.2", nome: "Depreciação — Benfeitorias",          tipo: "ativo",   nivel: 3, natureza: "credora"   },

  // ── 2. PASSIVO ────────────────────────────────────────────────────────────
  // Patrimonial — back-office apenas
  { codigo: "2",       nome: "PASSIVO",                             tipo: "passivo", nivel: 0, natureza: "credora"   },
  { codigo: "2.1",     nome: "Passivo Circulante",                  tipo: "passivo", nivel: 1, natureza: "credora"   },
  { codigo: "2.1.1",   nome: "Contas a Pagar",                      tipo: "passivo", nivel: 2, natureza: "credora"   },
  { codigo: "2.1.1.1", nome: "Fornecedores de Insumos",             tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.1.1.2", nome: "Prestadores de Serviços",             tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.1.1.3", nome: "Arrendamentos a Pagar",               tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.1.2",   nome: "Adiantamentos de Clientes",           tipo: "passivo", nivel: 2, natureza: "credora",   transitoria: true },
  { codigo: "2.1.2.1", nome: "Contratos de Venda Antecipada",       tipo: "passivo", nivel: 3, natureza: "credora",   transitoria: true },
  { codigo: "2.1.3",   nome: "Obrigações Fiscais e Trabalhistas",   tipo: "passivo", nivel: 2, natureza: "credora"   },
  { codigo: "2.1.3.1", nome: "Funrural a Recolher",                 tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.1.3.2", nome: "SENAR a Recolher",                    tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.1.3.3", nome: "INSS / eSocial a Recolher",           tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.1.3.4", nome: "ITR a Recolher",                      tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.1.4",   nome: "Empréstimos e Financiamentos CP",     tipo: "passivo", nivel: 2, natureza: "credora"   },
  { codigo: "2.1.4.1", nome: "Pronaf Custeio",                      tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.1.4.2", nome: "CPR — Cédula do Produtor Rural",      tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.2",     nome: "Passivo Não Circulante",              tipo: "passivo", nivel: 1, natureza: "credora"   },
  { codigo: "2.2.1",   nome: "Empréstimos LP",                      tipo: "passivo", nivel: 2, natureza: "credora"   },
  { codigo: "2.2.1.1", nome: "Pronaf Investimento",                 tipo: "passivo", nivel: 3, natureza: "credora"   },
  { codigo: "2.2.1.2", nome: "Finame / Leasing Agrícola",           tipo: "passivo", nivel: 3, natureza: "credora"   },

  // ── 3. PATRIMÔNIO LÍQUIDO ─────────────────────────────────────────────────
  // Patrimonial — back-office apenas
  { codigo: "3",   nome: "PATRIMÔNIO LÍQUIDO",            tipo: "pl", nivel: 0, natureza: "credora"  },
  { codigo: "3.1", nome: "Capital Social",                tipo: "pl", nivel: 1, natureza: "credora"  },
  { codigo: "3.2", nome: "Reservas de Lucro",             tipo: "pl", nivel: 1, natureza: "credora"  },
  { codigo: "3.3", nome: "Lucros / Prejuízos Acumulados", tipo: "pl", nivel: 1, natureza: "credora"  },
  { codigo: "3.4", nome: "Resultado do Exercício",        tipo: "pl", nivel: 1, natureza: "credora",  transitoria: true },

  // ── 4. RECEITAS ───────────────────────────────────────────────────────────
  { codigo: "4",     nome: "RECEITAS",                           tipo: "receita", nivel: 0, natureza: "credora" },
  { codigo: "4.1",   nome: "Receita Bruta de Vendas",            tipo: "receita", nivel: 1, natureza: "credora" },
  { codigo: "4.1.1", nome: "Venda de Grãos — Soja",              tipo: "receita", nivel: 2, natureza: "credora",  operacional: true, lcdpr: "101" },
  { codigo: "4.1.2", nome: "Venda de Grãos — Milho",             tipo: "receita", nivel: 2, natureza: "credora",  operacional: true, lcdpr: "101" },
  { codigo: "4.1.3", nome: "Venda de Grãos — Algodão",           tipo: "receita", nivel: 2, natureza: "credora",  operacional: true, lcdpr: "101" },
  { codigo: "4.1.4", nome: "Prêmios e Bonificações",             tipo: "receita", nivel: 2, natureza: "credora",  operacional: true, lcdpr: "101" },
  { codigo: "4.2",   nome: "Deduções da Receita Bruta",          tipo: "receita", nivel: 1, natureza: "devedora" },
  { codigo: "4.2.1", nome: "Funrural (1,5%)",                    tipo: "receita", nivel: 2, natureza: "devedora", operacional: false, lcdpr: null  }, // gerado automaticamente pela NF-e
  { codigo: "4.2.2", nome: "SENAR (0,2%)",                       tipo: "receita", nivel: 2, natureza: "devedora", operacional: false, lcdpr: null  }, // gerado automaticamente pela NF-e
  { codigo: "4.3",   nome: "Outras Receitas",                    tipo: "receita", nivel: 1, natureza: "credora" },
  { codigo: "4.3.1", nome: "Receita de Serviços Rurais",         tipo: "receita", nivel: 2, natureza: "credora",  operacional: true, lcdpr: "102" },
  { codigo: "4.3.2", nome: "Rendimento de Aplicação Financeira", tipo: "receita", nivel: 2, natureza: "credora",  operacional: true, lcdpr: null  },

  // ── 5. CUSTOS DE PRODUÇÃO ─────────────────────────────────────────────────
  { codigo: "5",     nome: "CUSTOS DE PRODUÇÃO",                tipo: "custo", nivel: 0, natureza: "devedora" },
  { codigo: "5.1",   nome: "Sementes",                          tipo: "custo", nivel: 1, natureza: "devedora" },
  { codigo: "5.1.1", nome: "Sementes — Soja",                   tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.1.2", nome: "Sementes — Milho",                  tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.2",   nome: "Fertilizantes",                     tipo: "custo", nivel: 1, natureza: "devedora" },
  { codigo: "5.2.1", nome: "Macronutrientes (N-P-K)",           tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.2.2", nome: "Micronutrientes e Corretivos",      tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.3",   nome: "Defensivos",                        tipo: "custo", nivel: 1, natureza: "devedora" },
  { codigo: "5.3.1", nome: "Herbicidas",                        tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.3.2", nome: "Fungicidas",                        tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.3.3", nome: "Inseticidas",                       tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.4",   nome: "Inoculantes e Bioestimulantes",     tipo: "custo", nivel: 1, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.5",   nome: "Operações Mecanizadas",             tipo: "custo", nivel: 1, natureza: "devedora" },
  { codigo: "5.5.1", nome: "Plantio",                           tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.5.2", nome: "Pulverização",                      tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.5.3", nome: "Colheita",                          tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.5.4", nome: "Frete e Transporte de Grãos",       tipo: "custo", nivel: 2, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.6",   nome: "Mão de Obra Direta",                tipo: "custo", nivel: 1, natureza: "devedora", operacional: true, lcdpr: "201" },
  { codigo: "5.7",   nome: "CMV — Custo da Mercadoria Vendida", tipo: "custo", nivel: 1, natureza: "devedora" },
  { codigo: "5.7.1", nome: "CMV — Soja",                        tipo: "custo", nivel: 2, natureza: "devedora", operacional: false, lcdpr: null  }, // gerado automaticamente ao vender
  { codigo: "5.7.2", nome: "CMV — Milho",                       tipo: "custo", nivel: 2, natureza: "devedora", operacional: false, lcdpr: null  },
  { codigo: "5.7.3", nome: "CMV — Algodão",                     tipo: "custo", nivel: 2, natureza: "devedora", operacional: false, lcdpr: null  },

  // ── 6. DESPESAS OPERACIONAIS ──────────────────────────────────────────────
  { codigo: "6",     nome: "DESPESAS OPERACIONAIS",                 tipo: "despesa", nivel: 0, natureza: "devedora" },
  { codigo: "6.1",   nome: "Arrendamento Rural",                    tipo: "despesa", nivel: 1, natureza: "devedora", operacional: true,  lcdpr: "201" },
  { codigo: "6.2",   nome: "Depreciação",                           tipo: "despesa", nivel: 1, natureza: "devedora" },
  { codigo: "6.2.1", nome: "Depreciação — Máquinas",                tipo: "despesa", nivel: 2, natureza: "devedora", operacional: false, lcdpr: null  }, // gerado automaticamente
  { codigo: "6.2.2", nome: "Depreciação — Benfeitorias",            tipo: "despesa", nivel: 2, natureza: "devedora", operacional: false, lcdpr: null  },
  { codigo: "6.3",   nome: "Aquisição de Imobilizado",              tipo: "despesa", nivel: 1, natureza: "devedora" },
  { codigo: "6.3.1", nome: "Compra de Máquinas e Implementos",      tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: "202" },
  { codigo: "6.3.2", nome: "Benfeitorias e Construções",            tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: "202" },
  { codigo: "6.4",   nome: "Despesas Administrativas",              tipo: "despesa", nivel: 1, natureza: "devedora" },
  { codigo: "6.4.1", nome: "Honorários Contábeis",                  tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: "299" },
  { codigo: "6.4.2", nome: "Escritório e Papelaria",                tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: "299" },
  { codigo: "6.4.3", nome: "Despesas com TI / Software",            tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: null  },
  { codigo: "6.5",   nome: "Encargos Financeiros",                  tipo: "despesa", nivel: 1, natureza: "devedora" },
  { codigo: "6.5.1", nome: "Juros e IOF",                           tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: "299" },
  { codigo: "6.5.2", nome: "Tarifas Bancárias",                     tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: null  },
  { codigo: "6.6",   nome: "Impostos e Taxas",                      tipo: "despesa", nivel: 1, natureza: "devedora" },
  { codigo: "6.6.1", nome: "ITR",                                   tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: "204" },
  { codigo: "6.6.2", nome: "IPTU",                                  tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: null  },
  { codigo: "6.7",   nome: "Seguros",                               tipo: "despesa", nivel: 1, natureza: "devedora" },
  { codigo: "6.7.1", nome: "Seguro Agrícola (PROAGRO/privado)",     tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: "299" },
  { codigo: "6.7.2", nome: "Seguro de Máquinas e Equipamentos",     tipo: "despesa", nivel: 2, natureza: "devedora", operacional: true,  lcdpr: "299" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Todas as contas marcadas como operacional: true — para dropdowns dos módulos */
export function contasOperacionais(): ContaContabil[] {
  return planoContasPadrao.filter(c => c.operacional === true);
}

/** Receitas operacionais (para CR, contratos de venda) */
export function contasReceita(): ContaContabil[] {
  return planoContasPadrao.filter(c => c.operacional && c.tipo === "receita");
}

/** Custos operacionais (para CP de insumos, lavoura) */
export function contasCusto(): ContaContabil[] {
  return planoContasPadrao.filter(c => c.operacional && c.tipo === "custo");
}

/** Despesas operacionais (para CP de despesas gerais) */
export function contasDespesa(): ContaContabil[] {
  return planoContasPadrao.filter(c => c.operacional && c.tipo === "despesa");
}

/** Custos + Despesas operacionais juntos (para CP geral) */
export function contasCustoDespesa(): ContaContabil[] {
  return planoContasPadrao.filter(c => c.operacional && (c.tipo === "custo" || c.tipo === "despesa"));
}

/** Rótulo formatado para exibição em dropdown: "5.1.1 — Sementes — Soja" */
export function labelConta(c: ContaContabil): string {
  return `${c.codigo} — ${c.nome}`;
}

/** Busca conta pelo código */
export function buscarConta(codigo: string): ContaContabil | undefined {
  return planoContasPadrao.find(c => c.codigo === codigo);
}
