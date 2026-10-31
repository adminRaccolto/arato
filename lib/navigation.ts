// ─── Tipos ───────────────────────────────────────────────────
// bloco: nome do bloco dentro da seção do painel (ex.: relatórios agrupados pela tela de origem). Itens seguidos com o
// mesmo bloco ficam juntos sob um separador (traço + nome); todo item do bloco leva o nome, para o separador aparecer
// mesmo quando o primeiro item estiver oculto por permissão.
export type NavLink     = { type?: "link";     id: string; label: string; path: string; moduleId?: string; disabled?: boolean; bloco?: string };
export type NavDivider  = { type: "divider";   label: string };
export type NavSubgroup = { type: "subgroup";  id: string; label: string; children: NavLink[]; moduleId?: string };
export type NavChild    = NavLink | NavDivider | NavSubgroup;

export type NavItem =
  | (NavLink & { minStep?: number })
  | { type: "group"; id: string; label: string; panel?: boolean; minStep?: number; children: NavChild[] };

export function extrairGrupos(children: NavChild[]): { label: string; items: NavLink[] }[] {
  const grupos: { label: string; items: NavLink[] }[] = [];
  let atual: { label: string; items: NavLink[] } | null = null;
  for (const c of children) {
    if (c.type === "divider") {
      if (atual) grupos.push(atual);
      atual = { label: c.label, items: [] };
    } else if (atual) {
      // subgroup dentro de painel não tem onde aparecer — achata os filhos na seção atual
      // em vez de descartá-los em silêncio (foi assim que "Abastecimento de Máquinas" sumiu).
      if (c.type === "subgroup") atual.items.push(...c.children);
      else atual.items.push(c as NavLink);
    }
  }
  if (atual) grupos.push(atual);
  return grupos;
}

