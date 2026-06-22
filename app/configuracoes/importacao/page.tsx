"use client";
import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────
type Aba = "pessoas" | "cp" | "cr" | "insumos" | "produtos" | "maquinas" | "contratos_fin" | "arrendamentos" | "contratos_venda" | "produtores_imp" | "fazendas_imp" | "talhoes_imp";

type PessoaRow = {
  nome: string; tipo: string; cpf_cnpj: string; cliente: string; fornecedor: string;
  mao_obra: string;
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
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type InsumoRow = {
  nome: string; categoria: string; unidade: string; estoque: string;
  estoque_minimo: string; valor_unitario: string; fabricante: string; subgrupo: string;
  _status?: "ok" | "aviso" | "erro" | "duplicado"; _msg?: string;
  _unidade_original?: string;  // unidade antes da conversão automática
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
  proprietario_cpf_cnpj: string;
  nr_nf_aquisicao: string; data_aquisicao: string; valor_aquisicao: string;
  status_financiamento: string; numero_contrato_financiamento: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type ContratoFinRow = {
  numero_contrato: string; descricao: string; credor: string; credor_cpf_cnpj: string;
  tipo: string; linha_credito: string; tipo_calculo: string;
  moeda: string; valor_financiado: string; valor_liberado: string; cotacao_usd: string;
  data_contrato: string; data_liberacao: string; data_vencimento: string;
  data_entrega_produto: string;
  prazo_meses: string; carencia_meses: string;
  periodicidade_pagamento: string;
  taxa_juros_aa: string; taxa_juros_am: string;
  iof_pct: string; tac_valor: string; outros_custos: string;
  auto_parcelas: string; produtor_cpf_cnpj: string; observacao: string;
  _status?: "ok" | "erro" | "duplicado" | "atualizar" | "aviso"; _msg?: string; _cp_encontrados?: number;
};

type ArrendamentoRow = {
  proprietario_cpf_cnpj: string; proprietario_nome: string;
  descricao: string; area_ha: string; forma_pagamento: string;
  valor: string; sc_milho_ha: string;
  data_inicio: string; data_fim: string; observacao: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type ContratoVendaRow = {
  numero: string; produto: string; safra: string; ciclo: string;
  modalidade: string; moeda: string; preco_por_kg: string;
  quantidade_kg: string; entregue_kg: string;
  data_contrato: string; data_entrega: string; data_pagamento: string;
  comprador: string; comprador_cpf_cnpj: string; produtor_cpf_cnpj: string;
  frete: string; observacao: string;
  _status?: "ok" | "erro" | "duplicado" | "atualizar"; _msg?: string;
};
type ProdutorImpRow = {
  nome: string; tipo: string; cpf_cnpj: string; inscricao_est: string;
  email: string; telefone: string; cep: string; logradouro: string;
  municipio: string; estado: string;
  _status?: "ok" | "erro" | "duplicado" | "ie_merge"; _msg?: string;
  _merge_into_id?: string; // produtor_id no banco para mesclagem de IE
};
type FazendaImpRow = {
  nome: string; municipio: string; estado: string; area_total_ha: string;
  cep: string; logradouro: string; car: string; nirf: string; itr_area_ha: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};
type TalhaoImpRow = {
  nome: string; fazenda_nome: string; area_ha: string;
  cultura_predominante: string; tipo_solo: string;
  latitude: string; longitude: string;
  _status?: "ok" | "erro" | "duplicado"; _msg?: string;
};

// ─── Templates ────────────────────────────────────────────────
const TEMPLATE_PESSOAS = [
  ["nome*", "tipo*", "cpf_cnpj", "cliente", "fornecedor", "mao_obra", "email", "telefone", "municipio", "estado", "cep", "banco_nome", "pix_chave", "pix_tipo"],
  ["Bunge Brasil", "pj", "08.821.250/0001-60", "sim", "nao", "nao", "bunge@bunge.com", "(11)3305-0000", "São Paulo", "SP", "04710-070", "Caixa", "08821250000160", "cnpj"],
  ["João da Silva", "pf", "012.345.678-90", "nao", "sim", "nao", "joao@email.com", "(65)99999-0001", "Nova Mutum", "MT", "78450-000", "", "", ""],
  ["Pedro Operador", "pf", "111.222.333-44", "nao", "nao", "sim", "pedro@email.com", "(65)99000-0001", "Nova Mutum", "MT", "78450-000", "", "", ""],
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
  ["nome*", "tipo*", "patrimonio*", "marca", "modelo", "ano", "chassi", "horimetro_atual", "proprietario_cpf_cnpj", "nr_nf_aquisicao", "data_aquisicao", "valor_aquisicao", "status_financiamento", "numero_contrato_financiamento"],
  ["Trator John Deere 6110J", "trator", "Máquina 1", "John Deere", "6110J", "2022", "1RW6110JXNL123456", "4250", "012.345.678-90", "000123", "2022-03-15", "480000.00", "financiado", "131910484"],
  ["Colhedora S760", "colhedora", "Máquina 2", "John Deere", "S760", "2021", "1HO760JXPL654321", "2180", "012.345.678-90", "000124", "2021-09-01", "1200000.00", "financiado", "131910485"],
  ["Plantadeira PD 1113", "plantadeira", "Máquina 3", "Plantio Direto", "PD 1113", "2020", "", "0", "", "", "", "", "proprio", ""],
  ["Pulverizador Menegatti", "pulverizador", "Máquina 4", "Menegatti", "2500", "2023", "", "1100", "012.345.678-90", "", "2023-06-10", "350000.00", "quitado", ""],
  ["Caminhão Volvo FH 460", "caminhao", "Máquina 5", "Volvo", "FH 460", "2019", "9BW3HH4A8KB123456", "0", "", "", "", "", "proprio", ""],
  ["Toyota Hilux SW4", "carro", "Carro 30", "Toyota", "Hilux SW4", "2023", "9BFBR49H0PB123456", "45000", "987.654.321-00", "000200", "2023-01-20", "220000.00", "financiado", ""],
];

const TEMPLATE_CONTRATOS_FIN = [
  ["numero_contrato*", "descricao*", "credor*", "credor_cpf_cnpj", "tipo*", "linha_credito", "tipo_calculo", "moeda", "valor_financiado*", "valor_liberado", "cotacao_usd", "data_contrato*", "data_liberacao", "data_entrega_produto", "data_vencimento", "prazo_meses", "carencia_meses", "periodicidade_pagamento", "taxa_juros_aa", "taxa_juros_am", "iof_pct", "tac_valor", "outros_custos", "auto_parcelas", "produtor_cpf_cnpj", "observacao"],
  ["959144", "Custeio Safra 2025/26", "SICOOB PRIMAVERA", "07.945.853/0001-14", "custeio", "PRONAMP", "sac", "BRL", "1656177.09", "1649927.09", "", "2025-06-01", "2025-06-01", "", "", "12", "0", "mensal", "11.16", "0.89", "", "6250.00", "", "sim", "012.345.678-90", "TAC R$6.250 retida na liberação"],
  ["131910484", "Moderfrota Trator BB", "BANCO DO BRASIL SA", "00.000.000/0001-91", "investimento", "Moderfrota", "price", "BRL", "480000.00", "477600.00", "", "2024-03-15", "2024-03-15", "", "", "48", "0", "mensal", "9.00", "0.75", "0.38", "1200.00", "", "sim", "012.345.678-90", "TAC R$1.200 + IOF retidos"],
  ["20251215000000410", "ORPAG-CREDITO EXPORTAÇÃO", "BANCO DO BRASIL SA", "00.000.000/0001-91", "outros", "", "sac", "USD", "185000.00", "184261.25", "5.85", "2025-12-28", "2025-12-28", "", "", "12", "0", "mensal", "", "", "", "", "", "sim", "012.345.678-90", "Produtor: CARINA CEOLIN - MT"],
  ["50107386300", "CPR Soja Itaú", "ITAU UNIBANCO S.A.", "60.701.190/0001-04", "cpr", "", "bullet", "USD", "28144.00", "", "5.98", "2025-01-10", "2025-01-10", "2026-01-10", "2026-01-10", "12", "0", "bullet", "", "", "", "", "", "nao", "", ""],
  ["CR-2024-001", "FCO Rural 5 anos", "BANCO DO BRASIL SA", "00.000.000/0001-91", "investimento", "FCO Rural", "sac", "BRL", "2000000.00", "1992400.00", "", "2024-05-01", "2024-05-01", "", "", "60", "6", "semestral", "8.64", "0.72", "0.38", "", "", "sim", "012.345.678-90", "Juros semestrais - carência 6 meses"],
];

const TEMPLATE_ARRENDAMENTOS = [
  ["proprietario_cpf_cnpj*", "proprietario_nome", "descricao", "area_ha*", "forma_pagamento*", "valor*", "sc_milho_ha", "data_inicio*", "data_fim*", "observacao"],
  ["012.345.678-90", "João da Silva", "Gleba Norte", "150.5", "sc_soja", "8.5", "", "2025-10-01", "2026-09-30", ""],
  ["987.654.321-00", "Maria Ferreira", "Gleba Sul", "200.0", "brl", "350.00", "", "2025-10-01", "2026-09-30", "R$/ha"],
  ["07.945.853/0001-14", "Espólio Santos", "Área Central", "80.0", "sc_milho", "5.0", "", "2026-01-01", "2026-12-31", ""],
  ["012.345.678-90", "João da Silva", "Fundo do Morro", "120.0", "sc_soja_milho", "5.0", "3.0", "2025-10-01", "2026-09-30", "5 sc soja + 3 sc milho por ha"],
];

const TEMPLATE_CONTRATOS_VENDA = [
  ["numero*", "produto*", "safra*", "ciclo", "modalidade*", "moeda*", "preco_por_kg*", "quantidade_kg*", "entregue_kg", "data_contrato*", "data_entrega*", "data_pagamento", "comprador*", "comprador_cpf_cnpj", "produtor_cpf_cnpj*", "frete", "observacao"],
  ["C-001/2026", "Soja", "2025/2026", "Ciclo Soja/Milho 2025/2026", "fixo", "BRL", "0.8833", "3000000", "0", "2026-01-15", "2026-03-31", "2026-04-15", "BUNGE BRASIL", "08.821.250/0001-60", "012.345.678-90", "destinatario", "Pagto 15 dias após entrega"],
  ["C-002/2026", "Milho", "2025/2026", "Ciclo Soja/Milho 2025/2026", "a_fixar", "BRL", "0.4167", "1200000", "0", "2026-02-01", "2026-07-31", "", "AMAGGI EXPORTAÇÃO", "42.664.021/0001-59", "012.345.678-90", "fob", "Preço a fixar"],
  ["C-003/2026", "Soja", "2025/2026", "", "fixo", "USD", "0.1026", "900000", "412860", "2026-01-10", "2026-04-30", "2026-05-05", "BTG PACTUAL", "30.306.294/0001-45", "987.654.321-00", "destinatario", "CPR USD"],
];

const TEMPLATE_PRODUTORES_IMP = [
  ["nome*", "tipo*", "cpf_cnpj*", "inscricao_est", "email", "telefone", "cep", "logradouro", "municipio", "estado*"],
  ["João da Silva Costa", "pf", "012.345.678-90", "123456789", "joao@email.com", "(65)99999-0001", "78450-000", "Rua das Palmeiras, 100", "Nova Mutum", "MT"],
  ["Costa Beber Agropecuária Ltda", "pj", "12.345.678/0001-90", "9876543210", "contato@costabeber.com.br", "(65)3301-0001", "78450-000", "Av. das Araucárias, 500", "Nova Mutum", "MT"],
  ["Maria Ferreira da Silva", "pf", "987.654.321-00", "", "", "(65)99888-0002", "", "", "Sorriso", "MT"],
];

const TEMPLATE_FAZENDAS_IMP = [
  ["nome*", "municipio*", "estado*", "area_total_ha*", "cep", "logradouro", "car", "nirf", "itr_area_ha"],
  ["Rancho Alegre", "Nova Mutum", "MT", "2500.00", "78450-000", "Estrada Municipal KM 25", "MT-5003420-5D8ECA1F2BA34BC7A5ED1FC3EBC89000", "7654321", "2500.00"],
  ["Fazenda Rio Bonito", "Sorriso", "MT", "1800.50", "78890-000", "Rodovia BR-163 KM 702", "", "", ""],
  ["Sítio Esperança", "Lucas do Rio Verde", "MT", "450.00", "", "", "", "", ""],
];

const TEMPLATE_TALHOES_IMP = [
  ["nome*", "fazenda_nome*", "area_ha*", "cultura_predominante", "tipo_solo", "latitude", "longitude"],
  ["Talhão 1 Norte", "Rancho Alegre", "320.5", "Soja", "Latossolo Vermelho", "-13.825000", "-56.091000"],
  ["Talhão 2 Sul", "Rancho Alegre", "280.0", "Milho", "Latossolo Vermelho-Amarelo", "-13.850000", "-56.095000"],
  ["Área Central", "Fazenda Rio Bonito", "450.0", "Soja", "Latossolo Amarelo", "-12.540000", "-55.720000"],
  ["Gleba Leste", "Sítio Esperança", "200.0", "Soja/Milho", "Latossolo Vermelho", "-13.100000", "-55.980000"],
];

const INSTRUCOES_CONTRATOS_VENDA = [
  ["INSTRUÇÕES — IMPORTAÇÃO DE CONTRATOS DE VENDA"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• numero: número único do contrato na fazenda (ex: C-001/2026)"],
  ["• produto: Soja, Milho, Milho Safrinha, Algodão, etc."],
  ["• safra: descrição do ano safra (ex: 2025/2026) — deve existir em Cadastros → Safras"],
  ["• ciclo: descrição do ciclo (ex: Ciclo Soja/Milho 2025/2026) — opcional, mas recomendado"],
  ["• modalidade: fixo, a_fixar ou barter"],
  ["  fixo    → preço travado no momento do contrato"],
  ["  a_fixar → quantidade fixada, preço a definir depois"],
  ["  barter  → pagamento em insumos (sem movimentação financeira)"],
  ["• moeda: BRL ou USD"],
  ["• preco_por_kg: preço em R$/kg ou US$/kg (ex: 0.8833 para R$53,00/sc)"],
  ["  Conversão: R$/sc ÷ 60 = R$/kg. Ex: 53 ÷ 60 = 0,8833/kg"],
  ["• quantidade_kg: quantidade total contratada em kg (ex: 3000000 = 3.000 t = 50.000 sc)"],
  ["  Conversão: sacas × 60 = kg. Ex: 50.000 sc × 60 = 3.000.000 kg"],
  ["• entregue_kg: quantidade já entregue em kg (0 se nenhuma entrega ainda)"],
  ["• data_contrato: data de assinatura no formato AAAA-MM-DD"],
  ["• data_entrega*: data limite de entrega FÍSICA do grão (logística) no formato AAAA-MM-DD"],
  ["• data_pagamento: data em que o pagamento (dinheiro) será recebido — pode ser diferente da"],
  ["  data_entrega. Ex: grão entregue em 31/03, pagamento em 15/04 (15 dias corridos)."],
  ["  Deixe em branco se pagamento ocorre no ato da entrega."],
  ["• comprador: nome do comprador (livre)"],
  ["• comprador_cpf_cnpj: CNPJ/CPF do comprador para vincular ao cadastro de Pessoas"],
  ["• produtor_cpf_cnpj: CPF/CNPJ do produtor responsável — deve existir em Produtores"],
  ["• frete: destinatario, remetente, cif, fob ou sem_frete"],
  ["• observacao: texto livre"],
  [""],
  ["⚠️  ATENÇÃO — Conversão de unidades:"],
  ["  O sistema armazena quantidades em kg e preços em R$/sc (×60)."],
  ["  Use a fórmula: preco_por_kg = preco_por_saca ÷ 60"],
  ["                 quantidade_kg = sacas × 60"],
];

const INSTRUCOES_PRODUTORES_IMP = [
  ["INSTRUÇÕES — IMPORTAÇÃO DE PRODUTORES"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• tipo: pf (pessoa física) ou pj (pessoa jurídica)"],
  ["• cpf_cnpj: CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) — deve ser único"],
  ["  Formatação livre — pontos, hífens e barras são aceitos"],
  ["• inscricao_est: Inscrição Estadual (apenas dígitos, sem pontuação)"],
  ["• email: endereço de e-mail válido (opcional)"],
  ["• telefone: com DDD (ex: (65)99999-0001)"],
  ["• cep: CEP no formato 00000-000 (opcional)"],
  ["• logradouro: rua, número, bairro (opcional)"],
  ["• municipio: nome do município sem abreviação"],
  ["• estado: sigla UF de 2 letras (ex: MT, SP, GO)"],
  [""],
  ["Diferença entre Produtor e Pessoa:"],
  ["  Produtor → quem produz e é dono/sócio da fazenda (aparece no LCDPR e contratos)"],
  ["  Pessoa   → fornecedores, compradores, arrendantes, motoristas, etc."],
  ["  Um produtor pode ter também um cadastro em Pessoas se for fornecedor/comprador."],
];

const INSTRUCOES_FAZENDAS_IMP = [
  ["INSTRUÇÕES — IMPORTAÇÃO DE FAZENDAS"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• nome: nome da propriedade (deve ser único na conta)"],
  ["• municipio: município sede da fazenda"],
  ["• estado: sigla UF (ex: MT)"],
  ["• area_total_ha: área total em hectares (ex: 2500.00)"],
  ["• cep: CEP da sede (opcional, formato 00000-000)"],
  ["• logradouro: endereço da sede (opcional)"],
  ["• car: Código do Cadastro Ambiental Rural (52 caracteres alfanuméricos)"],
  ["  Formato: UF-IBGE-HASH (ex: MT-5003420-5D8ECA1F2BA34BC7A5ED1FC3EBC89000)"],
  ["• nirf: Número do Imóvel na Receita Federal (até 8 dígitos)"],
  ["• itr_area_ha: área declarada no ITR (pode diferir da área total)"],
  [""],
  ["Efeitos da importação:"],
  ["  → Fazenda criada e vinculada à conta do usuário"],
  ["  → Talhões podem ser importados depois referenciando o nome da fazenda"],
  ["  → Matrículas de imóvel podem ser adicionadas em Cadastros → Fazendas → Matrículas"],
];

const INSTRUCOES_TALHOES_IMP = [
  ["INSTRUÇÕES — IMPORTAÇÃO DE TALHÕES"],
  [""],
  ["• Campos com * são obrigatórios"],
  ["• Não altere os nomes das colunas (linha 1)"],
  ["• nome: nome do talhão (ex: Talhão 1 Norte, Área Central)"],
  ["  Deve ser único dentro da fazenda informada"],
  ["• fazenda_nome: nome exato da fazenda cadastrada no sistema"],
  ["  O nome deve coincidir exatamente com o cadastrado (maiúsculas, acentos)"],
  ["• area_ha: área do talhão em hectares (ex: 320.5)"],
  ["• cultura_predominante: cultura principal do talhão (informativo, ex: Soja)"],
  ["  Este campo não é armazenado no banco — serve apenas de referência na importação"],
  ["• tipo_solo: tipo de solo predominante (ex: Latossolo Vermelho)"],
  ["• latitude / longitude: coordenadas GPS do centróide do talhão"],
  ["  Formato: graus decimais com sinal negativo para Sul/Oeste"],
  ["  Exemplo: latitude = -13.825000, longitude = -56.091000"],
  [""],
  ["Dica:"],
  ["  Importe as fazendas antes dos talhões. O sistema usa o nome da fazenda"],
  ["  para descobrir o fazenda_id automaticamente."],
];

const INSTRUCOES_CONTRATOS_FIN = [
  ["INSTRUÇÕES — IMPORTAÇÃO DE CONTRATOS FINANCEIROS"],
  [""],
  ["• Campos com * são obrigatórios. Os demais são opcionais."],
  ["• Não altere os nomes das colunas (linha 1)"],
  [""],
  ["IDENTIFICAÇÃO"],
  ["• numero_contrato*: número único do contrato no banco (ex: 20251215000000410)"],
  ["• descricao*: nome descritivo do contrato (ex: ORPAG-CREDITO EXPORTAÇÃO)"],
  ["• credor*: nome do banco/instituição financeira (ex: BANCO DO BRASIL SA)"],
  ["• credor_cpf_cnpj: CNPJ/CPF do credor para vincular ao cadastro de Pessoas"],
  ["• tipo*: custeio, investimento, cpr, egf, securitizacao, outros"],
  ["• linha_credito: programa de crédito (ex: PRONAMP, Moderfrota, FCO Rural, BNDES)"],
  [""],
  ["TIPO DE CÁLCULO (= Amortização)"],
  ["• tipo_calculo: sac, price ou bullet (padrão: sac)"],
  ["  sac    → SAC — Amortização Constante (parcelas decrescentes)"],
  ["  price  → Tabela Price (parcelas fixas)"],
  ["  bullet → só juros no período, principal no vencimento"],
  [""],
  ["CAPTAÇÃO — VALOR E MOEDA"],
  ["• moeda: BRL ou USD (padrão: BRL)"],
  ["• valor_financiado*: valor nominal do contrato na moeda original (referência, BI)"],
  ["• valor_liberado: valor efetivamente creditado na conta (após retenções de TAC, IOF,"],
  ["  spread, registro). Se vazio, usa valor_financiado. Gera CR (crédito) no Fluxo de Caixa."],
  ["  Ex: financiado=480000 | tac=1200 + iof=1824 retidos → liberado=476976"],
  ["• cotacao_usd: cotação R$/US$ na data do contrato — obrigatório se moeda=USD (ex: 5.85)"],
  ["  O sistema calcula automaticamente o equivalente em R$ para o BI"],
  [""],
  ["DATAS E PRAZO"],
  ["• data_contrato*: data de assinatura no formato AAAA-MM-DD"],
  ["• data_liberacao: data em que o recurso foi liberado (padrão: data_contrato)"],
  ["• data_entrega_produto: data limite para entrega física do produto (grão)"],
  ["  Usado em CPR e barter — quando o produtor deve entregar os grãos ao credor."],
  ["  Diferente de data_vencimento: uma é logística (entrega física), a outra é financeira."],
  ["• data_vencimento: data de vencimento FINANCEIRO — último pagamento em dinheiro."],
  ["  Para CPR puro (pago 100% em grão): deixe em branco ou igual a data_entrega_produto."],
  ["• prazo_meses: duração total em meses (ex: 12, 60) — necessário para gerar parcelas"],
  ["• carencia_meses: meses de carência antes de iniciar pagamentos (ex: 6) — padrão: 0"],
  [""],
  ["TAXAS E CUSTOS"],
  ["• taxa_juros_aa: taxa anual em % (ex: 11.16) — convertida para AM automaticamente"],
  ["• taxa_juros_am: taxa mensal em % (ex: 0.89) — use AA OU AM, não ambos"],
  ["• iof_pct: IOF em % (ex: 0.38)"],
  ["• tac_valor: Tarifa de Abertura de Crédito em R$ (ex: 1200.00)"],
  ["• outros_custos: outros custos fixos em R$ (registro, cartório, etc.)"],
  [""],
  ["PAGAMENTO"],
  ["• periodicidade_pagamento: mensal, bimestral, trimestral, semestral, anual ou bullet"],
  ["• auto_parcelas: sim (padrão) ou nao"],
  ["  sim → parcelas geradas automaticamente pelo prazo e periodicidade"],
  ["  nao → sem geração automática (use se já lançou as parcelas manualmente)"],
  [""],
  ["OUTROS"],
  ["• produtor_cpf_cnpj: CPF/CNPJ do produtor responsável (necessário para LCDPR)"],
  ["• observacao: texto livre"],
  [""],
  ["EXEMPLOS POR TIPO DE CONTRATO"],
  ["  Custeio BRL mensal SAC    → tipo=custeio, tipo_calculo=sac, periodicidade=mensal"],
  ["  Investimento Price        → tipo=investimento, tipo_calculo=price, periodicidade=mensal"],
  ["  ORPAG/CPR USD             → tipo=outros/cpr, moeda=USD, cotacao_usd=5.85, tipo_calculo=sac"],
  ["  FCO Rural carência        → tipo=investimento, linha_credito=FCO Rural, carencia_meses=6"],
  ["  Bullet (pagamento único)  → tipo_calculo=bullet, periodicidade=bullet, prazo_meses=total"],
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
  ["Campos de propriedade e aquisição (novos):"],
  ["• proprietario_cpf_cnpj: CPF ou CNPJ do proprietário do bem — vincula ao cadastro de Pessoas"],
  ["  → Essencial para o IR/IRPF quando há mais de um produtor na fazenda"],
  ["  → O CPF/CNPJ deve estar previamente cadastrado em Cadastros → Pessoas"],
  ["• nr_nf_aquisicao: número da Nota Fiscal de compra do bem (ex: 000123)"],
  ["• data_aquisicao: data da compra no formato AAAA-MM-DD (ex: 2022-03-15)"],
  ["• valor_aquisicao: valor de compra em R$ (ex: 480000.00) — sem R$, sem pontos de milhar"],
  [""],
  ["Campos de financiamento (novos):"],
  ["• status_financiamento: proprio, financiado ou quitado"],
  ["  proprio    → bem adquirido com recursos próprios (sem financiamento)"],
  ["  financiado → financiamento ativo, ainda sendo pago"],
  ["  quitado    → financiamento encerrado"],
  ["• numero_contrato_financiamento: Nº do contrato financeiro que financiou este bem"],
  ["  → Deve corresponder ao campo 'numero_contrato' no cadastro de Contratos Financeiros"],
  ["  → Se preenchido, o status muda automaticamente para 'quitado' quando a última"],
  ["    parcela do contrato for baixada no módulo Financeiro → Contratos Financeiros"],
  ["  → Deixe em branco se status_financiamento = proprio ou se o contrato não existe no sistema"],
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
      pessoas:          TEMPLATE_PESSOAS,
      cp:               TEMPLATE_CP,
      cr:               TEMPLATE_CR,
      insumos:          TEMPLATE_INSUMOS,
      produtos:         TEMPLATE_PRODUTOS,
      maquinas:         TEMPLATE_MAQUINAS,
      contratos_fin:    TEMPLATE_CONTRATOS_FIN,
      arrendamentos:    TEMPLATE_ARRENDAMENTOS,
      contratos_venda:  TEMPLATE_CONTRATOS_VENDA,
      produtores_imp:   TEMPLATE_PRODUTORES_IMP,
      fazendas_imp:     TEMPLATE_FAZENDAS_IMP,
      talhoes_imp:      TEMPLATE_TALHOES_IMP,
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
      ["• cliente / fornecedor / mao_obra: sim ou nao"],
      ["• moeda: BRL, USD ou barter"],
      ["• tipo_documento_lcdpr: RECIBO, NF, DUPLICATA, CHEQUE, PIX, TED ou OUTROS"],
      ["• pix_tipo: cpf, cnpj, email, telefone ou aleatoria"],
      ["• categoria insumo: semente, fertilizante, defensivo, inoculante, combustivel, peca, material, uso_consumo, escritorio, outros"],
      ["• unidade: kg, g, L, mL, sc, t, un, m, m2, cx, pc, par, bag, outros"],
      ["• SEMENTES: unidade é sempre kg — se informar 'bag' ou outra unidade, o sistema converte para kg automaticamente"],
    ];
    const instrMap: Record<Aba, (string | number)[][]> = {
      pessoas:          instrBase,
      cp:               INSTRUCOES_CP_CR,
      cr:               INSTRUCOES_CP_CR,
      insumos:          instrBase,
      produtos:         INSTRUCOES_PRODUTOS,
      maquinas:         INSTRUCOES_MAQUINAS,
      contratos_fin:    INSTRUCOES_CONTRATOS_FIN,
      arrendamentos:    INSTRUCOES_ARRENDAMENTOS,
      contratos_venda:  INSTRUCOES_CONTRATOS_VENDA,
      produtores_imp:   INSTRUCOES_PRODUTORES_IMP,
      fazendas_imp:     INSTRUCOES_FAZENDAS_IMP,
      talhoes_imp:      INSTRUCOES_TALHOES_IMP,
    };
    const instrucoes = utils.aoa_to_sheet(instrMap[aba]);
    utils.book_append_sheet(wb, instrucoes, "Instruções");

    const nomes: Record<Aba, string> = {
      pessoas:          "template_pessoas.xlsx",
      cp:               "template_contas_pagar.xlsx",
      cr:               "template_contas_receber.xlsx",
      insumos:          "template_insumos.xlsx",
      produtos:         "template_produtos.xlsx",
      maquinas:         "template_maquinas_veiculos.xlsx",
      contratos_fin:    "template_contratos_financeiros.xlsx",
      arrendamentos:    "template_arrendamentos.xlsx",
      contratos_venda:  "template_contratos_venda.xlsx",
      produtores_imp:   "template_produtores.xlsx",
      fazendas_imp:     "template_fazendas.xlsx",
      talhoes_imp:      "template_talhoes.xlsx",
    };
    writeFile(wb, nomes[aba]);
  });
}

// ─── Parse XLSX via servidor ──────────────────────────────────
// Node.js Buffer mode no servidor evita "Unsupported ZIP Compression method NaN"
// que ocorre no browser com arquivos XLSX exportados por ERPs como AgroSoft/Agrobase.
// (XLSX é um ZIP internamente — alguns ERPs usam compressão não-padrão.)
async function parseXlsx(file: File): Promise<Record<string, string>[]> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/parse-xlsx", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Erro no servidor ao ler o arquivo" }));
    throw new Error(err.error ?? "Erro ao processar arquivo");
  }
  const { rows: rawRows } = await res.json() as { rows: Record<string, unknown>[] };
  return rawRows.map(row => {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      cleaned[k.replace(/\*/g, "").trim()] = String(v ?? "");
    }
    return cleaned;
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

// Unidades aceitas para conversão automática de sementes
const UNIDADES_NAO_KG_SEMENTE = ["bag","sc","t","g","L","mL","un","cx","fardo","saco"];

function validarInsumo(r: Record<string, string>): InsumoRow {
  const row = r as unknown as InsumoRow;
  if (!row.nome?.trim())      return { ...row, _status: "erro", _msg: "nome obrigatório" };
  if (!row.categoria?.trim()) return { ...row, _status: "erro", _msg: "categoria obrigatória" };
  if (!row.unidade?.trim())   return { ...row, _status: "erro", _msg: "unidade obrigatória" };

  const catNorm = row.categoria.trim().toLowerCase();
  const unNorm  = row.unidade.trim().toLowerCase();

  // ── Sementes: unidade obrigatoriamente kg ──────────────────────────────────
  if (catNorm === "semente" && unNorm !== "kg") {
    const eraBag = unNorm === "bag";
    const msg = eraBag
      ? `bag → kg (verifique se estoque ${row.estoque || "0"} já está em kg)`
      : `${row.unidade} → kg (semente sempre em kg — verifique o estoque)`;
    return { ...row, categoria: catNorm, unidade: "kg", _unidade_original: row.unidade.trim(), _status: "aviso", _msg: msg };
  }

  return { ...row, categoria: catNorm, _status: "ok", _msg: "" };
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
const CAT_CAPTACAO_IMP: Record<string, string> = {
  custeio: "Captação de Custeio", investimento: "Captação de Financiamento",
  securitizacao: "Captação de Securitização", cpr: "Captação de CPR",
  egf: "Captação de EGF", outros: "Captação de Empréstimos",
};

function validarContratoFin(r: Record<string, string>): ContratoFinRow {
  const row = r as unknown as ContratoFinRow;
  if (!row.numero_contrato?.trim()) return { ...row, _status: "erro", _msg: "numero_contrato obrigatório" };
  if (!row.descricao?.trim())       return { ...row, _status: "erro", _msg: "descricao obrigatória" };
  if (!row.credor?.trim())          return { ...row, _status: "erro", _msg: "credor obrigatório" };
  const tipo = (row.tipo || "").trim().toLowerCase();
  if (!TIPOS_CONTRATO_FIN.includes(tipo))
    return { ...row, _status: "erro", _msg: `tipo inválido — use: ${TIPOS_CONTRATO_FIN.join(", ")}` };
  const valorField = (row.valor_financiado ?? (r as Record<string, string>).valor_total ?? "").toString();
  const valor = parseFloat(String(valorField).replace(",", ".").replace(/\./g, (m, o, s) => s.indexOf(",") !== -1 && o !== s.lastIndexOf(".") ? "" : m));
  if (isNaN(valor) || valor <= 0) return { ...row, _status: "erro", _msg: "valor_financiado inválido ou zero" };
  const moeda = (row.moeda || "BRL").trim().toUpperCase();
  if (moeda === "USD" && !row.cotacao_usd?.trim())
    return { ...row, _status: "erro", _msg: "cotacao_usd obrigatório quando moeda=USD" };
  if (!row.data_contrato?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.data_contrato.trim()))
    return { ...row, _status: "erro", _msg: "data_contrato deve ser AAAA-MM-DD" };
  if (row.data_liberacao?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.data_liberacao.trim()))
    return { ...row, _status: "erro", _msg: "data_liberacao deve ser AAAA-MM-DD" };
  if (row.data_entrega_produto?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.data_entrega_produto.trim()))
    return { ...row, _status: "erro", _msg: "data_entrega_produto deve ser AAAA-MM-DD" };
  if (row.data_vencimento?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.data_vencimento.trim()))
    return { ...row, _status: "erro", _msg: "data_vencimento deve ser AAAA-MM-DD" };
  if (row.prazo_meses?.trim() && (isNaN(parseInt(row.prazo_meses)) || parseInt(row.prazo_meses) < 1))
    return { ...row, _status: "erro", _msg: "prazo_meses deve ser número inteiro positivo" };
  const tipoCalc = (row.tipo_calculo || "sac").trim().toLowerCase();
  if (tipoCalc && !TIPOS_AMORTIZACAO.includes(tipoCalc))
    return { ...row, _status: "erro", _msg: `tipo_calculo deve ser: ${TIPOS_AMORTIZACAO.join(", ")}` };
  const periodicidade = (row.periodicidade_pagamento || "mensal").trim().toLowerCase();
  if (row.periodicidade_pagamento?.trim() && !PERIODICIDADES.includes(periodicidade))
    return { ...row, _status: "erro", _msg: `periodicidade_pagamento deve ser: ${PERIODICIDADES.join(", ")}` };
  return { ...row, tipo, moeda, tipo_calculo: tipoCalc || "sac", periodicidade_pagamento: periodicidade, _status: "ok", _msg: "" };
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

