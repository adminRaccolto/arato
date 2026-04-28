-- ============================================================
-- RacTech — Dados Demo Realistas
-- Fazenda Santa Fé · Nova Mutum - MT
-- Execute no Supabase: SQL Editor → New query → Run
-- ============================================================

-- Limpa dados existentes na ordem correta (respeita FKs)
truncate table notas_fiscais    cascade;
truncate table romaneios        cascade;
truncate table contratos        cascade;
truncate table lancamentos      cascade;
truncate table movimentacoes_estoque cascade;
truncate table insumos          cascade;
truncate table operacoes        cascade;
truncate table safras           cascade;
truncate table talhoes          cascade;
truncate table fazendas         cascade;

-- ============================================================
-- FAZENDA
-- ============================================================
insert into fazendas (id, nome, cnpj, car, nirf, itr, municipio, estado, area_total_ha) values
  ('00000000-0000-0000-0000-000000000001',
   'Fazenda Santa Fé',
   '12.345.678/0001-90',
   'MT-5106224-B3F2A1D0E9C8B7A6F5E4D3C2B1A09876',
   '987654321',
   '654321987',
   'Nova Mutum',
   'MT',
   4820.00);

-- ============================================================
-- TALHÕES
-- ============================================================
insert into talhoes (id, fazenda_id, nome, area_ha, tipo_solo, lat, lng) values
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', 'T-01 Norte',   980.50, 'Latossolo Vermelho',         -13.8312500, -56.0843700),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', 'T-02 Sul',     875.00, 'Latossolo Vermelho-Amarelo', -13.8450000, -56.0950000),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', 'T-03 Leste',  1120.00, 'Latossolo Vermelho',         -13.8200000, -56.0700000),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', 'T-04 Oeste',  1145.50, 'Latossolo Amarelo',          -13.8350000, -56.1100000),
  ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', 'T-05 Central', 699.00, 'Neossolo Quartzarênico',     -13.8280000, -56.0820000);

-- ============================================================
-- SAFRAS
-- ============================================================
insert into safras (id, fazenda_id, cultura, ano_agricola, status, area_ha, data_plantio, data_colheita, produtividade_sc_ha) values
  -- Soja 25/26 — colhida
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-000000000001',
   'Soja', '25/26', 'colhida', 4820.00, '2025-10-15', '2026-02-28', 63.40),

  -- Milho 2ª safra (safrinha) 25/26 — em andamento nos talhões T-01 e T-02
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-000000000001',
   'Milho 2ª', '25/26', 'em_andamento', 1855.50, '2026-02-05', null, null),

  -- Soja 26/27 — planejada
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-000000000001',
   'Soja', '26/27', 'planejada', 4820.00, '2026-10-10', null, null);

-- ============================================================
-- OPERAÇÕES — Soja 25/26 (concluídas)
-- ============================================================
insert into operacoes (safra_id, nome, tipo, data_prev, data_real, status, custo_ha, auto) values
  ('00000000-0000-0000-0002-000000000001', 'Dessecação pré-plantio · Roundup WG 3 L/ha',          'Pulverização',  '2025-10-05', '2025-10-07', 'concluida', 85.00,  true),
  ('00000000-0000-0000-0002-000000000001', 'Plantio · Semente Pioneer 98Y12 55 kg/ha',             'Plantio',       '2025-10-15', '2025-10-18', 'concluida', 420.00, true),
  ('00000000-0000-0000-0002-000000000001', 'Adubação base · MAP 200 kg/ha + KCl 100 kg/ha',        'Adubação',      '2025-10-15', '2025-10-18', 'concluida', 680.00, true),
  ('00000000-0000-0000-0002-000000000001', 'Tratamento de sementes · Nitrobakter 1,5 L/sc',        'Inoculação',    '2025-10-14', '2025-10-14', 'concluida', 38.00,  true),
  ('00000000-0000-0000-0002-000000000001', 'Herbicida pós-emergente · Roundup WG 2 L/ha',          'Pulverização',  '2025-11-10', '2025-11-12', 'concluida', 65.00,  true),
  ('00000000-0000-0000-0002-000000000001', 'Fungicida 1ª aplicação · Elatus 500 g/ha',             'Pulverização',  '2025-12-20', '2025-12-22', 'concluida', 195.00, true),
  ('00000000-0000-0000-0002-000000000001', 'Fungicida 2ª aplicação · Priori Xtra 300 mL/ha',       'Pulverização',  '2026-01-10', '2026-01-11', 'concluida', 155.00, true),
  ('00000000-0000-0000-0002-000000000001', 'Inseticida · Ampligo 100 mL/ha',                       'Pulverização',  '2026-01-20', '2026-01-21', 'concluida', 58.00,  true),
  ('00000000-0000-0000-0002-000000000001', 'Colheita mecânica',                                     'Colheita',      '2026-02-25', '2026-02-28', 'concluida', 145.00, true);

