"use client";
import { useState, useRef, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────
type Aba = "pessoas" | "cp" | "cr" | "insumos" | "produtos" | "maquinas" | "contratos_fin" | "arrendamentos";

type PessoaRow = {
  nome: string; tipo: string; cpf_cnpj: string; cliente: string; fornecedor: string;
  email: string; telefone: string; municipio: string; estado: string; cep: string;
  banco_nome: string; pix_chave: string; pix_tipo: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type LancRow = {
  descricao: string; categoria: string; data_lancamento: string;
  data_vencimento: string; valor: string; pessoa_cpf_cnpj: string;
  moeda: string; num_parcela: string; total_parcelas: string;
  tipo_documento_lcdpr: string; numero_documento: string;
  operacao_gerencial: string; produtor_cpf_cnpj: string;
  _status?: "ok" | "erro"; _msg?: string;
};
type InsumoRow = {
  nome: string; categoria: string; unidade: string; estoque: string;
  estoque_minimo: string; valor_unitario: string; fabricante: string; subgrupo: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type ProdutoRow = {
  nome: string; categoria: string; unidade: string; codigo_interno: string;
  ncm: string; estoque: string; estoque_minimo: string; valor_unitario: string;
  valor_venda: string; fabricante: string; marca: string; subgrupo: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type MaquinaRow = {
  nome: string; tipo: string; patrimonio: string; marca: string; modelo: string;
  ano: string; chassi: string; horimetro_atual: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type ContratoFinRow = {
  numero_contrato: string; descricao: string; credor: string; credor_cpf_cnpj: string;
  tipo: string; moeda: string; valor_total: string; data_contrato: string;
  data_liberacao: string; prazo_meses: string;
  periodicidade_pagamento: string; estrutura_pagamento: string;
  taxa_juros_am: string; taxa_juros_aa: string;
  iof_pct: string; tac_valor: string; linha_credito: string;
  tipo_amortizacao: string; cotacao_usd: string; auto_parcelas: string;
  produtor_cpf_cnpj: string; observacao: string;
  _status?: "ok" | "erro" | "duplicado" | "aviso"; _msg?: string; _cp_encontrados?: number;
};

type ArrendamentoRow = {
  proprietario_cpf_cnpj: string; proprietario_nome: string;
  descricao: string; area_ha: string; forma_pagamento: string;
  valor: string; sc_milho_ha: string;
  data_inicio: string; data_fim: string; observacao: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};

// ─── Templates ────────────────────────────────────────────────
const TEMPLATE_PESSOAS = [
  ["nome*", "tipo*", "cpf_cnpj", "cliente", "fornecedor", "email", "telefone", "municipio", "estado", "cep", "banco_nome", "pix_chave", "pix_tipo"],
  ["Bunge Brasil", "pj", "08.821.250/0001-60", "sim", "nao", "bunge@bunge.com", "(11)3305-0000", "São Paulo", "SP", "04710-070", "Caixa", "08821250000160", "cnpj"],
  ["João da Silva", "pf", "012.345.678-90", "nao", "sim", "joao@email.com", "(65)99999-0001", "Nova Mutum", "MT", "78450-000", "", "", ""],
];
const TEMPLATE_CP = [
  ["descricao*", "categoria*", "data_lancamento*", "data_vencimento*", "valor*", "pessoa_cpf_cnpj", "moeda", "num_parcela", "total_parcelas", "tipo_documento_lcdpr", "numero_documento", "operacao_gerencial", "produtor_cpf_cnpj"],
  ["Compra de Soja (Bunge)", "Comercialização", "2026-01-10", "2026-02-10", "150000.00", "08.821.250/0001-60", "BRL", "1", "1", "NF", "NF 001234", "Custeio Soja", "012.345.678-90"],
  ["Arrendamento Fazenda Sul", "Arrendamento", "2026-03-01", "2026-03-31", "45000.00", "012.345.678-90", "BRL", "1", "3", "RECIBO", "", "Arrendamento Terras", ""],
  ["Frete colheita safra 25/26", "Transporte", "2026-01-20", "2026-02-20", "28500.00", "", "BRL", "1", "1", "NF", "NF 005678", "Fretes e Carretos", ""],
];
const TEMPLATE_CR = [
  ["descricao*", "categoria*", "data_lancamento*", "data_vencimento*", "valor*", "pessoa_cpf_cnpj", "moeda", "num_parcela", "total_parcelas", "tipo_documento_lcdpr", "numero_documento", "operacao_gerencial", "produtor_cpf_cnpj"],
  ["Venda Soja Safra 25/26", "Comercialização", "2026-01-15", "2026-02-15", "280000.00", "08.821.250/0001-60", "BRL", "1", "2", "NF", "NF 008800", "Receita Soja", "012.345.678-90"],
  ["Prestação de Serviço", "Outros", "2026-02-01", "2026-03-01", "8500.00", "", "BRL", "1", "1", "RECIBO", "", "Receita Serviços", ""],
];
const TEMPLATE_INSUMOS = [
  ["nome*", "categoria*", "unidade*", "estoque", "estoque_minimo", "valor_unitario", "fabricante", "subgrupo"],
  ["Roundup WG", "defensivo", "kg", "500", "100", "42.50", "Monsanto", "Herbicida"],
  ["Uréia 45% N", "fertilizante", "sc", "200", "50", "185.00", "Yara", "Nitrogênio"],
  ["TMG 7062 IPRO", "semente", "sc", "80", "20", "335.00", "TMG Sementes", "Soja"],
];
const TEMPLATE_PRODUTOS = [
  ["nome*", "categoria*", "unidade*", "codigo_interno", "ncm", "estoque", "estoque_minimo", "valor_unitario", "valor_venda", "fabricante", "marca", "subgrupo"],
  ["Filtro de Óleo Motor", "peca", "un", "FLT-001", "84212300", "10", "2", "85.00", "120.00", "Fram", "Fram", "Filtros"],
  ["Fio Elétrico 2,5mm", "material", "m", "FIO-025", "85444929", "500", "100", "4.80", "7.50", "Prysmian", "Afumex", "Elétrico"],
  ["Papel A4 75g/m² (Resma)", "escritorio", "cx", "PAP-A4", "48025590", "20", "5", "22.00", "32.00", "Chamex", "Chamex", "Papelaria"],
  ["Óleo Hidráulico ISO 68", "uso_consumo", "L", "OLH-068", "27101980", "200", "50", "18.50", "0", "Ipiranga", "Lubrax", "Lubrificantes"],
  ["Correia Trapezoidal B-75", "peca", "un", "COR-B75", "40103900", "5", "2", "45.00", "68.00", "Gates", "Gates", "Transmissão"],
];

const TEMPLATE_MAQUINAS = [
  ["nome*", "tipo*", "patrimonio*", "marca", "modelo", "ano", "chassi", "horimetro_atual"],
  ["Trator John Deere 6110J", "trator", "Máquina 1", "John Deere", "6110J", "2022", "1RW6110JXNL123456", "4250"],
  ["Colhedora S760", "colhedora", "Máquina 2", "John Deere", "S760", "2021", "1HO760JXPL654321", "2180"],
  ["Plantadeira PD 1113", "plantadeira", "Máquina 3", "Plantio Direto", "PD 1113", "2020", "", "0"],
  ["Pulverizador Menegatti", "pulverizador", "Máquina 4", "Menegatti", "2500", "2023", "", "1100"],
  ["Caminhão Volvo FH 460", "caminhao", "Máquina 5", "Volvo", "FH 460", "2019", "9BW3HH4A8KB123456", "0"],
  ["Toyota Hilux SW4", "carro", "Carro 30", "Toyota", "Hilux SW4", "2023", "9BFBR49H0PB123456", "45000"],
];

const TEMPLATE_CONTRATOS_FIN = [
  ["numero_contrato*", "descricao*", "credor*", "credor_cpf_cnpj", "tipo*", "moeda", "valor_total*", "data_contrato*", "data_liberacao", "prazo_meses", "periodicidade_pagamento", "estrutura_pagamento", "taxa_juros_am", "taxa_juros_aa", "iof_pct", "tac_valor", "linha_credito", "tipo_amortizacao", "cotacao_usd", "auto_parcelas", "produtor_cpf_cnpj", "observacao"],
  ["959144", "Custeio Safra 2025/26", "SICOOB PRIMAVERA", "07.945.853/0001-14", "custeio", "BRL", "1656177.09", "2025-06-01", "2025-06-01", "12", "mensal", "simples", "0.89", "", "", "", "PRONAMP", "sac", "", "sim", "012.345.678-90", ""],
  ["131910484", "Investimento Trator BB", "BANCO DO BRASIL SA", "00.000.000/0001-91", "investimento", "BRL", "480000.00", "2024-03-15", "2024-03-15", "48", "mensal", "simples", "0.75", "", "0.38", "1200.00", "Moderfrota", "price", "", "sim", "012.345.678-90", "Trator John Deere"],
  ["50107386300", "CPR Soja Itaú", "ITAU UNIBANCO S.A.", "60.701.190/0001-04", "cpr", "USD", "1688649.36", "2025-01-10", "2025-01-10", "12", "bullet", "simples", "", "", "", "", "", "bullet", "5.85", "nao", "", ""],
  ["CR-2024-001", "FCO Rural 5 anos", "BANCO DO BRASIL SA", "00.000.000/0001-91", "investimento", "BRL", "2000000.00", "2024-05-01", "2024-05-01", "60", "semestral", "juros_semestral_capital_anual", "0.72", "", "0.38", "", "FCO Rural", "sac", "", "sim", "012.345.678-90", "Juros semestrais + amortização anual"],
];

const TEMPLATE_ARRENDAMENTOS = [
  ["proprietario_cpf_cnpj*", "proprietario_nome", "descricao", "area_ha*", "forma_pagamento*", "valor*", "sc_milho_ha", "data_inicio*", "data_fim*", "observacao"],
  ["012.345.678-90", "João da Silva", "Gleba Norte", "150.5", "sc_soja", "8.5", "", "2025-10-01", "2026-09-30", ""],
  ["987.654.321-00", "Maria Ferreira", "Gleba Sul", "200.0", "brl", "350.00", "", "2025-10-01", "2026-09-30", "R$/ha"],
  ["07.945.853/0001-14", "Espólio Santos", "Área Central", "80.0", "sc_milho", "5.0", "", "2026-01-01", "2026-12-31", ""],
  ["012.345.678-90", "João da Silva", "Fundo do Morro", "120.0", "sc_soja_milho", "5.0", "3.0", "2025-10-01", "2026-09-30", "5 sc soja + 3 sc milho por ha"],
];

const INSTRUCOES_CONTRATOS_FIN = [
  ["INSTRUÇÕES — IMPORTAÇÃO DE CONTRATOS FINANCEIROS"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• numero_contrato: número do contrato no banco/instituição (deve ser único)"],
  ["• tipo: custeio, investimento, cpr, egf, securitizacao, outros"],
  ["• moeda: BRL ou USD"],
  ["• valor_total: valor total financiado (sem R$, ex: 1500000.00)"],
  ["• data_contrato: data de assinatura no formato AAAA-MM-DD"],
  ["• data_liberacao: data em que o recurso foi liberado (início do cronograma)"],
  ["• prazo_meses: duração total do contrato em meses (ex: 12, 60)"],
  ["  O número de parcelas geradas depende da periodicidade_pagamento"],
  ["• periodicidade_pagamento: mensal, bimestral, trimestral, semestral, anual ou bullet"],
  ["  mensal    → 1 parcela por mês (padrão)"],
  ["  bimestral → 1 parcela a cada 2 meses"],
  ["  trimestral→ 1 parcela a cada 3 meses"],
  ["  semestral → 1 parcela a cada 6 meses"],
  ["  anual     → 1 parcela por ano"],
  ["  bullet    → somente uma parcela no final (não usa estrutura_pagamento)"],
  ["• estrutura_pagamento: define o que cada parcela contém"],
  ["  simples                    → cada parcela inclui amortização + juros do período (padrão)"],
  ["  juros_semestral_capital_anual → juros semestrais + amortização anual (SAC)"],
  ["    Gera 2 tipos de lançamento: juros a cada 6 meses, capital+juros a cada 12 meses"],
  ["    Comum em FCO Rural, BNDES e contratos com carência parcial"],
  ["• taxa_juros_am: taxa mensal em % (ex: 0.89). Informe AM OU AA, não os dois"],
  ["• taxa_juros_aa: taxa anual em % (ex: 11.16) — convertida automaticamente para AM"],
  ["• iof_pct: IOF em % (ex: 0.38)"],
  ["• tac_valor: Tarifa de Abertura de Crédito em R$ (ex: 1200.00)"],
  ["• linha_credito: linha de crédito (ex: PRONAMP, Moderfrota, FCO Rural)"],
  ["• tipo_amortizacao: sac, price ou bullet"],
  ["  sac   → amortização constante, parcelas decrescentes"],
  ["  price → Tabela Price (parcelas fixas)"],
  ["  bullet → paga só juros em cada período, principal no vencimento"],
  ["• cotacao_usd: só para moeda=USD (ex: 5.85)"],
  ["• auto_parcelas: sim ou nao — gera o cronograma automaticamente"],
  ["• credor_cpf_cnpj: CNPJ/CPF do credor para vincular ao cadastro de Pessoas"],
  ["• produtor_cpf_cnpj: CPF/CNPJ do produtor responsável (obrigatório para LCDPR)"],
  ["  Em fazendas com mais de um produtor, identifica quem assinou o contrato"],
  [""],
  ["⚠️  AVISO — Evitar duplicação do financeiro:"],
  ["  Se o numero_contrato já existir em lançamentos CP, o sistema vincula os CP"],
  ["  existentes sem criar duplicatas (auto_parcelas é ignorado nesse caso)."],
  [""],
  ["Exemplos de periodicidade + estrutura:"],
  ["  Custeio mensal SAC        → periodicidade=mensal,    estrutura=simples,                    tipo_amortizacao=sac"],
  ["  Custeio bullet            → periodicidade=bullet,    estrutura=simples,                    tipo_amortizacao=bullet"],
  ["  FCO Rural juros semestrais→ periodicidade=semestral, estrutura=juros_semestral_capital_anual, tipo_amortizacao=sac"],
  ["  Investimento Price mensal → periodicidade=mensal,    estrutura=simples,                    tipo_amortizacao=price"],
];

const INSTRUCOES_CP_CR = [
  ["INSTRUÇÕES — IMPORTAÇÃO DE CONTAS A PAGAR / RECEBER"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• pessoa_cpf_cnpj: CPF/CNPJ do fornecedor/cliente — vincula ao cadastro de Pessoas"],
  ["• moeda: BRL, USD ou barter"],
  ["• tipo_documento_lcdpr: RECIBO, NF, DUPLICATA, CHEQUE, PIX, TED ou OUTROS"],
  ["• num_parcela / total_parcelas: ex: 1 e 3 = primeira de 3 parcelas"],
  ["• numero_documento: número da NF ou documento (ex: NF 001234, RECIBO 005)"],
  ["• operacao_gerencial: nome exato da operação gerencial cadastrada no sistema"],
  ["  Usado para classificação no DRE. Deixe em branco se não souber."],
  ["  Exemplos: 'Custeio Soja', 'Arrendamento Terras', 'Fretes e Carretos'"],
  ["• produtor_cpf_cnpj: CPF do produtor responsável pelo lançamento (LCDPR)"],
  ["  Em fazendas com mais de um produtor — identifica de quem é a obrigação"],
];

const INSTRUCOES_ARRENDAMENTOS = [
  ["INSTRUÇÕES — IMPORTAÇÃO DE ARRENDAMENTOS"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• proprietario_cpf_cnpj: CPF ou CNPJ do proprietário da terra — vincula ao cadastro de Pessoas"],
  ["• proprietario_nome: apenas referência visual; não cria pessoa automaticamente"],
  ["• descricao: nome ou identificação do arrendamento (ex: 'Gleba Norte', 'Fazenda Rio Verde')"],
  ["• area_ha: área arrendada em hectares (ex: 150.5)"],
  ["• forma_pagamento: sc_soja, sc_milho, sc_soja_milho ou brl"],
  ["  → sc_soja: valor = sacas de soja por hectare por safra"],
  ["  → sc_milho: valor = sacas de milho por hectare por safra"],
  ["  → sc_soja_milho: pagamento misto — informe sc_soja em 'valor' e sc_milho em 'sc_milho_ha'"],
  ["  → brl: valor = R$ por hectare (gera conta a pagar no financeiro)"],
  ["• valor: para sc_soja/sc_milho = sacas/ha. Para brl = R$/ha. Para sc_soja_milho = sacas de soja/ha"],
  ["• sc_milho_ha: somente para forma_pagamento=sc_soja_milho — sacas de milho por hectare"],
  ["  Exemplo: 5 sc soja/ha + 3 sc milho/ha → valor=5.0, sc_milho_ha=3.0"],
  ["• data_inicio / data_fim: AAAA-MM-DD"],
  [""],
  ["Efeitos automáticos:"],
  ["  sc_soja / sc_milho / sc_soja_milho: compromete volume no BI de Grãos Comprometidos"],
  ["  brl: gera conta a pagar proporcional ao período informado"],
];

const INSTRUCOES_MAQUINAS = [
  ["INSTRUÇÕES — CADASTRO DE MÁQUINAS E VEÍCULOS"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• patrimonio: número ou código único de patrimônio da fazenda (ex: 'Máquina 1', 'Carro 30')"],
  ["  → Usado pelo WhatsApp Bot para identificar a máquina ('abasteça a Maquina 1')"],
  ["  → Os números NÃO se repetem entre máquinas e carros — são sequenciais"],
  ["• tipo: trator, colhedora, plantadeira, pulverizador, caminhao, carreta, carro, implemento, outro"],
  ["• ano: somente o número (ex: 2023)"],
  ["• chassi: opcional — 17 caracteres alfanuméricos"],
  ["• horimetro_atual: horas (tratores/colhedoras) ou km (carros/caminhões) — número sem unidade"],
  [""],
  ["Tipos disponíveis:"],
  ["  trator        → tratores de todas as potências"],
  ["  colhedora     → colhedoras de grãos"],
  ["  plantadeira   → plantadeiras e semeadoras"],
  ["  pulverizador  → pulverizadores autopropelidos e de barra"],
  ["  caminhao      → caminhões (graneleiros, basculantes, etc.)"],
  ["  carreta       → carretas e implementos de transporte"],
  ["  carro         → veículos de passeio e utilitários"],
  ["  implemento    → demais implementos (grades, subsoladores, etc.)"],
  ["  outro         → equipamentos não classificados acima"],
];

const INSTRUCOES_PRODUTOS = [
  ["INSTRUÇÕES — CADASTRO DE PRODUTOS"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• categoria: peca, material, uso_consumo, escritorio, outros"],
  ["• unidade: kg, g, L, mL, sc, t, un, m, m2, cx, pc, par, outros"],
  ["• codigo_interno: código próprio da fazenda (opcional, ex: FLT-001)"],
  ["• ncm: 8 dígitos sem pontos (ex: 84212300) — obrigatório para NF-e"],
  ["• estoque / estoque_minimo: quantidade atual em estoque"],
  ["• valor_unitario: custo de compra (sem R$, ex: 85.00)"],
  ["• valor_venda: preço de venda ou repasse (0 se não se aplica)"],
  ["• fabricante: razão social ou nome do fabricante"],
  ["• marca: marca comercial do produto"],
  ["• subgrupo: classificação interna livre (ex: Filtros, Elétrico)"],
  [""],
  ["Categorias disponíveis:"],
  ["  peca        → peças de reposição para máquinas e implementos"],
  ["  material    → materiais de construção, fios, tubos, etc."],
  ["  uso_consumo → lubrificantes, combustível, itens consumíveis"],
  ["  escritorio  → papelaria, cartuchos, materiais de escritório"],
  ["  outros      → demais itens que não se enquadram acima"],
];

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

function downloadTemplate(aba: Aba) {
  import("xlsx").then(({ utils, writeFile }) => {
    const wb = utils.book_new();
    const templates: Record<Aba, (string | number)[][]> = {
      pessoas:        TEMPLATE_PESSOAS,
      cp:             TEMPLATE_CP,
      cr:             TEMPLATE_CR,
      insumos:        TEMPLATE_INSUMOS,
      produtos:       TEMPLATE_PRODUTOS,
      maquinas:       TEMPLATE_MAQUINAS,
      contratos_fin:  TEMPLATE_CONTRATOS_FIN,
      arrendamentos:  TEMPLATE_ARRENDAMENTOS,
    };
    const ws = utils.aoa_to_sheet(templates[aba]);
    ws["!cols"] = templates[aba][0].map(() => ({ wch: 26 }));
    utils.book_append_sheet(wb, ws, "Dados");

    const instrBase = [
      ["INSTRUÇÕES DE PREENCHIMENTO"],
      [""],
      ["• Campos com * são obrigatórios"],
      ["• Não altere os nomes das colunas (linha 1)"],
      ["• Datas no formato AAAA-MM-DD (ex: 2026-03-15)"],
      ["• Valores numéricos sem símbolo R$ (ex: 15000.50)"],
      ["• tipo: pf ou pj"],
      ["• cliente / fornecedor: sim ou nao"],
      ["• moeda: BRL, USD ou barter"],
      ["• tipo_documento_lcdpr: RECIBO, NF, DUPLICATA, CHEQUE, PIX, TED ou OUTROS"],
      ["• pix_tipo: cpf, cnpj, email, telefone ou aleatoria"],
      ["• categoria insumo: semente, fertilizante, defensivo, inoculante, combustivel, peca, material, uso_consumo, escritorio, outros"],
      ["• unidade: kg, g, L, mL, sc, t, un, m, m2, cx, pc, par, outros"],
    ];
    const instrMap: Record<Aba, (string | number)[][]> = {
      pessoas:        instrBase,
      cp:             INSTRUCOES_CP_CR,
      cr:             INSTRUCOES_CP_CR,
      insumos:        instrBase,
      produtos:       INSTRUCOES_PRODUTOS,
      maquinas:       INSTRUCOES_MAQUINAS,
      contratos_fin:  INSTRUCOES_CONTRATOS_FIN,
      arrendamentos:  INSTRUCOES_ARRENDAMENTOS,
    };
    const instrucoes = utils.aoa_to_sheet(instrMap[aba]);
    utils.book_append_sheet(wb, instrucoes, "Instruções");

    const nomes: Record<Aba, string> = {
      pessoas:        "template_pessoas.xlsx",
      cp:             "template_contas_pagar.xlsx",
      cr:             "template_contas_receber.xlsx",
      insumos:        "template_insumos.xlsx",
      produtos:       "template_produtos.xlsx",
      maquinas:       "template_maquinas_veiculos.xlsx",
      contratos_fin:  "template_contratos_financeiros.xlsx",
      arrendamentos:  "template_arrendamentos.xlsx",
    };
    writeFile(wb, nomes[aba]);
  });
}

// ─── Parse XLSX ───────────────────────────────────────────────
function parseXlsx(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      import("xlsx").then(({ read, utils }) => {
        try {
          const wb = read(e.target!.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          // Strip asterisks from header keys (templates use nome*, categoria* etc. to mark required fields)
          const rows = raw.map(row => {
            const cleaned: Record<string, string> = {};
            for (const [k, v] of Object.entries(row)) {
              cleaned[k.replace(/\*/g, "").trim()] = String(v);
            }
            return cleaned;
          });
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      });
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Validações ───────────────────────────────────────────────
function validarPessoa(r: Record<string, string>): PessoaRow {
  const row = r as unknown as PessoaRow;
  if (!row.nome?.trim())  return { ...row, _status: "erro", _msg: "nome obrigatório" };
  if (!row.tipo || !["pf","pj"].includes(row.tipo.toLowerCase()))
    return { ...row, _status: "erro", _msg: "tipo deve ser pf ou pj" };
  return { ...row, tipo: row.tipo.toLowerCase(), _status: "ok", _msg: "" };
}

function validarLanc(r: Record<string, string>): LancRow {
  const row = r as unknown as LancRow;
  if (!row.descricao?.trim())       return { ...row, _status: "erro", _msg: "descricao obrigatória" };
  if (!row.categoria?.trim())       return { ...row, _status: "erro", _msg: "categoria obrigatória" };
  if (!row.data_lancamento?.trim()) return { ...row, _status: "erro", _msg: "data_lancamento obrigatória" };
  if (!row.data_vencimento?.trim()) return { ...row, _status: "erro", _msg: "data_vencimento obrigatória" };
  const v = parseFloat(String(row.valor).replace(",", "."));
  if (isNaN(v) || v <= 0)           return { ...row, _status: "erro", _msg: "valor inválido" };
  return { ...row, _status: "ok", _msg: "" };
}

function validarInsumo(r: Record<string, string>): InsumoRow {
  const row = r as unknown as InsumoRow;
  if (!row.nome?.trim())      return { ...row, _status: "erro", _msg: "nome obrigatório" };
  if (!row.categoria?.trim()) return { ...row, _status: "erro", _msg: "categoria obrigatória" };
  if (!row.unidade?.trim())   return { ...row, _status: "erro", _msg: "unidade obrigatória" };
  return { ...row, _status: "ok", _msg: "" };
}

const CATS_PRODUTO = ["peca","material","uso_consumo","escritorio","outros"];
const UNITS_VALIDAS = ["kg","g","L","mL","sc","t","un","m","m2","cx","pc","par","outros"];

function validarProduto(r: Record<string, string>): ProdutoRow {
  const row = r as unknown as ProdutoRow;
  if (!row.nome?.trim())
    return { ...row, _status: "erro", _msg: "nome obrigatório" };
  if (!row.categoria?.trim() || !CATS_PRODUTO.includes(row.categoria.trim().toLowerCase()))
    return { ...row, _status: "erro", _msg: `categoria inválida — use: ${CATS_PRODUTO.join(", ")}` };
  if (!row.unidade?.trim() || !UNITS_VALIDAS.includes(row.unidade.trim()))
    return { ...row, _status: "erro", _msg: `unidade inválida — use: ${UNITS_VALIDAS.join(", ")}` };
  if (row.ncm?.trim() && !/^\d{8}$/.test(row.ncm.trim()))
    return { ...row, _status: "erro", _msg: "NCM deve ter 8 dígitos numéricos (ex: 84212300)" };
  return { ...row, categoria: row.categoria.trim().toLowerCase(), unidade: row.unidade.trim(), _status: "ok", _msg: "" };
}

const TIPOS_CONTRATO_FIN = ["custeio","investimento","cpr","egf","securitizacao","outros"];
const TIPOS_AMORTIZACAO = ["sac","price","bullet"];
const PERIODICIDADES = ["mensal","bimestral","trimestral","semestral","anual","bullet"];
const ESTRUTURAS_PAGAMENTO = ["simples","juros_semestral_capital_anual"];
const MESES_POR_PERIODO: Record<string, number> = { mensal:1, bimestral:2, trimestral:3, semestral:6, anual:12 };
const FORMAS_PAGAMENTO_ARR = ["sc_soja","sc_milho","sc_soja_milho","brl"];

function validarContratoFin(r: Record<string, string>): ContratoFinRow {
  const row = r as unknown as ContratoFinRow;
  if (!row.numero_contrato?.trim()) return { ...row, _status: "erro", _msg: "numero_contrato obrigatório" };
  if (!row.descricao?.trim())       return { ...row, _status: "erro", _msg: "descricao obrigatória" };
  if (!row.credor?.trim())          return { ...row, _status: "erro", _msg: "credor obrigatório" };
  const tipo = (row.tipo || "").trim().toLowerCase();
  if (!TIPOS_CONTRATO_FIN.includes(tipo))
    return { ...row, _status: "erro", _msg: `tipo inválido — use: ${TIPOS_CONTRATO_FIN.join(", ")}` };
  const valor = parseFloat(String(row.valor_total).replace(",", "."));
  if (isNaN(valor) || valor <= 0) return { ...row, _status: "erro", _msg: "valor_total inválido" };
  if (!row.data_contrato?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.data_contrato.trim()))
    return { ...row, _status: "erro", _msg: "data_contrato deve ser AAAA-MM-DD" };
  if (row.data_liberacao?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.data_liberacao.trim()))
    return { ...row, _status: "erro", _msg: "data_liberacao deve ser AAAA-MM-DD" };
  if (row.prazo_meses?.trim() && (isNaN(parseInt(row.prazo_meses)) || parseInt(row.prazo_meses) < 1))
    return { ...row, _status: "erro", _msg: "prazo_meses deve ser número inteiro positivo" };
  const tipoAmort = (row.tipo_amortizacao || "").trim().toLowerCase();
  if (tipoAmort && !TIPOS_AMORTIZACAO.includes(tipoAmort))
    return { ...row, _status: "erro", _msg: `tipo_amortizacao deve ser: ${TIPOS_AMORTIZACAO.join(", ")}` };
  const periodicidade = (row.periodicidade_pagamento || "mensal").trim().toLowerCase();
  if (row.periodicidade_pagamento?.trim() && !PERIODICIDADES.includes(periodicidade))
    return { ...row, _status: "erro", _msg: `periodicidade_pagamento deve ser: ${PERIODICIDADES.join(", ")}` };
  const estrutura = (row.estrutura_pagamento || "simples").trim().toLowerCase();
  if (row.estrutura_pagamento?.trim() && !ESTRUTURAS_PAGAMENTO.includes(estrutura))
    return { ...row, _status: "erro", _msg: `estrutura_pagamento deve ser: ${ESTRUTURAS_PAGAMENTO.join(", ")}` };
  return { ...row, tipo, tipo_amortizacao: tipoAmort || "sac", periodicidade_pagamento: periodicidade, estrutura_pagamento: estrutura, _status: "ok", _msg: "" };
}

function validarArrendamento(r: Record<string, string>): ArrendamentoRow {
  const row = r as unknown as ArrendamentoRow;
  if (!row.proprietario_cpf_cnpj?.trim()) return { ...row, _status: "erro", _msg: "proprietario_cpf_cnpj obrigatório" };
  const area = parseFloat(String(row.area_ha).replace(",", "."));
  if (isNaN(area) || area <= 0) return { ...row, _status: "erro", _msg: "area_ha inválida" };
  const forma = (row.forma_pagamento || "").trim().toLowerCase();
  if (!FORMAS_PAGAMENTO_ARR.includes(forma))
    return { ...row, _status: "erro", _msg: `forma_pagamento deve ser: ${FORMAS_PAGAMENTO_ARR.join(", ")}` };
  const valor = parseFloat(String(row.valor).replace(",", "."));
  if (isNaN(valor) || valor <= 0) return { ...row, _status: "erro", _msg: "valor inválido" };
  if (forma === "sc_soja_milho" && row.sc_milho_ha?.trim()) {
    const scM = parseFloat(String(row.sc_milho_ha).replace(",", "."));
    if (isNaN(scM) || scM < 0) return { ...row, _status: "erro", _msg: "sc_milho_ha inválido" };
  }
  if (!row.data_inicio?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.data_inicio.trim()))
    return { ...row, _status: "erro", _msg: "data_inicio deve ser AAAA-MM-DD" };
  if (!row.data_fim?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.data_fim.trim()))
    return { ...row, _status: "erro", _msg: "data_fim deve ser AAAA-MM-DD" };
  return { ...row, forma_pagamento: forma, _status: "ok", _msg: "" };
}

// Tipos aceitos pelo banco — mapeamento de aliases comuns do Excel
const TIPOS_MAQUINA_DB = ["trator","colheitadeira","pulverizador","plantadeira","caminhao","carro","implemento","outro"];
const TIPOS_MAQUINA_ALIAS: Record<string, string> = {
  colhedora:    "colheitadeira",
  colheitadeira: "colheitadeira",
  carreta:      "implemento",
  carretinha:   "implemento",
  moto:         "outro",
  motocicleta:  "outro",
};
const TIPOS_MAQUINA = [...TIPOS_MAQUINA_DB, ...Object.keys(TIPOS_MAQUINA_ALIAS)];

function normalizarTipoMaquina(t: string): string {
  const lower = t.trim().toLowerCase();
  return TIPOS_MAQUINA_ALIAS[lower] ?? lower;
}

// Remove número de patrimônio no início do nome: "01 TRATOR..." → "TRATOR..."
// Padrões: "01 ", "(01) ", "(01)", "01." etc.
function limparNomeMaquina(nome: string): string {
  return nome.trim().replace(/^\(?0*\d+\)?\s*[.\-]?\s*/, "").trim();
}

function validarMaquina(r: Record<string, string>): MaquinaRow {
  const row = r as unknown as MaquinaRow;
  if (!row.nome?.trim())       return { ...row, _status: "erro", _msg: "nome obrigatório" };
  const tipoNorm = normalizarTipoMaquina(row.tipo?.trim() || "");
  if (!row.tipo?.trim() || !TIPOS_MAQUINA_DB.includes(tipoNorm))
    return { ...row, _status: "erro", _msg: `tipo inválido — use: ${TIPOS_MAQUINA_DB.join(", ")}` };
  if (!row.patrimonio?.trim()) return { ...row, _status: "erro", _msg: "patrimônio obrigatório" };
  if (row.ano?.trim() && !/^\d{4}$/.test(row.ano.trim()))
    return { ...row, _status: "erro", _msg: "ano deve ter 4 dígitos (ex: 2023)" };
  return {
    ...row,
    nome: limparNomeMaquina(row.nome),
    tipo: tipoNorm,
    _status: "ok",
    _msg: "",
  };
}

// ─── Componente UploadZone ────────────────────────────────────
function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => ref.current?.click()}
      style={{
        border: `2px dashed ${drag ? "#1A4870" : "#DDE2EE"}`,
        borderRadius: 10,
        padding: "40px 24px",
        textAlign: "center",
        cursor: "pointer",
        background: drag ? "#D5E8F5" : "#F4F6FA",
        transition: "all 0.15s",
      }}
    >
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }}
      />
      <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1A4870", marginBottom: 4 }}>
        Arraste o arquivo XLSX aqui
      </div>
      <div style={{ fontSize: 12, color: "#888" }}>ou clique para selecionar</div>
    </div>
  );
}

// ─── Preview Table ────────────────────────────────────────────
function PreviewTable({ rows, colunas }: { rows: Record<string, unknown>[]; colunas: string[] }) {
  if (!rows.length) return null;
  return (
    <div style={{ overflowX: "auto", marginTop: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#F4F6FA" }}>
            <th style={{ padding: "6px 10px", border: "0.5px solid #DDE2EE", textAlign: "left", fontWeight: 600, color: "#555" }}>#</th>
            {colunas.map(c => (
              <th key={c} style={{ padding: "6px 10px", border: "0.5px solid #DDE2EE", textAlign: "left", fontWeight: 600, color: "#555" }}>{c}</th>
            ))}
            <th style={{ padding: "6px 10px", border: "0.5px solid #DDE2EE", textAlign: "left", fontWeight: 600, color: "#555" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const status = (row as Record<string, unknown>)._status as string;
            const msg    = (row as Record<string, unknown>)._msg as string;
            return (
              <tr key={i} style={{ background: status === "erro" ? "#FFF0F0" : status === "duplicado" ? "#FFFBE0" : status === "aviso" ? "#FFF8EC" : "white" }}>
                <td style={{ padding: "5px 10px", border: "0.5px solid #DDE2EE", color: "#888" }}>{i + 1}</td>
                {colunas.map(c => (
                  <td key={c} style={{ padding: "5px 10px", border: "0.5px solid #DDE2EE", color: "#1a1a1a", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {String((row as Record<string, unknown>)[c] ?? "")}
                  </td>
                ))}
                <td style={{ padding: "5px 10px", border: "0.5px solid #DDE2EE" }}>
                  {status === "ok"        && <span style={{ color: "#16A34A", fontWeight: 600 }}>✓ ok</span>}
                  {status === "aviso"     && <span style={{ color: "#C9921B", fontWeight: 600 }}>⚡ {msg}</span>}
                  {status === "duplicado" && <span style={{ color: "#888",    fontWeight: 600 }}>⏭ {msg || "duplicado"}</span>}
                  {status === "erro"      && <span style={{ color: "#E24B4A", fontWeight: 600 }}>✗ {msg}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Resultado resumo ─────────────────────────────────────────
function Resultado({ ok, erros, duplicados, total }: { ok: number; erros: number; duplicados: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
      {[
        { label: "Total lidas", valor: total,      cor: "#1A4870", bg: "#D5E8F5" },
        { label: "Importadas",  valor: ok,          cor: "#16A34A", bg: "#DCFCE7" },
        { label: "Duplicadas",  valor: duplicados,  cor: "#C9921B", bg: "#FBF3E0" },
        { label: "Com erro",    valor: erros,       cor: "#E24B4A", bg: "#FFF0F0" },
      ].map(({ label, valor, cor, bg }) => (
        <div key={label} style={{ padding: "10px 20px", borderRadius: 8, background: bg, border: `0.5px solid ${cor}40` }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: cor }}>{valor}</div>
          <div style={{ fontSize: 12, color: cor }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Referência de categorias (Produtos) ─────────────────────
function RefCategorias() {
  return (
    <div style={{ marginTop: 16, background: "#F4F6FA", borderRadius: 10, border: "0.5px solid #DDE2EE", padding: "14px 16px" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#1A4870", marginBottom: 10 }}>
        Categorias de Produtos
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
        {[
          { cat: "peca",        label: "Peça",          desc: "Reposição de máquinas e implementos" },
          { cat: "material",    label: "Material",      desc: "Construção, fios, tubos, chapas" },
          { cat: "uso_consumo", label: "Uso e Consumo", desc: "Lubrificantes, combustível, consumíveis" },
          { cat: "escritorio",  label: "Escritório",    desc: "Papelaria, cartuchos, informática" },
          { cat: "outros",      label: "Outros",        desc: "Demais itens não classificados" },
        ].map(({ cat, label, desc }) => (
          <div key={cat} style={{ padding: "8px 12px", background: "white", borderRadius: 8, border: "0.5px solid #DDE2EE" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{label}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{desc}</div>
            <code style={{ fontSize: 11, color: "#1A4870", background: "#D5E8F5", padding: "1px 5px", borderRadius: 4, marginTop: 4, display: "inline-block" }}>{cat}</code>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "#888" }}>
        <strong>Unidades válidas:</strong> kg · g · L · mL · sc · t · un · m · m² · cx · pc · par · outros
        &nbsp;&nbsp;|&nbsp;&nbsp;
        <strong>NCM:</strong> 8 dígitos sem pontos (ex: 84212300) — consultar tabela TIPI
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────
export default function ImportacaoPage() {
  const { fazendaId, userRole } = useAuth();
  const [aba, setAba] = useState<Aba>("pessoas");

  // Estados por aba
  const [pessoasRows,  setPessoasRows]  = useState<PessoaRow[]>([]);
  const [cpRows,       setCpRows]       = useState<LancRow[]>([]);
  const [crRows,       setCrRows]       = useState<LancRow[]>([]);
  const [insumosRows,  setInsumosRows]  = useState<InsumoRow[]>([]);
  const [produtosRows, setProdutosRows] = useState<ProdutoRow[]>([]);
  const [maquinasRows,       setMaquinasRows]       = useState<MaquinaRow[]>([]);
  const [contratoFinRows,    setContratoFinRows]    = useState<ContratoFinRow[]>([]);
  const [arrendamentosRows,  setArrendamentosRows]  = useState<ArrendamentoRow[]>([]);

  const [loadingPessoas,     setLoadingPessoas]     = useState(false);
  const [loadingCp,          setLoadingCp]          = useState(false);
  const [loadingCr,          setLoadingCr]          = useState(false);
  const [loadingInsumos,     setLoadingInsumos]     = useState(false);
  const [loadingProdutos,    setLoadingProdutos]    = useState(false);
  const [loadingMaquinas,    setLoadingMaquinas]    = useState(false);
  const [loadingContratoFin, setLoadingContratoFin] = useState(false);
  const [loadingArrendamentos, setLoadingArrendamentos] = useState(false);

  type Resultado = { ok: number; erros: number; duplicados: number };
  const [resultPessoas,      setResultPessoas]      = useState<Resultado | null>(null);
  const [resultCp,           setResultCp]           = useState<Resultado | null>(null);
  const [resultCr,           setResultCr]           = useState<Resultado | null>(null);
  const [resultInsumos,      setResultInsumos]      = useState<Resultado | null>(null);
  const [resultProdutos,     setResultProdutos]     = useState<Resultado | null>(null);
  const [resultMaquinas,     setResultMaquinas]     = useState<Resultado | null>(null);
  const [resultContratoFin,  setResultContratoFin]  = useState<Resultado | null>(null);
  const [resultArrendamentos, setResultArrendamentos] = useState<Resultado | null>(null);

  // ─── Acesso restrito ──────────────────────────────────────
  if (userRole !== "raccotlo") {
    return (
      <>
        <TopNav />
        <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: "#1a1a1a" }}>Acesso restrito</div>
          <div style={{ fontSize: 14, marginTop: 8 }}>Esta área é exclusiva para a equipe Raccolto.</div>
        </div>
      </>
    );
  }

  // ─── Handlers de upload ───────────────────────────────────
  async function handleFilePessoas(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarPessoa(r));
    // Duplicados dentro do arquivo
    const cpfs = rows.map(r => r.cpf_cnpj?.replace(/\D/g, "")).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.cpf_cnpj) {
        const cpf = r.cpf_cnpj.replace(/\D/g, "");
        if (cpf && cpfs.indexOf(cpf) !== i) r._status = "duplicado";
      }
    });
    // Duplicados já existentes no banco
    if (fazendaId) {
      const { data: existentes } = await supabase
        .from("pessoas").select("cpf_cnpj").eq("fazenda_id", fazendaId);
      const cpfsExistentes = new Set((existentes ?? []).map((p: { cpf_cnpj: string | null }) => (p.cpf_cnpj ?? "").replace(/\D/g, "")).filter(Boolean));
      rows.forEach(r => {
        if (r._status === "ok" && r.cpf_cnpj) {
          if (cpfsExistentes.has(r.cpf_cnpj.replace(/\D/g, ""))) r._status = "duplicado";
        }
      });
    }
    setPessoasRows(rows); setResultPessoas(null);
  }

  async function handleFileCp(file: File) {
    const raw = await parseXlsx(file);
    setCpRows(raw.map(r => validarLanc(r))); setResultCp(null);
  }

  async function handleFileCr(file: File) {
    const raw = await parseXlsx(file);
    setCrRows(raw.map(r => validarLanc(r))); setResultCr(null);
  }

  async function handleFileInsumos(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarInsumo(r));
    // Duplicados dentro do arquivo
    const nomes = rows.map(r => r.nome?.toLowerCase().trim()).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.nome) {
        const n = r.nome.toLowerCase().trim();
        if (n && nomes.indexOf(n) !== i) r._status = "duplicado";
      }
    });
    // Duplicados já existentes no banco
    if (fazendaId) {
      const { data: existentes } = await supabase
        .from("insumos").select("nome").eq("fazenda_id", fazendaId).eq("tipo", "insumo");
      const nomesExistentes = new Set((existentes ?? []).map((x: { nome: string }) => x.nome.toLowerCase().trim()));
      rows.forEach(r => {
        if (r._status === "ok" && r.nome) {
          if (nomesExistentes.has(r.nome.toLowerCase().trim())) r._status = "duplicado";
        }
      });
    }
    setInsumosRows(rows); setResultInsumos(null);
  }

  async function handleFileProdutos(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarProduto(r));
    // Duplicados dentro do arquivo
    const nomes = rows.map(r => r.nome?.toLowerCase().trim()).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.nome) {
        const n = r.nome.toLowerCase().trim();
        if (n && nomes.indexOf(n) !== i) r._status = "duplicado";
      }
    });
    // Duplicados já existentes no banco
    if (fazendaId) {
      const { data: existentes } = await supabase
        .from("insumos").select("nome").eq("fazenda_id", fazendaId).eq("tipo", "produto");
      const nomesExistentes = new Set((existentes ?? []).map((x: { nome: string }) => x.nome.toLowerCase().trim()));
      rows.forEach(r => {
        if (r._status === "ok" && r.nome) {
          if (nomesExistentes.has(r.nome.toLowerCase().trim())) r._status = "duplicado";
        }
      });
    }
    setProdutosRows(rows); setResultProdutos(null);
  }

  // ─── Importar Pessoas ─────────────────────────────────────
  async function importarPessoas() {
    if (!fazendaId || !pessoasRows.length) return;
    setLoadingPessoas(true);
    let ok = 0, erros = 0, duplicados = 0;
    for (const r of pessoasRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }
      const { error } = await supabase.from("pessoas").insert({
        fazenda_id: fazendaId,
        nome:       r.nome.trim(),
        tipo:       (r.tipo as "pf" | "pj") || "pj",
        cliente:    r.cliente?.toLowerCase() === "sim",
        fornecedor: r.fornecedor?.toLowerCase() === "sim",
        cpf_cnpj:   r.cpf_cnpj?.trim() || null,
        email:      r.email?.trim() || null,
        telefone:   r.telefone?.trim() || null,
        municipio:  r.municipio?.trim() || null,
        estado:     r.estado?.trim() || null,
        cep:        r.cep?.trim() || null,
        banco_nome: r.banco_nome?.trim() || null,
        pix_chave:  r.pix_chave?.trim() || null,
        pix_tipo:   r.pix_tipo?.trim() || null,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setPessoasRows([...pessoasRows]);
    setResultPessoas({ ok, erros, duplicados });
    setLoadingPessoas(false);
  }

  // ─── Importar CP / CR ─────────────────────────────────────
  async function importarLancamentos(tipo: "pagar" | "receber", rows: LancRow[], setRows: (r: LancRow[]) => void, setResult: (r: { ok: number; erros: number; duplicados: number }) => void, setLoading: (v: boolean) => void) {
    if (!fazendaId || !rows.length) return;
    setLoading(true);
    let ok = 0, erros = 0, duplicados = 0;

    const [pessoasRes, opGerRes, produtoresRes] = await Promise.all([
      supabase.from("pessoas").select("id, cpf_cnpj").eq("fazenda_id", fazendaId),
      supabase.from("operacoes_gerenciais").select("id, descricao, classificacao").eq("fazenda_id", fazendaId),
      supabase.from("produtores").select("id, cpf_cnpj").eq("fazenda_id", fazendaId),
    ]);
    const pessoaMap: Record<string, string> = {};
    (pessoasRes.data ?? []).forEach((p: { id: string; cpf_cnpj: string | null }) => { if (p.cpf_cnpj) pessoaMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id; });
    const opGerMap: Record<string, string> = {};
    (opGerRes.data ?? []).forEach((o: { id: string; descricao: string; classificacao?: string }) => {
      opGerMap[o.descricao.toLowerCase().trim()] = o.id;
    });
    const produtorMap: Record<string, string> = {};
    (produtoresRes.data ?? []).forEach((p: { id: string; cpf_cnpj: string | null }) => { if (p.cpf_cnpj) produtorMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id; });

    for (const r of rows) {
      if (r._status === "erro") { erros++; continue; }
      const pessoaId = r.pessoa_cpf_cnpj ? pessoaMap[r.pessoa_cpf_cnpj.replace(/\D/g, "")] ?? null : null;
      const produtorId = r.produtor_cpf_cnpj?.trim() ? produtorMap[r.produtor_cpf_cnpj.replace(/\D/g, "")] ?? null : null;
      const opGerId = r.operacao_gerencial?.trim() ? opGerMap[r.operacao_gerencial.toLowerCase().trim()] ?? null : null;
      const valor = parseFloat(String(r.valor).replace(",", "."));
      const { error } = await supabase.from("lancamentos").insert({
        fazenda_id:              fazendaId,
        tipo,
        descricao:               r.descricao.trim(),
        categoria:               r.categoria.trim(),
        data_lancamento:         r.data_lancamento.trim(),
        data_vencimento:         r.data_vencimento.trim(),
        valor,
        moeda:                   (r.moeda?.toUpperCase() as "BRL"|"USD"|"barter") || "BRL",
        status:                  "em_aberto",
        auto:                    false,
        num_parcela:             r.num_parcela    ? parseInt(r.num_parcela)    : null,
        total_parcelas:          r.total_parcelas  ? parseInt(r.total_parcelas) : null,
        tipo_documento_lcdpr:    r.tipo_documento_lcdpr?.trim() || null,
        numero_documento:        r.numero_documento?.trim() || null,
        pessoa_id:               pessoaId,
        operacao_gerencial_id:   opGerId,
        produtor_id:             produtorId,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setRows([...rows]);
    setResult({ ok, erros, duplicados });
    setLoading(false);
  }

  // ─── Importar Insumos ─────────────────────────────────────
  async function importarInsumos() {
    if (!fazendaId || !insumosRows.length) return;
    setLoadingInsumos(true);
    let ok = 0, erros = 0, duplicados = 0;
    for (const r of insumosRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }
      const { error } = await supabase.from("insumos").insert({
        fazenda_id:     fazendaId,
        tipo:           "insumo",
        nome:           r.nome.trim(),
        categoria:      r.categoria.trim(),
        unidade:        r.unidade.trim(),
        estoque:        parseFloat(r.estoque || "0"),
        estoque_minimo: parseFloat(r.estoque_minimo || "0"),
        valor_unitario: parseFloat(String(r.valor_unitario).replace(",", ".") || "0"),
        fabricante:     r.fabricante?.trim() || null,
        subgrupo:       r.subgrupo?.trim() || null,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setInsumosRows([...insumosRows]);
    setResultInsumos({ ok, erros, duplicados });
    setLoadingInsumos(false);
  }

  // ─── Importar Produtos ────────────────────────────────────
  async function importarProdutos() {
    if (!fazendaId || !produtosRows.length) return;
    setLoadingProdutos(true);
    let ok = 0, erros = 0, duplicados = 0;
    for (const r of produtosRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }
      const valorVenda = parseFloat(String(r.valor_venda).replace(",", ".") || "0");
      const { error } = await supabase.from("insumos").insert({
        fazenda_id:     fazendaId,
        tipo:           "produto",
        nome:           r.nome.trim(),
        categoria:      r.categoria,
        unidade:        r.unidade,
        estoque:        parseFloat(r.estoque || "0"),
        estoque_minimo: parseFloat(r.estoque_minimo || "0"),
        valor_unitario: parseFloat(String(r.valor_unitario).replace(",", ".") || "0"),
        // campos extras: armazenar em lote/subgrupo o que couber, NCM e código interno em colunas se existirem
        lote:           r.codigo_interno?.trim() || null,
        subgrupo:       r.subgrupo?.trim() || null,
        fabricante:     r.fabricante?.trim() || null,
        // valor_venda e ncm — salvar como custo_medio e lote se não tiver colunas dedicadas
        custo_medio:    valorVenda > 0 ? valorVenda : null,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setProdutosRows([...produtosRows]);
    setResultProdutos({ ok, erros, duplicados });
    setLoadingProdutos(false);
  }

  async function handleFileContratoFin(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarContratoFin(r));
    // Duplicados dentro do arquivo
    const nrs = rows.map(r => r.numero_contrato?.trim().toLowerCase()).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.numero_contrato) {
        const n = r.numero_contrato.trim().toLowerCase();
        if (n && nrs.indexOf(n) !== i) r._status = "duplicado";
      }
    });
    if (fazendaId) {
      // Verifica contratos já existentes no módulo
      const { data: existentes } = await supabase
        .from("contratos_financeiros").select("numero_contrato").eq("fazenda_id", fazendaId);
      const nrsExistentes = new Set((existentes ?? []).map((c: { numero_contrato: string | null }) => (c.numero_contrato ?? "").trim().toLowerCase()).filter(Boolean));
      // Verifica CP com esse numero_documento (para avisar, não bloquear)
      for (const r of rows) {
        if (r._status !== "ok") continue;
        if (nrsExistentes.has(r.numero_contrato.trim().toLowerCase())) {
          r._status = "duplicado"; r._msg = "contrato já existe no módulo";
          continue;
        }
        const { count } = await supabase.from("lancamentos")
          .select("id", { count: "exact", head: true })
          .eq("fazenda_id", fazendaId).eq("tipo", "pagar")
          .eq("numero_documento", r.numero_contrato.trim());
        r._cp_encontrados = count ?? 0;
        if ((count ?? 0) > 0) {
          r._status = "aviso" as ContratoFinRow["_status"];
          r._msg = `${count} CP já existem — parcelas serão linkadas, sem duplicação`;
        }
      }
    }
    setContratoFinRows(rows); setResultContratoFin(null);
  }

  async function importarContratosFin() {
    if (!fazendaId || !contratoFinRows.length) return;
    setLoadingContratoFin(true);
    let ok = 0, erros = 0, duplicados = 0;
    for (const r of contratoFinRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }
      // Resolve pessoa pelo CPF/CNPJ
      let pessoaId: string | null = null;
      if (r.credor_cpf_cnpj?.trim()) {
        const docNum = r.credor_cpf_cnpj.replace(/\D/g, "");
        const { data: p } = await supabase.from("pessoas").select("id")
          .eq("fazenda_id", fazendaId).ilike("cpf_cnpj", `%${docNum}%`).limit(1).maybeSingle();
        pessoaId = p?.id ?? null;
      }
      // Resolve produtor_id para o contrato financeiro
      let produtorIdFin: string | null = null;
      if (r.produtor_cpf_cnpj?.trim()) {
        const docNumP = r.produtor_cpf_cnpj.replace(/\D/g, "");
        const { data: prd } = await supabase.from("produtores").select("id").eq("fazenda_id", fazendaId).ilike("cpf_cnpj", `%${docNumP}%`).limit(1).maybeSingle();
        produtorIdFin = prd?.id ?? null;
      }
      const { data: contrato, error } = await supabase.from("contratos_financeiros").insert({
        fazenda_id:              fazendaId,
        numero_contrato:         r.numero_contrato.trim(),
        descricao:               r.descricao.trim(),
        credor:                  r.credor.trim(),
        pessoa_id:               pessoaId,
        produtor_id:             produtorIdFin,
        tipo:                    r.tipo,
        moeda:                   (r.moeda || "BRL").toUpperCase(),
        valor_total:             parseFloat(String(r.valor_total).replace(",", ".")),
        data_contrato:           r.data_contrato.trim(),
        taxa_juros_am:           r.taxa_juros_am?.trim() ? parseFloat(r.taxa_juros_am.replace(",", ".")) : null,
        periodicidade_pagamento: r.periodicidade_pagamento || "mensal",
        estrutura_pagamento:     r.estrutura_pagamento || "simples",
        observacao:              r.observacao?.trim() || null,
        status:                  "ativo",
      }).select("id").single();

      if (error) { r._status = "erro"; r._msg = error.message; erros++; continue; }
      ok++;

      // Auto-geração de parcelas com suporte a periodicidade
      const prazo = parseInt(r.prazo_meses || "0");
      const autoP = (r.auto_parcelas || "").toLowerCase() === "sim";
      if (autoP && prazo > 0 && (r._cp_encontrados ?? 0) === 0 && contrato) {
        const startDate = r.data_liberacao?.trim() || r.data_contrato.trim();
        let taxaAm = r.taxa_juros_am?.trim() ? parseFloat(r.taxa_juros_am.replace(",", ".")) : 0;
        if (!taxaAm && r.taxa_juros_aa?.trim()) {
          const aa = parseFloat(r.taxa_juros_aa.replace(",", "."));
          taxaAm = (Math.pow(1 + aa / 100, 1 / 12) - 1) * 100;
        }
        const i = taxaAm / 100;
        const pv = parseFloat(String(r.valor_total).replace(",", "."));
        const tipoAmort = (r.tipo_amortizacao || "sac").toLowerCase();
        const periodicidade = (r.periodicidade_pagamento || "mensal").toLowerCase();
        const estrutura = (r.estrutura_pagamento || "simples").toLowerCase();
        const parcRows: Record<string, unknown>[] = [];

        const base = { contrato_id: contrato.id, fazenda_id: fazendaId, despesas_acessorios: 0, status: "em_aberto" };

        if (estrutura === "juros_semestral_capital_anual" && tipoAmort !== "bullet") {
          // Estrutura FCO/BNDES: juros semestrais + amortização anual SAC
          const numAnos = Math.ceil(prazo / 12);
          const amortAnual = pv / numAnos;
          let saldo = pv;
          let numParc = 0;
          for (let ano = 1; ano <= numAnos; ano++) {
            // Parcela semestral — apenas juros (6 meses)
            numParc++;
            const jSem = Math.round(saldo * i * 6 * 100) / 100;
            parcRows.push({ ...base, num_parcela: numParc, data_vencimento: addMonths(startDate, (ano - 1) * 12 + 6), amortizacao: 0, juros: jSem, valor_parcela: jSem, saldo_devedor: saldo });
            // Parcela anual — amortização + juros do segundo semestre
            numParc++;
            const jAnu = Math.round(saldo * i * 6 * 100) / 100;
            saldo -= amortAnual;
            parcRows.push({ ...base, num_parcela: numParc, data_vencimento: addMonths(startDate, ano * 12), amortizacao: Math.round(amortAnual * 100) / 100, juros: jAnu, valor_parcela: Math.round((amortAnual + jAnu) * 100) / 100, saldo_devedor: Math.max(0, Math.round(saldo * 100) / 100) });
          }
        } else if (periodicidade === "bullet" || tipoAmort === "bullet") {
          // Bullet: juros periódicos + principal no final
          const mesesPorParcela = MESES_POR_PERIODO[periodicidade] ?? prazo;
          const numParcelas = periodicidade === "bullet" ? 1 : Math.ceil(prazo / mesesPorParcela);
          const iPeriod = i === 0 ? 0 : Math.pow(1 + i, mesesPorParcela) - 1;
          const jPeriod = Math.round(pv * iPeriod * 100) / 100;
          if (numParcelas === 1) {
            parcRows.push({ ...base, num_parcela: 1, data_vencimento: addMonths(startDate, prazo), amortizacao: pv, juros: Math.round(pv * i * prazo * 100) / 100, valor_parcela: Math.round(pv * (1 + i * prazo) * 100) / 100, saldo_devedor: 0 });
          } else {
            for (let m = 1; m < numParcelas; m++) {
              parcRows.push({ ...base, num_parcela: m, data_vencimento: addMonths(startDate, m * mesesPorParcela), amortizacao: 0, juros: jPeriod, valor_parcela: jPeriod, saldo_devedor: pv });
            }
            parcRows.push({ ...base, num_parcela: numParcelas, data_vencimento: addMonths(startDate, numParcelas * mesesPorParcela), amortizacao: pv, juros: jPeriod, valor_parcela: Math.round((pv + jPeriod) * 100) / 100, saldo_devedor: 0 });
          }
        } else {
          // SAC ou PRICE com periodicidade configurada
          const mesesPorParcela = MESES_POR_PERIODO[periodicidade] ?? 1;
          const numParcelas = Math.ceil(prazo / mesesPorParcela);
          const iPeriod = i === 0 ? 0 : Math.pow(1 + i, mesesPorParcela) - 1;
          if (tipoAmort === "price") {
            const pf = iPeriod === 0 ? pv / numParcelas : pv * iPeriod / (1 - Math.pow(1 + iPeriod, -numParcelas));
            let saldo = pv;
            for (let m = 1; m <= numParcelas; m++) {
              const juros = saldo * iPeriod; const amort = pf - juros; saldo -= amort;
              parcRows.push({ ...base, num_parcela: m, data_vencimento: addMonths(startDate, m * mesesPorParcela), amortizacao: Math.round(amort * 100) / 100, juros: Math.round(juros * 100) / 100, valor_parcela: Math.round(pf * 100) / 100, saldo_devedor: Math.max(0, Math.round(saldo * 100) / 100) });
            }
          } else {
            // SAC
            const amort = pv / numParcelas; let saldo = pv;
            for (let m = 1; m <= numParcelas; m++) {
              const juros = saldo * iPeriod; saldo -= amort;
              parcRows.push({ ...base, num_parcela: m, data_vencimento: addMonths(startDate, m * mesesPorParcela), amortizacao: Math.round(amort * 100) / 100, juros: Math.round(juros * 100) / 100, valor_parcela: Math.round((amort + juros) * 100) / 100, saldo_devedor: Math.max(0, Math.round(saldo * 100) / 100) });
            }
          }
        }
        if (parcRows.length > 0) await supabase.from("parcelas_pagamento").insert(parcRows);
      }

      // Se há CP existentes com esse numero_documento, vincula como parcelas
      if ((r._cp_encontrados ?? 0) > 0 && contrato) {
        const { data: cpExist } = await supabase.from("lancamentos")
          .select("id, valor, data_vencimento")
          .eq("fazenda_id", fazendaId).eq("tipo", "pagar")
          .eq("numero_documento", r.numero_contrato.trim())
          .order("data_vencimento");
        if (cpExist?.length) {
          const parcRows = cpExist.map((l: { id: string; valor: number; data_vencimento: string }, idx: number) => ({
            contrato_id:         contrato.id,
            fazenda_id:          fazendaId,
            num_parcela:         idx + 1,
            data_vencimento:     l.data_vencimento,
            amortizacao:         Number(l.valor || 0),
            juros:               0,
            despesas_acessorios: 0,
            valor_parcela:       Number(l.valor || 0),
            saldo_devedor:       0,
            status:              "em_aberto",
            lancamento_id:       l.id,
          }));
          await supabase.from("parcelas_pagamento").insert(parcRows);
        }
      }
    }
    setContratoFinRows([...contratoFinRows]);
    setResultContratoFin({ ok, erros, duplicados });
    setLoadingContratoFin(false);
  }

  async function handleFileMaquinas(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarMaquina(r));
    // Duplicados dentro do arquivo (por patrimônio)
    const patrimonios = rows.map(r => r.patrimonio?.toLowerCase().trim()).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.patrimonio) {
        const p = r.patrimonio.toLowerCase().trim();
        if (p && patrimonios.indexOf(p) !== i) r._status = "duplicado";
      }
    });
    // Duplicados já existentes no banco
    if (fazendaId) {
      const { data: existentes } = await supabase
        .from("maquinas").select("patrimonio, nome").eq("fazenda_id", fazendaId);
      const patrExistentes = new Set((existentes ?? []).map((m: { patrimonio: string | null }) => (m.patrimonio ?? "").toLowerCase().trim()).filter(Boolean));
      const nomesExistentes = new Set((existentes ?? []).map((m: { nome: string }) => m.nome.toLowerCase().trim()));
      rows.forEach(r => {
        if (r._status === "ok") {
          if (r.patrimonio && patrExistentes.has(r.patrimonio.toLowerCase().trim())) r._status = "duplicado";
          else if (r.nome && nomesExistentes.has(r.nome.toLowerCase().trim())) r._status = "duplicado";
        }
      });
    }
    setMaquinasRows(rows); setResultMaquinas(null);
  }

  async function importarMaquinas() {
    if (!fazendaId || !maquinasRows.length) return;
    setLoadingMaquinas(true);
    let ok = 0, erros = 0, duplicados = 0;
    for (const r of maquinasRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }
      const isVeiculo = ["carro", "caminhao"].includes(r.tipo);
      const { error } = await supabase.from("maquinas").insert({
        fazenda_id:      fazendaId,
        nome:            r.nome.trim(),
        tipo:            normalizarTipoMaquina(r.tipo),
        patrimonio:      r.patrimonio?.trim() || null,
        marca:           r.marca?.trim() || null,
        modelo:          r.modelo?.trim() || null,
        ano:             r.ano?.trim() ? parseInt(r.ano.trim()) : null,
        chassi:          r.chassi?.trim() || null,
        horimetro_atual: r.horimetro_atual?.trim() ? parseFloat(r.horimetro_atual.replace(",", ".")) : null,
        ativa:           true,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setMaquinasRows([...maquinasRows]);
    setResultMaquinas({ ok, erros, duplicados });
    setLoadingMaquinas(false);
  }

  async function handleFileArrendamentos(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarArrendamento(r));
    setArrendamentosRows(rows); setResultArrendamentos(null);
  }

  async function importarArrendamentos() {
    if (!fazendaId || !arrendamentosRows.length) return;
    setLoadingArrendamentos(true);
    let ok = 0, erros = 0, duplicados = 0;
    const { data: pessoas } = await supabase.from("pessoas").select("id, cpf_cnpj").eq("fazenda_id", fazendaId);
    const pessoaMap: Record<string, string> = {};
    (pessoas ?? []).forEach((p: { id: string; cpf_cnpj: string | null }) => {
      if (p.cpf_cnpj) pessoaMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id;
    });
    for (const r of arrendamentosRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }
      const docNum = r.proprietario_cpf_cnpj.replace(/\D/g, "");
      const proprietarioId = pessoaMap[docNum] ?? null;
      const scMilhoHa = r.sc_milho_ha?.trim() ? parseFloat(String(r.sc_milho_ha).replace(",", ".")) : null;
      const { error } = await supabase.from("arrendamentos").insert({
        fazenda_id:      fazendaId,
        pessoa_id:       proprietarioId,
        descricao:       r.descricao?.trim() || null,
        area_ha:         parseFloat(String(r.area_ha).replace(",", ".")),
        forma_pagamento: r.forma_pagamento,
        valor:           parseFloat(String(r.valor).replace(",", ".")),
        sc_milho_ha:     scMilhoHa,
        data_inicio:     r.data_inicio.trim(),
        data_fim:        r.data_fim.trim(),
        obs:             r.observacao?.trim() || null,
        status:          "ativo",
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setArrendamentosRows([...arrendamentosRows]);
    setResultArrendamentos({ ok, erros, duplicados });
    setLoadingArrendamentos(false);
  }

  // ─── Config por aba ───────────────────────────────────────
  const ABA_CONFIG: Record<Aba, {
    label: string; icon: string; desc: string;
    cols: string[]; rows: Record<string, unknown>[]; loading: boolean;
    result: { ok: number; erros: number; duplicados: number } | null;
    onFile: (f: File) => void; onImport: () => void;
  }> = {
    pessoas: {
      label: "Pessoas", icon: "👤",
      desc: "Importe fornecedores, clientes, arrendantes e demais pessoas de uma só vez.",
      cols: ["nome", "tipo", "cpf_cnpj", "cliente", "fornecedor", "email", "telefone", "municipio", "estado"],
      rows: pessoasRows as Record<string, unknown>[],
      loading: loadingPessoas,
      result: resultPessoas,
      onFile: handleFilePessoas,
      onImport: importarPessoas,
    },
    cp: {
      label: "Contas a Pagar", icon: "💸",
      desc: "Importe contas a pagar. Use numero_documento, operacao_gerencial e produtor_cpf_cnpj para classificação completa.",
      cols: ["descricao", "categoria", "data_lancamento", "data_vencimento", "valor", "pessoa_cpf_cnpj", "numero_documento", "operacao_gerencial", "produtor_cpf_cnpj"],
      rows: cpRows as Record<string, unknown>[],
      loading: loadingCp,
      result: resultCp,
      onFile: handleFileCp,
      onImport: () => importarLancamentos("pagar", cpRows, setCpRows, setResultCp, setLoadingCp),
    },
    cr: {
      label: "Contas a Receber", icon: "💰",
      desc: "Importe contas a receber. Use numero_documento, operacao_gerencial e produtor_cpf_cnpj para classificação completa.",
      cols: ["descricao", "categoria", "data_lancamento", "data_vencimento", "valor", "pessoa_cpf_cnpj", "numero_documento", "operacao_gerencial", "produtor_cpf_cnpj"],
      rows: crRows as Record<string, unknown>[],
      loading: loadingCr,
      result: resultCr,
      onFile: handleFileCr,
      onImport: () => importarLancamentos("receber", crRows, setCrRows, setResultCr, setLoadingCr),
    },
    insumos: {
      label: "Insumos", icon: "🌾",
      desc: "Importe insumos agrícolas: sementes, fertilizantes, defensivos e combustíveis.",
      cols: ["nome", "categoria", "unidade", "estoque", "estoque_minimo", "valor_unitario", "fabricante"],
      rows: insumosRows as Record<string, unknown>[],
      loading: loadingInsumos,
      result: resultInsumos,
      onFile: handleFileInsumos,
      onImport: importarInsumos,
    },
    produtos: {
      label: "Produtos", icon: "📦",
      desc: "Importe peças, materiais, itens de uso e consumo e produtos de escritório.",
      cols: ["nome", "categoria", "unidade", "codigo_interno", "ncm", "estoque", "valor_unitario", "fabricante", "marca"],
      rows: produtosRows as Record<string, unknown>[],
      loading: loadingProdutos,
      result: resultProdutos,
      onFile: handleFileProdutos,
      onImport: importarProdutos,
    },
    maquinas: {
      label: "Máquinas / Veículos", icon: "🚜",
      desc: "Importe toda a frota: tratores, colhedoras, pulverizadores, caminhões, carros e implementos.",
      cols: ["nome", "tipo", "patrimonio", "marca", "modelo", "ano", "horimetro_atual"],
      rows: maquinasRows as Record<string, unknown>[],
      loading: loadingMaquinas,
      result: resultMaquinas,
      onFile: handleFileMaquinas,
      onImport: importarMaquinas,
    },
    contratos_fin: {
      label: "Contratos Financeiros", icon: "🏦",
      desc: "Importe contratos bancários (custeio, investimento, CPR, EGF). Suporta periodicidade mensal, semestral, anual e estrutura de juros semestrais + amortização anual.",
      cols: ["numero_contrato", "descricao", "credor", "tipo", "valor_total", "data_contrato", "prazo_meses", "periodicidade_pagamento", "estrutura_pagamento", "tipo_amortizacao", "produtor_cpf_cnpj"],
      rows: contratoFinRows as Record<string, unknown>[],
      loading: loadingContratoFin,
      result: resultContratoFin,
      onFile: handleFileContratoFin,
      onImport: importarContratosFin,
    },
    arrendamentos: {
      label: "Arrendamentos", icon: "🌾",
      desc: "Importe contratos de arrendamento. Para sc_soja_milho informe o componente soja em 'valor' e milho em 'sc_milho_ha'.",
      cols: ["proprietario_cpf_cnpj", "descricao", "area_ha", "forma_pagamento", "valor", "sc_milho_ha", "data_inicio", "data_fim"],
      rows: arrendamentosRows as Record<string, unknown>[],
      loading: loadingArrendamentos,
      result: resultArrendamentos,
      onFile: handleFileArrendamentos,
      onImport: importarArrendamentos,
    },
  };

  const cfg      = ABA_CONFIG[aba];
  const totalRows = cfg.rows.length;
  const okRows    = cfg.rows.filter(r => ["ok","aviso"].includes((r as Record<string, unknown>)._status as string)).length;
  const erroRows  = cfg.rows.filter(r => (r as Record<string, unknown>)._status === "erro").length;

  function limpar() {
    if (aba === "pessoas")       { setPessoasRows([]);        setResultPessoas(null); }
    if (aba === "cp")            { setCpRows([]);              setResultCp(null); }
    if (aba === "cr")            { setCrRows([]);              setResultCr(null); }
    if (aba === "insumos")       { setInsumosRows([]);         setResultInsumos(null); }
    if (aba === "produtos")      { setProdutosRows([]);        setResultProdutos(null); }
    if (aba === "maquinas")      { setMaquinasRows([]);        setResultMaquinas(null); }
    if (aba === "contratos_fin") { setContratoFinRows([]);     setResultContratoFin(null); }
    if (aba === "arrendamentos") { setArrendamentosRows([]);   setResultArrendamentos(null); }
  }

  return (
    <>
    <TopNav />
    <div style={{ background: "#F4F6FA", minHeight: "100vh", padding: "24px 28px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
          Importações
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
          Importe dados em lote via planilha XLSX — exclusivo Raccolto
        </p>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* Sidebar de abas */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ background: "white", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
            {(["pessoas", "cp", "cr", "insumos", "produtos", "maquinas", "contratos_fin", "arrendamentos"] as Aba[]).map(a => {
              const c = ABA_CONFIG[a];
              return (
                <button
                  key={a}
                  onClick={() => setAba(a)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "12px 16px",
                    border: "none", borderBottom: "0.5px solid #DDE2EE",
                    background: aba === a ? "#D5E8F5" : "transparent",
                    color: aba === a ? "#1A4870" : "#555",
                    fontWeight: aba === a ? 700 : 400,
                    fontSize: 13, cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 16 }}>{c.icon}</span>
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* Instrução geral */}
          <div style={{ marginTop: 16, padding: "12px 14px", background: "#FBF3E0", borderRadius: 10, border: "0.5px solid #C9921B", fontSize: 12, color: "#7A5A12", lineHeight: 1.6 }}>
            <strong>Passo a passo:</strong><br />
            1. Baixe o template<br />
            2. Preencha os dados<br />
            3. Faça upload do XLSX<br />
            4. Revise a prévia<br />
            5. Clique em Importar
          </div>
        </div>

        {/* Área principal */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: "white", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: 24 }}>

            {/* Cabeçalho da aba */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{cfg.icon}</span>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1a1a1a" }}>{cfg.label}</h2>
                </div>
                <p style={{ margin: "4px 0 0 34px", fontSize: 13, color: "#666" }}>{cfg.desc}</p>
              </div>
              <button
                onClick={() => downloadTemplate(aba)}
                style={{
                  padding: "8px 16px", background: "white", border: "0.5px solid #1A4870",
                  borderRadius: 8, color: "#1A4870", fontWeight: 600, fontSize: 13,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                }}
              >
                ⬇ Baixar template
              </button>
            </div>

            {/* Upload */}
            <UploadZone onFile={cfg.onFile} />

            {/* Prévia */}
            {totalRows > 0 && (
              <>
                <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, color: "#555" }}>
                    <strong>{totalRows}</strong> linha{totalRows !== 1 ? "s" : ""} lida{totalRows !== 1 ? "s" : ""}
                    {erroRows > 0 && <span style={{ marginLeft: 10, color: "#E24B4A", fontWeight: 600 }}>{erroRows} com erro</span>}
                    {okRows   > 0 && <span style={{ marginLeft: 10, color: "#16A34A", fontWeight: 600 }}>{okRows} prontas para importar</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={limpar}
                      style={{ padding: "7px 14px", background: "white", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, color: "#888", cursor: "pointer" }}
                    >
                      Limpar
                    </button>
                    <button
                      onClick={cfg.onImport}
                      disabled={cfg.loading || okRows === 0}
                      style={{
                        padding: "7px 20px",
                        background: okRows === 0 ? "#DDE2EE" : "#1A4870",
                        border: "none", borderRadius: 8, color: "white",
                        fontSize: 13, fontWeight: 600, cursor: okRows === 0 ? "default" : "pointer",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      {cfg.loading ? "⏳ Importando..." : `⬆ Importar ${okRows} registro${okRows !== 1 ? "s" : ""}`}
                    </button>
                  </div>
                </div>
                <PreviewTable rows={cfg.rows} colunas={cfg.cols} />
              </>
            )}

            {/* Resultado */}
            {cfg.result && (
              <Resultado
                ok={cfg.result.ok}
                erros={cfg.result.erros}
                duplicados={cfg.result.duplicados}
                total={cfg.result.ok + cfg.result.erros + cfg.result.duplicados}
              />
            )}

            {/* Empty state */}
            {totalRows === 0 && !cfg.result && (
              <div style={{ marginTop: 20, textAlign: "center", color: "#aaa", fontSize: 13, padding: "16px 0" }}>
                Faça o upload de um arquivo XLSX para visualizar os dados antes de importar.
              </div>
            )}
          </div>

          {/* Dicas contextuais */}
          {(aba === "cp" || aba === "cr") && (
            <div style={{ marginTop: 16, padding: "12px 16px", background: "#D5E8F5", borderRadius: 10, border: "0.5px solid #1A4870", fontSize: 12, color: "#0B2D50" }}>
              <strong>💡 Dica:</strong> A coluna <code>pessoa_cpf_cnpj</code> faz o vínculo automático com o cadastro de Pessoas pelo CPF ou CNPJ.
              Importe Pessoas primeiro para garantir o vínculo correto.
            </div>
          )}
          {aba === "produtos" && <RefCategorias />}
        </div>
      </div>
    </div>
    </>
  );
}