const MODALIDADES_CONTRATO = ["fixo", "a_fixar", "barter"];
const FRETES_CONTRATO = ["destinatario", "remetente", "cif", "fob", "sem_frete"];
const ESTADOS_BR = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

function validarContratoVenda(r: Record<string, string>): ContratoVendaRow {
  const row = r as unknown as ContratoVendaRow;
  if (!row.numero?.trim())         return { ...row, _status: "erro", _msg: "numero obrigatório" };
  if (!row.produto?.trim())        return { ...row, _status: "erro", _msg: "produto obrigatório" };
  if (!row.safra?.trim())          return { ...row, _status: "erro", _msg: "safra obrigatória" };
  if (!row.comprador?.trim())      return { ...row, _status: "erro", _msg: "comprador obrigatório" };
  if (!row.produtor_cpf_cnpj?.trim()) return { ...row, _status: "erro", _msg: "produtor_cpf_cnpj obrigatório" };
  const modalidade = (row.modalidade || "").trim().toLowerCase();
  if (!MODALIDADES_CONTRATO.includes(modalidade))
    return { ...row, _status: "erro", _msg: `modalidade deve ser: ${MODALIDADES_CONTRATO.join(", ")}` };
  const moeda = (row.moeda || "").trim().toUpperCase();
  if (!["BRL", "USD"].includes(moeda))
    return { ...row, _status: "erro", _msg: "moeda deve ser BRL ou USD" };
  const preco = parseFloat(String(row.preco_por_kg).replace(",", "."));
  if (isNaN(preco) || preco <= 0) return { ...row, _status: "erro", _msg: "preco_por_kg inválido" };
  const qtd = parseFloat(String(row.quantidade_kg).replace(",", "."));
  if (isNaN(qtd) || qtd <= 0) return { ...row, _status: "erro", _msg: "quantidade_kg inválida" };
  if (!row.data_contrato?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.data_contrato.trim()))
    return { ...row, _status: "erro", _msg: "data_contrato deve ser AAAA-MM-DD" };
  if (!row.data_entrega?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.data_entrega.trim()))
    return { ...row, _status: "erro", _msg: "data_entrega deve ser AAAA-MM-DD" };
  if (row.data_pagamento?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.data_pagamento.trim()))
    return { ...row, _status: "erro", _msg: "data_pagamento deve ser AAAA-MM-DD" };
  const frete = (row.frete || "sem_frete").trim().toLowerCase();
  if (row.frete?.trim() && !FRETES_CONTRATO.includes(frete))
    return { ...row, _status: "erro", _msg: `frete deve ser: ${FRETES_CONTRATO.join(", ")}` };
  return { ...row, modalidade, moeda, frete: frete || "sem_frete", _status: "ok", _msg: "" };
}