-- ============================================================
-- OPERAÇÕES — Milho 2ª 25/26 (mix concluída/andamento/pendente)
-- ============================================================
insert into operacoes (safra_id, nome, tipo, data_prev, data_real, status, custo_ha, auto) values
  ('00000000-0000-0000-0002-000000000002', 'Plantio · DKB390 PRO3 60.000 sem/ha',                 'Plantio',       '2026-02-05', '2026-02-07', 'concluida',    580.00, true),
  ('00000000-0000-0000-0002-000000000002', 'Adubação base · MAP 180 kg/ha',                        'Adubação',      '2026-02-05', '2026-02-07', 'concluida',    480.00, true),
  ('00000000-0000-0000-0002-000000000002', 'Herbicida pós-emergente · Atrazina + Tembotriona',     'Pulverização',  '2026-03-01', '2026-03-03', 'concluida',    72.00,  true),
  ('00000000-0000-0000-0002-000000000002', 'Adubação cobertura · Ureia 150 kg/ha',                 'Adubação',      '2026-03-15', '2026-03-16', 'concluida',    255.00, true),
  ('00000000-0000-0000-0002-000000000002', 'Fungicida · Priori Xtra 300 mL/ha',                   'Pulverização',  '2026-04-05', null,         'em_andamento', 155.00, true),
  ('00000000-0000-0000-0002-000000000002', 'Colheita mecânica',                                    'Colheita',      '2026-05-20', null,         'pendente',     145.00, true);

-- ============================================================
-- OPERAÇÕES — Soja 26/27 (planejamento gerado automaticamente)
-- ============================================================
insert into operacoes (safra_id, nome, tipo, data_prev, data_real, status, custo_ha, auto) values
  ('00000000-0000-0000-0002-000000000003', 'Dessecação pré-plantio · Roundup WG 3 L/ha',          'Pulverização',  '2026-10-01', null, 'pendente', 85.00,  true),
  ('00000000-0000-0000-0002-000000000003', 'Plantio · Semente certificada 55 kg/ha',               'Plantio',       '2026-10-10', null, 'pendente', 420.00, true),
  ('00000000-0000-0000-0002-000000000003', 'Adubação base · MAP + KCl',                            'Adubação',      '2026-10-10', null, 'pendente', 680.00, true),
  ('00000000-0000-0000-0002-000000000003', 'Inoculação · Nitrobakter 1,5 L/sc',                   'Inoculação',    '2026-10-09', null, 'pendente', 38.00,  true),
  ('00000000-0000-0000-0002-000000000003', 'Herbicida pós-emergente',                              'Pulverização',  '2026-11-05', null, 'pendente', 65.00,  true),
  ('00000000-0000-0000-0002-000000000003', 'Fungicida 1ª aplicação',                               'Pulverização',  '2026-12-15', null, 'pendente', 195.00, true),
  ('00000000-0000-0000-0002-000000000003', 'Fungicida 2ª aplicação',                               'Pulverização',  '2027-01-05', null, 'pendente', 155.00, true),
  ('00000000-0000-0000-0002-000000000003', 'Colheita mecânica',                                    'Colheita',      '2027-02-20', null, 'pendente', 145.00, true);

