// Catálogo único dos módulos do Arato — fonte de verdade para planos, Gestão Arato (Planos & Preços, Módulos do
// Sistema, Visão Geral), Usuários e Permissões e a regra de add-ons do login. Antes cada tela tinha a sua lista e elas
// divergiam (nomes diferentes, add-on que vinha no plano, módulo sem chave de liberação). Módulo novo entra AQUI.
//
//  planos            → planos que incluem o módulo (lib/planos.ts monta a lista de cada plano a partir daqui).
//  addon             → vendido à parte: só libera com chave ligada em Gestão Arato → Módulos do Sistema
//                      (conta_modulos). Não entra em plano nenhum.
//  exclusivoRaccolto → só a equipe Raccolto/BPO vê; cliente nunca, nem com plano ou chave.
//  emBreve           → ainda sem tela: aparece desligado em Módulos do Sistema e não pode ser ligado.
//  permissao         → aparece em Configurações → Usuários e Permissões (grupos de usuários).
//  contratavel       → aparece em Gestão Arato → Módulos do Sistema (liga/desliga por cliente).

import type { PlanoId } from "./planos";

export type AcaoModulo = "visualizar" | "criar" | "editar" | "excluir" | "exportar" | "aprovar" | "reprocessar";
export type GrupoModulo =
  | "Campo" | "Estoque" | "Comercial" | "Financeiro" | "Fiscal" | "Análise" | "Cadastros"
  | "Add-ons" | "Configurações" | "Sistema";

export interface ModuloDef {
  id: string;
  nome: string;
  grupo: GrupoModulo;
  acoes: AcaoModulo[];
  planos: PlanoId[];
  addon?: boolean;
  exclusivoRaccolto?: boolean;
  emBreve?: boolean;
  permissao: boolean;
  contratavel: boolean;
}

const CRUD: AcaoModulo[] = ["visualizar", "criar", "editar", "excluir"];
const CRUD_APROVAR: AcaoModulo[] = [...CRUD, "aprovar"];
const VER_EXPORTAR: AcaoModulo[] = ["visualizar", "exportar"];
const VER_EDITAR: AcaoModulo[] = ["visualizar", "editar"];
const TODOS: PlanoId[] = ["essencial", "gestao", "performance"];
const GESTAO_PERF: PlanoId[] = ["gestao", "performance"];
const PERF: PlanoId[] = ["performance"];

const m = (id: string, nome: string, grupo: GrupoModulo, acoes: AcaoModulo[], planos: PlanoId[], extra: Partial<ModuloDef> = {}): ModuloDef =>
  ({ id, nome, grupo, acoes, planos, permissao: true, contratavel: true, ...extra });