function validarProdutorImp(r: Record<string, string>): ProdutorImpRow {
  const row = r as unknown as ProdutorImpRow;
  if (!row.nome?.trim())   return { ...row, _status: "erro", _msg: "nome obrigatório" };
  const tipo = (row.tipo || "").trim().toLowerCase();
  if (!["pf", "pj"].includes(tipo)) return { ...row, _status: "erro", _msg: "tipo deve ser pf ou pj" };
  if (!row.cpf_cnpj?.trim()) return { ...row, _status: "erro", _msg: "cpf_cnpj obrigatório" };
  if (!row.estado?.trim() || !ESTADOS_BR.includes(row.estado.trim().toUpperCase()))
    return { ...row, _status: "erro", _msg: `estado deve ser sigla UF (ex: MT)` };
  return { ...row, tipo, estado: row.estado.trim().toUpperCase(), _status: "ok", _msg: "" };
}

function validarFazendaImp(r: Record<string, string>): FazendaImpRow {
  const row = r as unknown as FazendaImpRow;
  if (!row.nome?.trim())      return { ...row, _status: "erro", _msg: "nome obrigatório" };
  if (!row.municipio?.trim()) return { ...row, _status: "erro", _msg: "municipio obrigatório" };
  if (!row.estado?.trim() || !ESTADOS_BR.includes(row.estado.trim().toUpperCase()))
    return { ...row, _status: "erro", _msg: "estado deve ser sigla UF (ex: MT)" };
  const area = parseFloat(String(row.area_total_ha).replace(",", "."));
  if (isNaN(area) || area <= 0) return { ...row, _status: "erro", _msg: "area_total_ha inválida" };
  return { ...row, estado: row.estado.trim().toUpperCase(), _status: "ok", _msg: "" };
}