-- ============================================================
-- INSUMOS
-- ============================================================
insert into insumos (id, fazenda_id, nome, categoria, unidade, fabricante, estoque, estoque_minimo, valor_unitario, lote, validade) values
  -- Sementes
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001',
   'Pioneer 98Y12 — soja RR2 PRO',      'semente',     'sc',   'Corteva',    840,  200, 320.00, 'L2026-001', '2026-09-30'),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000001',
   'Brevant B58RSF95 — soja Intacta',   'semente',     'sc',   'Corteva',    560,  150, 345.00, 'L2026-002', '2026-09-30'),
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000001',
   'Dekalb DKB390 PRO3 — milho',        'semente',     'sc',   'Bayer',      210,   80, 1180.00, 'L2026-010', '2026-08-15'),

  -- Fertilizantes
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001',
   'MAP — Monoamônio Fosfato',           'fertilizante','ton',  'Mosaic',      48,   20, 2650.00, null, null),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001',
   'KCl — Cloreto de Potássio',          'fertilizante','ton',  'Mosaic',      35,   15, 1980.00, null, null),
  ('00000000-0000-0000-0003-000000000006', '00000000-0000-0000-0000-000000000001',
   'Ureia — N 46%',                      'fertilizante','ton',  'Petrobras',   22,   10, 1650.00, null, null),
  ('00000000-0000-0000-0003-000000000007', '00000000-0000-0000-0000-000000000001',
   'Superfosfato Simples',               'fertilizante','ton',  'Yara',         8,   10, 1120.00, null, null),

  -- Defensivos
  ('00000000-0000-0000-0003-000000000008', '00000000-0000-0000-0000-000000000001',
   'Roundup WG 720 — Glifosato',         'defensivo',   'kg',   'Bayer',     1240,  300,   18.50, 'D2025-044', '2027-03-31'),
  ('00000000-0000-0000-0003-000000000009', '00000000-0000-0000-0000-000000000001',
   'Elatus — Azoxistrobina + Benzovindiflupir','defensivo','kg', 'Syngenta',    86,   50,  385.00, 'D2025-112', '2026-06-30'),
  ('00000000-0000-0000-0003-000000000010', '00000000-0000-0000-0000-000000000001',
   'Priori Xtra — Azoxistrobina + Ciproconazol','defensivo','L','Syngenta',   140,   40,  168.00, 'D2025-098', '2027-01-15'),
  ('00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0000-000000000001',
   'Ampligo — Clorantraniliprole + Lambda-cialotrina','defensivo','L','Syngenta',28,30,  520.00, 'D2026-003', '2026-05-20'),

  -- Inoculantes
  ('00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0000-000000000001',
   'Nitrobakter Líquido — soja',         'inoculante',  'L',    'Bioagro',     95,   20,   28.00, null, '2026-07-10'),
  ('00000000-0000-0000-0003-000000000013', '00000000-0000-0000-0000-000000000001',
   'Co-inoculante Azospirillum',         'inoculante',  'L',    'Bioagro',     48,   15,   42.00, null, '2026-07-10');