// ─── Dados de navegação ──────────────────────────────────────
export const NAV: NavItem[] = [

  { id: "inicio", label: "Início", path: "/", minStep: 0 },

  {
    type: "group", id: "cadastros", label: "Cadastros", panel: true, minStep: 0,
    children: [
      { type: "divider", label: "Cadastros — Entidades" },
      { id: "cad-pessoas",          label: "Pessoas e Entidades",        path: "/cadastros?tab=pessoas"                              },
      { id: "cad-produtores",       label: "Produtores",                 path: "/cadastros?tab=produtores"                           },
      { id: "cad-fazendas",         label: "Fazendas e Talhões",         path: "/cadastros?tab=fazendas"                             },
      { id: "cad-funcionarios",     label: "Funcionários",               path: "/cadastros?tab=funcionarios"                         },
      { id: "cad-empresas",         label: "Empresas",                   path: "/cadastros?tab=empresas"                             },
      { id: "cad-imoveis-urbanos",  label: "Imóveis Urbanos",            path: "/cadastros?tab=imoveis_urbanos"                      },
      { type: "divider", label: "Cadastros — Agrícola" },
      { id: "cad-insumos",          label: "Catálogo de Insumos",        path: "/cadastros?tab=insumos"                              },
      { id: "cad-produtos",         label: "Produtos Agrícolas",         path: "/cadastros?tab=produtos"                             },
      { id: "cad-itens",            label: "Itens Gerais",               path: "/cadastros?tab=itens"                                },
      { id: "cad-depositos",        label: "Depósitos & Armazéns",       path: "/cadastros?tab=depositos"                            },
      { id: "cad-combustivel",      label: "Combustíveis & Bombas",      path: "/cadastros?tab=combustivel"                          },
      { id: "cad-grupos-insumo",    label: "Grupos de Insumos",          path: "/cadastros?tab=grupos_insumo"                        },
      { id: "cad-culturas",         label: "Culturas",                   path: "/cadastros?tab=culturas"                             },
      { id: "cad-principios-ativos",label: "Princípios Ativos (BOT)",    path: "/cadastros?tab=principios_ativos"                    },
      { id: "cad-unidades-medida",  label: "Unidades de Medida",         path: "/cadastros?tab=unidades_medida"                      },
      { type: "divider", label: "Cadastros — Patrimônio" },
      { id: "cad-maquinas",         label: "Máquinas e Veículos",        path: "/cadastros?tab=maquinas"                             },
      { id: "cad-benfeitorias",     label: "Benfeitorias",               path: "/cadastros?tab=benfeitorias"                         },
      { id: "cad-bens",             label: "Bens (Alienação)",           path: "/cadastros?tab=bens"                                 },
      { type: "divider", label: "Cadastros — Financeiro" },
      { id: "cad-contas-bancarias", label: "Contas Bancárias",           path: "/cadastros?tab=contas_bancarias"                     },
      { id: "cad-centros-custo",    label: "Centros de Custo",           path: "/cadastros?tab=centros_custo"                        },
      { id: "cad-historico-fiscal", label: "Histórico Fiscal (CFOPs)",   path: "/cadastros?tab=historico_fiscal"                     },
      { id: "cad-formas-pagamento", label: "Formas de Pagamento",        path: "/cadastros?tab=formas_pagamento"                     },
    ],
  },

  {
    type: "group", id: "producao", label: "Produção", panel: true, minStep: 3,
    children: [
      { type: "divider", label: "Planejamento" },
      { id: "prod-planejamento",  label: "Planejamento de Safra",           path: "/lavoura/planejamento"                     },
      { id: "prod-safras",        label: "Safras e Ciclos",                 path: "/cadastros?tab=safras"                     },
      { id: "prod-orcamento",     label: "Orçamento Planejado × Realizado", path: "/lavoura/planejamento?aba=comparativo"     },
      { type: "divider", label: "Operações de Campo" },
      { id: "prod-plantio",       label: "Plantio",                         path: "/lavoura/plantio"                          },
      { id: "prod-adubacao",      label: "Adubação de Base",                path: "/lavoura/adubacao"                         },
      { id: "prod-correcao",      label: "Correção de Solo",                path: "/lavoura/correcao"                         },
      { id: "prod-pulverizacao",  label: "Pulverização Terrestre",          path: "/lavoura/pulverizacao"                     },
      { id: "prod-aerea",         label: "Aplicação Aérea",                 path: "/lavoura/aerea"                            },
      { id: "prod-trat-semente",  label: "Tratamento de Sementes",          path: "/lavoura/tratamento-sementes"              },
      { type: "divider", label: "Monitoramento" },
      { id: "prod-mapa",          label: "Mapa de Talhões",                  path: "/mapa"                                     },
      { id: "prod-recomendacoes", label: "Recomendações Agronômicas",       path: "/lavoura/recomendacoes"                    },
      { id: "prod-pragas",        label: "Pragas & Doenças",                path: "/lavoura/pragas"                           },
      { id: "prod-pluviometria",  label: "Pluviometria",                    path: "/lavoura/pluviometria"                     },
      { type: "divider", label: "Colheita" },
      { id: "prod-colheita",      label: "Colheita",                        path: "/lavoura/colheita"                         },
      { id: "prod-rom-producao",  label: "Romaneios de Produção",           path: "/estoque/romaneio-entrada"                 },
      { id: "prod-classificacao", label: "Classificação de Grãos",          path: "/cadastros?tab=padroes_classificacao"      },
      { type: "divider", label: "Máquinas" },
      { id: "prod-maquinas",      label: "Máquinas e Veículos",         path: "/cadastros?tab=maquinas"                   },
      { id: "prod-abastecimento", label: "Abastecimento de Máquinas",   path: "/estoque/abastecimento"                    },
      { id: "prod-manutencoes",   label: "Manutenções",                 path: "/relatorios/manutencao"                    },
      { id: "prod-custos-maq",    label: "Custos por Máquina",          path: "/relatorios/manutencao?aba=custos"         },
      { type: "divider", label: "Algodão" },
      { id: "alg-safra",          label: "Safra & Operações",               path: "/algodao?aba=safra",      moduleId: "algodao" },
      { id: "alg-bicudo",         label: "Monitoramento de Bicudo",         path: "/algodao?aba=bicudo",     moduleId: "algodao" },
      { id: "alg-modulos",        label: "Colheita & Módulos",              path: "/algodao?aba=modulos",    moduleId: "algodao" },
      { id: "alg-benef",          label: "Algodoeira / Beneficiamento",     path: "/algodao?aba=algodoeira", moduleId: "algodao" },
      { id: "alg-hvi",            label: "HVI & Qualidade",                 path: "/algodao?aba=hvi",        moduleId: "algodao" },
      { id: "alg-posicao",        label: "Posição de Algodão",              path: "/algodao?aba=posicao",    moduleId: "algodao" },
    ],
  },

  {
    type: "group", id: "documentos-fiscais", label: "Documentos Fiscais", panel: true, minStep: 5,
    children: [
      { type: "divider", label: "Notas de Entrada" },
      { id: "docfis-terceiro",   label: "Notas de Terceiro",                 path: "/fiscal/documentos",             moduleId: "nf_entrada" },
      { id: "docfis-proprias",   label: "Notas Próprias",                    path: "/fiscal/notas-proprias",         moduleId: "fiscal_nfe" },
      { id: "docfis-ret-agric",  label: "Retorno de Produto Agrícola",       path: "/comercial/faturamento",         moduleId: "contratos"  },
      { type: "divider", label: "Notas de Saída" },
      { id: "docfis-venda",      label: "Notas de Venda",                    path: "/comercial/faturamento",         moduleId: "contratos"  },
      { type: "divider", label: "Remessas e Retornos" },
      { id: "docfis-remessas",   label: "Remessas (armazém, máquinas)",      path: "/fiscal/remessas",               moduleId: "fiscal_nfe" },
      { id: "docfis-retornos",   label: "Retornos",                          path: "/fiscal/retornos",               moduleId: "fiscal_nfe" },
      { id: "docfis-entregas-fut", label: "Entregas Futuras",                path: "/fiscal/entregas-futuras",       moduleId: "fiscal_nfe" },
      { type: "divider", label: "Transporte" },
      { id: "docfis-cte",        label: "CT-e — Conhecimento de Transporte", path: "/transporte/cte",                moduleId: "transporte" },
      { id: "docfis-mdfe",       label: "MDF-e — Manifesto de Cargas",       path: "/transporte/mdfe",               moduleId: "transporte" },
      { type: "divider", label: "Relatórios" },
      { id: "docfis-rel-processamento", label: "Processamento de NF e NFS-e", path: "/fiscal/relatorio-processamento", moduleId: "nf_entrada" },
      { id: "docfis-rel-canceladas", label: "NFs Canceladas pelo Emitente", path: "/fiscal/relatorio-canceladas", moduleId: "nf_entrada" },
    ],
  },

  {
    type: "group", id: "comercial", label: "Comercial & Logística", panel: true, minStep: 4,
    children: [
      { type: "divider", label: "Compras" },
      { id: "com-pedidos",        label: "Pedido de Compras",           path: "/compras",                            moduleId: "compras" },
      { type: "divider", label: "Estoque" },
      { id: "com-transferencias", label: "Transferência entre Fazendas", path: "/estoque/transferencias"                          },
      { id: "com-rom-terceiros",  label: "Romaneios de Terceiros",      path: "/relatorios/romaneios?aba=entrada"                 },
      { type: "divider", label: "Integração de Documentos" },
      { id: "com-notas-capt",     label: "Notas Capturadas (SIEG)",     path: "/configuracoes/classificacao"                      },
      { id: "com-ligar-sieg",     label: "⚡ Ligar / Desligar SIEG",    path: "/configuracoes/automacoes"                         },
      { type: "divider", label: "Comercialização" },
      { id: "com-contratos",          label: "Contratos de Grãos",          path: "/contratos",                    moduleId: "contratos"   },
      { id: "com-migrar-nf",          label: "Migração de NF entre Contratos", path: "/contratos/migrar-nf",       moduleId: "contratos"   },
      { id: "com-compromissos-graos", label: "Compromissos em Grãos",       path: "/contratos/compromissos-graos", moduleId: "contratos"   },
      { id: "com-faturamento",        label: "Faturamento / NF-e de Saída", path: "/comercial/faturamento",        moduleId: "contratos"   },
      { id: "com-compra-terra",       label: "Compra de Terra",             path: "/contratos/compra-terra",       moduleId: "contratos"   },
      { id: "com-arrendamentos",      label: "Contratos de Arrendamento",   path: "/contratos/arrendamento",       moduleId: "arrendamento" },
      { type: "divider", label: "Expedição" },
      { id: "com-expedicao",          label: "Expedição de Grãos",          path: "/expedicao",                              moduleId: "expedicao" },
      { id: "com-cargas-transito",    label: "Cargas em Trânsito",          path: "/expedicao?aba=transito",                 moduleId: "expedicao" },
      { id: "com-rom-saida",          label: "Romaneios de Saída",          path: "/relatorios/romaneios?aba=saida",         moduleId: "expedicao" },
      { type: "divider", label: "Fretes e Transporte" },
      { id: "transp-acerto",          label: "Acerto de Frete (TAC)",             path: "/transporte/acerto-frete",  moduleId: "transporte" },
      { id: "transp-cte",             label: "CT-e — Conhecimento de Transporte", path: "/transporte/cte",           moduleId: "transporte" },
      { id: "transp-mdfe",            label: "MDF-e — Manifesto de Cargas",       path: "/transporte/mdfe",          moduleId: "transporte" },
      { id: "transp-cadastros",       label: "Transportadoras / Veículos",        path: "/transporte/cadastros",     moduleId: "transporte" },
      { type: "divider", label: "Balança" },
      { id: "com-pesagem-avulsa",     label: "Pesagem Avulsa",                    path: "/balanca/pesagem-avulsa"                           },
      // Tudo acima é OPERAÇÃO (lançamento/execução); tudo abaixo é RELATÓRIO
      // (consulta/filtro/exportar) — agrupado numa seção final só, com o
      // mesmo separador horizontal que já existe antes de cada divider.
      // Mesmo padrão já usado no grupo Financeiro ("Relatórios Financeiros"
      // como única seção final).
      { type: "divider", label: "Relatórios" },
      { id: "com-rel-pedidos",    label: "Pedidos de Compra",           path: "/relatorios/pedidos-compra",                       moduleId: "compras", bloco: "Compras" },
      { id: "com-rel-posicao",    label: "Posição de Insumos",          path: "/estoque",                                         bloco: "Estoque" },
      { id: "com-rel-kardex",     label: "Kardex (Ficha de Estoque)",   path: "/estoque/kardex",                                  bloco: "Estoque" },
      { id: "com-rel-aud-fiscal", label: "Auditor Fiscal × Físico",     path: "/estoque/auditoria-fiscal",                        bloco: "Estoque" },
      { id: "com-rel-rastreio",   label: "Rastreabilidade do Item",     path: "/estoque/rastreabilidade",                         bloco: "Estoque" },
      { id: "com-rel-graos",      label: "Estoque de Grãos",            path: "/estoque/graos",                                   bloco: "Comercialização" },
      { id: "com-rel-pendencias", label: "Pendências de Classificação", path: "/financeiro/pendencias-nf",                        bloco: "Integração de Documentos" },
    ],
  },

  {
    type: "group", id: "financeiro", label: "Financeiro", panel: true, minStep: 6,
    children: [
      { type: "divider", label: "Contas a Pagar / Receber" },
      { id: "fin-pagar",           label: "Contas a Pagar",               path: "/financeiro/pagar",                moduleId: "fin_pagar"      },
      { id: "fin-receber",         label: "Contas a Receber",             path: "/financeiro/receber",              moduleId: "fin_receber"    },
      { id: "fin-adiantamentos",   label: "Adiantamentos a Fornecedores", path: "/financeiro/adiantamentos",        moduleId: "fin_pagar"      },
      { id: "fin-folha",           label: "Folha de Pagamento",           path: "/financeiro/folha"                                            },
      { id: "fin-previsoes",       label: "Previsão de Gastos",           path: "/financeiro/previsoes",            moduleId: "fin_pagar"      },
      { id: "fin-emp-folha",       label: "Folha de Pagamento — Empresa", path: "/empresas/folha"                                             },
      { type: "divider", label: "Tesouraria" },
      { id: "fin-lanc-tesouraria", label: "Lançamento de Tesouraria",     path: "/financeiro/tesouraria",           moduleId: "fin_tesouraria" },
      { id: "fin-op-tesouraria",   label: "Operações de Tesouraria",      path: "/financeiro/tesouraria/operacoes", moduleId: "fin_tesouraria" },
      { id: "fin-aplicacoes",      label: "Aplicações Financeiras",       path: "/financeiro/aplicacoes",           moduleId: "fin_tesouraria" },
      { id: "fin-conciliacao",     label: "Conciliação Bancária",         path: "/financeiro/conciliacao",          moduleId: "fin_tesouraria" },
      { type: "divider", label: "Relatórios Financeiros" },
      { id: "fin-cpcr",            label: "CP / CR — Contas",             path: "/financeiro/relatorios?aba=cpcr",                moduleId: "fin_relatorios", bloco: "Contas a Pagar / Receber" },
      { id: "fin-classificacao",   label: "Gastos por Classificação",     path: "/relatorios/financeiro-classificacao",          moduleId: "fin_relatorios", bloco: "Contas a Pagar / Receber" },
      { id: "fin-fluxo-prev",      label: "Fluxo de Caixa Previsto",      path: "/financeiro/relatorios?aba=fluxo&tipo=previsto",  moduleId: "fin_relatorios", bloco: "Tesouraria" },
      { id: "fin-fluxo-real",      label: "Fluxo de Caixa Realizado",     path: "/financeiro/relatorios?aba=fluxo&tipo=realizado", moduleId: "fin_relatorios", bloco: "Tesouraria" },
      { id: "fin-posicao-banc",    label: "Posição Bancária",             path: "/financeiro/relatorios?aba=posicao",             moduleId: "fin_relatorios", bloco: "Tesouraria" },
      { id: "fin-endividamento",   label: "Endividamento",                path: "/financeiro/endividamento",                     moduleId: "fin_relatorios", bloco: "Complemento Financeiro" },
      { id: "fin-comercializacao", label: "Posição de Comercialização",   path: "/financeiro/relatorios?aba=comercializacao",     moduleId: "fin_relatorios", bloco: "Comercialização" },
      { type: "divider", label: "Complemento Financeiro" },
      { id: "fin-contratos",        label: "Contratos Financeiros",      path: "/financeiro/contratos",           moduleId: "fin_contratos"     },
      { id: "fin-apoio",            label: "Apoio Financeiro",           path: "/financeiro/apoio",               moduleId: "apoio_financeiro"  },
      { id: "fin-seguros",          label: "Seguros / Apólices",         path: "/financeiro/seguros",             moduleId: "fin_seguros"       },
      { id: "fin-consorcios",       label: "Consórcios",                 path: "/financeiro/consorcios",          moduleId: "fin_seguros"       },
      { type: "divider", label: "Cartões de Crédito" },
      { id: "fin-cartoes",         label: "Cartões de Crédito",           path: "/financeiro/cartoes",              moduleId: "fin_pagar"      },
    ],
  },

  {
    type: "group", id: "fiscal", label: "Fiscal", panel: true, minStep: 7,
    children: [
      { type: "divider", label: "Emissão e Controle" },
      { id: "fiscal-monitor",       label: "Monitor NF-e Emitidas",   path: "/fiscal",                             moduleId: "fiscal_nfe"  },
      { id: "fiscal-pendencias",    label: "Pendências Fiscais",       path: "/fiscal/pendencias",                  moduleId: "fiscal_nfe"  },
      { id: "fiscal-gnre",          label: "GNRE",                     path: "/fiscal/gnre",                        moduleId: "fiscal_nfe"  },
      { id: "fiscal-triangulacao",  label: "Triangulação de NF",       path: "/fiscal/triangulacao",               moduleId: "fiscal_nfe", disabled: true },
      { id: "fiscal-certificado",   label: "Certificado Digital",      path: "/fiscal?aba=certificado",             moduleId: "fiscal_nfe"  },
      { type: "divider", label: "Obrigações" },
      { id: "fiscal-lcdpr",         label: "LCDPR",                    path: "/lcdpr",                              moduleId: "fiscal_sped" },
      { id: "fiscal-sped-contabil", label: "SPED ECD — Contábil",      path: "/fiscal/sped-contabil",               moduleId: "fiscal_sped" },
      { id: "fiscal-esocial",       label: "eSocial Rural",            path: "/fiscal/esocial",                     moduleId: "fiscal_sped" },
      { id: "fiscal-ibs",           label: "IBS / CBS — 2027",         path: "/ibs",                                moduleId: "fiscal_sped" },
      { id: "fiscal-parcerias",     label: "Parcerias & Grupos",       path: "/parcerias",                          moduleId: "fiscal_sped" },
      { id: "fiscal-op-fiscais",    label: "Operações Fiscais",        path: "/configuracoes/modulos?aba=operacoes", moduleId: "conf_fiscal" },
    ],
  },

  {
    type: "group", id: "resultados", label: "Resultados", panel: true, minStep: 3,
    children: [
      { type: "divider", label: "Resultado Econômico" },
      { id: "res-dre",           label: "DRE Agrícola",            path: "/custos?aba=dre"                       },
      { id: "res-margens",       label: "Margens por Safra",       path: "/relatorios/dre"                       },
      { id: "res-dre-empresa",   label: "DRE por Empresa",         path: "/financeiro/empresas"                  },
      { type: "divider", label: "Custos" },
      { id: "res-custos-totais", label: "Custos Totais",           path: "/custos?aba=custostotais"              },
      { id: "res-custo-ha",      label: "Custo / ha",              path: "/custos?aba=custoha"                   },
      { id: "res-rateio",        label: "Regras de Rateio",        path: "/configuracoes/rateio"                 },
      { id: "res-aplicacoes",    label: "Aplicações por Ciclo",    path: "/lavoura/relatorios/aplicacoes"        },
      { id: "res-manutencao",    label: "Manutenção de Máquinas",  path: "/relatorios/manutencao"                },
      { type: "divider", label: "Desempenho" },
      { id: "res-produtividade", label: "Produtividade",           path: "/custos?aba=produtividade"             },
      { id: "res-fin-classif",   label: "Gastos por Classificação", path: "/relatorios/financeiro-classificacao", moduleId: "fin_relatorios" },
    ],
  },

  {
    type: "group", id: "configuracoes", label: "Configurações", panel: true, minStep: 0,
    children: [
      { type: "divider", label: "Sistema" },
      { id: "conf-modulos",         label: "Parâmetros Fiscais (NF-e)",  path: "/configuracoes/modulos",                              moduleId: "conf_fiscal"       },
      { id: "conf-op-fiscais",      label: "Operações Fiscais / CFOP",   path: "/configuracoes/modulos?aba=operacoes",                moduleId: "conf_fiscal"       },
      { id: "conf-op-gerenciais",   label: "Operações Gerenciais",       path: "/configuracoes/operacoes-gerenciais",                 moduleId: "conf_financeiro"   },
      { id: "conf-plano-contas",    label: "Plano de Contas",            path: "/configuracoes/plano-contas",                         moduleId: "conf_financeiro"   },
      { id: "conf-rateio",          label: "Regras de Rateio",           path: "/configuracoes/rateio"                                                              },
      { id: "conf-classificacao",   label: "Classificação Automática",   path: "/configuracoes/classificacao",                        moduleId: "conf_fiscal"       },
      { id: "conf-taxas-variaveis", label: "Taxas de Referência",        path: "/configuracoes/financeiras/taxas",                    moduleId: "conf_financeiro"   },
      { id: "conf-contabilidade",   label: "Contabilidade",              path: "/configuracoes/contabilidade",                        moduleId: "conf_contabilidade" },
      { type: "divider", label: "Usuários" },
      { id: "conf-usuarios",        label: "Usuários e Permissões",      path: "/configuracoes/usuarios",                             moduleId: "usuarios"          },
      { id: "conf-auditoria",       label: "Auditoria",                  path: "/configuracoes/auditoria"                                                           },
      { type: "divider", label: "Raccolto" },
      { id: "conf-integracoes",     label: "Integrações",                path: "/configuracoes/integracoes",                          moduleId: "conf_raccotlo" },
      { id: "conf-bot",             label: "Bot IA — WhatsApp",          path: "/configuracoes/bot",                                  moduleId: "conf_raccotlo" },
      { id: "conf-automacoes",      label: "Automações",                 path: "/configuracoes/automacoes",                           moduleId: "conf_raccotlo" },
      { id: "conf-importacao",      label: "Importações",                path: "/configuracoes/importacao",                           moduleId: "conf_raccotlo" },
      { id: "conf-backup",          label: "Backup & Restauração",       path: "/configuracoes/backup",                               moduleId: "conf_raccotlo" },
      { id: "conf-alertas",         label: "Alertas do Sistema",         path: "/controller",                                         moduleId: "conf_raccotlo" },
      { id: "conf-logs",            label: "Log do Sistema",             path: "/admin/logs",                                         moduleId: "conf_raccotlo" },
      { id: "conf-manual",          label: "Manual do Proprietário",     path: "/admin/manual",                                       moduleId: "conf_raccotlo" },
    ],
  },

  {
    type: "group", id: "ajuda", label: "Ajuda", panel: true, minStep: 0,
    children: [
      { type: "divider", label: "Suporte" },
      { id: "ajuda-learning", label: "Aprendizado", path: "/learning" },
      { id: "ajuda-suporte-remoto", label: "Suporte Remoto", path: "/ajuda/suporte-remoto" },
      // Suporte IA (Olívia) saiu daqui — agora é o balão flutuante global (OliviaWidget),
      // sempre acessível no canto inferior direito, sem precisar navegar até aqui.
    ],
  },
];