function validarTalhaoImp(r: Record<string, string>): TalhaoImpRow {
  const row = r as unknown as TalhaoImpRow;
  if (!row.nome?.trim())        return { ...row, _status: "erro", _msg: "nome obrigatório" };
  if (!row.fazenda_nome?.trim()) return { ...row, _status: "erro", _msg: "fazenda_nome obrigatório" };
  const area = parseFloat(String(row.area_ha).replace(",", "."));
  if (isNaN(area) || area <= 0) return { ...row, _status: "erro", _msg: "area_ha inválida" };
  if (row.latitude?.trim() && isNaN(parseFloat(row.latitude)))
    return { ...row, _status: "erro", _msg: "latitude inválida (graus decimais, ex: -13.825)" };
  if (row.longitude?.trim() && isNaN(parseFloat(row.longitude)))
    return { ...row, _status: "erro", _msg: "longitude inválida (graus decimais, ex: -56.091)" };
  return { ...row, _status: "ok", _msg: "" };
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
  const statusFin = row.status_financiamento?.trim().toLowerCase() || "proprio";
  if (statusFin && !["proprio", "financiado", "quitado"].includes(statusFin))
    return { ...row, _status: "erro", _msg: "status_financiamento: proprio, financiado ou quitado" };
  if (row.data_aquisicao?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.data_aquisicao.trim()))
    return { ...row, _status: "erro", _msg: "data_aquisicao deve ser AAAA-MM-DD" };
  return {
    ...row,
    nome: limparNomeMaquina(row.nome),
    tipo: tipoNorm,
    status_financiamento: statusFin || "proprio",
    _status: "ok",
    _msg: "",
  };
}