-- ============================================================
-- MOVIMENTAÇÕES DE ESTOQUE (entradas de compra + saídas da lavoura)
-- ============================================================
insert into movimentacoes_estoque (insumo_id, fazenda_id, tipo, quantidade, data, talhao, safra, operacao, nf_entrada, observacao, auto) values
  -- Entradas (compras para safra 25/26)
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'entrada', 1200, '2025-09-20', null, null, null, 'NF 004.211', 'Compra sementes safra 25/26', false),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000001', 'entrada',  800, '2025-09-20', null, null, null, 'NF 004.211', 'Compra sementes safra 25/26', false),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 'entrada',   80, '2025-09-25', null, null, null, 'NF 004.215', 'Compra MAP safra 25/26', false),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 'entrada',   50, '2025-09-25', null, null, null, 'NF 004.215', 'Compra KCl safra 25/26', false),
  ('00000000-0000-0000-0003-000000000008', '00000000-0000-0000-0000-000000000001', 'entrada', 2000, '2025-09-28', null, null, null, 'NF 004.218', 'Compra Roundup safra 25/26', false),
  ('00000000-0000-0000-0003-000000000009', '00000000-0000-0000-0000-000000000001', 'entrada',  150, '2025-11-15', null, null, null, 'NF 004.230', 'Compra Elatus', false),
  ('00000000-0000-0000-0003-000000000010', '00000000-0000-0000-0000-000000000001', 'entrada',  200, '2025-11-15', null, null, null, 'NF 004.230', 'Compra Priori Xtra', false),
  ('00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0000-000000000001', 'entrada',   80, '2025-12-01', null, null, null, 'NF 004.240', 'Compra Ampligo', false),
  ('00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0000-000000000001', 'entrada',  180, '2025-09-22', null, null, null, 'NF 004.212', 'Compra inoculante', false),
  -- Entradas milho
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000001', 'entrada',  350, '2025-12-10', null, null, null, 'NF 004.245', 'Compra sementes milho safrinha', false),
  ('00000000-0000-0000-0003-000000000006', '00000000-0000-0000-0000-000000000001', 'entrada',   40, '2026-01-20', null, null, null, 'NF 004.260', 'Compra ureia cobertura milho', false),

  -- Saídas (aplicações — soja 25/26)
  ('00000000-0000-0000-0003-000000000008', '00000000-0000-0000-0000-000000000001', 'saida',   280, '2025-10-07', 'T-01 Norte, T-02 Sul, T-03 Leste, T-04 Oeste, T-05 Central', 'Soja 25/26', 'Dessecação pré-plantio', null, null, true),
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-000000000001', 'saida',   360, '2025-10-18', 'T-01 Norte', 'Soja 25/26', 'Plantio', null, null, true),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-000000000001', 'saida',   240, '2025-10-18', 'T-02 Sul, T-03 Leste', 'Soja 25/26', 'Plantio', null, null, true),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 'saida',    16, '2025-10-18', 'Geral', 'Soja 25/26', 'Adubação base', null, null, true),
  ('00000000-0000-0000-0003-000000000005', '00000000-0000-0000-0000-000000000001', 'saida',    10, '2025-10-18', 'Geral', 'Soja 25/26', 'Adubação base', null, null, true),
  ('00000000-0000-0000-0003-000000000012', '00000000-0000-0000-0000-000000000001', 'saida',    85, '2025-10-14', 'Geral', 'Soja 25/26', 'Tratamento de sementes', null, null, true),
  ('00000000-0000-0000-0003-000000000008', '00000000-0000-0000-0000-000000000001', 'saida',   190, '2025-11-12', 'Geral', 'Soja 25/26', 'Herbicida pós-emergente', null, null, true),
  ('00000000-0000-0000-0003-000000000009', '00000000-0000-0000-0000-000000000001', 'saida',    64, '2025-12-22', 'Geral', 'Soja 25/26', 'Fungicida 1ª aplicação', null, null, true),
  ('00000000-0000-0000-0003-000000000010', '00000000-0000-0000-0000-000000000001', 'saida',    60, '2026-01-11', 'Geral', 'Soja 25/26', 'Fungicida 2ª aplicação', null, null, true),
  ('00000000-0000-0000-0003-000000000011', '00000000-0000-0000-0000-000000000001', 'saida',    52, '2026-01-21', 'Geral', 'Soja 25/26', 'Inseticida', null, null, true),

  -- Saídas milho safrinha
  ('00000000-0000-0000-0003-000000000003', '00000000-0000-0000-0000-000000000001', 'saida',   140, '2026-02-07', 'T-01 Norte, T-02 Sul', 'Milho 2ª 25/26', 'Plantio', null, null, true),
  ('00000000-0000-0000-0003-000000000004', '00000000-0000-0000-0000-000000000001', 'saida',     6, '2026-02-07', 'T-01 Norte, T-02 Sul', 'Milho 2ª 25/26', 'Adubação base', null, null, true),
  ('00000000-0000-0000-0003-000000000006', '00000000-0000-0000-0000-000000000001', 'saida',    18, '2026-03-16', 'T-01 Norte, T-02 Sul', 'Milho 2ª 25/26', 'Adubação cobertura', null, null, true);