export const MODULOS: ModuloDef[] = [
  // ── Campo ──
  m("propriedades",     "Fazendas & Talhões",           "Campo",      CRUD,         TODOS),
  m("lavoura_plantio",  "Lavoura — Plantio",            "Campo",      CRUD,         TODOS),
  m("lavoura_pulv",     "Lavoura — Pulverização",       "Campo",      CRUD,         TODOS),
  m("lavoura_colheita", "Lavoura — Colheita",           "Campo",      CRUD_APROVAR, TODOS),
  m("lavoura_plan",     "Lavoura — Planejamento",       "Campo",      CRUD,         TODOS),
  // ── Comercial ──
  m("contratos",        "Comercialização de Grãos",     "Comercial",  CRUD_APROVAR, GESTAO_PERF),
  m("expedicao",        "Expedição de Grãos",           "Comercial",  CRUD,         GESTAO_PERF),
  m("arrendamento",     "Contratos de Arrendamento",    "Comercial",  CRUD,         GESTAO_PERF),
  // ── Estoque e compras ──
  m("estoque",          "Estoque",                      "Estoque",    CRUD,         GESTAO_PERF),
  m("compras",          "Pedidos de Compra",            "Estoque",    CRUD_APROVAR, GESTAO_PERF),
  m("nf_entrada",       "NF de Entrada (Produtos)",     "Estoque",    CRUD,         GESTAO_PERF),
  m("nf_servico",       "NF de Serviços",               "Estoque",    CRUD,         GESTAO_PERF),
  // ── Financeiro ──
  m("fin_receber",      "Contas a Receber",             "Financeiro", CRUD_APROVAR, TODOS),
  m("fin_pagar",        "Contas a Pagar",               "Financeiro", CRUD_APROVAR, TODOS),
  m("fin_contratos",    "Contratos Financeiros",        "Financeiro", CRUD,         GESTAO_PERF),
  // Folha nunca esteve em plano e aparece para todos os clientes; fica em todos para não sumir de ninguém.
  m("folha",            "Folha de Pagamento",           "Financeiro", [...CRUD, "reprocessar"], TODOS, { contratavel: false }),
  m("fin_tesouraria",   "Tesouraria",                   "Financeiro", CRUD,         GESTAO_PERF),
  m("fin_seguros",      "Seguros",                      "Financeiro", CRUD,         GESTAO_PERF),
  // ── Fiscal ──
  m("fiscal_nfe",       "Emissão NF-e (SEFAZ)",         "Fiscal",     ["visualizar", "criar", "aprovar"], PERF),
  m("fiscal_sped",      "SPED ECD / LCDPR",             "Fiscal",     VER_EXPORTAR, PERF),
  m("transporte",       "CT-e & MDF-e",                 "Fiscal",     CRUD_APROVAR, GESTAO_PERF),
  // ── Análise ──
  m("custos",           "Custos & DRE Agrícola",        "Análise",    VER_EXPORTAR, GESTAO_PERF),
  m("fin_relatorios",   "Relatórios Financeiros",       "Análise",    VER_EXPORTAR, GESTAO_PERF),
  // BI: exclusivo da equipe Raccolto por enquanto (decisão do dono, 16/11/2026).
  m("bi",               "BI — Raccolto Intelligence",   "Análise",    ["visualizar"], [], { exclusivoRaccolto: true, permissao: false, contratavel: false }),
  // ── Cadastros ──
  m("cadastros",        "Cadastros (tabelas auxiliares)", "Cadastros", CRUD,        TODOS),
  // ── Add-ons e módulos vendidos à parte ──
  // Empresas vem no Performance e pode ser liberado à parte para os outros planos.
  m("empresas",         "Módulo Empresas (cadastro, Folha e DRE por empresa)", "Add-ons", CRUD, PERF, { permissao: false }),
  m("algodao",          "Algodão",                      "Add-ons",    CRUD,         [], { addon: true }),
  m("protecao_margem",  "Proteção de Margem & Hedge",   "Add-ons",    CRUD,         [], { addon: true }),
  // Apoio Financeiro: add-on vendido à parte (decisão do dono, 16/11/2026) — antes vinha nos planos Gestão e Performance.
  m("apoio_financeiro", "Apoio Financeiro",             "Add-ons",    CRUD,         [], { addon: true }),
  m("cerealista",       "Cerealista",                   "Add-ons",    CRUD,         [], { addon: true, emBreve: true }),
  m("sementes",         "Sementes",                     "Add-ons",    CRUD,         [], { addon: true, emBreve: true }),
  m("pecuaria",         "Pecuária",                     "Add-ons",    CRUD,         [], { addon: true, emBreve: true }),
  m("ia_cedula",        "IA — Extração de Cédula",      "Add-ons",    ["visualizar", "criar"], [], { addon: true }),
  m("ia_contrato_venda","IA — Extração de Contrato de Venda", "Add-ons", ["visualizar", "criar"], [], { addon: true, permissao: false }),
  m("ia_pedido_compra", "IA — Lançamento de Pedido de Compra", "Add-ons", ["visualizar", "criar"], [], { addon: true, permissao: false }),
  m("ia_consorcio",     "IA — Importar Extrato de Consórcio",  "Add-ons", ["visualizar", "criar"], [], { addon: true, permissao: false }),
  m("ia_apolice",       "IA — Lançar Apólice de Seguro",       "Add-ons", ["visualizar", "criar"], [], { addon: true, permissao: false }),
  m("nf_confirmacao_entrega", "NF de Entrada — Enviar para Aprovação (estoque só após confirmar a entrega)", "Add-ons", ["visualizar"], [], { addon: true, permissao: false }),
  // ── Configurações: quem vê decide o grupo de usuários, não o plano (lib/permissoes-configuracao.ts) ──
  m("conf_empresa",       "Empresa & Certificado A1",          "Configurações", VER_EDITAR, [], { contratavel: false }),
  m("conf_fiscal",        "Parâmetros Fiscais (NF-e/MDF-e)",   "Configurações", VER_EDITAR, [], { contratavel: false }),
  m("conf_financeiro",    "Config. Financeira (Plano/Oper)",   "Configurações", VER_EDITAR, [], { contratavel: false }),
  m("conf_contabilidade", "Configuração Contábil",             "Configurações", VER_EDITAR, [], { contratavel: false }),
  m("conf_sistema",       "Sistema (Automações/Integrações)",  "Configurações", VER_EDITAR, [], { contratavel: false }),
  m("conf_importacao",    "Importação de Dados",               "Configurações", ["visualizar", "criar"], [], { contratavel: false }),
  m("usuarios",           "Usuários & Permissões",             "Configurações", CRUD, GESTAO_PERF),
  m("logs",               "Log do Sistema",                    "Configurações", VER_EXPORTAR, [], { contratavel: false }),
  m("conf_raccotlo",      "🔒 Gestão Raccolto (WhatsApp Bot / Integrações / Backup / Importação)", "Configurações", VER_EDITAR, [], { exclusivoRaccolto: true, contratavel: false }),
  // ── Recursos de plano sem tela própria de permissão ──
  m("configuracoes",    "Configurações",                "Sistema",    ["visualizar"], TODOS, { permissao: false, contratavel: false }),
  m("automacoes",       "Automações",                   "Sistema",    ["visualizar"], PERF, { permissao: false }),
  m("whatsapp_agente",  "Agente WhatsApp",              "Sistema",    ["visualizar"], PERF, { permissao: false }),
];