// ─── Componente UploadZone ────────────────────────────────────
function UploadZone({ onFile }: { onFile: (f: File) => void | Promise<void> }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag]     = useState(false);
  const [busy, setBusy]     = useState(false);
  const [erro, setErro]     = useState<string | null>(null);

  const handle = useCallback(async (f: File) => {
    setErro(null);
    setBusy(true);
    try { await onFile(f); }
    catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [onFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handle(f);
  }, [handle]);

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        onClick={() => !busy && ref.current?.click()}
        style={{
          border: `2px dashed ${drag ? "#1A4870" : erro ? "#E24B4A" : "#DDE2EE"}`,
          borderRadius: 10,
          padding: "40px 24px",
          textAlign: "center",
          cursor: busy ? "wait" : "pointer",
          background: drag ? "#D5E8F5" : erro ? "#FFF5F5" : "#F4F6FA",
          transition: "all 0.15s",
        }}
      >
        <input
          ref={ref}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => { if (e.target.files?.[0]) handle(e.target.files[0]); }}
        />
        <div style={{ fontSize: 32, marginBottom: 8 }}>{busy ? "⏳" : "📂"}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: busy ? "#888" : "#1A4870", marginBottom: 4 }}>
          {busy ? "Lendo arquivo..." : "Arraste o arquivo XLSX aqui"}
        </div>
        <div style={{ fontSize: 12, color: "#888" }}>{busy ? "aguarde" : "ou clique para selecionar"}</div>
      </div>
      {erro && (
        <div style={{ marginTop: 10, padding: "10px 14px", background: "#FFF5F5", border: "0.5px solid #E24B4A", borderRadius: 8, fontSize: 13, color: "#B91C1C", whiteSpace: "pre-wrap" }}>
          <strong>Erro ao ler o arquivo:</strong> {erro}
        </div>
      )}
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
function Resultado({ ok, erros, duplicados, atualizados, total, labelDuplicados = "Duplicadas" }: { ok: number; erros: number; duplicados: number; atualizados?: number; total: number; labelDuplicados?: string }) {
  const itens = [
    { label: "Total lidas",   valor: total,       cor: "#1A4870", bg: "#D5E8F5" },
    { label: "Importadas",    valor: ok,           cor: "#16A34A", bg: "#DCFCE7" },
    ...(atualizados ? [{ label: "Atualizadas",  valor: atualizados, cor: "#7C3AED", bg: "#EDE9FE" }] : []),
    { label: labelDuplicados, valor: duplicados,   cor: "#C9921B", bg: "#FBF3E0" },
    { label: "Com erro",      valor: erros,        cor: "#E24B4A", bg: "#FFF0F0" },
  ];
  return (
    <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
      {itens.map(({ label, valor, cor, bg }) => (
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
function ImportacaoInner() {
  const { fazendaId, contaId, userRole } = useAuth();
  const searchParams = useSearchParams();
  const [aba, setAba] = useState<Aba>((searchParams.get("aba") as Aba) ?? "pessoas");

  useEffect(() => {
    const a = searchParams.get("aba") as Aba | null;
    if (a) setAba(a);
  }, [searchParams]);

  // Estados por aba
  const [pessoasRows,  setPessoasRows]  = useState<PessoaRow[]>([]);
  const [cpRows,       setCpRows]       = useState<LancRow[]>([]);
  const [crRows,       setCrRows]       = useState<LancRow[]>([]);
  const [insumosRows,  setInsumosRows]  = useState<InsumoRow[]>([]);
  const [produtosRows, setProdutosRows] = useState<ProdutoRow[]>([]);
  const [maquinasRows,       setMaquinasRows]       = useState<MaquinaRow[]>([]);
  const [contratoFinRows,    setContratoFinRows]    = useState<ContratoFinRow[]>([]);
  const [arrendamentosRows,  setArrendamentosRows]  = useState<ArrendamentoRow[]>([]);
  const [contratoVendaRows,  setContratoVendaRows]  = useState<ContratoVendaRow[]>([]);
  const [produtoresImpRows,  setProdutoresImpRows]  = useState<ProdutorImpRow[]>([]);
  const [fazendasImpRows,    setFazendasImpRows]    = useState<FazendaImpRow[]>([]);
  const [talhoesImpRows,     setTalhoesImpRows]     = useState<TalhaoImpRow[]>([]);

  const [loadingPessoas,     setLoadingPessoas]     = useState(false);
  const [loadingCp,          setLoadingCp]          = useState(false);
  const [loadingCr,          setLoadingCr]          = useState(false);
  const [loadingInsumos,     setLoadingInsumos]     = useState(false);
  const [modoAtualizacaoInsumos, setModoAtualizacaoInsumos] = useState(false);
  const [loadingProdutos,    setLoadingProdutos]    = useState(false);
  const [loadingMaquinas,    setLoadingMaquinas]    = useState(false);
  const [loadingContratoFin, setLoadingContratoFin] = useState(false);
  const [modoAtualizacaoContratoFin, setModoAtualizacaoContratoFin] = useState(false);
  const [modoAtualizacaoContratoVenda, setModoAtualizacaoContratoVenda] = useState(false);
  const [loadingArrendamentos,  setLoadingArrendamentos]  = useState(false);
  const [loadingContratoVenda,  setLoadingContratoVenda]  = useState(false);
  const [loadingProdutoresImp,  setLoadingProdutoresImp]  = useState(false);
  const [loadingFazendasImp,    setLoadingFazendasImp]    = useState(false);
  const [loadingTalhoesImp,     setLoadingTalhoesImp]     = useState(false);

  type Resultado = { ok: number; erros: number; duplicados: number; atualizados?: number };
  const [resultPessoas,      setResultPessoas]      = useState<Resultado | null>(null);
  const [resultCp,           setResultCp]           = useState<Resultado | null>(null);
  const [resultCr,           setResultCr]           = useState<Resultado | null>(null);
  const [resultInsumos,      setResultInsumos]      = useState<Resultado | null>(null);
  const [resultProdutos,     setResultProdutos]     = useState<Resultado | null>(null);
  const [resultMaquinas,     setResultMaquinas]     = useState<Resultado | null>(null);
  const [resultContratoFin,  setResultContratoFin]  = useState<Resultado | null>(null);
  const [resultArrendamentos,  setResultArrendamentos]  = useState<Resultado | null>(null);
  const [resultContratoVenda,  setResultContratoVenda]  = useState<Resultado | null>(null);
  const [resultProdutoresImp,  setResultProdutoresImp]  = useState<Resultado | null>(null);
  const [resultFazendasImp,    setResultFazendasImp]    = useState<Resultado | null>(null);
  const [resultTalhoesImp,     setResultTalhoesImp]     = useState<Resultado | null>(null);

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
    const rows = raw.map(r => validarLanc(r));
    // ── Guarda de duplicidade com contratos financeiros ──────────────────────
    if (fazendaId) {
      const { data: autoLancs } = await supabase
        .from("lancamentos").select("numero_documento")
        .eq("fazenda_id", fazendaId).eq("tipo", "pagar").eq("auto", true);
      const autoNums = new Set(
        (autoLancs ?? []).map((l: { numero_documento: string | null }) =>
          (l.numero_documento ?? "").toLowerCase().trim()
        ).filter(Boolean)
      );
      rows.forEach(r => {
        if (r._status === "ok" && r.numero_documento?.trim()) {
          if (autoNums.has(r.numero_documento.trim().toLowerCase())) {
            r._status = "duplicado";
            r._msg = "CP já gerado automaticamente pelo contrato financeiro — não reimporte";
          }
        }
      });
    }
    setCpRows(rows); setResultCp(null);
  }

  async function handleFileCr(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarLanc(r));
    // ── Guarda: CR de liberação auto-gerado por contratos financeiros ────────
    if (fazendaId) {
      const { data: autoLancsCr } = await supabase
        .from("lancamentos").select("numero_documento")
        .eq("fazenda_id", fazendaId).eq("tipo", "receber").eq("auto", true);
      const autoNumsCr = new Set(
        (autoLancsCr ?? []).map((l: { numero_documento: string | null }) =>
          (l.numero_documento ?? "").toLowerCase().trim()
        ).filter(Boolean)
      );
      rows.forEach(r => {
        if (r._status === "ok" && r.numero_documento?.trim()) {
          if (autoNumsCr.has(r.numero_documento.trim().toLowerCase())) {
            r._status = "duplicado";
            r._msg = "CR de liberação já criado automaticamente pelo contrato financeiro";
          }
        }
      });
    }
    setCrRows(rows); setResultCr(null);
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
        mao_obra:   r.mao_obra?.toLowerCase() === "sim",
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

    // ── Carregar números auto-gerados por contratos (guarda de duplicidade) ──
    const { data: autoLancsGlobal } = await supabase
      .from("lancamentos").select("numero_documento")
      .eq("fazenda_id", fazendaId).eq("tipo", tipo).eq("auto", true);
    const autoNumsGlobal = new Set(
      (autoLancsGlobal ?? []).map((l: { numero_documento: string | null }) =>
        (l.numero_documento ?? "").toLowerCase().trim()
      ).filter(Boolean)
    );

    for (const r of rows) {
      if (r._status === "erro") { erros++; continue; }
      if (r._status === "duplicado") { duplicados++; continue; }
      // Segunda linha de defesa: bloqueia CP duplicados de contratos financeiros
      if (tipo === "pagar" && r.numero_documento?.trim() &&
          autoNumsGlobal.has(r.numero_documento.trim().toLowerCase())) {
        r._status = "duplicado";
        r._msg = "CP já gerado automaticamente pelo contrato financeiro";
        duplicados++; continue;
      }
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
      if (r._status === "erro") { erros++; continue; }
      if (r._status === "duplicado" && !modoAtualizacaoInsumos) { duplicados++; continue; }
      const payload = {
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
      };
      if (r._status === "duplicado" && modoAtualizacaoInsumos) {
        const { error } = await supabase.from("insumos")
          .update(payload)
          .eq("fazenda_id", fazendaId)
          .eq("tipo", "insumo")
          .eq("nome", r.nome.trim());
        if (error) { r._status = "erro"; r._msg = error.message; erros++; }
        else { r._status = "ok"; ok++; }
      } else {
        const { error } = await supabase.from("insumos").insert(payload);
        if (error) { r._status = "erro"; r._msg = error.message; erros++; }
        else ok++;
      }
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
          if (modoAtualizacaoContratoFin) {
            r._status = "atualizar";
            r._msg = "contrato existente — datas serão atualizadas";
          } else {
            r._status = "duplicado"; r._msg = "contrato já existe no módulo";
          }
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
    let ok = 0, erros = 0, duplicados = 0, atualizados = 0;
    for (const r of contratoFinRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }

      // Modo atualização: corrige datas em contratos já existentes
      if (r._status === "atualizar") {
        const { error } = await supabase
          .from("contratos_financeiros")
          .update({
            data_entrega_produto: r.data_entrega_produto?.trim() || null,
            data_vencimento:      r.data_vencimento?.trim()      || null,
            data_liberacao:       r.data_liberacao?.trim()       || null,
          })
          .eq("fazenda_id", fazendaId)
          .eq("numero_contrato", r.numero_contrato.trim());
        if (error) { erros++; } else { atualizados++; }
        continue;
      }
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
      const valorFin  = parseFloat(String(r.valor_financiado || (r as unknown as Record<string,string>).valor_total || "0").replace(",", "."));
      const cotacaoV  = r.cotacao_usd?.trim() ? parseFloat(r.cotacao_usd.replace(",", ".")) : null;
      const moedaUp   = (r.moeda || "BRL").toUpperCase();
      const valorBRL  = moedaUp === "USD" && cotacaoV ? valorFin * cotacaoV : valorFin;
      // Calcula taxa AM a partir da AA se necessário
      let taxaAmFinal: number | null = null;
      if (r.taxa_juros_am?.trim()) {
        taxaAmFinal = parseFloat(r.taxa_juros_am.replace(",", "."));
      } else if (r.taxa_juros_aa?.trim()) {
        const aa = parseFloat(r.taxa_juros_aa.replace(",", "."));
        taxaAmFinal = (Math.pow(1 + aa / 100, 1 / 12) - 1) * 100;
      }
      const { data: contrato, error } = await supabase.from("contratos_financeiros").insert({
        fazenda_id:              fazendaId,
        numero_contrato:         r.numero_contrato.trim(),
        descricao:               r.descricao.trim(),
        credor:                  r.credor.trim(),
        pessoa_id:               pessoaId,
        produtor_id:             produtorIdFin,
        tipo:                    r.tipo,
        linha_credito:           r.linha_credito?.trim() || null,
        moeda:                   moedaUp,
        valor_total:             valorBRL,        // armazena sempre em BRL
        cotacao_usd:             cotacaoV,
        data_contrato:           r.data_contrato.trim(),
        data_liberacao:          r.data_liberacao?.trim() || null,
        data_entrega_produto:    r.data_entrega_produto?.trim() || null,
        data_vencimento:         r.data_vencimento?.trim() || null,
        prazo_meses:             r.prazo_meses?.trim() ? parseInt(r.prazo_meses) : null,
        taxa_juros_aa:           r.taxa_juros_aa?.trim() ? parseFloat(r.taxa_juros_aa.replace(",", ".")) : null,
        taxa_juros_am:           taxaAmFinal,
        iof_pct:                 r.iof_pct?.trim() ? parseFloat(r.iof_pct.replace(",", ".")) : null,
        tac_valor:               r.tac_valor?.trim() ? parseFloat(r.tac_valor.replace(",", ".")) : null,
        outros_custos:           r.outros_custos?.trim() ? parseFloat(r.outros_custos.replace(",", ".")) : null,
        tipo_amortizacao:        (r.tipo_calculo || "sac").toUpperCase(),
        periodicidade_pagamento: r.periodicidade_pagamento || "mensal",
        estrutura_pagamento:     "simples",
        observacao:              r.observacao?.trim() || null,
        status:                  "ativo",
      }).select("id").single();

      if (error) { r._status = "erro"; r._msg = error.message; erros++; continue; }
      ok++;

      // ── CR de liberação: dinheiro que entra na conta ─────────────────────
      // valor_liberado = valor creditado após retenções (TAC, IOF, spread)
      // Se não informado → usa valor_financiado (sem retenções)
      if (contrato) {
        const vlRaw     = r.valor_liberado?.trim() ? parseFloat(r.valor_liberado.replace(",", ".")) : null;
        const vlBRL     = vlRaw !== null
          ? (moedaUp === "USD" && cotacaoV ? vlRaw * cotacaoV : vlRaw)
          : valorBRL; // fallback: mesmo valor do financiado
        const dataLib   = r.data_liberacao?.trim() || r.data_contrato.trim();
        const hoje      = new Date().toISOString().slice(0, 10);
        // Verifica se já existe CR auto-gerado para não duplicar
        const { count: crAutoExist } = await supabase
          .from("lancamentos").select("id", { count: "exact", head: true })
          .eq("fazenda_id", fazendaId).eq("tipo", "receber")
          .eq("auto", true).eq("numero_documento", r.numero_contrato.trim());
        if ((crAutoExist ?? 0) === 0) {
          // Status: se data de liberação já passou → baixado (histórico)
          const jaBaixado = dataLib <= hoje;
          await supabase.from("lancamentos").insert({
            fazenda_id:       fazendaId,
            tipo:             "receber",
            descricao:        `${r.descricao.trim()} — Liberação de Recurso`,
            categoria:        CAT_CAPTACAO_IMP[r.tipo] ?? "Captação de Empréstimos",
            data_lancamento:  dataLib,
            data_vencimento:  dataLib,
            valor:            Math.round(vlBRL * 100) / 100,
            moeda:            "BRL",
            status:           jaBaixado ? "baixado" : "em_aberto",
            data_baixa:       jaBaixado ? dataLib : null,
            auto:             true,
            numero_documento: r.numero_contrato.trim(),
            pessoa_id:        pessoaId,
            observacao:       vlRaw !== null && vlRaw < valorFin
              ? `Retenções: ${moedaUp === "USD" ? "US$" : "R$"} ${(valorFin - vlRaw).toFixed(2)} (TAC/IOF/spread)`
              : null,
          });
        }
      }

      // Auto-geração de parcelas com suporte a periodicidade
      const prazo = parseInt(r.prazo_meses || "0");
      const skipAutoP = (r.auto_parcelas || "").toLowerCase() === "nao";
      const autoP = !skipAutoP && prazo > 0;
      if (autoP && contrato) {
        const carencia = parseInt(r.carencia_meses || "0") || 0;
        const startDate = r.data_liberacao?.trim() || r.data_contrato.trim();
        const i = taxaAmFinal ? taxaAmFinal / 100 : 0;
        const pv = valorBRL;
        const tipoAmort = (r.tipo_calculo || "sac").toLowerCase();
        const periodicidade = (r.periodicidade_pagamento || "mensal").toLowerCase();
        const parcRows: Record<string, unknown>[] = [];

        const base = { contrato_id: contrato.id, fazenda_id: fazendaId, despesas_acessorios: 0, status: "em_aberto" };

        if (false) { // FCO estrutura especial não suportada na importação
          // Estrutura FCO/BNDES: juros semestrais + amortização anual SAC
          const numAnos = Math.ceil(prazo / 12);
          const amortAnual = pv / numAnos;
          let saldo = pv;
          let numParc = 0;
          for (let ano = 1; ano <= numAnos; ano++) {
            numParc++;
            const jSem = Math.round(saldo * i * 6 * 100) / 100;
            parcRows.push({ ...base, num_parcela: numParc, data_vencimento: addMonths(startDate, carencia + (ano - 1) * 12 + 6), amortizacao: 0, juros: jSem, valor_parcela: jSem, saldo_devedor: saldo });
            numParc++;
            const jAnu = Math.round(saldo * i * 6 * 100) / 100;
            saldo -= amortAnual;
            parcRows.push({ ...base, num_parcela: numParc, data_vencimento: addMonths(startDate, carencia + ano * 12), amortizacao: Math.round(amortAnual * 100) / 100, juros: jAnu, valor_parcela: Math.round((amortAnual + jAnu) * 100) / 100, saldo_devedor: Math.max(0, Math.round(saldo * 100) / 100) });
          }
        } else if (periodicidade === "bullet" || tipoAmort === "bullet") {
          // Bullet: juros periódicos + principal no final
          const mesesPorParcela = MESES_POR_PERIODO[periodicidade] ?? prazo;
          const numParcelas = periodicidade === "bullet" ? 1 : Math.ceil(prazo / mesesPorParcela);
          const iPeriod = i === 0 ? 0 : Math.pow(1 + i, mesesPorParcela) - 1;
          const jPeriod = Math.round(pv * iPeriod * 100) / 100;
          if (numParcelas === 1) {
            parcRows.push({ ...base, num_parcela: 1, data_vencimento: addMonths(startDate, carencia + prazo), amortizacao: pv, juros: Math.round(pv * i * prazo * 100) / 100, valor_parcela: Math.round(pv * (1 + i * prazo) * 100) / 100, saldo_devedor: 0 });
          } else {
            for (let m = 1; m < numParcelas; m++) {
              parcRows.push({ ...base, num_parcela: m, data_vencimento: addMonths(startDate, carencia + m * mesesPorParcela), amortizacao: 0, juros: jPeriod, valor_parcela: jPeriod, saldo_devedor: pv });
            }
            parcRows.push({ ...base, num_parcela: numParcelas, data_vencimento: addMonths(startDate, carencia + numParcelas * mesesPorParcela), amortizacao: pv, juros: jPeriod, valor_parcela: Math.round((pv + jPeriod) * 100) / 100, saldo_devedor: 0 });
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
              parcRows.push({ ...base, num_parcela: m, data_vencimento: addMonths(startDate, carencia + m * mesesPorParcela), amortizacao: Math.round(amort * 100) / 100, juros: Math.round(juros * 100) / 100, valor_parcela: Math.round(pf * 100) / 100, saldo_devedor: Math.max(0, Math.round(saldo * 100) / 100) });
            }
          } else {
            // SAC
            const amort = pv / numParcelas; let saldo = pv;
            for (let m = 1; m <= numParcelas; m++) {
              const juros = saldo * iPeriod; saldo -= amort;
              parcRows.push({ ...base, num_parcela: m, data_vencimento: addMonths(startDate, carencia + m * mesesPorParcela), amortizacao: Math.round(amort * 100) / 100, juros: Math.round(juros * 100) / 100, valor_parcela: Math.round((amort + juros) * 100) / 100, saldo_devedor: Math.max(0, Math.round(saldo * 100) / 100) });
            }
          }
        }
        if (parcRows.length > 0) {
          const numDoc = r.numero_contrato.trim();
          // ── Guarda de duplicidade: verifica CP auto-gerados anteriores ──────
          const { count: cpAutoExist } = await supabase
            .from("lancamentos").select("id", { count: "exact", head: true })
            .eq("fazenda_id", fazendaId).eq("tipo", "pagar")
            .eq("auto", true).eq("numero_documento", numDoc);

          if ((cpAutoExist ?? 0) > 0) {
            // CP já existem — insere apenas parcelas sem criar CP duplicados
            await supabase.from("parcelas_pagamento").insert(parcRows);
            r._msg = `Parcelas criadas (${cpAutoExist} CP auto já existiam — não duplicados)`;
          } else {
            // ── Cria CP em lancamentos e vincula às parcelas ─────────────────
            const hoje = new Date().toISOString().slice(0, 10);
            const categoria = CAT_CAPTACAO_IMP[r.tipo] ?? "Captação de Empréstimos";
            const totalP = parcRows.length;
            const lancRows = parcRows.map(p => ({
              fazenda_id:       fazendaId,
              tipo:             "pagar",
              descricao:        `${r.descricao.trim()} — Parcela ${p.num_parcela as number}/${totalP}`,
              categoria,
              data_lancamento:  hoje,
              data_vencimento:  p.data_vencimento as string,
              valor:            p.valor_parcela as number,
              moeda:            moedaUp,
              status:           "em_aberto",
              auto:             true,
              numero_documento: numDoc,
              pessoa_id:        pessoaId,
            }));
            const { data: lancCriados } = await supabase
              .from("lancamentos").insert(lancRows).select("id");
            if (lancCriados?.length) {
              parcRows.forEach((p, idx) => { p.lancamento_id = lancCriados[idx]?.id ?? null; });
            }
            await supabase.from("parcelas_pagamento").insert(parcRows);
          }
        }
      }

      // Vincula CP existentes apenas quando prazo_meses não foi informado (fallback)
      if (!autoP && (r._cp_encontrados ?? 0) > 0 && contrato) {
        const { data: cpExist } = await supabase.from("lancamentos")
          .select("id, valor, data_vencimento")
          .eq("fazenda_id", fazendaId).eq("tipo", "pagar")
          .eq("numero_documento", r.numero_contrato.trim())
          .order("data_vencimento");
        if (cpExist?.length) {
          const parcRowsLink = cpExist.map((l: { id: string; valor: number; data_vencimento: string }, idx: number) => ({
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
          await supabase.from("parcelas_pagamento").insert(parcRowsLink);
        }
      }
    }
    setContratoFinRows([...contratoFinRows]);
    setResultContratoFin({ ok, erros, duplicados, atualizados });
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

    // Mapas de resolução de FK (CPF/CNPJ → id)
    const { data: pessoasDB } = await supabase.from("pessoas").select("id, cpf_cnpj").eq("fazenda_id", fazendaId);
    const pessoaMap: Record<string, string> = {};
    (pessoasDB ?? []).forEach((p: { id: string; cpf_cnpj: string | null }) => {
      if (p.cpf_cnpj) pessoaMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id;
    });

    // Mapa: numero_documento → id de contratos financeiros
    const { data: contratosDB } = await supabase
      .from("contratos_financeiros")
      .select("id, numero_documento")
      .eq("fazenda_id", fazendaId)
      .not("numero_documento", "is", null);
    const contratoMap: Record<string, string> = {};
    (contratosDB ?? []).forEach((c: { id: string; numero_documento: string | null }) => {
      if (c.numero_documento) contratoMap[c.numero_documento.trim()] = c.id;
    });

    for (const r of maquinasRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }

      const docProp = r.proprietario_cpf_cnpj?.replace(/\D/g, "");
      const proprietarioId = docProp ? (pessoaMap[docProp] ?? null) : null;
      const nrContrato = r.numero_contrato_financiamento?.trim();
      const contratoFinId = nrContrato ? (contratoMap[nrContrato] ?? null) : null;

      const { error } = await supabase.from("maquinas").insert({
        fazenda_id:                 fazendaId,
        nome:                       r.nome.trim(),
        tipo:                       normalizarTipoMaquina(r.tipo),
        patrimonio:                 r.patrimonio?.trim() || null,
        marca:                      r.marca?.trim() || null,
        modelo:                     r.modelo?.trim() || null,
        ano:                        r.ano?.trim() ? parseInt(r.ano.trim()) : null,
        chassi:                     r.chassi?.trim() || null,
        horimetro_atual:            r.horimetro_atual?.trim() ? parseFloat(r.horimetro_atual.replace(",", ".")) : null,
        proprietario_id:            proprietarioId,
        nr_nf_aquisicao:            r.nr_nf_aquisicao?.trim() || null,
        data_aquisicao:             r.data_aquisicao?.trim() || null,
        valor_aquisicao:            r.valor_aquisicao?.trim() ? parseFloat(r.valor_aquisicao.replace(/\./g, "").replace(",", ".")) : null,
        status_financiamento:       r.status_financiamento || "proprio",
        contrato_financiamento_id:  contratoFinId,
        ativa:                      true,
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

  // ─── Contratos de Venda ───────────────────────────────────
  async function handleFileContratoVenda(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarContratoVenda(r));
    // Duplicados dentro do arquivo por número
    const nums = rows.map(r => r.numero?.trim().toLowerCase()).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.numero) {
        const n = r.numero.trim().toLowerCase();
        if (n && nums.indexOf(n) !== i) { r._status = "duplicado"; r._msg = "número duplicado no arquivo"; }
      }
    });
    if (fazendaId) {
      const { data: exist } = await supabase.from("contratos").select("numero").eq("fazenda_id", fazendaId);
      const existSet = new Set((exist ?? []).map((c: { numero: string | null }) => (c.numero ?? "").trim().toLowerCase()).filter(Boolean));
      rows.forEach(r => {
        if (r._status === "ok" && r.numero && existSet.has(r.numero.trim().toLowerCase())) {
          if (modoAtualizacaoContratoVenda) {
            r._status = "atualizar"; r._msg = "contrato existente — datas serão atualizadas";
          } else {
            r._status = "duplicado"; r._msg = "contrato já existe";
          }
        }
      });
    }
    setContratoVendaRows(rows); setResultContratoVenda(null);
  }

  async function importarContratosVenda() {
    if (!fazendaId || !contratoVendaRows.length) return;
    setLoadingContratoVenda(true);
    let ok = 0, erros = 0, duplicados = 0, atualizados = 0;

    const [pessoasRes, produtoresRes, safrasRes, ciclosRes] = await Promise.all([
      supabase.from("pessoas").select("id, cpf_cnpj").eq("fazenda_id", fazendaId),
      supabase.from("produtores").select("id, cpf_cnpj").eq("fazenda_id", fazendaId),
      supabase.from("anos_safra").select("id, descricao").eq("fazenda_id", fazendaId),
      supabase.from("ciclos").select("id, descricao").eq("fazenda_id", fazendaId),
    ]);
    const pessoaMap: Record<string, string> = {};
    (pessoasRes.data ?? []).forEach((p: { id: string; cpf_cnpj: string | null }) => { if (p.cpf_cnpj) pessoaMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id; });
    const produtorMap: Record<string, string> = {};
    (produtoresRes.data ?? []).forEach((p: { id: string; cpf_cnpj: string | null }) => { if (p.cpf_cnpj) produtorMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id; });
    const safraMap: Record<string, string> = {};
    (safrasRes.data ?? []).forEach((s: { id: string; descricao: string }) => { safraMap[s.descricao.trim().toLowerCase()] = s.id; });
    const cicloMap: Record<string, string> = {};
    (ciclosRes.data ?? []).forEach((c: { id: string; descricao: string }) => { cicloMap[c.descricao.trim().toLowerCase()] = c.id; });

    for (const r of contratoVendaRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }

      if (r._status === "atualizar") {
        // Busca o contrato atual para pegar lancamento_cr_id antes de atualizar
        const { data: contratoAtual } = await supabase
          .from("contratos")
          .select("id, lancamento_cr_id")
          .eq("fazenda_id", fazendaId)
          .eq("numero", r.numero.trim())
          .maybeSingle();

        const { error } = await supabase
          .from("contratos")
          .update({
            data_entrega:   r.data_entrega.trim(),
            data_pagamento: r.data_pagamento?.trim() || null,
          })
          .eq("fazenda_id", fazendaId)
          .eq("numero", r.numero.trim());

        if (error) { r._status = "erro"; r._msg = error.message; erros++; continue; }

        // Propaga data_pagamento → data_vencimento no lancamento de CR vinculado
        if (contratoAtual?.lancamento_cr_id && r.data_pagamento?.trim()) {
          await supabase
            .from("lancamentos")
            .update({ data_vencimento: r.data_pagamento.trim() })
            .eq("id", contratoAtual.lancamento_cr_id);
        }

        atualizados++;
        continue;
      }

      const precoPorKg = parseFloat(String(r.preco_por_kg).replace(",", "."));
      const precoPorSaca = Math.round(precoPorKg * 60 * 100) / 100;
      const qtdKg = parseFloat(String(r.quantidade_kg).replace(",", "."));
      const entregueKg = r.entregue_kg?.trim() ? parseFloat(String(r.entregue_kg).replace(",", ".")) : 0;
      const safraId = safraMap[r.safra.trim().toLowerCase()] ?? null;
      const cicloId = r.ciclo?.trim() ? (cicloMap[r.ciclo.trim().toLowerCase()] ?? null) : null;
      const pessoaId = r.comprador_cpf_cnpj?.trim() ? (pessoaMap[r.comprador_cpf_cnpj.replace(/\D/g, "")] ?? null) : null;
      const produtorId = r.produtor_cpf_cnpj?.trim() ? (produtorMap[r.produtor_cpf_cnpj.replace(/\D/g, "")] ?? null) : null;

      const { error } = await supabase.from("contratos").insert({
        fazenda_id:    fazendaId,
        numero:        r.numero.trim(),
        produto:       r.produto.trim(),
        safra:         r.safra.trim(),
        ano_safra_id:  safraId,
        ciclo_id:      cicloId,
        modalidade:    r.modalidade as "fixo" | "a_fixar" | "barter",
        moeda:         r.moeda as "BRL" | "USD",
        preco:         precoPorSaca,
        quantidade_sc: qtdKg,
        entregue_sc:   entregueKg,
        data_contrato:  r.data_contrato.trim(),
        data_entrega:   r.data_entrega.trim(),
        data_pagamento: r.data_pagamento?.trim() || null,
        comprador:      r.comprador.trim(),
        pessoa_id:     pessoaId,
        produtor_id:   produtorId,
        frete:         (r.frete || "sem_frete") as "destinatario"|"remetente"|"cif"|"fob"|"sem_frete",
        observacao:    r.observacao?.trim() || null,
        tipo:          "venda",
        status:        entregueKg >= qtdKg ? "encerrado" : entregueKg > 0 ? "parcial" : "aberto",
        confirmado:    true,
        autorizacao:   "autorizada",
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else ok++;
    }
    setContratoVendaRows([...contratoVendaRows]);
    setResultContratoVenda({ ok, erros, duplicados, atualizados });
    setLoadingContratoVenda(false);
  }

  // ─── Produtores ───────────────────────────────────────────
  async function handleFileProdutoresImp(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarProdutorImp(r));
    // Primeira ocorrência de cada CPF no arquivo
    const cpfFirstIndex: Record<string, number> = {};
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.cpf_cnpj) {
        const c = r.cpf_cnpj.replace(/\D/g, "");
        if (c) {
          if (cpfFirstIndex[c] === undefined) cpfFirstIndex[c] = i;
          else { r._status = "ie_merge"; r._msg = `→ IE mesclada ao produtor da linha ${cpfFirstIndex[c] + 1}`; }
        }
      }
    });
    if (fazendaId) {
      const { data: exist } = await supabase.from("produtores").select("id, cpf_cnpj").eq("fazenda_id", fazendaId);
      const existMap: Record<string, string> = {};
      (exist ?? []).forEach((p: { id: string; cpf_cnpj: string | null }) => {
        if (p.cpf_cnpj) existMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id;
      });
      rows.forEach(r => {
        if (r._status === "ok" && r.cpf_cnpj && existMap[r.cpf_cnpj.replace(/\D/g, "")]) {
          r._status = "ie_merge";
          r._merge_into_id = existMap[r.cpf_cnpj.replace(/\D/g, "")];
          r._msg = r.inscricao_est?.trim() ? "→ IE adicionada ao produtor existente" : "→ produtor já cadastrado (sem IE nova)";
        }
      });
    }
    setProdutoresImpRows(rows); setResultProdutoresImp(null);
  }

  async function importarProdutoresImp() {
    if (!fazendaId || !produtoresImpRows.length) return;
    setLoadingProdutoresImp(true);
    let ok = 0, erros = 0, mesclados = 0;
    // Mapa cpf → produtor_id recém-criado (para IEs de duplicatas internas do arquivo)
    const criados: Record<string, string> = {};

    for (const r of produtoresImpRows) {
      if (r._status === "erro") { erros++; continue; }

      if (r._status === "ie_merge") {
        // Resolve o produtor_id: banco (merge_into_id) ou recém-criado na mesma importação
        let prodId = r._merge_into_id;
        if (!prodId && r.cpf_cnpj) prodId = criados[r.cpf_cnpj.replace(/\D/g, "")];
        if (prodId && r.inscricao_est?.trim()) {
          await supabase.from("produtor_inscricoes_estaduais").insert({
            produtor_id:       prodId,
            inscricao_estadual: r.inscricao_est.trim(),
            municipio:         r.municipio?.trim() || null,
            estado:            r.estado?.trim() || "MT",
            ativa:             true,
          });
          r._msg = "→ IE adicionada ✓";
        } else if (!r.inscricao_est?.trim()) {
          r._msg = "→ sem IE para mesclar";
        }
        mesclados++;
        continue;
      }

      // Status "ok" → inserir produtor
      const { data: novo, error } = await supabase.from("produtores").insert({
        fazenda_id:    fazendaId,
        conta_id:      contaId,
        nome:          r.nome.trim(),
        tipo:          r.tipo as "pf" | "pj",
        cpf_cnpj:      r.cpf_cnpj?.trim() || null,
        inscricao_est: r.inscricao_est?.trim() || null,
        email:         r.email?.trim() || null,
        telefone:      r.telefone?.trim() || null,
        cep:           r.cep?.trim() || null,
        logradouro:    r.logradouro?.trim() || null,
        municipio:     r.municipio?.trim() || null,
        estado:        r.estado?.trim() || null,
      }).select("id").single();
      if (error) { r._status = "erro"; r._msg = error.message; erros++; continue; }
      ok++;
      if (novo?.id && r.cpf_cnpj) criados[r.cpf_cnpj.replace(/\D/g, "")] = novo.id;
      // Registra também a IE principal na tabela auxiliar
      if (novo?.id && r.inscricao_est?.trim()) {
        await supabase.from("produtor_inscricoes_estaduais").insert({
          produtor_id:       novo.id,
          inscricao_estadual: r.inscricao_est.trim(),
          municipio:         r.municipio?.trim() || null,
          estado:            r.estado?.trim() || "MT",
          ativa:             true,
        });
      }
    }
    setProdutoresImpRows([...produtoresImpRows]);
    setResultProdutoresImp({ ok, erros, duplicados: mesclados });
    setLoadingProdutoresImp(false);
  }

  // ─── Fazendas ─────────────────────────────────────────────
  async function handleFileFazendasImp(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarFazendaImp(r));
    const nomes = rows.map(r => r.nome?.trim().toLowerCase()).filter(Boolean);
    rows.forEach((r, i) => {
      if (r._status === "ok" && r.nome) {
        const n = r.nome.trim().toLowerCase();
        if (n && nomes.indexOf(n) !== i) { r._status = "duplicado"; r._msg = "nome duplicado no arquivo"; }
      }
    });
    if (contaId) {
      const { data: exist } = await supabase.from("fazendas").select("nome").eq("conta_id", contaId);
      const existSet = new Set((exist ?? []).map((f: { nome: string }) => f.nome.trim().toLowerCase()));
      rows.forEach(r => {
        if (r._status === "ok" && r.nome && existSet.has(r.nome.trim().toLowerCase()))
          { r._status = "duplicado"; r._msg = "fazenda já cadastrada na conta"; }
      });
    }
    setFazendasImpRows(rows); setResultFazendasImp(null);
  }

  async function importarFazendasImp() {
    if (!fazendasImpRows.length) return;
    setLoadingFazendasImp(true);
    let ok = 0, erros = 0, duplicados = 0;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const ownerUserId = authData?.user?.id ?? null;
      for (const r of fazendasImpRows) {
        if (r._status === "duplicado") { duplicados++; continue; }
        if (r._status === "erro")      { erros++;      continue; }
        const area = parseFloat(String(r.area_total_ha).replace(",", "."));
        const itrArea = r.itr_area_ha?.trim() ? parseFloat(String(r.itr_area_ha).replace(",", ".")) : null;
        const { error } = await supabase.from("fazendas").insert({
          conta_id:      contaId ?? null,
          owner_user_id: ownerUserId,
          nome:          r.nome.trim(),
          municipio:     r.municipio.trim(),
          estado:        r.estado.trim(),
          area_total_ha: area,
          cep:           r.cep?.trim() || null,
          logradouro:    r.logradouro?.trim() || null,
          car:           r.car?.trim() || null,
          nirf:          r.nirf?.trim() || null,
          itr:           itrArea ? String(itrArea) : null,
        });
        if (error) {
          r._status = "erro";
          r._msg = error.code === "42501"
            ? "Sem permissão (execute Seção 113 no Supabase SQL Editor)"
            : error.message;
          erros++;
        } else ok++;
      }
    } catch (e) {
      alert("Erro inesperado ao importar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setFazendasImpRows([...fazendasImpRows]);
      setResultFazendasImp({ ok, erros, duplicados });
      setLoadingFazendasImp(false);
    }
  }

  // ─── Talhões ──────────────────────────────────────────────
  async function handleFileTalhoesImp(file: File) {
    const raw = await parseXlsx(file);
    const rows = raw.map(r => validarTalhaoImp(r));
    setTalhoesImpRows(rows); setResultTalhoesImp(null);
  }

  async function importarTalhoesImp() {
    if (!fazendaId || !talhoesImpRows.length) return;
    setLoadingTalhoesImp(true);
    let ok = 0, erros = 0, duplicados = 0;

    // Mapa de fazendas da conta pelo nome (usa conta_id se disponível, senão owner_user_id)
    const { data: fazendasDB } = contaId
      ? await supabase.from("fazendas").select("id, nome").eq("conta_id", contaId)
      : fazendaId
        ? await supabase.from("fazendas").select("id, nome").eq("owner_user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
        : { data: [] };
    const fazendaMap: Record<string, string> = {};
    (fazendasDB ?? []).forEach((f: { id: string; nome: string }) => {
      fazendaMap[f.nome.trim().toLowerCase()] = f.id;
    });

    // Talhões já existentes por fazenda
    const { data: talhoesDB } = await supabase.from("talhoes").select("fazenda_id, nome");
    const talhaoSet = new Set((talhoesDB ?? []).map((t: { fazenda_id: string; nome: string }) => `${t.fazenda_id}::${t.nome.toLowerCase().trim()}`));

    for (const r of talhoesImpRows) {
      if (r._status === "duplicado") { duplicados++; continue; }
      if (r._status === "erro")      { erros++;      continue; }

      const fId = fazendaMap[r.fazenda_nome.trim().toLowerCase()];
      if (!fId) { r._status = "erro"; r._msg = `fazenda "${r.fazenda_nome}" não encontrada`; erros++; continue; }

      const key = `${fId}::${r.nome.trim().toLowerCase()}`;
      if (talhaoSet.has(key)) { r._status = "duplicado"; r._msg = "talhão já existe nesta fazenda"; duplicados++; continue; }

      const lat = r.latitude?.trim() ? parseFloat(r.latitude) : null;
      const lng = r.longitude?.trim() ? parseFloat(r.longitude) : null;
      const { error } = await supabase.from("talhoes").insert({
        fazenda_id: fId,
        nome:       r.nome.trim(),
        area_ha:    parseFloat(String(r.area_ha).replace(",", ".")),
        tipo_solo:  r.tipo_solo?.trim() || null,
        lat,
        lng,
      });
      if (error) { r._status = "erro"; r._msg = error.message; erros++; }
      else { talhaoSet.add(key); ok++; }
    }
    setTalhoesImpRows([...talhoesImpRows]);
    setResultTalhoesImp({ ok, erros, duplicados });
    setLoadingTalhoesImp(false);
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
      cols: ["nome", "tipo", "cpf_cnpj", "cliente", "fornecedor", "mao_obra", "email", "telefone", "municipio", "estado"],
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
      cols: ["numero_contrato", "descricao", "credor", "tipo", "valor_total", "data_contrato", "data_entrega_produto", "data_vencimento", "prazo_meses", "periodicidade_pagamento", "tipo_amortizacao", "produtor_cpf_cnpj"],
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
    contratos_venda: {
      label: "Contratos de Venda", icon: "📋",
      desc: "Importe contratos de venda de grãos (soja, milho, algodão). Preço em R$/kg ou US$/kg — convertido automaticamente para /sc.",
      cols: ["numero", "produto", "safra", "modalidade", "moeda", "preco_por_kg", "quantidade_kg", "entregue_kg", "data_entrega", "data_pagamento", "comprador"],
      rows: contratoVendaRows as Record<string, unknown>[],
      loading: loadingContratoVenda,
      result: resultContratoVenda,
      onFile: handleFileContratoVenda,
      onImport: importarContratosVenda,
    },
    produtores_imp: {
      label: "Produtores", icon: "👨‍🌾",
      desc: "Importe o cadastro de produtores rurais (donos/sócios da fazenda). Diferente de Pessoas — produtores aparecem no LCDPR e contratos.",
      cols: ["nome", "tipo", "cpf_cnpj", "inscricao_est", "email", "telefone", "municipio", "estado"],
      rows: produtoresImpRows as Record<string, unknown>[],
      loading: loadingProdutoresImp,
      result: resultProdutoresImp,
      onFile: handleFileProdutoresImp,
      onImport: importarProdutoresImp,
    },
    fazendas_imp: {
      label: "Fazendas", icon: "🏡",
      desc: "Importe propriedades rurais. Cada fazenda é vinculada automaticamente à sua conta. Importe antes dos talhões.",
      cols: ["nome", "municipio", "estado", "area_total_ha", "car", "nirf"],
      rows: fazendasImpRows as Record<string, unknown>[],
      loading: loadingFazendasImp,
      result: resultFazendasImp,
      onFile: handleFileFazendasImp,
      onImport: importarFazendasImp,
    },
    talhoes_imp: {
      label: "Talhões", icon: "🗺️",
      desc: "Importe talhões referenciando o nome da fazenda. O sistema resolve o fazenda_id automaticamente pelo nome.",
      cols: ["nome", "fazenda_nome", "area_ha", "tipo_solo", "latitude", "longitude"],
      rows: talhoesImpRows as Record<string, unknown>[],
      loading: loadingTalhoesImp,
      result: resultTalhoesImp,
      onFile: handleFileTalhoesImp,
      onImport: importarTalhoesImp,
    },
  };

  const cfg      = ABA_CONFIG[aba];
  const totalRows = cfg.rows.length;
  const dupRows   = cfg.rows.filter(r => ["duplicado","atualizar"].includes((r as Record<string, unknown>)._status as string)).length;
  const okRows    = cfg.rows.filter(r => ["ok","aviso"].includes((r as Record<string, unknown>)._status as string)).length
    + (aba === "insumos" && modoAtualizacaoInsumos ? dupRows : 0)
    + (aba === "contratos_fin"   && modoAtualizacaoContratoFin   ? cfg.rows.filter(r => (r as Record<string, unknown>)._status === "atualizar").length : 0)
    + (aba === "contratos_venda" && modoAtualizacaoContratoVenda ? cfg.rows.filter(r => (r as Record<string, unknown>)._status === "atualizar").length : 0);
  const erroRows  = cfg.rows.filter(r => (r as Record<string, unknown>)._status === "erro").length;

  function limpar() {
    if (aba === "pessoas")       { setPessoasRows([]);        setResultPessoas(null); }
    if (aba === "cp")            { setCpRows([]);              setResultCp(null); }
    if (aba === "cr")            { setCrRows([]);              setResultCr(null); }
    if (aba === "insumos")       { setInsumosRows([]);         setResultInsumos(null); }
    if (aba === "produtos")      { setProdutosRows([]);        setResultProdutos(null); }
    if (aba === "maquinas")      { setMaquinasRows([]);        setResultMaquinas(null); }
    if (aba === "contratos_fin")  { setContratoFinRows([]);      setResultContratoFin(null); }
    if (aba === "arrendamentos")  { setArrendamentosRows([]);    setResultArrendamentos(null); }
    if (aba === "contratos_venda"){ setContratoVendaRows([]);    setResultContratoVenda(null); }
    if (aba === "produtores_imp") { setProdutoresImpRows([]);    setResultProdutoresImp(null); }
    if (aba === "fazendas_imp")   { setFazendasImpRows([]);      setResultFazendasImp(null); }
    if (aba === "talhoes_imp")    { setTalhoesImpRows([]);       setResultTalhoesImp(null); }
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
            {(["pessoas", "cp", "cr", "insumos", "produtos", "maquinas", "contratos_fin", "arrendamentos", "contratos_venda", "produtores_imp", "fazendas_imp", "talhoes_imp"] as Aba[]).map(a => {
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
                {aba === "insumos" && dupRows > 0 && (
                  <div style={{ marginTop: 16, padding: "10px 14px", background: "#FFFBE0", border: "0.5px solid #C9921B", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#555", userSelect: "none" }}>
                      <input type="checkbox" checked={modoAtualizacaoInsumos} onChange={e => setModoAtualizacaoInsumos(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#C9921B", cursor: "pointer" }} />
                      <span>
                        <strong style={{ color: "#7A5C00" }}>Modo Atualização</strong>
                        {" — "}{dupRows} registro{dupRows !== 1 ? "s" : ""} duplicado{dupRows !== 1 ? "s" : ""} {modoAtualizacaoInsumos ? "serão atualizados no banco" : "serão pulados (marque para atualizar)"}
                      </span>
                    </label>
                  </div>
                )}

                {aba === "contratos_fin" && dupRows > 0 && (
                  <div style={{ marginTop: 16, padding: "10px 14px", background: "#EDE9FE", border: "0.5px solid #7C3AED", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#555", userSelect: "none" }}>
                      <input type="checkbox" checked={modoAtualizacaoContratoFin} onChange={e => {
                          const novoModo = e.target.checked;
                          setModoAtualizacaoContratoFin(novoModo);
                          setResultContratoFin(null);
                          setContratoFinRows(prev => prev.map(r => {
                            if (novoModo && r._status === "duplicado" && r._msg === "contrato já existe") {
                              return { ...r, _status: "atualizar" as const, _msg: "contrato existente — datas serão atualizadas" };
                            }
                            if (!novoModo && r._status === "atualizar") {
                              return { ...r, _status: "duplicado" as const, _msg: "contrato já existe" };
                            }
                            return r;
                          }));
                        }} style={{ width: 16, height: 16, accentColor: "#7C3AED", cursor: "pointer" }} />
                      <span>
                        <strong style={{ color: "#4C1D95" }}>Atualizar datas nos contratos existentes</strong>
                        {" — "}atualiza <code>data_entrega_produto</code> e <code>data_vencimento</code> nos {dupRows} contrato{dupRows !== 1 ? "s" : ""} já importado{dupRows !== 1 ? "s" : ""}. Novos contratos são inseridos normalmente.
                      </span>
                    </label>
                  </div>
                )}

                {aba === "contratos_venda" && dupRows > 0 && (
                  <div style={{ marginTop: 16, padding: "10px 14px", background: "#EDE9FE", border: "0.5px solid #7C3AED", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#555", userSelect: "none" }}>
                      <input type="checkbox" checked={modoAtualizacaoContratoVenda} onChange={e => {
                          const novoModo = e.target.checked;
                          setModoAtualizacaoContratoVenda(novoModo);
                          setResultContratoVenda(null);
                          setContratoVendaRows(prev => prev.map(r => {
                            if (novoModo && r._status === "duplicado" && r._msg === "contrato já existe") {
                              return { ...r, _status: "atualizar" as const, _msg: "contrato existente — datas serão atualizadas" };
                            }
                            if (!novoModo && r._status === "atualizar") {
                              return { ...r, _status: "duplicado" as const, _msg: "contrato já existe" };
                            }
                            return r;
                          }));
                        }} style={{ width: 16, height: 16, accentColor: "#7C3AED", cursor: "pointer" }} />
                      <span>
                        <strong style={{ color: "#4C1D95" }}>Atualizar datas nos contratos existentes</strong>
                        {" — "}atualiza <code>data_entrega</code> e <code>data_pagamento</code> nos {dupRows} contrato{dupRows !== 1 ? "s" : ""} já importado{dupRows !== 1 ? "s" : ""}. Novos contratos são inseridos normalmente.
                      </span>
                    </label>
                  </div>
                )}
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
                labelDuplicados={aba === "produtores_imp" ? "IEs mescladas" : "Duplicadas"}
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

export default function ImportacaoPage() {
  return <Suspense><ImportacaoInner /></Suspense>;
}