-- ============================================================
-- LANÇAMENTOS FINANCEIROS
-- ============================================================
insert into lancamentos (fazenda_id, tipo, moeda, descricao, categoria, data_lancamento, data_vencimento, data_baixa, valor, valor_pago, status, auto, conta_bancaria, observacao) values
  -- Receitas (baixadas)
  ('00000000-0000-0000-0000-000000000001', 'receber', 'BRL', 'Venda soja — Amaggi contrato #2025-001', 'Venda de Grãos',
   '2026-03-05', '2026-03-10', '2026-03-11', 462240.00, 462240.00, 'baixado', true, 'Banco do Brasil — CC 12345-6', null),
  ('00000000-0000-0000-0000-000000000001', 'receber', 'BRL', 'Venda soja — Bunge contrato #2025-002', 'Venda de Grãos',
   '2026-03-15', '2026-03-20', '2026-03-21', 539280.00, 539280.00, 'baixado', true, 'Banco do Brasil — CC 12345-6', null),
  ('00000000-0000-0000-0000-000000000001', 'receber', 'BRL', 'Venda milho — Cargill contrato #2025-003', 'Venda de Grãos',
   '2026-03-28', '2026-04-02', '2026-04-03', 123600.00, 123600.00, 'baixado', true, 'Bradesco — CC 98765-4', null),
  ('00000000-0000-0000-0000-000000000001', 'receber', 'BRL', 'Venda soja — LDC contrato #2025-004', 'Venda de Grãos',
   '2026-04-05', '2026-04-10', null, 231120.00, null, 'vencendo', true, null, null),
  ('00000000-0000-0000-0000-000000000001', 'receber', 'BRL', 'Venda soja — ADM contrato #2025-005', 'Venda de Grãos',
   '2026-04-08', '2026-04-25', null, 385200.00, null, 'em_aberto', true, null, null),

  -- Custos (pagos)
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Sementes — Corteva safra 25/26', 'Insumos — Sementes',
   '2025-09-20', '2025-10-05', '2025-10-03', 659200.00, 659200.00, 'baixado', false, 'Banco do Brasil — CC 12345-6', 'Pioneer 98Y12 + Brevant B58'),
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Fertilizantes — Mosaic safra 25/26', 'Insumos — Fertilizantes',
   '2025-09-25', '2025-10-20', '2025-10-18', 311400.00, 311400.00, 'baixado', false, 'Banco do Brasil — CC 12345-6', 'MAP 80t + KCl 50t'),
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Defensivos — Syngenta safra 25/26', 'Insumos — Defensivos',
   '2025-11-15', '2025-12-10', '2025-12-08', 148050.00, 148050.00, 'baixado', false, 'Bradesco — CC 98765-4', 'Elatus + Priori Xtra + Ampligo'),
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Serviço de colheita — Colheitadeiras MT', 'Serviços Agrícolas',
   '2026-03-01', '2026-03-15', '2026-03-14', 241000.00, 241000.00, 'baixado', false, 'Banco do Brasil — CC 12345-6', '5.000 ha × R$ 48,20/ha'),
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Arrendamento — Gleba Norte (T-03)', 'Arrendamento de Terra',
   '2026-03-01', '2026-04-01', '2026-04-02', 168000.00, 168000.00, 'baixado', false, 'Bradesco — CC 98765-4', '1.120 ha × R$ 12,5/sc × 12 sc/ha'),
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Seguro agrícola Proagro — safra 25/26', 'Seguros',
   '2025-09-10', '2025-09-30', '2025-09-28', 72300.00, 72300.00, 'baixado', false, 'Banco do Brasil — CC 12345-6', null),

  -- Contas a pagar em aberto
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Defensivos milho safrinha — Bayer', 'Insumos — Defensivos',
   '2026-04-01', '2026-04-20', null, 48600.00, null, 'em_aberto', false, null, 'Herbicida + fungicida milho'),
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Serviço transporte grãos — Pantanal Transportes', 'Fretes e Transportes',
   '2026-04-05', '2026-04-30', null, 28500.00, null, 'em_aberto', false, null, null),
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Manutenção colheitadeira — oficina autorizada', 'Manutenção de Máquinas',
   '2026-04-07', '2026-05-07', null, 18700.00, null, 'em_aberto', false, null, null),
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Arrendamento — Gleba Sul (T-02) parcela 2/2', 'Arrendamento de Terra',
   '2026-04-01', '2026-05-01', null, 98000.00, null, 'em_aberto', false, null, '875 ha × R$ 12,5/sc × 9 sc/ha'),
  ('00000000-0000-0000-0000-000000000001', 'pagar', 'BRL', 'Sementes milho safrinha — Bayer DKB390', 'Insumos — Sementes',
   '2025-12-10', '2026-04-15', null, 413000.00, null, 'vencendo', false, null, '350 sc × R$ 1.180/sc');