const POR_ID = new Map(MODULOS.map(x => [x.id, x]));

export function moduloPorId(id: string): ModuloDef | undefined {
  return POR_ID.get(id);
}

export function nomeModulo(id: string): string {
  return POR_ID.get(id)?.nome ?? id;
}

/** Módulos incluídos num plano, na ordem do catálogo. */
export function modulosDoPlano(plano: PlanoId): string[] {
  return MODULOS.filter(x => x.planos.includes(plano)).map(x => x.id);
}

/** Add-on opt-in: só libera com chave ligada para a conta (conta_modulos). */
export function ehAddon(id: string): boolean {
  return POR_ID.get(id)?.addon === true;
}

export function ehExclusivoRaccolto(id: string): boolean {
  return POR_ID.get(id)?.exclusivoRaccolto === true;
}

/** Módulos que aparecem em Configurações → Usuários e Permissões. */
export const MODULOS_PERMISSAO = MODULOS.filter(x => x.permissao);

/** Módulos que aparecem em Gestão Arato → Módulos do Sistema, agrupados na ordem do catálogo. */
export function gruposContrataveis(): { label: string; modulos: ModuloDef[] }[] {
  const grupos: { label: string; modulos: ModuloDef[] }[] = [];
  for (const x of MODULOS.filter(y => y.contratavel && !y.exclusivoRaccolto)) {
    const label = x.grupo === "Add-ons" ? "Add-ons Opcionais" : x.grupo;
    let g = grupos.find(y => y.label === label);
    if (!g) { g = { label, modulos: [] }; grupos.push(g); }
    g.modulos.push(x);
  }
  return grupos;
}