// ─── Mapeamento nav-id → módulos de permissão ───────────────
// Grupo visível se pelo menos 1 dos módulos for acessível.
// IDs batem com MODULOS_PERM em admin/usuarios/page.tsx
// Grupos sem entrada no mapa são sempre visíveis (dashboard, mapa, ajuda).
export const NAV_MODULE_MAP: Record<string, string[]> = {
  "producao":      ["lavoura_plantio", "lavoura_pulv", "lavoura_colheita", "lavoura_plan", "propriedades", "lavoura", "lavoura_planejamento", "lavoura_relatorios"],
  "documentos-fiscais": ["nf_entrada", "nf_servico", "fiscal_nfe", "transporte", "contratos"],
  "comercial":     ["contratos", "expedicao", "arrendamento", "transporte", "compras", "fin_relatorios"],
  "financeiro":    ["fin_receber", "fin_pagar", "fin_contratos", "fin_tesouraria", "fin_seguros", "apoio_financeiro", "fin_relatorios"],
  "fiscal":        ["fiscal_nfe", "fiscal_sped"],
  "resultados":    ["custos", "fin_relatorios", "bi"],
  "cadastros":     ["cadastros"],
  "configuracoes": ["conf_empresa", "conf_fiscal", "conf_financeiro", "conf_contabilidade", "conf_sistema", "conf_importacao", "usuarios", "logs"],
};