-- ============================================================
-- CONTRATOS DE VENDA
-- ============================================================
insert into contratos (id, fazenda_id, numero, comprador, produto, safra, modalidade, moeda, preco, quantidade_sc, entregue_sc, data_contrato, data_entrega, status, observacao) values
  -- Soja 25/26 — Amaggi (encerrado)
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001',
   '2025-001', 'Amaggi Exportação e Importação Ltda', 'Soja', '25/26',
   'fixo', 'BRL', 128.40, 8000, 8000, '2025-08-15', '2026-03-31', 'encerrado', null),

  -- Soja 25/26 — Bunge (encerrado)
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001',
   '2025-002', 'Bunge Alimentos S.A.', 'Soja', '25/26',
   'fixo', 'BRL', 128.40, 6000, 6000, '2025-09-01', '2026-03-31', 'encerrado', null),

  -- Milho 25/26 — Cargill (parcial, colheita ainda em andamento)
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0000-000000000001',
   '2025-003', 'Cargill Agrícola S.A.', 'Milho', '25/26',
   'fixo', 'BRL', 61.80, 6000, 2000, '2025-11-20', '2026-06-30', 'parcial', null),

  -- Soja 25/26 — LDC (parcial)
  ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0000-000000000001',
   '2025-004', 'Louis Dreyfus Commodities Brasil S.A.', 'Soja', '25/26',
   'fixo', 'BRL', 128.40, 5000, 1800, '2025-08-20', '2026-04-30', 'parcial', null),

  -- Soja 25/26 — ADM (aberto)
  ('00000000-0000-0000-0004-000000000005', '00000000-0000-0000-0000-000000000001',
   '2025-005', 'ADM do Brasil Ltda', 'Soja', '25/26',
   'fixo', 'BRL', 128.40, 3000, 0, '2025-10-05', '2026-04-30', 'aberto', null),

  -- Soja 26/27 — a fixar (planejamento antecipado)
  ('00000000-0000-0000-0004-000000000006', '00000000-0000-0000-0000-000000000001',
   '2026-001', 'Amaggi Exportação e Importação Ltda', 'Soja', '26/27',
   'a_fixar', 'USD', 0.00, 10000, 0, '2026-03-20', '2027-03-31', 'aberto',
   'Referência CBOT Mai/27 − Basis −45 FOB Paranaguá');

-- ============================================================
-- ROMANEIOS (entregas já realizadas)
-- ============================================================
-- Contrato Amaggi 2025-001 — 8.000 sc entregues em 4 cargas
insert into romaneios (contrato_id, fazenda_id, numero, placa, peso_bruto_kg, tara_kg, data, nfe_numero, nfe_status) values
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001',
   'ROM-2026-001', 'QAB-1234', 300000, 20000, '2026-03-05', '001.420', 'autorizada'),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001',
   'ROM-2026-002', 'QBB-5678', 300000, 22000, '2026-03-06', '001.421', 'autorizada'),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001',
   'ROM-2026-003', 'QCC-9012', 282000, 21000, '2026-03-07', '001.422', 'autorizada'),
  ('00000000-0000-0000-0004-000000000001', '00000000-0000-0000-0000-000000000001',
   'ROM-2026-004', 'QDD-3456', 298000, 20000, '2026-03-08', '001.423', 'autorizada'),

-- Contrato Bunge 2025-002 — 6.000 sc em 3 cargas
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001',
   'ROM-2026-005', 'QEE-7890', 300000, 21000, '2026-03-18', '001.424', 'autorizada'),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001',
   'ROM-2026-006', 'QFF-2345', 300000, 20500, '2026-03-19', '001.425', 'autorizada'),
  ('00000000-0000-0000-0004-000000000002', '00000000-0000-0000-0000-000000000001',
   'ROM-2026-007', 'QGG-6789', 283000, 21000, '2026-03-20', '001.426', 'autorizada'),

-- Contrato Cargill 2025-003 — 2.000 sc de milho (parcial)
  ('00000000-0000-0000-0004-000000000003', '00000000-0000-0000-0000-000000000001',
   'ROM-2026-008', 'QHH-1234', 240000, 22000, '2026-03-28', '001.427', 'autorizada'),

-- Contrato LDC 2025-004 — 1.800 sc (parcial)
  ('00000000-0000-0000-0004-000000000004', '00000000-0000-0000-0000-000000000001',
   'ROM-2026-009', 'QII-5678', 240000, 21000, '2026-04-05', '001.428', 'autorizada');

-- ============================================================
-- NOTAS FISCAIS
-- ============================================================
insert into notas_fiscais (fazenda_id, numero, serie, tipo, cfop, natureza, destinatario, cnpj_destinatario, valor_total, data_emissao, status, chave_acesso, auto) values
  ('00000000-0000-0000-0000-000000000001', '001.420', '1', 'saida', '6.101',
   'Soja em grão, mesmo triturada · 2967 sc · NCM 1201.10.00',
   'Amaggi Exportação e Importação Ltda', '09.093.117/0001-80',
   380817.00, '2026-03-05', 'autorizada',
   '5126030509093117000180550010014200001234567', true),

  ('00000000-0000-0000-0000-000000000001', '001.421', '1', 'saida', '6.101',
   'Soja em grão, mesmo triturada · 2983 sc · NCM 1201.10.00',
   'Amaggi Exportação e Importação Ltda', '09.093.117/0001-80',
   383218.00, '2026-03-06', 'autorizada',
   '5126030609093117000180550010014210001234567', true),

  ('00000000-0000-0000-0000-000000000001', '001.422', '1', 'saida', '6.101',
   'Soja em grão, mesmo triturada · 2683 sc · NCM 1201.10.00',
   'Amaggi Exportação e Importação Ltda', '09.093.117/0001-80',
   344503.00, '2026-03-07', 'autorizada',
   '5126030709093117000180550010014220001234567', true),

  ('00000000-0000-0000-0000-000000000001', '001.423', '1', 'saida', '6.101',
   'Soja em grão, mesmo triturada · 2967 sc · NCM 1201.10.00',
   'Amaggi Exportação e Importação Ltda', '09.093.117/0001-80',
   380817.00, '2026-03-08', 'autorizada',
   '5126030809093117000180550010014230001234567', true),

  ('00000000-0000-0000-0000-000000000001', '001.424', '1', 'saida', '6.101',
   'Soja em grão, mesmo triturada · 2983 sc · NCM 1201.10.00',
   'Bunge Alimentos S.A.', '84.413.200/0005-02',
   383218.00, '2026-03-18', 'autorizada',
   '5126031884413200000502550010014240001234567', true),

  ('00000000-0000-0000-0000-000000000001', '001.425', '1', 'saida', '6.101',
   'Soja em grão, mesmo triturada · 2983 sc · NCM 1201.10.00',
   'Bunge Alimentos S.A.', '84.413.200/0005-02',
   383218.00, '2026-03-19', 'autorizada',
   '5126031984413200000502550010014250001234567', true),

  ('00000000-0000-0000-0000-000000000001', '001.426', '1', 'saida', '6.101',
   'Soja em grão, mesmo triturada · 2700 sc · NCM 1201.10.00',
   'Bunge Alimentos S.A.', '84.413.200/0005-02',
   346680.00, '2026-03-20', 'autorizada',
   '5126032084413200000502550010014260001234567', true),

  ('00000000-0000-0000-0000-000000000001', '001.427', '1', 'saida', '6.101',
   'Milho em grão · 2967 sc · NCM 1005.10.90',
   'Cargill Agrícola S.A.', '60.498.706/0179-37',
   123600.00, '2026-03-28', 'autorizada',
   '5126032860498706017937550010014270001234567', true),

  ('00000000-0000-0000-0000-000000000001', '001.428', '1', 'saida', '6.101',
   'Soja em grão, mesmo triturada · 1800 sc · NCM 1201.10.00',
   'Louis Dreyfus Commodities Brasil S.A.', '07.291.707/0033-47',
   231120.00, '2026-04-05', 'autorizada',
   '5126040507291707003347550010014280001234567', true),

  -- NF em processamento (ainda não autorizada)
  ('00000000-0000-0000-0000-000000000001', '001.429', '1', 'saida', '6.101',
   'Soja em grão, mesmo triturada · 3000 sc · NCM 1201.10.00',
   'ADM do Brasil Ltda', '33.958.695/0001-04',
   385200.00, '2026-04-09', 'em_digitacao',
   null, true);
