-- ============================================================
-- RacTech — Migrations pendentes
-- Execute no Supabase SQL Editor (em ordem)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. TABELAS AUXILIARES (dados mestres)
-- ────────────────────────────────────────────────────────────

create table if not exists grupos_insumos (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid references fazendas(id) on delete cascade,
  nome        text not null,
  cor         text,
  created_at  timestamptz default now()
);

create table if not exists subgrupos_insumos (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid references fazendas(id) on delete cascade,
  grupo_id    uuid references grupos_insumos(id) on delete cascade,
  nome        text not null,
  created_at  timestamptz default now()
);

create table if not exists tipos_pessoa (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid references fazendas(id) on delete cascade,
  nome        text not null,
  descricao   text,
  created_at  timestamptz default now()
);

create table if not exists centros_custo (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid references fazendas(id) on delete cascade,
  codigo      text,
  nome        text not null,
  tipo        text not null check (tipo in ('receita','despesa','neutro')),
  parent_id   uuid references centros_custo(id),
  created_at  timestamptz default now()
);

create table if not exists categorias_lancamento (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid references fazendas(id) on delete cascade,
  nome        text not null,
  tipo        text not null check (tipo in ('pagar','receber','ambos')),
  created_at  timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- 2. LAVOURA — Plantio
-- ────────────────────────────────────────────────────────────

create table if not exists plantios (
  id                   uuid primary key default gen_random_uuid(),
  fazenda_id           uuid references fazendas(id) on delete cascade,
  safra_id             uuid references safras(id) on delete cascade,
  talhao_id            uuid references talhoes(id),
  insumo_id            uuid references insumos(id),
  variedade            text,
  area_ha              numeric(10,2),
  dose_kg_ha           numeric(10,3),
  quantidade_kg        numeric(10,2),
  custo_sementes       numeric(14,2),
  data_plantio         date not null,
  data_colheita_prev   date,
  produtividade_esperada numeric(8,2),
  moeda                text default 'BRL',
  preco_esperado_sc    numeric(10,2),
  receita_esperada     numeric(14,2),
  observacao           text,
  lancamento_id        uuid,
  created_at           timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- 3. LAVOURA — Pulverização
-- ────────────────────────────────────────────────────────────

create table if not exists pulverizacoes (
  id              uuid primary key default gen_random_uuid(),
  fazenda_id      uuid references fazendas(id) on delete cascade,
  safra_id        uuid references safras(id) on delete cascade,
  talhao_id       uuid references talhoes(id),
  tipo            text not null,   -- herbicida, fungicida, etc.
  pre_emergencia  boolean default false,
  estadio         text,
  area_ha         numeric(10,2),
  data_aplicacao  date not null,
  data_fim        date,
  cap_tanque_l    numeric(10,1),
  vazao_lha       numeric(8,2),
  num_tanques     numeric(6,1),
  calda_total_l   numeric(10,1),
  custo_total     numeric(14,2),
  observacao      text,
  lancamento_id   uuid,
  created_at      timestamptz default now()
);

create table if not exists pulverizacao_itens (
  id              uuid primary key default gen_random_uuid(),
  pulverizacao_id uuid references pulverizacoes(id) on delete cascade,
  fazenda_id      uuid references fazendas(id) on delete cascade,
  insumo_id       uuid references insumos(id),
  nome_produto    text not null,
  unidade         text default 'L',
  dose_ha         numeric(10,3),
  total           numeric(10,3),
  valor_unitario  numeric(14,4),
  custo_ha        numeric(14,4),
  custo_total     numeric(14,2),
  created_at      timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- 4. LAVOURA — Colheita
-- ────────────────────────────────────────────────────────────

create table if not exists colheitas (
  id                    uuid primary key default gen_random_uuid(),
  fazenda_id            uuid references fazendas(id) on delete cascade,
  safra_id              uuid references safras(id) on delete cascade,
  talhao_id             uuid references talhoes(id),
  data_colheita         date not null,
  deposito_id           uuid references depositos(id),
  produto               text not null,
  variedade             text,
  area_ha               numeric(10,2),
  total_kg_bruto        numeric(14,2) default 0,
  total_kg_classificado numeric(14,2) default 0,
  total_sacas           numeric(12,3) default 0,
  umidade_media         numeric(6,2),
  impureza_media        numeric(6,2),
  avariados_media       numeric(6,2),
  produtividade_sc_ha   numeric(8,2),
  observacao            text,
  created_at            timestamptz default now()
);

create table if not exists colheita_romaneios (
  id                    uuid primary key default gen_random_uuid(),
  colheita_id           uuid references colheitas(id) on delete cascade,
  fazenda_id            uuid references fazendas(id) on delete cascade,
  numero                text,
  placa                 text not null,
  peso_bruto_kg         numeric(12,2) not null,
  tara_kg               numeric(12,2) not null,
  peso_liquido_kg       numeric(12,2) not null,
  umidade_pct           numeric(5,2),
  umidade_padrao_pct    numeric(5,2) default 14,
  desconto_umidade_kg   numeric(12,2) default 0,
  impureza_pct          numeric(5,2),
  desconto_impureza_kg  numeric(12,2) default 0,
  avariados_pct         numeric(5,2),
  desconto_avariados_kg numeric(12,2) default 0,
  peso_classificado_kg  numeric(12,2) not null,
  sacas                 numeric(10,3) not null,
  data                  date,
  created_at            timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- 5. CONTRATOS FINANCEIROS
-- ────────────────────────────────────────────────────────────

create table if not exists contratos_financeiros (
  id                  uuid primary key default gen_random_uuid(),
  fazenda_id          uuid references fazendas(id) on delete cascade,
  tipo                text not null,  -- custeio, financiamento, emprestimo, etc.
  descricao           text not null,
  numero_contrato     text,
  pessoa_id           uuid references pessoas(id),
  credor              text,
  linha_credito       text,
  valor_total         numeric(16,2),
  moeda               text default 'BRL',
  cotacao_usd         numeric(10,4),
  data_contrato       date,
  data_liberacao      date,
  data_vencimento     date,
  prazo_meses         integer,
  taxa_juros_aa       numeric(8,4),
  taxa_juros_am       numeric(8,6),
  iof_pct             numeric(6,4),
  tac_valor           numeric(14,2),
  outros_custos       numeric(14,2),
  conta_liberacao_id  uuid references contas_bancarias(id),
  conta_pagamento_id  uuid references contas_bancarias(id),
  tipo_amortizacao    text default 'SAC',
  status              text default 'ativo' check (status in ('ativo','quitado','cancelado')),
  observacao          text,
  created_at          timestamptz default now()
);

create table if not exists parcelas_liberacao (
  id               uuid primary key default gen_random_uuid(),
  contrato_id      uuid references contratos_financeiros(id) on delete cascade,
  fazenda_id       uuid references fazendas(id) on delete cascade,
  num_parcela      integer,
  data_liberacao   date,
  valor            numeric(14,2),
  status           text default 'previsto' check (status in ('previsto','liberado','cancelado')),
  lancamento_id    uuid,
  created_at       timestamptz default now()
);

create table if not exists parcelas_pagamento (
  id                    uuid primary key default gen_random_uuid(),
  contrato_id           uuid references contratos_financeiros(id) on delete cascade,
  fazenda_id            uuid references fazendas(id) on delete cascade,
  num_parcela           integer,
  data_vencimento       date,
  amortizacao           numeric(14,2),
  juros                 numeric(14,2),
  despesas_acessorios   numeric(14,2) default 0,
  valor_parcela         numeric(14,2),
  saldo_devedor         numeric(14,2),
  status                text default 'em_aberto' check (status in ('em_aberto','pago','vencido')),
  lancamento_id         uuid,
  created_at            timestamptz default now()
);

create table if not exists garantias_contrato (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid references contratos_financeiros(id) on delete cascade,
  tipo          text,
  descricao     text,
  valor         numeric(14,2),
  created_at    timestamptz default now()
);

create table if not exists centros_custo_contrato (
  id            uuid primary key default gen_random_uuid(),
  contrato_id   uuid references contratos_financeiros(id) on delete cascade,
  descricao     text,
  percentual    numeric(6,2),
  created_at    timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- 6. ALTERAÇÕES EM TABELAS EXISTENTES
-- ────────────────────────────────────────────────────────────

-- Insumos: subgrupo e custo médio
alter table insumos
  add column if not exists subgrupo    text,
  add column if not exists custo_medio numeric(14,4);

-- Safras: talhão vinculado
alter table safras
  add column if not exists talhao_id uuid references talhoes(id);

-- ────────────────────────────────────────────────────────────
-- 7. RLS — habilitar e permitir acesso por fazenda
-- (ajuste as políticas conforme sua estratégia de auth)
-- ────────────────────────────────────────────────────────────

alter table grupos_insumos       enable row level security;
alter table subgrupos_insumos    enable row level security;
alter table tipos_pessoa         enable row level security;
alter table centros_custo        enable row level security;
alter table categorias_lancamento enable row level security;
alter table plantios             enable row level security;
alter table pulverizacoes        enable row level security;
alter table pulverizacao_itens   enable row level security;
alter table colheitas            enable row level security;
alter table colheita_romaneios   enable row level security;
alter table contratos_financeiros enable row level security;
alter table parcelas_liberacao   enable row level security;
alter table parcelas_pagamento   enable row level security;
alter table garantias_contrato   enable row level security;
alter table centros_custo_contrato enable row level security;

-- Políticas permissivas (ajuste quando implementar multi-tenant)
do $$
declare t text;
begin
  foreach t in array array[
    'grupos_insumos','subgrupos_insumos','tipos_pessoa',
    'centros_custo','categorias_lancamento',
    'plantios','pulverizacoes','pulverizacao_itens',
    'colheitas','colheita_romaneios',
    'contratos_financeiros','parcelas_liberacao','parcelas_pagamento',
    'garantias_contrato','centros_custo_contrato'
  ] loop
    begin
      execute format(
        'create policy "allow_all_%s" on %I for all using (true) with check (true)',
        t, t
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────
-- ARQUITETURA TRÊS ENTIDADES: Produtor → Empresa → Fazenda
-- Execute após as migrations anteriores
-- ────────────────────────────────────────────────────────────

-- 1. Tabela empresas (entidade jurídica vinculada ao Produtor)
create table if not exists empresas (
  id             uuid primary key default gen_random_uuid(),
  fazenda_id     uuid references fazendas(id) on delete cascade,
  produtor_id    uuid references produtores(id) on delete set null,
  nome           text not null,
  razao_social   text,
  tipo           text not null default 'pj' check (tipo in ('pf','pj')),
  cpf_cnpj       text,
  inscricao_est  text,
  municipio      text,
  estado         text,
  email          text,
  telefone       text,
  created_at     timestamptz default now()
);

-- 2. Adicionar FKs na tabela fazendas
alter table fazendas
  add column if not exists produtor_id uuid references produtores(id) on delete set null,
  add column if not exists empresa_id  uuid references empresas(id)  on delete set null;

-- 3. Adicionar campo INCRA e endereço na tabela produtores
alter table produtores
  add column if not exists incra       text,
  add column if not exists cep         text,
  add column if not exists logradouro  text,
  add column if not exists numero      text,
  add column if not exists complemento text,
  add column if not exists bairro      text;

-- 4. Adicionar campos expandidos na tabela empresas
alter table empresas
  add column if not exists razao_social       text,
  add column if not exists inscricao_est      text,
  add column if not exists regime_tributario  text,
  add column if not exists municipio          text,
  add column if not exists estado             text,
  add column if not exists car                text,
  add column if not exists nirf               text,
  add column if not exists itr                text,
  add column if not exists email              text,
  add column if not exists email_relatorios   text,
  add column if not exists telefone           text,
  add column if not exists produtor_id        uuid references produtores(id) on delete set null;

-- 5. RLS
alter table empresas enable row level security;
do $$ begin
  create policy "allow_all_empresas" on empresas for all using (true) with check (true);
exception when duplicate_object then null;
end $$;

-- ────────────────────────────────────────────────────────────
-- ARRENDAMENTO — campos na tabela fazendas
-- ────────────────────────────────────────────────────────────
alter table fazendas
  add column if not exists arrendada                  boolean default false,
  add column if not exists arrendamento_proprietario  text,
  add column if not exists arrendamento_valor_sc_ha   numeric(10,2),
  add column if not exists arrendamento_valor_brl_ha  numeric(12,2),
  add column if not exists arrendamento_area_ha       numeric(12,4),
  add column if not exists arrendamento_inicio        date,
  add column if not exists arrendamento_vencimento    date,
  add column if not exists arrendamento_renovacao_auto boolean default false;

-- ────────────────────────────────────────────────────────────
-- PESSOAS — campos expandidos (endereço, contato, pagamento, tributação)
-- ────────────────────────────────────────────────────────────
alter table pessoas
  add column if not exists cep                text,
  add column if not exists logradouro         text,
  add column if not exists numero             text,
  add column if not exists complemento        text,
  add column if not exists bairro             text,
  add column if not exists nome_contato       text,
  add column if not exists telefone_contato   text,
  add column if not exists banco_nome         text,
  add column if not exists banco_agencia      text,
  add column if not exists banco_conta        text,
  add column if not exists banco_tipo         text,
  add column if not exists pix_chave          text,
  add column if not exists pix_tipo           text,
  add column if not exists regime_tributario  text,
  add column if not exists cnae               text,
  add column if not exists situacao_cadastral text;

-- ────────────────────────────────────────────────────────────
-- 8. COMERCIALIZAÇÃO — Itens de contrato
-- ────────────────────────────────────────────────────────────

create table if not exists contrato_itens (
  id              uuid primary key default gen_random_uuid(),
  contrato_id     uuid references contratos(id) on delete cascade,
  fazenda_id      uuid references fazendas(id) on delete cascade,
  tipo            text,
  produto         text not null,
  unidade         text not null default 'sc',
  quantidade      numeric(14,3) not null default 0,
  valor_unitario  numeric(14,4) not null default 0,
  valor_total     numeric(16,2),
  moeda           text default 'BRL',
  classificacao   text,
  created_at      timestamptz default now()
);

-- Novos campos na tabela contratos para comercialização
alter table contratos
  add column if not exists num_lancamento        integer,
  add column if not exists safra                 text,
  add column if not exists autorizacao           text default 'pendente',
  add column if not exists confirmado            boolean default false,
  add column if not exists a_fixar               boolean default false,
  add column if not exists venda_a_ordem         boolean default false,
  add column if not exists produtor_id           uuid references produtores(id),
  add column if not exists produtor_nome         text,
  add column if not exists pessoa_id             uuid references pessoas(id),
  add column if not exists nr_contrato_cliente   text,
  add column if not exists contato_broker        text,
  add column if not exists grupo_vendedor        text,
  add column if not exists vendedor              text,
  add column if not exists saldo_tipo            text default 'peso_saida',
  add column if not exists valor_frete           numeric(14,4),
  add column if not exists natureza_operacao     text,
  add column if not exists cfop                  text,
  add column if not exists deposito_carregamento text,
  add column if not exists deposito_fiscal       boolean default false,
  add column if not exists propriedade           text,
  add column if not exists empreendimento        text,
  add column if not exists seguradora            text,
  add column if not exists corretora             text,
  add column if not exists cte_numero            text,
  add column if not exists terceiro              text,
  add column if not exists observacao_interna    text,
  add column if not exists ano_safra_id          uuid references anos_safra(id) on delete set null,
  add column if not exists ciclo_id              uuid references ciclos(id) on delete set null;

-- Classificação do grão no romaneio de expedição
alter table romaneios
  add column if not exists umidade_pct             numeric(6,2),
  add column if not exists umidade_padrao_pct      numeric(6,2),
  add column if not exists desconto_umidade_kg     numeric(12,2),
  add column if not exists impureza_pct            numeric(6,2),
  add column if not exists impureza_padrao_pct     numeric(6,2),
  add column if not exists desconto_impureza_kg    numeric(12,2),
  add column if not exists avariados_pct           numeric(6,2),
  add column if not exists avariados_padrao_pct    numeric(6,2),
  add column if not exists desconto_avariados_kg   numeric(12,2),
  add column if not exists peso_classificado_kg    numeric(14,2);

alter table contrato_itens enable row level security;

-- ────────────────────────────────────────────────────────────
-- 9. PRODUTOR — municípios e estado (campos faltantes na seção 3)
-- ────────────────────────────────────────────────────────────

alter table produtores
  add column if not exists municipio text,
  add column if not exists estado    text;

-- ────────────────────────────────────────────────────────────
-- 10. FAZENDA — endereço + certidões + arrendamentos múltiplos
-- ────────────────────────────────────────────────────────────

alter table fazendas
  add column if not exists cep             text,
  add column if not exists logradouro      text,
  add column if not exists numero_end      text,
  add column if not exists complemento     text,
  add column if not exists bairro          text,
  add column if not exists car_vencimento  date,
  add column if not exists itr_vencimento  date,
  add column if not exists ccir            text,
  add column if not exists ccir_vencimento date;

create table if not exists arrendamentos (
  id                uuid primary key default gen_random_uuid(),
  fazenda_id        uuid references fazendas(id) on delete cascade,
  proprietario_id   uuid references pessoas(id) on delete set null,
  proprietario_nome text,
  area_ha           numeric(14,4) not null,
  forma_pagamento   text not null check (forma_pagamento in ('sc_soja','sc_milho','sc_soja_milho','brl')),
  sc_ha             numeric(10,4),
  valor_brl         numeric(14,4),
  ano_safra_id      uuid references anos_safra(id) on delete set null,
  inicio            date,
  vencimento        date,
  renovacao_auto    boolean default false,
  observacao        text,
  created_at        timestamptz default now()
);

create table if not exists arrendamento_matriculas (
  id              uuid primary key default gen_random_uuid(),
  arrendamento_id uuid references arrendamentos(id) on delete cascade,
  fazenda_id      uuid references fazendas(id) on delete cascade,
  numero          text not null,
  area_ha         numeric(14,4),
  cartorio        text,
  created_at      timestamptz default now()
);

alter table arrendamentos enable row level security;
alter table arrendamento_matriculas enable row level security;
do $$ begin
  create policy "allow_all_contrato_itens"          on contrato_itens          for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_arrendamentos"            on arrendamentos           for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_arrendamento_matriculas"  on arrendamento_matriculas for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- 11. RLS — políticas para tabelas principais que podem estar sem policy
-- ────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'produtores','fazendas','talhoes','safras','operacoes','insumos',
    'movimentacoes_estoque','lancamentos','contratos','romaneios',
    'notas_fiscais','simulacoes','pessoas','empresas','matriculas_imoveis',
    'anos_safra','ciclos','maquinas','bombas_combustivel','funcionarios',
    'grupos_usuarios','usuarios','depositos','historico_manutencao',
    'nf_entradas','nf_entrada_itens','estoque_terceiros',
    'contas_bancarias','perfis'
  ] loop
    begin
      execute format('alter table %I enable row level security', t);
    exception when others then null;
    end;
    begin
      execute format(
        'create policy "allow_all_%s" on %I for all using (true) with check (true)',
        t, t
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────
-- 12. DEPÓSITOS — tipo terceiro + vínculo com pessoa
-- ────────────────────────────────────────────────────────────
alter table depositos
  add column if not exists descricao text,
  add column if not exists pessoa_id uuid references pessoas(id) on delete set null;

-- Atualiza constraint de tipo para novos tipos de depósito
alter table depositos
  drop constraint if exists depositos_tipo_check;
alter table depositos
  add constraint depositos_tipo_check
  check (tipo in ('insumo_fazenda','armazem_fazenda','almoxarifado','oficina','terceiro','armazem_terceiro'));

-- ============================================================
-- SEÇÃO 13 — VEF (Venda com Entrega Futura) e Remessa
-- ============================================================

-- 1. Adiciona "vef" e "remessa" ao constraint de tipo_apropiacao em nf_entrada_itens
alter table nf_entrada_itens
  drop constraint if exists nf_entrada_itens_tipo_apropiacao_check;
alter table nf_entrada_itens
  add constraint nf_entrada_itens_tipo_apropiacao_check
  check (tipo_apropiacao in ('estoque','maquinario','direto','terceiro','vef','remessa'));

-- 2. Adiciona deposito_id em estoque_terceiros (vincula ao depósito de terceiro do fornecedor)
alter table estoque_terceiros
  add column if not exists deposito_id uuid references depositos(id) on delete set null;

-- RLS para estoque_terceiros (caso ainda não exista)
DO $$ begin
  create policy "fazenda_rls_estoque_terceiros" on estoque_terceiros
    using (fazenda_id = current_setting('app.fazenda_id', true)::uuid);
exception when duplicate_object then null; end $$;

-- ============================================================
-- SEÇÃO 14 — Insumos (tipo, deposito_id, grupo_id) + Movimentações (motivo, deposito_id)
-- ============================================================

-- 1. Coluna tipo em insumos (diferencia insumo agrícola de produto geral)
alter table insumos
  add column if not exists tipo text not null default 'insumo';

alter table insumos
  drop constraint if exists insumos_tipo_check;
alter table insumos
  add constraint insumos_tipo_check
  check (tipo in ('insumo','produto'));

-- 2. Coluna deposito_id em insumos (depósito de destino inicial do item)
alter table insumos
  add column if not exists deposito_id uuid references depositos(id) on delete set null;

-- 3. Coluna grupo_id em insumos (vínculo com grupos_insumo)
alter table insumos
  add column if not exists grupo_id uuid references grupos_insumo(id) on delete set null;

-- 4. Categorias novas em insumos (peças, material, uso e consumo, escritório)
alter table insumos
  drop constraint if exists insumos_categoria_check;
alter table insumos
  add constraint insumos_categoria_check
  check (categoria in (
    'semente','fertilizante','defensivo','inoculante','adjuvante','corretivo',
    'combustivel','lubrificante','peca','material','uso_consumo','escritorio','outro'
  ));

-- 5. Unidades novas em insumos
alter table insumos
  drop constraint if exists insumos_unidade_check;
alter table insumos
  add constraint insumos_unidade_check
  check (unidade in ('kg','g','L','mL','sc','t','un','cx','pc','par','m','m2','outros'));

-- 6. Coluna motivo em movimentacoes_estoque
alter table movimentacoes_estoque
  add column if not exists motivo text;

-- 7. Tipo "ajuste" em movimentacoes_estoque
alter table movimentacoes_estoque
  drop constraint if exists movimentacoes_estoque_tipo_check;
alter table movimentacoes_estoque
  add constraint movimentacoes_estoque_tipo_check
  check (tipo in ('entrada','saida','ajuste'));

-- 8. Coluna deposito_id em movimentacoes_estoque
alter table movimentacoes_estoque
  add column if not exists deposito_id uuid references depositos(id) on delete set null;

-- 9. Tabela grupos_insumo (criada aqui caso não exista ainda — seção 6 já pode ter criado)
create table if not exists grupos_insumo (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  cor         text,
  created_at  timestamptz default now()
);

create table if not exists subgrupos_insumo (
  id           uuid primary key default gen_random_uuid(),
  fazenda_id   uuid not null references fazendas(id) on delete cascade,
  grupo_id     uuid not null references grupos_insumo(id) on delete cascade,
  nome         text not null,
  created_at   timestamptz default now()
);

-- RLS para grupos e subgrupos
do $$ begin
  create policy "allow_all_grupos_insumo"    on grupos_insumo    for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_subgrupos_insumo" on subgrupos_insumo for all using (true) with check (true);
exception when duplicate_object then null; end $$;

alter table grupos_insumo    enable row level security;
alter table subgrupos_insumo enable row level security;

-- ============================================================
-- SEÇÃO 15 — Safras: vínculo com Ano Safra e Ciclo
-- ============================================================

alter table safras
  add column if not exists ano_safra_id uuid references anos_safra(id) on delete set null;

alter table safras
  add column if not exists ciclo_id uuid references ciclos(id) on delete set null;

-- ============================================================
-- SEÇÃO 16 — Pulverizações: corrigir nomes de colunas
-- ============================================================

alter table pulverizacoes rename column data_aplicacao    to data_inicio;
alter table pulverizacoes rename column estadio           to estadio_fenologico;
alter table pulverizacoes rename column vazao_lha         to vazao_l_ha;

alter table pulverizacoes add column if not exists pre_pos text;
update pulverizacoes set pre_pos = 'pre' where pre_emergencia = true;
alter table pulverizacoes drop column if exists pre_emergencia;

alter table pulverizacoes add column if not exists fiscal boolean default false;

alter table pulverizacao_itens rename column total to total_consumido;

-- ============================================================
-- SEÇÃO 17 — Criar tabelas faltantes: anos_safra, ciclos,
--            maquinas, bombas_combustivel, funcionarios,
--            grupos_usuarios, usuarios
-- ============================================================

create table if not exists anos_safra (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  descricao   text not null,
  data_inicio date,
  data_fim    date,
  created_at  timestamptz default now()
);

create table if not exists ciclos (
  id           uuid primary key default gen_random_uuid(),
  fazenda_id   uuid not null references fazendas(id) on delete cascade,
  ano_safra_id uuid references anos_safra(id) on delete cascade,
  descricao    text not null,
  cultura      text not null,
  data_inicio  date,
  data_fim     date,
  created_at   timestamptz default now()
);

create table if not exists maquinas (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  tipo        text not null default 'outro',
  marca       text,
  modelo      text,
  ano         int,
  patrimonio  text,
  ativa       boolean default true,
  created_at  timestamptz default now()
);

create table if not exists bombas_combustivel (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  tipo        text not null default 'diesel',
  ativa       boolean default true,
  created_at  timestamptz default now()
);

create table if not exists funcionarios (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  cpf         text,
  cargo       text,
  ativo       boolean default true,
  created_at  timestamptz default now()
);

create table if not exists grupos_usuarios (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  permissoes  jsonb,
  created_at  timestamptz default now()
);

create table if not exists usuarios (
  id           uuid primary key default gen_random_uuid(),
  fazenda_id   uuid not null references fazendas(id) on delete cascade,
  auth_user_id uuid,
  nome         text not null,
  email        text,
  grupo_id     uuid references grupos_usuarios(id) on delete set null,
  ativo        boolean default true,
  created_at   timestamptz default now()
);

do $$ begin
  create policy "allow_all_anos_safra"         on anos_safra         for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_ciclos"             on ciclos             for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_maquinas"           on maquinas           for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_bombas"             on bombas_combustivel for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_funcionarios"       on funcionarios       for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_grupos_usuarios"    on grupos_usuarios    for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_usuarios"           on usuarios           for all using (true) with check (true);
exception when duplicate_object then null; end $$;

alter table anos_safra         enable row level security;
alter table ciclos             enable row level security;
alter table maquinas           enable row level security;
alter table bombas_combustivel enable row level security;
alter table funcionarios       enable row level security;
alter table grupos_usuarios    enable row level security;
alter table usuarios           enable row level security;

-- ============================================================
-- Seção 18 — PLANEJAMENTO AGRÍCOLA
-- Agenda de tarefas + Recomendações Técnicas por ciclo
-- ============================================================

-- Agenda de tarefas
create table if not exists planejamento_tarefas (
  id                uuid primary key default gen_random_uuid(),
  fazenda_id        uuid not null references fazendas(id) on delete cascade,
  ciclo_id          uuid references safras(id) on delete set null,
  titulo            text not null,
  descricao         text,
  tipo              text not null default 'outro',
  data_prevista     date,
  data_conclusao    date,
  responsavel       text,
  prioridade        text not null default 'normal' check (prioridade in ('urgente','normal','baixa')),
  status            text not null default 'pendente' check (status in ('pendente','em_andamento','concluida','cancelada')),
  observacoes       text,
  created_at        timestamptz default now()
);

-- Recomendações técnicas do agrônomo
create table if not exists recomendacoes_tecnicas (
  id                    uuid primary key default gen_random_uuid(),
  fazenda_id            uuid not null references fazendas(id) on delete cascade,
  ciclo_id              uuid references safras(id) on delete set null,
  titulo                text not null,
  descricao             text,
  tipo                  text not null default 'outro',
  estadio_fenologico    text,
  data_recomendacao     date,
  responsavel_tecnico   text,
  prioridade            text not null default 'normal' check (prioridade in ('urgente','normal','baixa')),
  status                text not null default 'pendente' check (status in ('pendente','aplicada','ignorada')),
  created_at            timestamptz default now()
);

-- RLS
alter table planejamento_tarefas    enable row level security;
alter table recomendacoes_tecnicas  enable row level security;

do $$ begin
  create policy "allow_all_planejamento_tarefas"   on planejamento_tarefas   for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_recomendacoes_tecnicas" on recomendacoes_tecnicas for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ============================================================
-- SEÇÃO 19 — Correção de Solo e Adubação de Base
-- ============================================================

-- Registros de correção de solo (calcário, gesso, micronutrientes, orgânico)
create table if not exists correcoes_solo (
  id               uuid primary key default gen_random_uuid(),
  fazenda_id       uuid not null references fazendas(id) on delete cascade,
  ciclo_id         uuid not null references ciclos(id) on delete cascade,
  talhao_id        uuid references talhoes(id) on delete set null,
  finalidade       text not null default 'calcario' check (finalidade in ('calcario','gesso','micronutrientes','organico','outros')),
  area_ha          numeric(10,2) not null,
  data_aplicacao   date not null,
  observacao       text,
  custo_total      numeric(14,2),
  lancamento_id    uuid,
  created_at       timestamptz default now()
);

-- Itens de cada correção de solo
create table if not exists correcoes_solo_itens (
  id              uuid primary key default gen_random_uuid(),
  correcao_id     uuid not null references correcoes_solo(id) on delete cascade,
  fazenda_id      uuid not null references fazendas(id) on delete cascade,
  insumo_id       uuid references insumos(id) on delete set null,
  produto_nome    text,
  dose_ton_ha     numeric(10,4),
  quantidade_ton  numeric(14,4),
  valor_unitario  numeric(14,4),
  custo_total     numeric(14,2),
  created_at      timestamptz default now()
);

-- Registros de adubação de base (NPK, micronutrientes, foliar, fertirrigação)
create table if not exists adubacoes_base (
  id               uuid primary key default gen_random_uuid(),
  fazenda_id       uuid not null references fazendas(id) on delete cascade,
  ciclo_id         uuid not null references ciclos(id) on delete cascade,
  talhao_id        uuid references talhoes(id) on delete set null,
  modalidade       text not null default 'convencional' check (modalidade in ('convencional','sulco','broadcast','foliar','fertirrigacao')),
  area_ha          numeric(10,2) not null,
  data_aplicacao   date not null,
  observacao       text,
  custo_total      numeric(14,2),
  lancamento_id    uuid,
  created_at       timestamptz default now()
);

-- Itens de cada adubação de base
create table if not exists adubacoes_base_itens (
  id              uuid primary key default gen_random_uuid(),
  adubacao_id     uuid not null references adubacoes_base(id) on delete cascade,
  fazenda_id      uuid not null references fazendas(id) on delete cascade,
  insumo_id       uuid references insumos(id) on delete set null,
  produto_nome    text,
  dose_kg_ha      numeric(10,4),
  quantidade_kg   numeric(14,4),
  valor_unitario  numeric(14,4),
  custo_total     numeric(14,2),
  created_at      timestamptz default now()
);

-- RLS
alter table correcoes_solo       enable row level security;
alter table correcoes_solo_itens enable row level security;
alter table adubacoes_base       enable row level security;
alter table adubacoes_base_itens enable row level security;

do $$ begin
  create policy "allow_all_correcoes_solo"       on correcoes_solo       for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_correcoes_solo_itens" on correcoes_solo_itens for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_adubacoes_base"       on adubacoes_base       for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_adubacoes_base_itens" on adubacoes_base_itens for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ============================================================
-- Seção 20 — Adicionar ciclo_id nas operações existentes
-- (plantios, pulverizacoes, colheitas já criados em seções anteriores)
-- Execute depois das seções anteriores se as tabelas já existirem.
-- ============================================================

alter table plantios
  add column if not exists ciclo_id uuid references ciclos(id) on delete set null;

alter table pulverizacoes
  add column if not exists ciclo_id uuid references ciclos(id) on delete set null;

alter table colheitas
  add column if not exists ciclo_id uuid references ciclos(id) on delete set null;

-- Correção: correcoes_solo e adubacoes_base também precisam de ciclo_id
alter table correcoes_solo
  add column if not exists ciclo_id uuid references ciclos(id) on delete set null;

alter table adubacoes_base
  add column if not exists ciclo_id uuid references ciclos(id) on delete set null;

-- safra_id era NOT NULL na versão antiga (referenciava tabela safras, hoje vazia)
-- Sistema migrou para ciclo_id — tornar nullable para não bloquear inserção
alter table correcoes_solo alter column safra_id drop not null;
alter table adubacoes_base  alter column safra_id drop not null;

-- ============================================================
-- Seção 21 — Pedidos de Compra + Regras de Rateio
-- ============================================================

create table if not exists pedidos_compra (
  id                      uuid primary key default gen_random_uuid(),
  fazenda_id              uuid not null references fazendas(id) on delete cascade,
  numero                  serial,
  operacao                text,
  safra_texto             text,
  ciclo_id                uuid references ciclos(id) on delete set null,
  aprovador               text,
  nr_pedido               text,
  nr_solicitacao          text,
  data_registro           date not null default current_date,
  tipo                    text default 'Pedido Compra',
  fiscal                  boolean default false,
  fornecedor_id           uuid references pessoas(id) on delete set null,
  nr_pedido_fornecedor    text,
  cotacao_moeda           text default 'R$',
  variacao_cambial        numeric(10,4),
  deposito_previsao       text,
  contato_fornecedor      text,
  operacao_nf             text,
  forma_pagamento_nf      text,
  possui_ordem_compra     boolean default false,
  antecipacao_juros_pct   numeric(5,2) default 0,
  desc_antecipacao_pct    numeric(5,2) default 0,
  desc_pontualidade_pct   numeric(5,2) default 0,
  acrescimos_valor        numeric(14,2) default 0,
  desconto_pct            numeric(5,2) default 0,
  desconto_valor          numeric(14,2) default 0,
  frete_tipo              text,
  frete_total             numeric(14,2) default 0,
  comprador_id            uuid references pessoas(id) on delete set null,
  entrega_unica           boolean default true,
  previsao_entrega_unica  date,
  data_entrega_total      date,
  transportador           text,
  propriedade_entrega     text,
  endereco_entrega        text,
  cidade_entrega          text,
  status                  text default 'rascunho' check (status in ('rascunho','aprovado','parcialmente_entregue','entregue','cancelado')),
  observacao              text,
  total_financeiro        numeric(14,2) default 0,
  total_produtos_servicos numeric(14,2) default 0,
  lancamento_id           uuid,
  created_at              timestamptz default now()
);

create table if not exists pedidos_compra_itens (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references pedidos_compra(id) on delete cascade,
  fazenda_id       uuid not null references fazendas(id) on delete cascade,
  tipo_item        text default 'produto' check (tipo_item in ('produto','servico')),
  insumo_id        uuid references insumos(id) on delete set null,
  nome_item        text not null,
  unidade          text not null default 'kg',
  quantidade       numeric(14,4) not null default 0,
  valor_unitario   numeric(14,4) not null default 0,
  qtd_cancelada    numeric(14,4) default 0,
  qtd_entregue     numeric(14,4) default 0,
  centro_custo_id  uuid references centros_custo(id) on delete set null,
  created_at       timestamptz default now()
);

create table if not exists pedidos_compra_entregas (
  id                   uuid primary key default gen_random_uuid(),
  pedido_id            uuid not null references pedidos_compra(id) on delete cascade,
  item_id              uuid references pedidos_compra_itens(id) on delete set null,
  fazenda_id           uuid not null references fazendas(id) on delete cascade,
  nf_entrada_id        uuid references nf_entradas(id) on delete set null,
  data_entrega         date not null,
  quantidade_entregue  numeric(14,4) not null,
  valor_entregue       numeric(14,2),
  observacao           text,
  created_at           timestamptz default now()
);

create table if not exists regras_rateio (
  id                uuid primary key default gen_random_uuid(),
  fazenda_id        uuid not null references fazendas(id) on delete cascade,
  nome              text not null,
  tipo              text not null check (tipo in ('arrendamento','salario','manutencao','combustivel','outros')),
  descricao         text,
  ciclo_a_id        uuid references ciclos(id) on delete set null,
  ciclo_a_pct       numeric(5,2) default 50,
  ciclo_a_descricao text,
  ciclo_b_id        uuid references ciclos(id) on delete set null,
  ciclo_b_pct       numeric(5,2) default 50,
  ciclo_b_descricao text,
  ativo             boolean default true,
  created_at        timestamptz default now()
);

-- RLS
alter table pedidos_compra          enable row level security;
alter table pedidos_compra_itens    enable row level security;
alter table pedidos_compra_entregas enable row level security;
alter table regras_rateio           enable row level security;

do $$ begin
  create policy "allow_all_pedidos_compra" on pedidos_compra for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_pedidos_compra_itens" on pedidos_compra_itens for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_pedidos_compra_entregas" on pedidos_compra_entregas for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_regras_rateio" on regras_rateio for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ============================================================
-- SEÇÃO 22 — Rateio: ano_safra_id + tipos como array
-- Executa no Supabase SQL Editor
-- ============================================================

-- 1. Adiciona ano_safra_id
alter table regras_rateio
  add column if not exists ano_safra_id uuid references anos_safra(id) on delete restrict;

-- 2. Substitui coluna tipo (singular) por tipos (array de texto)
--    Executa apenas se a coluna tipo ainda existir
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'regras_rateio' and column_name = 'tipo'
  ) then
    alter table regras_rateio add column if not exists tipos text[] default '{}';
    -- migra dados existentes: coloca o valor antigo dentro do array
    update regras_rateio set tipos = array[tipo] where tipos = '{}' or tipos is null;
    alter table regras_rateio drop column tipo;
  end if;
end $$;

-- 3. Garante que tipos existe mesmo se tipo já foi removido
alter table regras_rateio
  add column if not exists tipos text[] default '{}';

-- 4. Índice para consultas por ano safra
create index if not exists idx_regras_rateio_ano_safra on regras_rateio(ano_safra_id);

-- ============================================================
-- SEÇÃO 23 — Operações de Compra + Formas de Pagamento
-- Executa no Supabase SQL Editor
-- ============================================================

create table if not exists operacoes_compra (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  tipo        text not null default 'ambos' check (tipo in ('pedido','nf','ambos')),
  descricao   text,
  ativo       boolean default true,
  created_at  timestamptz default now()
);

create table if not exists formas_pagamento (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  parcelas    int,
  dias        text,
  descricao   text,
  ativo       boolean default true,
  created_at  timestamptz default now()
);

alter table operacoes_compra enable row level security;
alter table formas_pagamento  enable row level security;

do $$ begin
  create policy "allow_all_operacoes_compra" on operacoes_compra for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "allow_all_formas_pagamento" on formas_pagamento for all using (true) with check (true);
exception when duplicate_object then null; end $$;

create index if not exists idx_operacoes_compra_fazenda on operacoes_compra(fazenda_id);
create index if not exists idx_formas_pagamento_fazenda on formas_pagamento(fazenda_id);

-- ============================================================
-- SEÇÃO 24 — Operações Gerenciais / Plano de Contas
-- Executa no Supabase SQL Editor
-- ============================================================

create table if not exists operacoes_gerenciais (
  id                       uuid primary key default gen_random_uuid(),
  fazenda_id               uuid not null references fazendas(id) on delete cascade,
  classificacao            text not null,               -- ex: "1.01.001"
  descricao                text not null,
  tipo                     text not null default 'despesa' check (tipo in ('receita','despesa')),
  parent_id                uuid references operacoes_gerenciais(id),
  tipo_lcdpr               text,                        -- "1","2","3","4","5"
  inativo                  boolean default false,
  informa_complemento      boolean default false,

  -- Aba Principal — telas
  permite_notas_fiscais      boolean default false,
  permite_cp_cr              boolean default false,
  permite_adiantamentos      boolean default false,
  permite_tesouraria         boolean default false,
  permite_baixas             boolean default false,
  permite_custo_produto      boolean default false,
  permite_contrato_financeiro boolean default false,

  -- Aba Principal — específicos
  permite_estoque            boolean default false,
  permite_pedidos_venda      boolean default false,
  permite_manutencao         boolean default false,
  marcar_fiscal_padrao       boolean default false,
  permite_energia_eletrica   boolean default false,

  -- Aba Estoque
  operacao_estoque           text check (operacao_estoque in ('entrada','saida','neutra')),
  tipo_item_estoque          text,
  tipo_custo_estoque         text default 'nenhum' check (tipo_custo_estoque in ('gasto','ajuste','contrato','nenhum')),

  -- Aba Fiscal
  obs_legal                  text,
  natureza_receita           text,
  impostos                   text[] default '{}',

  -- Aba Financeiro/Custos
  gerar_financeiro            boolean default false,
  gerar_financeiro_gerencial  boolean default false,
  valida_propriedade          boolean default false,
  custo_absorcao              boolean default false,
  custo_abc                   boolean default false,
  atualizar_custo_estoque     boolean default false,
  manutencao_reparos          boolean default false,
  gerar_depreciacao           boolean default false,

  -- Aba Config Plano de Contas
  tipo_formula               text check (tipo_formula in ('baixas','tesouraria','adiantamentos')),
  modelo_contabil            text,

  -- Aba Contabilidade
  conta_debito               text,    -- código da conta contábil de débito (ex: "3.1.01.001")
  conta_credito              text,    -- código da conta contábil de crédito (ex: "1.1.01.002")

  created_at                 timestamptz default now()
);

alter table operacoes_gerenciais enable row level security;

do $$ begin
  create policy "allow_all_operacoes_gerenciais" on operacoes_gerenciais for all using (true) with check (true);
exception when duplicate_object then null; end $$;

create index if not exists idx_op_gerenciais_fazenda       on operacoes_gerenciais(fazenda_id);
create index if not exists idx_op_gerenciais_classificacao on operacoes_gerenciais(fazenda_id, classificacao);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 25 — pedidos_compra: safra como FK, data_vencimento, meio_pagamento, barter
-- ─────────────────────────────────────────────────────────────────────────────
alter table pedidos_compra
  add column if not exists ano_safra_id          uuid references anos_safra(id),
  add column if not exists data_vencimento        date,
  add column if not exists meio_pagamento         text check (meio_pagamento in ('barter','pix','transferencia','boleto')),
  add column if not exists barter_ciclo_id        uuid references ciclos(id),
  add column if not exists barter_ano_safra_id    uuid references anos_safra(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 26 — nf_entradas v2: origem, tipo_entrada, vínculos e CP
-- ─────────────────────────────────────────────────────────────────────────────

alter table nf_entradas
  add column if not exists pessoa_id              uuid references pessoas(id),
  add column if not exists cfop                   text,
  add column if not exists status                 text not null default 'pendente'
                                                    check (status in ('digitando','pendente','processada','cancelada')),
  add column if not exists origem                 text check (origem in ('manual','xml','sieg')),
  add column if not exists tipo_entrada           text check (tipo_entrada in ('consumo','insumos','vef','remessa')),
  add column if not exists pedido_compra_id       uuid references pedidos_compra(id),
  add column if not exists operacao_gerencial_id  uuid references operacoes_gerenciais(id),
  add column if not exists centro_custo_id        uuid references centros_custo(id),
  add column if not exists data_vencimento_cp     date,
  add column if not exists deposito_destino_id    uuid references depositos(id);

alter table nf_entrada_itens
  add column if not exists descricao_nf       text,
  add column if not exists unidade_nf         text,
  add column if not exists fator_conversao    numeric(10,6) default 1,
  add column if not exists centro_custo_id    uuid references centros_custo(id);

-- Garante que a coluna status existe como texto (pode já existir com outro tipo)
do $$ begin
  -- Atualiza registros sem status
  update nf_entradas set status = 'pendente' where status is null;
exception when others then null; end $$;

create index if not exists idx_nf_entradas_pedido    on nf_entradas(pedido_compra_id);
create index if not exists idx_nf_entradas_tipo      on nf_entradas(fazenda_id, tipo_entrada);
create index if not exists idx_nf_entradas_status    on nf_entradas(fazenda_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 27 — NF de Devolução de Compra
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Adiciona coluna de referência à NF de origem (a NF que está sendo devolvida)
alter table nf_entradas
  add column if not exists nf_origem_id uuid references nf_entradas(id);

-- 2. Atualiza o check constraint de tipo_entrada para incluir 'devolucao_compra'
--    Remove o constraint gerado automaticamente e recria com o novo valor
alter table nf_entradas
  drop constraint if exists nf_entradas_tipo_entrada_check;

alter table nf_entradas
  add constraint nf_entradas_tipo_entrada_check
  check (tipo_entrada in ('consumo','insumos','vef','remessa','devolucao_compra'));

-- 3. Índice para localizar devoluções por NF de origem
create index if not exists idx_nf_entradas_origem on nf_entradas(nf_origem_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 28 — Configurações de NF-e por fazenda
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists configuracoes_nfe (
  id                      uuid primary key default gen_random_uuid(),
  fazenda_id              uuid not null references fazendas(id) on delete cascade,

  -- Emissão
  ambiente                text not null default 'homologacao' check (ambiente in ('producao','homologacao')),
  modelo                  text not null default '55'          check (modelo in ('55','65')),
  serie                   text not null default '1',
  proximo_numero          bigint not null default 1,
  forma_emissao           text not null default '1'
                            check (forma_emissao in ('1','2','3','4','5','6','7','9')),
                            -- 1=Normal, 2=Contingência FS, 3=SCAN, 4=DPEC, 5=FS-DA, 6=SVC-AN, 7=SVC-RS, 9=Off-Line NFC-e

  -- Tributação
  regime_tributario       text not null default '3'
                            check (regime_tributario in ('1','2','3')),
                            -- 1=Simples Nacional, 2=Simples Nacional excesso, 3=Regime Normal
  aliquota_icms_padrao    numeric(5,2) default 0,
  icms_diferido           boolean default true,   -- MT: ICMS diferido em operações com grãos
  pct_icms_diferido       numeric(5,2) default 100,

  -- CFOP padrões por tipo de operação
  cfop_venda_intraestadual   text default '6101',
  cfop_venda_interestadual   text default '6101',
  cfop_remessa_armazem       text default '1905',
  cfop_retorno_armazem       text default '5905',
  cfop_devolucao_compra      text default '5201',

  -- Textos legais
  texto_complementar      text,                   -- infCpl padrão em toda NF
  texto_icms_diferido     text default 'ICMS diferido nos termos do art. 18 do Anexo VII do RICMS/MT.',
  texto_produtor_rural    text default 'Produtor Rural. Nota fiscal emitida nos termos da IN 006/2017 SEFAZ/MT.',
  textos_por_cfop         jsonb default '[]',     -- [{cfop, texto}]

  -- IBS / CBS — Reforma Tributária 2027
  destaque_ibs_cbs        boolean default false,
  aliquota_ibs            numeric(5,2) default 0,
  aliquota_cbs            numeric(5,2) default 0,
  texto_ibs_cbs           text default 'Valores de IBS e CBS destacados conforme LC 214/2024.',

  -- Automação
  emissao_automatica      boolean default false,  -- emite NF ao confirmar contrato/romaneio
  enviar_xml_email        boolean default false,
  email_copia_xml         text,
  gerar_danfe_auto        boolean default true,
  armazenar_xml_storage   boolean default true,

  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),

  unique (fazenda_id)     -- uma configuração por fazenda
);

alter table configuracoes_nfe enable row level security;

do $$ begin
  create policy "allow_all_configuracoes_nfe" on configuracoes_nfe for all using (true) with check (true);
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SEÇÃO 29 — Campos adicionais em configuracoes_nfe (PF/PJ + Funrural + PIS/COFINS)
-- Executar após Seção 28
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tipo de emitente (PF = Produtor Rural Pessoa Física / PJ = Pessoa Jurídica)
alter table configuracoes_nfe
  add column if not exists tipo_emitente text not null default 'pf'
    check (tipo_emitente in ('pf','pj'));

-- 2. Funrural — discriminado por componente para transparência fiscal
alter table configuracoes_nfe
  add column if not exists funrural_ativo              boolean      default true,
  add column if not exists funrural_responsavel        text         default 'adquirente'
    check (funrural_responsavel in ('emitente','adquirente')),
  add column if not exists funrural_aliquota_inss      numeric(5,3) default 1.200,   -- % sobre receita bruta
  add column if not exists funrural_aliquota_senar     numeric(5,3) default 0.100,   -- % SENAR
  add column if not exists funrural_aliquota_rat       numeric(5,3) default 0.200,   -- % RAT (Acidente de Trabalho)
  add column if not exists funrural_texto              text;

-- 3. ICMS — alíquotas por destino (MT usa diferimento; manter para cálculo em operações PJ)
alter table configuracoes_nfe
  add column if not exists aliquota_icms_intraestadual          numeric(5,2) default 12.00,
  add column if not exists aliquota_icms_interestadual_sul_sudeste  numeric(5,2) default 7.00,
  add column if not exists aliquota_icms_interestadual_demais   numeric(5,2) default 12.00;

-- 4. PIS / COFINS — só aplicável para PJ
alter table configuracoes_nfe
  add column if not exists pis_cofins_ativo   boolean      default false,
  add column if not exists cst_pis_cofins     text         default '07',   -- 07=Operações Fiscalmente Isentas (Agro)
  add column if not exists aliquota_pis       numeric(5,3) default 0.650,  -- % Regime Cumulativo
  add column if not exists aliquota_cofins    numeric(5,3) default 3.000;  -- % Regime Cumulativo

-- 5. CFOP separado por distância (intra vs inter) — já havia cfop_venda_intraestadual/interestadual
--    Renomear colunas antigas para manter consistência com a interface
alter table configuracoes_nfe
  rename column cfop_venda_intraestadual to cfop_venda_intra;

alter table configuracoes_nfe
  rename column cfop_venda_interestadual to cfop_venda_inter;

-- 6. Renomear aliquota_icms_padrao → aliquota_icms_intraestadual já existe acima;
--    remover a coluna antiga (pode ter conflito se já foi criada na Seção 28)
alter table configuracoes_nfe
  drop column if exists aliquota_icms_padrao;

-- ============================================================
-- Seção 30 — Tabela nf_servicos (NFS-e / Nota Fiscal de Serviços)
-- Executar no Supabase SQL Editor
-- ============================================================

create table if not exists nf_servicos (
  id                       uuid primary key default gen_random_uuid(),
  fazenda_id               uuid not null references fazendas(id) on delete cascade,

  -- Identificação
  numero_nf                text not null,
  serie                    text not null default '1',
  chave_nfse               text,                        -- chave eletrônica NFS-e (44 dígitos)

  -- Prestador
  prestador_id             uuid references pessoas(id),
  prestador_nome           text not null,
  prestador_cnpj           text,
  municipio_prestacao      text,

  -- Data e competência
  data_prestacao           date not null,
  competencia              text,                        -- formato YYYY-MM

  -- Serviço
  codigo_servico           text,                        -- código LC 116/2003 ou municipal
  cnae                     text,
  discriminacao            text,                        -- descrição detalhada (até 2000 chars)

  -- Valores
  valor_servico            numeric(15,2) not null default 0,
  valor_deducoes           numeric(15,2) not null default 0,
  valor_base_iss           numeric(15,2) not null default 0,
  aliquota_iss             numeric(5,2)  not null default 0,
  valor_iss                numeric(15,2) not null default 0,
  iss_retido               boolean       not null default false,

  -- Retenções federais
  valor_inss               numeric(15,2) not null default 0,
  valor_ir                 numeric(15,2) not null default 0,
  valor_outras_retencoes   numeric(15,2) not null default 0,   -- CSLL + PIS + COFINS
  valor_liquido            numeric(15,2) not null default 0,

  -- Classificação gerencial
  operacao_gerencial_id    uuid references operacoes_gerenciais(id),
  centro_custo_id          uuid references centros_custo(id),
  ano_safra_id             uuid references anos_safra(id),
  pedido_compra_id         uuid references pedidos_compra(id),
  data_vencimento_cp       date,

  -- Controle
  status                   text not null default 'digitando'
                             check (status in ('digitando','pendente','processada','cancelada')),
  origem                   text not null default 'manual'
                             check (origem in ('manual','xml','api')),
  observacao               text,
  created_at               timestamptz default now()
);

alter table nf_servicos enable row level security;
drop policy if exists "allow_all_nf_servicos" on nf_servicos;
create policy "allow_all_nf_servicos" on nf_servicos
  for all using (true) with check (true);

create index if not exists idx_nf_servicos_fazenda    on nf_servicos(fazenda_id);
create index if not exists idx_nf_servicos_prestador  on nf_servicos(fazenda_id, prestador_id);
create index if not exists idx_nf_servicos_competencia on nf_servicos(fazenda_id, competencia);

-- ============================================================
-- Seção 31 — Padrões de Classificação + Romaneio detalhado
-- Executar no Supabase SQL Editor
-- ============================================================

-- 31.1 Tabela auxiliar de padrões de classificação por commodity
-- Substitui os valores hardcoded no frontend — cada cliente pode
-- configurar seus próprios padrões (ex: Bunge tem tolerâncias diferentes
-- da Cargill para avariados de soja).
create table if not exists padroes_classificacao (
  id                    uuid primary key default gen_random_uuid(),
  fazenda_id            uuid not null references fazendas(id) on delete cascade,
  commodity             text not null,          -- 'Soja','Milho 1ª','Milho 2ª (Safrinha)','Algodão','Sorgo','Trigo'
  nome_padrao           text not null,          -- ex: 'ABIOVE 2025', 'Padrão Bunge', 'Interno'
  ativo                 boolean not null default true,

  -- Padrões de referência (acima disso = desconto)
  umidade_padrao        numeric(5,2) not null,
  impureza_padrao       numeric(5,2) not null,
  avariados_padrao      numeric(5,2) not null,  -- avariados totais

  -- Soja — sub-parâmetros de avariados (IN MAPA 11/2007 / ABIOVE)
  ardidos_max           numeric(5,2),           -- padrão ABIOVE: 8%
  mofados_max           numeric(5,2),           -- incluso em ardidos
  esverdeados_max       numeric(5,2),           -- padrão ABIOVE: 8%
  quebrados_max         numeric(5,2),           -- padrão ABIOVE: 30%
  ph_minimo             numeric(5,2),           -- Peso Hectolítrico mínimo (kg/hl), ex: 78

  -- Milho — sub-parâmetros (IN MAPA 60/2011)
  -- ardidos_max reaproveitado (ardidos+brotados p/ milho)
  carunchados_max       numeric(5,2),           -- carunchados e atacados por insetos

  -- Peso da saca
  kg_saca               numeric(6,2) not null default 60,

  created_at            timestamptz default now(),

  unique (fazenda_id, commodity, nome_padrao)
);

alter table padroes_classificacao enable row level security;
drop policy if exists "allow_all_padroes_classificacao" on padroes_classificacao;
create policy "allow_all_padroes_classificacao" on padroes_classificacao
  for all using (true) with check (true);
create index if not exists idx_padroes_class_fazenda on padroes_classificacao(fazenda_id, commodity);

-- 31.2 Colunas detalhadas de classificação no romaneio de expedição
-- Soja: sub-parâmetros de avariados
alter table romaneios
  add column if not exists ph_hl                  numeric(5,2),   -- Peso Hectolítrico (kg/hl)
  add column if not exists ardidos_pct            numeric(5,2),   -- ardidos / queimados
  add column if not exists mofados_pct            numeric(5,2),
  add column if not exists fermentados_pct        numeric(5,2),
  add column if not exists germinados_pct         numeric(5,2),
  add column if not exists esverdeados_pct        numeric(5,2),
  add column if not exists quebrados_pct          numeric(5,2),
  add column if not exists outros_avariados_pct   numeric(5,2),
  -- Milho específico
  add column if not exists carunchados_pct        numeric(5,2),
  -- padrao_id: vincula ao padrão utilizado para calcular descontos
  add column if not exists padrao_classificacao_id uuid references padroes_classificacao(id) on delete set null;

-- 31.3 Peso faturado / recebido pelo comprador
-- O peso da balança saída (produtor) pode diferir do peso que o
-- comprador fatura. Guardamos ambos para conciliação e análise de perdas.
alter table romaneios
  add column if not exists peso_liquido_destino   numeric(14,2),  -- balança comprador (kg)
  add column if not exists peso_class_destino     numeric(14,2),  -- peso classificado comprador (kg)
  add column if not exists sacas_faturadas        numeric(12,4),  -- sacas na NF do comprador
  add column if not exists diferenca_kg           numeric(14,2),  -- peso_class_saida - peso_class_destino
  add column if not exists diferenca_pct          numeric(7,4),   -- diferença percentual
  add column if not exists obs_divergencia        text;           -- justificativa se divergência > tolerância

-- ============================================================
-- Seção 32 — Orçamento de Safra (planejamento de custos por ciclo)
-- Executar no Supabase SQL Editor
-- ============================================================

create table if not exists orcamentos (
  id                      uuid primary key default gen_random_uuid(),
  fazenda_id              uuid not null references fazendas(id) on delete cascade,
  ciclo_id                uuid not null references ciclos(id) on delete cascade,
  nome                    text not null,
  status                  text not null default 'rascunho'
                            check (status in ('rascunho','aprovado','encerrado')),
  area_ha                 numeric(10,2),
  produtividade_esperada  numeric(10,4),   -- sc/ha
  preco_esperado_sc       numeric(15,2),   -- R$/sc
  created_at              timestamptz default now(),
  unique (fazenda_id, ciclo_id)
);

create table if not exists orcamento_itens (
  id              uuid primary key default gen_random_uuid(),
  orcamento_id    uuid not null references orcamentos(id) on delete cascade,
  fazenda_id      uuid not null references fazendas(id) on delete cascade,
  categoria       text not null
                    check (categoria in ('sementes','fertilizantes','defensivos','correcao_solo','operacoes','arrendamento','outros')),
  subcategoria    text,
  descricao       text not null,
  insumo_id       uuid references insumos(id) on delete set null,
  quantidade      numeric(14,4),
  unidade         text,
  valor_unitario  numeric(15,4),
  valor_total     numeric(15,2),
  created_at      timestamptz default now()
);

alter table orcamentos      enable row level security;
alter table orcamento_itens enable row level security;
drop policy if exists "allow_all_orcamentos"      on orcamentos;
drop policy if exists "allow_all_orcamento_itens" on orcamento_itens;
create policy "allow_all_orcamentos"      on orcamentos      for all using (true) with check (true);
create policy "allow_all_orcamento_itens" on orcamento_itens for all using (true) with check (true);

create index if not exists idx_orcamentos_fazenda      on orcamentos(fazenda_id, ciclo_id);
create index if not exists idx_orcamento_itens_orc     on orcamento_itens(orcamento_id);

-- ============================================================
-- Seção 33 — Pagamentos de Arrendamento
-- Executar no Supabase SQL Editor
-- ============================================================

create table if not exists arrendamento_pagamentos (
  id                  uuid primary key default gen_random_uuid(),
  arrendamento_id     uuid not null references arrendamentos(id) on delete cascade,
  fazenda_id          uuid not null references fazendas(id) on delete cascade,
  ano_safra_id        uuid references anos_safra(id),
  data_vencimento     date not null,
  data_pagamento      date,
  -- Pagamento em sacas
  sacas_previstas     numeric(12,4),
  sacas_pagas         numeric(12,4),
  commodity           text,              -- soja, milho, etc.
  preco_sc_referencia numeric(15,2),     -- R$/sc no momento do pagamento
  -- Pagamento em R$
  valor_previsto      numeric(15,2),
  valor_pago          numeric(15,2),
  -- Controle
  status              text not null default 'pendente'
                        check (status in ('pendente','pago','parcial','cancelado')),
  lancamento_id       uuid,              -- FK para contas_pagar quando gerado
  observacao          text,
  created_at          timestamptz default now()
);

alter table arrendamento_pagamentos enable row level security;
drop policy if exists "allow_all_arr_pagamentos" on arrendamento_pagamentos;
create policy "allow_all_arr_pagamentos" on arrendamento_pagamentos
  for all using (true) with check (true);

create index if not exists idx_arr_pag_fazenda      on arrendamento_pagamentos(fazenda_id);
create index if not exists idx_arr_pag_arrendamento on arrendamento_pagamentos(arrendamento_id);
create index if not exists idx_arr_pag_vencimento   on arrendamento_pagamentos(fazenda_id, data_vencimento);

-- ────────────────────────────────────────────────────────────
-- 34. sc_milho_ha em arrendamentos (Soja+Milho separados)
-- ────────────────────────────────────────────────────────────
-- Antes: sc_ha guardava um único valor com divisão implícita ÷2
-- Agora: sc_ha = soja sc/ha, sc_milho_ha = milho sc/ha (independentes)
alter table arrendamentos
  add column if not exists sc_milho_ha numeric(10,4);

comment on column arrendamentos.sc_milho_ha is
  'sc/ha/ano de milho — usado apenas quando forma_pagamento = sc_soja_milho';

-- ────────────────────────────────────────────────────────────
-- 35. is_arrendamento e arrendamento_id em contratos
-- ────────────────────────────────────────────────────────────
-- Contratos de comprometimento de grãos gerados pelo módulo de
-- arrendamento. Não geram financeiro — servem para rastrear
-- comprometimento de estoque e alimentar o painel de BI.
alter table contratos
  add column if not exists is_arrendamento  boolean  default false,
  add column if not exists arrendamento_id  uuid     references arrendamentos(id) on delete set null;

comment on column contratos.is_arrendamento is
  'true = comprometimento de grãos de arrendamento (não gera financeiro)';
comment on column contratos.arrendamento_id is
  'FK arrendamentos — preenchido quando is_arrendamento = true';

create index if not exists idx_contratos_arrendamento
  on contratos(arrendamento_id) where arrendamento_id is not null;

-- ────────────────────────────────────────────────────────────
-- 36. role em perfis — controle de acesso Raccotlo BI
-- ────────────────────────────────────────────────────────────
-- Valores: 'client' (padrão) ou 'raccotlo'
-- Usuários raccotlo veem o painel BI exclusivo com todos os clientes.
-- Para promover um usuário: UPDATE perfis SET role = 'raccotlo' WHERE user_id = '<uuid>';
alter table perfis
  add column if not exists role text default 'client'
    check (role in ('client', 'raccotlo'));

comment on column perfis.role is
  'client = usuário normal da fazenda; raccotlo = acesso ao painel BI exclusivo Raccotlo';

-- ────────────────────────────────────────────────────────────
-- 37. raccolto_acesso em fazendas — consentimento LGPD
-- ────────────────────────────────────────────────────────────
-- false por padrão (opt-in). O cliente ativa explicitamente em
-- Configurações > Usuários para permitir que a Raccolto visualize
-- seus dados no painel BI.
alter table fazendas
  add column if not exists raccolto_acesso boolean default false;

comment on column fazendas.raccolto_acesso is
  'Consentimento LGPD: true = cliente autorizou a Raccolto a visualizar seus dados no painel BI';

-- ────────────────────────────────────────────────────────────
-- 38. Expedição de Grãos + Central de Configurações de Módulos
-- ────────────────────────────────────────────────────────────

-- 38a. Configurações de módulos (JSONB por fazenda/módulo)
-- Permite configurar cada módulo sem alterar código a cada implantação
create table if not exists configuracoes_modulo (
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  modulo      text not null,  -- 'nfe' | 'mdfe' | 'nfse' | 'email' | 'whatsapp' | 'banco' | 'expedicao'
  config      jsonb not null default '{}',
  updated_at  timestamptz default now(),
  updated_by  text,
  primary key (fazenda_id, modulo)
);

-- 38b. Transportadoras
create table if not exists transportadoras (
  id           uuid primary key default gen_random_uuid(),
  fazenda_id   uuid not null references fazendas(id) on delete cascade,
  cnpj         text,
  razao_social text not null,
  nome_fantasia text,
  ie           text,
  rntrc        text,
  uf           text,
  municipio    text,
  fone         text,
  email        text,
  ativa        boolean default true,
  created_at   timestamptz default now()
);

-- 38c. Veículos
create table if not exists veiculos (
  id           uuid primary key default gen_random_uuid(),
  fazenda_id   uuid not null references fazendas(id) on delete cascade,
  placa        text not null,
  tipo         text default 'truck',  -- truck | bitruck | bitrem | rodotrem | van | outros
  tara_kg      numeric(8,0),
  cap_kg       numeric(8,0),
  uf           text,
  rntrc        text,
  proprietario text,
  ativo        boolean default true,
  created_at   timestamptz default now()
);

-- 38d. Motoristas
create table if not exists motoristas (
  id           uuid primary key default gen_random_uuid(),
  fazenda_id   uuid not null references fazendas(id) on delete cascade,
  nome         text not null,
  cpf          text,
  cnh          text,
  cnh_validade date,
  fone         text,
  ativo        boolean default true,
  created_at   timestamptz default now()
);

-- 38e. Cargas de expedição
create table if not exists cargas_expedicao (
  id                      uuid primary key default gen_random_uuid(),
  fazenda_id              uuid not null references fazendas(id) on delete cascade,
  contrato_id             uuid references contratos(id) on delete set null,
  numero                  text,                        -- EXP-2025-001
  produto                 text,
  safra                   text,
  -- Rota
  rota                    text not null,               -- transbordo_sem_nf | transbordo_com_remessa | direto_comprador
  modalidade_frete        text default 'fob',          -- fob | cif
  deposito_destino        text,                        -- para transbordo
  destino_nome            text,                        -- comprador / armazém
  -- Pesagem
  peso_bruto_kg           numeric(12,2),
  tara_kg                 numeric(12,2),
  peso_liquido_kg         numeric(12,2),
  peso_aproximado         boolean default false,        -- true = NF com peso aprox., aguarda correção
  peso_destino_kg         numeric(12,2),               -- peso conferido no destino
  divergencia_kg          numeric(12,2),               -- calculado
  -- Classificação
  umidade_pct             numeric(5,2),
  impureza_pct            numeric(5,2),
  avariados_pct           numeric(5,2),
  -- Transporte
  transportadora_id       uuid references transportadoras(id) on delete set null,
  veiculo_id              uuid references veiculos(id) on delete set null,
  motorista_id            uuid references motoristas(id) on delete set null,
  placa_carreta           text,
  -- NF-e
  nfe_tipo                text,                        -- 5905 | 6101
  nfe_numero              text,
  nfe_serie               text,
  nfe_chave               text,
  nfe_status              text default 'pendente',     -- pendente | emitida | cancelada
  nfe_complementar_numero text,
  nfe_complementar_chave  text,
  nfe_complementar_status text,
  -- MDF-e
  mdfe_id                 uuid,                        -- FK mdfe(id) after creation
  -- Datas
  data_saida              date,
  data_entrega            date,
  -- Status
  status                  text default 'rascunho',     -- rascunho | em_transito | entregue | corrigindo_peso | encerrada
  observacao              text,
  created_at              timestamptz default now()
);

-- 38f. MDF-e (Manifesto Eletrônico de Documentos Fiscais)
create table if not exists mdfe (
  id                  uuid primary key default gen_random_uuid(),
  fazenda_id          uuid not null references fazendas(id) on delete cascade,
  carga_id            uuid references cargas_expedicao(id) on delete set null,
  ambiente            text default 'homologacao',      -- homologacao | producao
  serie               text default '1',
  numero              text,
  chave               text,
  status              text default 'rascunho',         -- rascunho | assinado | transmitido | autorizado | encerrado | cancelado
  -- Emitente (snapshot da config no momento da emissão)
  emit_cnpj           text,
  emit_razao_social   text,
  emit_ie             text,
  emit_uf             text,
  emit_rntrc          text,
  -- Modal Rodoviário
  condutor_nome       text,
  condutor_cpf        text,
  veiculo_placa       text,
  veiculo_uf          text,
  veiculo_rntrc       text,
  veiculo_tipo        text,
  placa_carreta       text,
  -- Percurso
  mun_carregamento    text,                            -- nome + código IBGE
  mun_descarregamento text,
  uf_ini              text,
  uf_fim              text,
  -- Carga
  produto             text,
  quantidade_kg       numeric(14,3),
  -- Documentos vinculados
  nfes_chave          text[],                          -- array de chaves NF-e
  -- Transmissão
  xml_gerado          text,
  protocolo           text,
  motivo              text,
  -- Datas
  data_emissao        timestamptz,
  data_encerramento   timestamptz,
  observacao          text,
  created_at          timestamptz default now()
);

-- RLS — permite acesso autenticado (mesma política do restante do sistema)
alter table configuracoes_modulo  enable row level security;
alter table transportadoras       enable row level security;
alter table veiculos              enable row level security;
alter table motoristas            enable row level security;
alter table cargas_expedicao      enable row level security;
alter table mdfe                  enable row level security;

create policy "allow_all_configuracoes_modulo" on configuracoes_modulo for all using (true) with check (true);
create policy "allow_all_transportadoras"      on transportadoras       for all using (true) with check (true);
create policy "allow_all_veiculos"             on veiculos              for all using (true) with check (true);
create policy "allow_all_motoristas"           on motoristas            for all using (true) with check (true);
create policy "allow_all_cargas_expedicao"     on cargas_expedicao      for all using (true) with check (true);
create policy "allow_all_mdfe"                 on mdfe                  for all using (true) with check (true);

-- Índices
create index if not exists idx_config_modulo_fazenda on configuracoes_modulo(fazenda_id, modulo);
create index if not exists idx_cargas_fazenda        on cargas_expedicao(fazenda_id, status);
create index if not exists idx_cargas_contrato       on cargas_expedicao(contrato_id);
create index if not exists idx_mdfe_carga            on mdfe(carga_id);

-- ─── Migration 39 — cargas_expedicao: campos MDF-e inline + contrato_numero ─
-- Permite exibir MDF-e e nº contrato na lista sem JOIN extra
alter table cargas_expedicao add column if not exists mdfe_numero text;
alter table cargas_expedicao add column if not exists mdfe_chave  text;
alter table cargas_expedicao add column if not exists mdfe_status text default 'pendente';
alter table cargas_expedicao add column if not exists contrato_numero text;
alter table cargas_expedicao add column if not exists destino_razao_social text;
alter table cargas_expedicao add column if not exists peso_bruto_origem_kg numeric(12,2);
alter table cargas_expedicao add column if not exists tara_origem_kg       numeric(12,2);
alter table cargas_expedicao add column if not exists peso_liquido_destino_kg numeric(12,2);
alter table cargas_expedicao add column if not exists peso_aproximado_kg   numeric(12,2);

-- ─── Migration 40 — Extratos Bancários (Conciliação OFX) ──────────────────────
create table if not exists extratos_bancarios (
  id               text primary key,               -- gerado no frontend (ext-timestamp)
  fazenda_id       uuid not null references fazendas(id) on delete cascade,
  conta_id         uuid references contas_bancarias(id) on delete set null,
  conta_nome       text,
  data_importacao  date,
  data_inicio      date,
  data_fim         date,
  total_linhas     int  default 0,
  conciliados      int  default 0,
  pendentes        int  default 0,
  linhas           jsonb not null default '[]',     -- array de LinhaOFX
  created_at       timestamptz default now()
);

alter table extratos_bancarios enable row level security;
create policy "allow_all_extratos" on extratos_bancarios for all using (true) with check (true);
create index if not exists idx_extratos_fazenda on extratos_bancarios(fazenda_id, data_importacao);

-- ─── Migration 41 — Ciclos: produtividade esperada + talhões vinculados ─────────

-- Novos campos no ciclo
alter table ciclos add column if not exists produtividade_esperada_sc_ha numeric(10,4);
alter table ciclos add column if not exists preco_esperado_sc             numeric(10,2);
alter table ciclos add column if not exists area_plantada_ha              numeric(10,4);

-- Tabela de vínculo ciclo ↔ talhão
create table if not exists ciclo_talhoes (
  id               uuid primary key default gen_random_uuid(),
  ciclo_id         uuid not null references ciclos(id) on delete cascade,
  talhao_id        uuid not null references talhoes(id) on delete cascade,
  fazenda_id       uuid not null references fazendas(id) on delete cascade,
  area_plantada_ha numeric(10,4) not null default 0,
  created_at       timestamptz default now(),
  unique(ciclo_id, talhao_id)
);

alter table ciclo_talhoes enable row level security;
create policy "allow_all_ciclo_talhoes" on ciclo_talhoes for all using (true) with check (true);
create index if not exists idx_ciclo_talhoes_ciclo   on ciclo_talhoes(ciclo_id);
create index if not exists idx_ciclo_talhoes_talhao  on ciclo_talhoes(talhao_id);
create index if not exists idx_ciclo_talhoes_fazenda on ciclo_talhoes(fazenda_id);

-- Trigger: atualiza area_plantada_ha em ciclos automaticamente ao salvar ciclo_talhoes
create or replace function sync_ciclo_area_plantada()
returns trigger language plpgsql as $$
begin
  update ciclos
  set area_plantada_ha = (
    select coalesce(sum(area_plantada_ha), 0)
    from ciclo_talhoes
    where ciclo_id = coalesce(new.ciclo_id, old.ciclo_id)
  )
  where id = coalesce(new.ciclo_id, old.ciclo_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_ciclo_area on ciclo_talhoes;
create trigger trg_sync_ciclo_area
  after insert or update or delete on ciclo_talhoes
  for each row execute function sync_ciclo_area_plantada();

-- ─── Migration 42 — Lançamentos: ano_safra_id, produtor_id, moeda_pagamento ──
alter table lancamentos add column if not exists ano_safra_id    uuid references anos_safra(id)  on delete set null;
alter table lancamentos add column if not exists produtor_id     uuid references produtores(id)  on delete set null;
alter table lancamentos add column if not exists moeda_pagamento text check (moeda_pagamento in ('BRL','USD'));

create index if not exists idx_lanc_ano_safra on lancamentos(ano_safra_id);
create index if not exists idx_lanc_produtor  on lancamentos(produtor_id);

-- ─── Migration 43 — Agricultores por contrato (LCDPR multi-produtor) ──────────
-- Arrendamentos: quem paga (locatário) — pode ser 1 ou 2 produtores em conjunto
alter table arrendamentos add column if not exists produtor_id   uuid references produtores(id) on delete set null;
alter table arrendamentos add column if not exists produtor_id_2 uuid references produtores(id) on delete set null;
comment on column arrendamentos.produtor_id   is 'Agricultor responsável principal pelo pagamento do arrendamento (LCDPR)';
comment on column arrendamentos.produtor_id_2 is 'Segundo agricultor em contratos conjuntos — 50% cada para LCDPR';

-- Contas Bancárias: vínculo com produtor para LCDPR
alter table contas_bancarias add column if not exists produtor_id uuid references produtores(id) on delete set null;
comment on column contas_bancarias.produtor_id is 'Produtor dono da conta bancária (LCDPR)';

-- Contratos Financeiros: agricultor responsável
alter table contratos_financeiros add column if not exists produtor_id uuid references produtores(id) on delete set null;
comment on column contratos_financeiros.produtor_id is 'Agricultor responsável pelo contrato financeiro (LCDPR)';

create index if not exists idx_arrendamentos_produtor  on arrendamentos(produtor_id);
create index if not exists idx_contrfin_produtor       on contratos_financeiros(produtor_id);
create index if not exists idx_contas_banc_produtor    on contas_bancarias(produtor_id);

-- ─── Migration 44 — Subcategorias de Pessoas ──────────────────────────────────
-- Permite classificar pessoas com múltiplas subcategorias (ex: "Arrendante", "Fornecedor de Insumos")
-- TEXT[] suporta subcategorias padrão e customizadas sem schema rígido
alter table pessoas add column if not exists subcategorias text[] default '{}';
comment on column pessoas.subcategorias is 'Lista de subcategorias da pessoa: Prestador de Serviço, Arrendante, Fornecedor de Insumos, etc. Inclui customizadas.';

create index if not exists idx_pessoas_subcategorias on pessoas using gin(subcategorias);

-- ─── Migration 45 — Learning Progress ────────────────────────────────────────
-- Armazena o progresso de aprendizado de cada usuário por lição
create table if not exists learning_progress (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  lesson_id   text not null,
  completed   boolean not null default true,
  completed_at timestamptz,
  created_at  timestamptz default now(),
  constraint uq_learning_progress unique (fazenda_id, user_id, lesson_id)
);
create index if not exists idx_learning_fazenda_user on learning_progress(fazenda_id, user_id);

-- ─── Migration 46 — Controller Alertas ───────────────────────────────────────
-- Armazena alertas gerados pelas verificações automáticas do Controller
create table if not exists controller_alertas (
  id              uuid primary key default gen_random_uuid(),
  fazenda_id      uuid not null references fazendas(id) on delete cascade,
  categoria       text not null,
  severidade      text not null check (severidade in ('critico','alto','medio','baixo')),
  titulo          text not null,
  descricao       text not null,
  affected_id     text,
  affected_module text,
  suggested_action text,
  check_key       text not null,
  first_seen_at   timestamptz default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  resolved_at     timestamptz,
  created_at      timestamptz default now(),
  constraint uq_controller_alerta unique (fazenda_id, check_key, affected_id)
);
create index if not exists idx_controller_fazenda     on controller_alertas(fazenda_id);
create index if not exists idx_controller_severidade  on controller_alertas(severidade);
create index if not exists idx_controller_resolved    on controller_alertas(resolved_at) where resolved_at is null;

-- ─── Migration 47 — Suporte IA ───────────────────────────────────────────────
-- Conversas e mensagens do Suporte IA
create table if not exists suporte_conversas (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  titulo      text default 'Nova conversa',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_suporte_conv_user on suporte_conversas(fazenda_id, user_id);

create table if not exists suporte_mensagens (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references suporte_conversas(id) on delete cascade,
  fazenda_id   uuid not null references fazendas(id) on delete cascade,
  role         text not null check (role in ('user','assistant')),
  content      text not null,
  created_at   timestamptz default now()
);
create index if not exists idx_suporte_msgs_conversa on suporte_mensagens(conversa_id);

-- RLS suporte_conversas
alter table suporte_conversas enable row level security;
create policy "usuario vê próprias conversas"        on suporte_conversas for select using (user_id = auth.uid());
create policy "usuario cria próprias conversas"      on suporte_conversas for insert with check (user_id = auth.uid());
create policy "usuario atualiza próprias conversas"  on suporte_conversas for update using (user_id = auth.uid());
create policy "usuario exclui próprias conversas"    on suporte_conversas for delete using (user_id = auth.uid());
create policy "raccotlo acessa suporte_conversas"    on suporte_conversas for all
  using      (exists (select 1 from perfis where user_id = auth.uid() and role = 'raccotlo'))
  with check (exists (select 1 from perfis where user_id = auth.uid() and role = 'raccotlo'));

-- RLS suporte_mensagens
alter table suporte_mensagens enable row level security;
create policy "usuario vê mensagens da sua fazenda"     on suporte_mensagens for select
  using (fazenda_id in (select fazenda_id from perfis where user_id = auth.uid()));
create policy "usuario insere mensagens da sua fazenda" on suporte_mensagens for insert
  with check (fazenda_id in (select fazenda_id from perfis where user_id = auth.uid()));
create policy "usuario exclui mensagens da sua fazenda" on suporte_mensagens for delete
  using (fazenda_id in (select fazenda_id from perfis where user_id = auth.uid()));
create policy "raccotlo acessa suporte_mensagens"       on suporte_mensagens for all
  using      (exists (select 1 from perfis where user_id = auth.uid() and role = 'raccotlo'))
  with check (exists (select 1 from perfis where user_id = auth.uid() and role = 'raccotlo'));

-- ─── Migration 48 — Rateio por Centro de Custo (N ciclos) ────────────────────
-- Adiciona coluna centro_custo_id na tabela existente
ALTER TABLE regras_rateio
  ADD COLUMN IF NOT EXISTS centro_custo_id UUID REFERENCES centros_custo(id);

-- Tabela de linhas: N destinos por regra
CREATE TABLE IF NOT EXISTS regras_rateio_linhas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id    UUID NOT NULL REFERENCES regras_rateio(id) ON DELETE CASCADE,
  ciclo_id    UUID REFERENCES ciclos(id),
  percentual  NUMERIC(6,2) NOT NULL DEFAULT 0,
  descricao   TEXT,
  ordem       INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rateio_linhas_regra ON regras_rateio_linhas(regra_id);

-- ─── Migration 49 — Regras de Classificação Automática ───────────────────────
CREATE TABLE IF NOT EXISTS regras_classificacao (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id              UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  nome                    TEXT NOT NULL,
  -- critérios de match (AND entre os preenchidos)
  fornecedor_cnpj         TEXT,           -- CNPJ normalizado (só dígitos)
  fornecedor_nome_contem  TEXT,           -- substring case-insensitive
  ncm                     TEXT,           -- NCM começa com
  cfop                    TEXT,           -- CFOP começa com
  descricao_contem        TEXT,           -- descrição do item contém
  -- sugestões aplicadas
  operacao_gerencial_id   UUID REFERENCES operacoes_gerenciais(id),
  centro_custo_id         UUID REFERENCES centros_custo(id),
  -- meta
  prioridade              INT DEFAULT 10,
  ativo                   BOOLEAN DEFAULT TRUE,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_regras_class_fazenda ON regras_classificacao(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_regras_class_cnpj    ON regras_classificacao(fornecedor_cnpj) WHERE fornecedor_cnpj IS NOT NULL;

-- ─── Migration 50 — Pagamento em Lote (Borderô) ──────────────────────────────
CREATE TABLE IF NOT EXISTS pagamento_lotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id      UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('pagar','receber')),
  conta_bancaria  TEXT,
  data_pagamento  DATE NOT NULL,
  valor_total     NUMERIC(15,2) NOT NULL DEFAULT 0,
  descricao       TEXT,
  conciliado      BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pag_lotes_fazenda ON pagamento_lotes(fazenda_id, tipo);

CREATE TABLE IF NOT EXISTS pagamento_lote_itens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id        UUID NOT NULL REFERENCES pagamento_lotes(id) ON DELETE CASCADE,
  lancamento_id  UUID NOT NULL REFERENCES lancamentos(id),
  valor_pago     NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pag_lote_itens_lote ON pagamento_lote_itens(lote_id);

-- Vincula o lançamento ao lote após baixa em grupo
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS lote_id UUID REFERENCES pagamento_lotes(id);

-- ─── Migration 51 — Tesouraria: Mútuo entre empresas ─────────────────────────
CREATE TABLE IF NOT EXISTS mutuos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id          UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('concessao','captacao')),
  contraparte         TEXT NOT NULL,
  valor_principal     NUMERIC(15,2) NOT NULL DEFAULT 0,
  taxa_juros_mensal   NUMERIC(8,4)  NOT NULL DEFAULT 0,
  data_inicio         DATE NOT NULL,
  data_vencimento     DATE NOT NULL,
  saldo_devedor       NUMERIC(15,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','quitado','em_atraso')),
  observacao          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagamentos_mutuo (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mutuo_id            UUID NOT NULL REFERENCES mutuos(id) ON DELETE CASCADE,
  data_pagamento      DATE NOT NULL,
  valor_principal     NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_juros         NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_total         NUMERIC(15,2) NOT NULL DEFAULT 0,
  observacao          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mutuos_fazenda      ON mutuos(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_pag_mutuo_mutuo_id  ON pagamentos_mutuo(mutuo_id);

ALTER TABLE mutuos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_mutuo ENABLE ROW LEVEL SECURITY;

-- ─── Migration 52 — Tesouraria: Taxas Bancárias ───────────────────────────────
CREATE TABLE IF NOT EXISTS taxas_bancarias (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id          UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  conta_bancaria_id   UUID REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  conta_nome          TEXT,
  tipo                TEXT NOT NULL DEFAULT 'outro'
                        CHECK (tipo IN ('ted','doc','boleto','tarifa_manutencao','iof','imposto','outro')),
  descricao           TEXT NOT NULL,
  valor               NUMERIC(15,2) NOT NULL DEFAULT 0,
  data_lancamento     DATE NOT NULL,
  competencia         TEXT,   -- YYYY-MM
  observacao          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taxas_bancarias_fazenda ON taxas_bancarias(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_taxas_bancarias_data    ON taxas_bancarias(data_lancamento);

ALTER TABLE taxas_bancarias ENABLE ROW LEVEL SECURITY;

-- ─── Migration 53 — Controle de Seguros ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS apolices_seguro (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id              UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  numero_apolice          TEXT NOT NULL,
  seguradora              TEXT NOT NULL,
  ramo                    TEXT NOT NULL DEFAULT 'outro'
                            CHECK (ramo IN ('rural','vida','patrimonial','automovel','responsabilidade_civil','maquinas','outro')),
  objeto_segurado         TEXT NOT NULL DEFAULT '',
  importancia_segurada    NUMERIC(15,2) NOT NULL DEFAULT 0,
  premio_anual            NUMERIC(15,2) NOT NULL DEFAULT 0,
  forma_pagamento_premio  TEXT NOT NULL DEFAULT 'À vista',
  data_inicio_vigencia    DATE NOT NULL,
  data_fim_vigencia       DATE NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'vigente'
                            CHECK (status IN ('vigente','vencida','cancelada','em_renovacao')),
  corretora               TEXT,
  corretor_contato        TEXT,
  arquivo_url             TEXT,
  observacao              TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagamentos_premio_seguro (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apolice_id          UUID NOT NULL REFERENCES apolices_seguro(id) ON DELETE CASCADE,
  data_vencimento     DATE NOT NULL,
  data_pagamento      DATE,
  valor               NUMERIC(15,2) NOT NULL DEFAULT 0,
  pago                BOOLEAN NOT NULL DEFAULT FALSE,
  observacao          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sinistros_seguro (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apolice_id          UUID NOT NULL REFERENCES apolices_seguro(id) ON DELETE CASCADE,
  data_ocorrencia     DATE NOT NULL,
  data_comunicacao    DATE,
  descricao           TEXT NOT NULL,
  valor_reclamado     NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_indenizado    NUMERIC(15,2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'aberto'
                        CHECK (status IN ('aberto','em_analise','pago','negado')),
  numero_protocolo    TEXT,
  observacao          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apolices_seguro_fazenda   ON apolices_seguro(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_apolices_seguro_vigencia  ON apolices_seguro(data_fim_vigencia);
CREATE INDEX IF NOT EXISTS idx_pag_premio_apolice        ON pagamentos_premio_seguro(apolice_id);
CREATE INDEX IF NOT EXISTS idx_sinistros_apolice         ON sinistros_seguro(apolice_id);

ALTER TABLE apolices_seguro         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_premio_seguro ENABLE ROW LEVEL SECURITY;
ALTER TABLE sinistros_seguro        ENABLE ROW LEVEL SECURITY;

-- ─── Migration 54 — Controle de Consórcios ───────────────────────────────────
CREATE TABLE IF NOT EXISTS consorcios (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id              UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  administradora          TEXT NOT NULL,
  numero_cota             TEXT NOT NULL,
  grupo                   TEXT NOT NULL DEFAULT '',
  tipo_bem                TEXT NOT NULL DEFAULT 'outro'
                            CHECK (tipo_bem IN ('veiculo','imovel','maquina','caminhao','outro')),
  descricao_bem           TEXT NOT NULL DEFAULT '',
  valor_credito           NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_parcela_mensal    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_parcelas          INTEGER NOT NULL DEFAULT 0,
  parcelas_pagas          INTEGER NOT NULL DEFAULT 0,
  data_inicio             DATE NOT NULL,
  data_contemplacao       DATE,
  data_encerramento       DATE,
  status                  TEXT NOT NULL DEFAULT 'a_contemplar'
                            CHECK (status IN ('a_contemplar','contemplado','encerrado','cancelado')),
  financiamento_id        UUID,   -- FK para financiamentos quando migrado
  valor_lance             NUMERIC(15,2),
  bem_adquirido           TEXT,
  observacao              TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parcelas_consorcio (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consorcio_id        UUID NOT NULL REFERENCES consorcios(id) ON DELETE CASCADE,
  numero_parcela      INTEGER NOT NULL,
  data_vencimento     DATE NOT NULL,
  data_pagamento      DATE,
  valor               NUMERIC(15,2) NOT NULL DEFAULT 0,
  pago                BOOLEAN NOT NULL DEFAULT FALSE,
  tipo_parcela        TEXT NOT NULL DEFAULT 'mensalidade'
                        CHECK (tipo_parcela IN ('mensalidade','fundo_reserva','seguro','taxa_adm','lance')),
  observacao          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consorcios_fazenda     ON consorcios(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_consorcio_id  ON parcelas_consorcio(consorcio_id);
CREATE INDEX IF NOT EXISTS idx_parcelas_vencimento    ON parcelas_consorcio(data_vencimento);

ALTER TABLE consorcios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE parcelas_consorcio ENABLE ROW LEVEL SECURITY;

-- ─── Migration 55 — CT-e (Conhecimento de Transporte Eletrônico) ──────────────
CREATE TABLE IF NOT EXISTS ctes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id          UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  numero_cte          TEXT NOT NULL,
  serie               TEXT NOT NULL DEFAULT '1',
  chave_acesso        TEXT,
  data_emissao        DATE NOT NULL,
  cfop                TEXT NOT NULL DEFAULT '6353',
  natureza_operacao   TEXT NOT NULL DEFAULT 'Prestação de Serviço de Transporte',
  tomador_tipo        TEXT NOT NULL DEFAULT 'remetente'
                        CHECK (tomador_tipo IN ('remetente','destinatario','expedidor','recebedor')),
  remetente_id        UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  remetente_nome      TEXT NOT NULL DEFAULT '',
  remetente_cnpj      TEXT,
  destinatario_id     UUID REFERENCES pessoas(id) ON DELETE SET NULL,
  destinatario_nome   TEXT NOT NULL DEFAULT '',
  destinatario_cnpj   TEXT,
  municipio_origem    TEXT NOT NULL DEFAULT '',
  uf_origem           TEXT NOT NULL DEFAULT 'MT',
  municipio_destino   TEXT NOT NULL DEFAULT '',
  uf_destino          TEXT NOT NULL DEFAULT 'MT',
  produto_descricao   TEXT NOT NULL DEFAULT '',
  ncm                 TEXT,
  quantidade          NUMERIC(12,4) NOT NULL DEFAULT 0,
  unidade             TEXT NOT NULL DEFAULT 'TON',
  peso_bruto_kg       NUMERIC(12,2) NOT NULL DEFAULT 0,
  peso_liquido_kg     NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_mercadoria    NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_frete         NUMERIC(15,2) NOT NULL DEFAULT 0,
  base_calc_icms      NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliquota_icms       NUMERIC(5,2)  NOT NULL DEFAULT 12,
  valor_icms          NUMERIC(15,2) NOT NULL DEFAULT 0,
  veiculo_id          UUID REFERENCES veiculos(id) ON DELETE SET NULL,
  veiculo_placa       TEXT NOT NULL DEFAULT '',
  veiculo_tipo        TEXT,
  motorista_id        UUID REFERENCES motoristas(id) ON DELETE SET NULL,
  motorista_nome      TEXT NOT NULL DEFAULT '',
  motorista_cpf       TEXT,
  nfe_chave           TEXT,
  carregamento_id     UUID REFERENCES cargas_expedicao(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'rascunho'
                        CHECK (status IN ('rascunho','autorizado','cancelado')),
  observacao          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ctes_fazenda      ON ctes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_ctes_data         ON ctes(data_emissao);
CREATE INDEX IF NOT EXISTS idx_ctes_status       ON ctes(status);

ALTER TABLE ctes ENABLE ROW LEVEL SECURITY;

-- ─── Migration 56 — MDF-e (Manifesto de Documentos Fiscais Eletrônico) ────────
CREATE TABLE IF NOT EXISTS mdfes (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id              UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  numero_mdfe             TEXT NOT NULL,
  serie                   TEXT NOT NULL DEFAULT '1',
  chave_acesso            TEXT,
  data_emissao            DATE NOT NULL,
  uf_inicio               TEXT NOT NULL DEFAULT 'MT',
  municipio_inicio        TEXT NOT NULL DEFAULT '',
  uf_fim                  TEXT NOT NULL DEFAULT 'MT',
  percurso_ufs            TEXT[],            -- UFs intermediárias
  veiculo_id              UUID REFERENCES veiculos(id) ON DELETE SET NULL,
  veiculo_placa           TEXT NOT NULL DEFAULT '',
  veiculo_tipo            TEXT,
  motorista_id            UUID REFERENCES motoristas(id) ON DELETE SET NULL,
  motorista_nome          TEXT NOT NULL DEFAULT '',
  motorista_cpf           TEXT,
  documentos              JSONB NOT NULL DEFAULT '[]',   -- [{tipo, chave, numero, emitente}]
  peso_total_kg           NUMERIC(12,2),
  valor_total_carga       NUMERIC(15,2),
  status                  TEXT NOT NULL DEFAULT 'rascunho'
                            CHECK (status IN ('rascunho','autorizado','encerrado','cancelado')),
  data_encerramento       DATE,
  municipio_encerramento  TEXT,
  uf_encerramento         TEXT,
  observacao              TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mdfes_fazenda  ON mdfes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_mdfes_data     ON mdfes(data_emissao);
CREATE INDEX IF NOT EXISTS idx_mdfes_status   ON mdfes(status);

ALTER TABLE mdfes ENABLE ROW LEVEL SECURITY;


-- ─── Migration 57 — Vinculo de atividade em lançamentos e NF entradas ─────────
-- Permite classificar cada lançamento/NF como rural, PF, investimento ou não tributável
-- Necessário para LCDPR e SPED ECD

ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS vinculo_atividade  TEXT CHECK (vinculo_atividade IN ('rural','pessoa_fisica','investimento','nao_tributavel')),
  ADD COLUMN IF NOT EXISTS entidade_contabil  TEXT CHECK (entidade_contabil IN ('pf','pj'));

ALTER TABLE nf_entradas
  ADD COLUMN IF NOT EXISTS vinculo_atividade  TEXT CHECK (vinculo_atividade IN ('rural','pessoa_fisica','investimento','nao_tributavel')),
  ADD COLUMN IF NOT EXISTS entidade_contabil  TEXT CHECK (entidade_contabil IN ('pf','pj'));

CREATE INDEX IF NOT EXISTS idx_lancamentos_vinculo ON lancamentos(fazenda_id, vinculo_atividade);
CREATE INDEX IF NOT EXISTS idx_nf_entradas_vinculo ON nf_entradas(fazenda_id, vinculo_atividade);

-- ─── Migration 58 — Configuração Contábil (SPED ECD) ─────────────────────────
-- Uma linha por entidade (PF ou PJ) dentro da fazenda
-- Armazena dados do livro contábil, responsável técnico e termos

CREATE TABLE IF NOT EXISTS config_contabilidade (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id            UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  entidade              TEXT NOT NULL CHECK (entidade IN ('pf','pj')),
  tipo_escrituracao     TEXT NOT NULL DEFAULT 'G' CHECK (tipo_escrituracao IN ('G','R','B')),
  nome_empresarial      TEXT NOT NULL DEFAULT '',
  cnpj                  TEXT,
  cpf                   TEXT,
  uf                    TEXT,
  cod_municipio_ibge    TEXT,
  nome_municipio        TEXT,
  ie                    TEXT,
  nire                  TEXT,
  nr_livro              TEXT,
  nome_livro            TEXT,
  nr_tipo_livro         TEXT DEFAULT '1' CHECK (nr_tipo_livro IN ('1','2','3')),
  ind_sit_ini           TEXT DEFAULT '0' CHECK (ind_sit_ini IN ('0','1','2','3','4')),
  resp_nome             TEXT,
  resp_cpf              TEXT,
  resp_crc              TEXT,
  resp_email            TEXT,
  termo_abertura        TEXT,
  termo_encerramento    TEXT,
  ativo                 BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fazenda_id, entidade)
);

CREATE INDEX IF NOT EXISTS idx_config_contab_fazenda ON config_contabilidade(fazenda_id);
ALTER TABLE config_contabilidade ENABLE ROW LEVEL SECURITY;


-- ─── Migration 59 — Previsão em lançamentos ───────────────────────────────────
-- Campo "natureza" distingue lançamentos reais de previsões de planejamento.
-- Previsões podem ser confirmadas (→ real) ou excluídas sem afetar o DRE/LCDPR.

ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS natureza TEXT NOT NULL DEFAULT 'real'
    CHECK (natureza IN ('real','previsao'));

CREATE INDEX IF NOT EXISTS idx_lancamentos_natureza ON lancamentos(fazenda_id, natureza);

bs

-- ============================================================
-- Migration 61 — Log do Sistema + permissoes granulares nos grupos
-- ============================================================

-- Tabela de log de auditoria
CREATE TABLE IF NOT EXISTS logs_sistema (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id    UUID        NOT NULL REFERENCES fazendas(id),
  usuario_id    UUID,
  usuario_nome  TEXT,
  usuario_email TEXT,
  acao          TEXT        NOT NULL
    CHECK (acao IN ('insert','update','delete','login','logout','export','view')),
  modulo        TEXT        NOT NULL,
  entidade      TEXT,
  entidade_id   UUID,
  descricao     TEXT        NOT NULL,
  dados_antes   JSONB,
  dados_depois  JSONB,
  ip            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_fazenda_created ON logs_sistema(fazenda_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_acao            ON logs_sistema(acao);
CREATE INDEX IF NOT EXISTS idx_logs_modulo          ON logs_sistema(modulo);

ALTER TABLE logs_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY logs_leitura ON logs_sistema
  FOR SELECT USING (
    fazenda_id IN (SELECT fazenda_id FROM perfis WHERE id = auth.uid())
  );

CREATE POLICY logs_insercao ON logs_sistema
  FOR INSERT WITH CHECK (
    fazenda_id IN (SELECT fazenda_id FROM perfis WHERE id = auth.uid())
  );

-- Migrar permissoes em grupos_usuarios de texto simples para JSONB granular
-- (coluna permissoes já é JSONB — apenas garante compatibilidade)
ALTER TABLE grupos_usuarios
  ALTER COLUMN permissoes SET DEFAULT '{}';



-- ────────────────────────────────────────────────────────────
-- SEÇÃO 60 — BACKUP & RESTAURAÇÃO
-- ────────────────────────────────────────────────────────────

-- Tabela de log de backups e restaurações
CREATE TABLE IF NOT EXISTS backup_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id     UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  arquivo        TEXT NOT NULL,
  total_registros INTEGER NOT NULL DEFAULT 0,
  tamanho_bytes  INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL CHECK (status IN ('sucesso','restaurado','erro')),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_fazenda ON backup_logs(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_backup_logs_criado  ON backup_logs(criado_em DESC);

ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;

-- Somente o próprio usuário/raccotlo pode ver os logs de backup
CREATE POLICY backup_logs_leitura ON backup_logs
  FOR SELECT USING (
    fazenda_id IN (SELECT fazenda_id FROM perfis WHERE id = auth.uid())
  );

-- Apenas service role (backend) pode inserir — via RLS bypass no service key
-- (o INSERT vem sempre do servidor com service role, sem passar por RLS)

-- Bucket de backups: criar manualmente no Supabase Storage
-- Nome: backups  |  Tipo: Private  |  Sem política pública
-- O acesso é feito via signed URLs geradas pelo backend com service role key.


-- ============================================================
-- Migration 63 — Rastreabilidade de lançamentos (origem_lancamento + pedido_compra_id)
-- ============================================================

ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS origem_lancamento TEXT
    CHECK (origem_lancamento IN ('nf_entrada','nf_saida','pedido_compra','arrendamento','tesouraria','plantio','contrato_financeiro','manual')),
  ADD COLUMN IF NOT EXISTS pedido_compra_id  UUID REFERENCES pedidos_compra(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lancamentos_origem ON lancamentos(fazenda_id, origem_lancamento);
CREATE INDEX IF NOT EXISTS idx_lancamentos_pedido ON lancamentos(pedido_compra_id);

-- ============================================================
-- Migration 64 — Operações de Tesouraria (cadastro de tipos)
-- ============================================================

CREATE TABLE IF NOT EXISTS operacoes_tesouraria (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id   UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  nome         TEXT NOT NULL,
  tipo         TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ambos','transferencia','ajuste')),
  categoria    TEXT,
  observacao   TEXT,
  ativo        BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE operacoes_tesouraria ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operacoes_tesouraria' AND policyname='allow_all_operacoes_tesouraria') THEN
    CREATE POLICY "allow_all_operacoes_tesouraria" ON operacoes_tesouraria FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_op_tesouraria_fazenda ON operacoes_tesouraria(fazenda_id);

-- ────────────────────────────────────────────────────────────
-- Migration: tornar empresa_id opcional em contas_bancarias
-- Execute no Supabase SQL Editor
-- ────────────────────────────────────────────────────────────
ALTER TABLE contas_bancarias ALTER COLUMN empresa_id DROP NOT NULL;

-- ────────────────────────────────────────────────────────────
-- Tributação por NCM (NF-e)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ncm_tributacoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id            UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,

  ncm                   VARCHAR(8)    NOT NULL,
  descricao             TEXT          NOT NULL,

  -- ICMS
  icms_cst_interno      VARCHAR(3)    NOT NULL DEFAULT '051', -- CST operações internas (ex: diferido)
  icms_cst_externo      VARCHAR(3)    NOT NULL DEFAULT '020', -- CST operações interestaduais (ex: base reduzida)
  icms_aliq             NUMERIC(5,2)  NOT NULL DEFAULT 0,     -- alíquota nominal %
  icms_base_reduzida_pct NUMERIC(5,2) NOT NULL DEFAULT 100,  -- % da base (61,11 para soja/milho — Conv. 100/97)

  -- PIS
  pis_cst               VARCHAR(2)    NOT NULL DEFAULT '06',
  pis_aliq              NUMERIC(5,2)  NOT NULL DEFAULT 0,

  -- COFINS
  cofins_cst            VARCHAR(2)    NOT NULL DEFAULT '06',
  cofins_aliq           NUMERIC(5,2)  NOT NULL DEFAULT 0,

  -- CFOPs (NULL = usa o do emitente)
  cfop_dentro           VARCHAR(4),
  cfop_fora             VARCHAR(4),

  -- IBS/CBS — Reforma Tributária (LC 214/2025)
  -- Alíquotas padrão; ibs_cbs_reducao_pct = 60 para produtos agropecuários
  ibs_estadual_aliq     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ibs_municipal_aliq    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  cbs_aliq              NUMERIC(5,2)  NOT NULL DEFAULT 0,
  ibs_cbs_reducao_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0,     -- 60 para agro, 100 para exportação/cesta básica

  -- Texto legal específico para este NCM (sobrescreve o padrão do emitente)
  inf_cpl               TEXT,

  created_at            TIMESTAMPTZ   DEFAULT now(),
  updated_at            TIMESTAMPTZ   DEFAULT now(),

  UNIQUE(fazenda_id, ncm)
);

ALTER TABLE ncm_tributacoes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='ncm_tributacoes' AND policyname='allow_all_ncm_tributacoes') THEN
    CREATE POLICY "allow_all_ncm_tributacoes" ON ncm_tributacoes FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ncm_trib_fazenda ON ncm_tributacoes(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_ncm_trib_ncm     ON ncm_tributacoes(fazenda_id, ncm);

-- ────────────────────────────────────────────────────────────
-- Operações Fiscais (CFOP + perfil tributário por tipo de saída)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operacoes_fiscais (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id            UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,

  nome                  TEXT NOT NULL,
  descricao             TEXT,

  -- CFOPs — mesmo estado / outro estado ou exterior
  cfop_interno          VARCHAR(4) NOT NULL,
  cfop_externo          VARCHAR(4) NOT NULL,

  -- ICMS
  icms_cst_interno      VARCHAR(3) NOT NULL DEFAULT '051',  -- interno: diferido
  icms_cst_externo      VARCHAR(3) NOT NULL DEFAULT '020',  -- interestadual: base reduzida
  icms_aliq             NUMERIC(5,2) NOT NULL DEFAULT 0,
  icms_base_reduzida_pct NUMERIC(5,2) NOT NULL DEFAULT 100, -- 61,11% para soja/milho interestadual

  -- PIS / COFINS
  pis_cst               VARCHAR(2) NOT NULL DEFAULT '06',
  pis_aliq              NUMERIC(5,2) NOT NULL DEFAULT 0,
  cofins_cst            VARCHAR(2) NOT NULL DEFAULT '06',
  cofins_aliq           NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- IBS/CBS — Reforma Tributária (LC 214/2025)
  -- ibs_cbs_imune = true para exportações (imunidade constitucional Art. 149-B CF)
  ibs_cbs_imune         BOOLEAN NOT NULL DEFAULT FALSE,
  ibs_cbs_reducao_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,    -- 60% para produção rural

  -- Template de texto complementar (infCpl)
  -- Variáveis suportadas: [CONTRATO], [RE_NUMERO], [DUE_NUMERO], [CONHECIMENTO]
  inf_cpl_template      TEXT,

  ativa                 BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE operacoes_fiscais ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='operacoes_fiscais' AND policyname='allow_all_operacoes_fiscais') THEN
    CREATE POLICY "allow_all_operacoes_fiscais" ON operacoes_fiscais FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_op_fiscais_fazenda ON operacoes_fiscais(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_op_fiscais_cfop    ON operacoes_fiscais(fazenda_id, cfop_interno);

-- ────────────────────────────────────────────────────────────
-- Notas Fiscais (NF-e emitidas)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notas_fiscais (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id          UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  numero              TEXT NOT NULL,
  serie               TEXT NOT NULL DEFAULT '1',
  tipo                TEXT NOT NULL CHECK (tipo IN ('saida','entrada')),
  cfop                TEXT NOT NULL,
  natureza            TEXT NOT NULL,
  destinatario        TEXT NOT NULL,
  cnpj_destinatario   TEXT,
  valor_total         NUMERIC(14,2) NOT NULL DEFAULT 0,
  data_emissao        DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'em_digitacao'
                        CHECK (status IN ('autorizada','cancelada','rejeitada','denegada','em_digitacao')),
  chave_acesso        TEXT,
  xml_url             TEXT,
  danfe_url           TEXT,
  observacao          TEXT,
  auto                BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='notas_fiscais'
    AND policyname='allow_all_notas_fiscais'
  ) THEN
    CREATE POLICY "allow_all_notas_fiscais"
    ON notas_fiscais FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nf_fazenda       ON notas_fiscais(fazenda_id);
CREATE INDEX IF NOT EXISTS idx_nf_data_emissao  ON notas_fiscais(fazenda_id, data_emissao);
CREATE INDEX IF NOT EXISTS idx_nf_status        ON notas_fiscais(fazenda_id, status);

-- ═══════════════════════════════════════════════════════════════
-- Migration: Classificação e Saldo Inicial em Contas Bancárias
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE contas_bancarias
  ADD COLUMN IF NOT EXISTS tipo_conta   TEXT NOT NULL DEFAULT 'corrente'
    CHECK (tipo_conta IN ('corrente','investimento','caixa','transitoria')),
  ADD COLUMN IF NOT EXISTS saldo_inicial NUMERIC(15,2) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════
-- Migration: Isolamento de Fazendas por Usuário v4 (DEFINITIVO)
-- Corrige farms criadas por raccotlo admin com owner errado.
-- Raccotlo admin tem bypass total (é admin do sistema).
-- ═══════════════════════════════════════════════════════════════

-- 1. Adiciona coluna owner_user_id (se não existir)
ALTER TABLE fazendas
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id);

-- 2. Backfill principal: usa o user_id do cliente (role='client') vinculado via perfis
--    Sobrescreve qualquer owner_user_id incorreto (ex: id do raccotlo admin)
UPDATE fazendas f
SET owner_user_id = p.user_id
FROM perfis p
WHERE p.fazenda_id = f.id
  AND (p.role = 'client' OR p.role IS NULL OR p.role = '');

-- 3. Backfill secundário: farms sem entrada em perfis mantêm owner_user_id existente
--    (farms novas do API sem perfis ainda — deixa NULL, API vai corrigir no próximo cadastro)

-- 4. Garante que RLS está ATIVO
ALTER TABLE fazendas ENABLE ROW LEVEL SECURITY;

-- 5. Remove TODAS as políticas existentes (por nome E pelo loop — cobertura total)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'fazendas' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON fazendas';
  END LOOP;
END $$;

-- 6. Cria políticas:
--    - Clientes veem apenas suas fazendas (owner_user_id = auth.uid())
--    - Raccotlo admin vê todas as fazendas (bypass total — é admin do sistema)
CREATE POLICY "fazendas_select"
  ON fazendas FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

CREATE POLICY "fazendas_insert"
  ON fazendas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "fazendas_update"
  ON fazendas FOR UPDATE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

CREATE POLICY "fazendas_delete"
  ON fazendas FOR DELETE
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

-- 7. Verificação — execute e confira:
--    Cada fazenda deve ter owner_user_id = user_id do cliente que a possui
SELECT f.nome, f.owner_user_id, p.user_id as perfis_user_id, p.role
FROM fazendas f
LEFT JOIN perfis p ON p.fazenda_id = f.id
ORDER BY f.nome;

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- MIGRATION v5 — Arquitetura Conta (tenant multi-fazenda)
-- Execute INTEIRO de uma vez no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Criar tabela contas (raiz do tenant SaaS)
CREATE TABLE IF NOT EXISTS contas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  tipo       text NOT NULL DEFAULT 'pf' CHECK (tipo IN ('pf', 'pj', 'grupo')),
  created_at timestamptz DEFAULT now()
);

-- 2. Adicionar conta_id nas tabelas principais (nullable primeiro para o backfill)
ALTER TABLE fazendas   ADD COLUMN IF NOT EXISTS conta_id uuid REFERENCES contas(id);
ALTER TABLE produtores ADD COLUMN IF NOT EXISTS conta_id uuid REFERENCES contas(id);
ALTER TABLE perfis     ADD COLUMN IF NOT EXISTS conta_id uuid REFERENCES contas(id);

-- 3. Backfill — criar uma conta por owner_user_id distinto nas fazendas
DO $$
DECLARE
  rec           RECORD;
  nova_conta_id uuid;
  nome_conta    text;
BEGIN
  FOR rec IN
    SELECT DISTINCT owner_user_id
    FROM fazendas
    WHERE owner_user_id IS NOT NULL
  LOOP
    -- Usar o nome do perfil do usuário como nome da conta
    SELECT COALESCE(p.nome, 'Conta ' || LEFT(rec.owner_user_id::text, 8))
    INTO   nome_conta
    FROM   perfis p
    WHERE  p.user_id = rec.owner_user_id
    LIMIT  1;

    IF nome_conta IS NULL THEN
      nome_conta := 'Conta ' || LEFT(rec.owner_user_id::text, 8);
    END IF;

    INSERT INTO contas (nome, tipo) VALUES (nome_conta, 'pf')
    RETURNING id INTO nova_conta_id;

    -- Vincular fazendas
    UPDATE fazendas   SET conta_id = nova_conta_id WHERE owner_user_id = rec.owner_user_id;
    -- Vincular perfis do usuário
    UPDATE perfis     SET conta_id = nova_conta_id WHERE user_id = rec.owner_user_id;
    -- Vincular produtores via fazendas
    UPDATE produtores SET conta_id = nova_conta_id
    WHERE fazenda_id IN (SELECT id FROM fazendas WHERE conta_id = nova_conta_id);
  END LOOP;
END $$;

-- 4. Atualizar RLS das fazendas — usar conta_id
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'fazendas' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON fazendas';
  END LOOP;
END $$;

CREATE POLICY "fazendas_select" ON fazendas FOR SELECT
  USING (
    conta_id IN (
      SELECT conta_id FROM perfis
      WHERE user_id = auth.uid() AND conta_id IS NOT NULL
    )
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

CREATE POLICY "fazendas_insert" ON fazendas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "fazendas_update" ON fazendas FOR UPDATE
  USING (
    conta_id IN (
      SELECT conta_id FROM perfis
      WHERE user_id = auth.uid() AND conta_id IS NOT NULL
    )
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

CREATE POLICY "fazendas_delete" ON fazendas FOR DELETE
  USING (
    conta_id IN (
      SELECT conta_id FROM perfis
      WHERE user_id = auth.uid() AND conta_id IS NOT NULL
    )
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

-- 5. RLS para produtores (nova proteção)
ALTER TABLE produtores ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'produtores' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON produtores';
  END LOOP;
END $$;

CREATE POLICY "produtores_select" ON produtores FOR SELECT
  USING (
    conta_id IN (
      SELECT conta_id FROM perfis
      WHERE user_id = auth.uid() AND conta_id IS NOT NULL
    )
    OR conta_id IS NULL
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

CREATE POLICY "produtores_insert" ON produtores FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "produtores_update" ON produtores FOR UPDATE
  USING (
    conta_id IN (
      SELECT conta_id FROM perfis
      WHERE user_id = auth.uid() AND conta_id IS NOT NULL
    )
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

CREATE POLICY "produtores_delete" ON produtores FOR DELETE
  USING (
    conta_id IN (
      SELECT conta_id FROM perfis
      WHERE user_id = auth.uid() AND conta_id IS NOT NULL
    )
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

-- 6. Verificação pós-migration
SELECT c.nome AS conta, f.nome AS fazenda, f.owner_user_id, f.conta_id
FROM contas c
JOIN fazendas f ON f.conta_id = c.id
ORDER BY c.nome, f.nome;

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- MIGRATION v6 — Onboarding guiado
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE contas
  ADD COLUMN IF NOT EXISTS onboarding_ativo boolean NOT NULL DEFAULT true;

-- Clientes existentes: manter onboarding desligado (já foram implantados)
UPDATE contas SET onboarding_ativo = false WHERE onboarding_ativo = true;

-- Para ativar onboarding em um cliente específico:
-- UPDATE contas SET onboarding_ativo = true WHERE id = '<id>';

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- MIGRATION v7 — Adicionar auth_user_id em usuarios
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_user_id uuid;

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- MIGRATION v8 — Rateio Global Inter-Fazendas
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- Regra de rateio global: aplica-se a todas as fazendas de uma conta.
-- Exemplo: colheitadeira compartilhada → 60% Fazenda A, 40% Fazenda B;
--          dentro de cada fazenda, o custo é dividido entre os ciclos.

create table if not exists regras_rateio_global (
  id               uuid primary key default gen_random_uuid(),
  conta_id         uuid not null references contas(id) on delete cascade,
  ano_safra_label  text not null,          -- "2025/2026" — label do ano (não FK)
  centro_custo_id  uuid references centros_custo(id),
  nome             text not null,
  descricao        text,
  ativo            boolean default true,
  created_at       timestamptz default now()
);

-- Nível 1: distribuição percentual entre fazendas
create table if not exists rateio_global_fazendas (
  id               uuid primary key default gen_random_uuid(),
  regra_global_id  uuid not null references regras_rateio_global(id) on delete cascade,
  fazenda_id       uuid not null references fazendas(id) on delete cascade,
  percentual       numeric(8,4) not null check (percentual >= 0 and percentual <= 100),
  ordem            integer default 0,
  created_at       timestamptz default now()
);

-- Nível 2: distribuição percentual entre ciclos dentro de cada fazenda
create table if not exists rateio_global_ciclos (
  id                  uuid primary key default gen_random_uuid(),
  rateio_fazenda_id   uuid not null references rateio_global_fazendas(id) on delete cascade,
  ciclo_id            uuid not null references ciclos(id) on delete cascade,
  percentual          numeric(8,4) not null check (percentual >= 0 and percentual <= 100),
  descricao           text,
  ordem               integer default 0,
  created_at          timestamptz default now()
);

alter table regras_rateio_global    enable row level security;
alter table rateio_global_fazendas  enable row level security;
alter table rateio_global_ciclos    enable row level security;

drop policy if exists "allow_all_rateio_global"         on regras_rateio_global;
drop policy if exists "allow_all_rateio_global_faz"     on rateio_global_fazendas;
drop policy if exists "allow_all_rateio_global_ciclos"  on rateio_global_ciclos;

create policy "allow_all_rateio_global"
  on regras_rateio_global for all using (true) with check (true);
create policy "allow_all_rateio_global_faz"
  on rateio_global_fazendas for all using (true) with check (true);
create policy "allow_all_rateio_global_ciclos"
  on rateio_global_ciclos for all using (true) with check (true);

create index if not exists idx_rateio_global_conta     on regras_rateio_global(conta_id);
create index if not exists idx_rateio_gfaz_regra       on rateio_global_fazendas(regra_global_id);
create index if not exists idx_rateio_gciclo_fazlinha  on rateio_global_ciclos(rateio_fazenda_id);

NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK: Reverter refatoração Conta (se necessário)
-- Execute SOMENTE se precisar voltar ao modelo com owner_user_id
-- ═══════════════════════════════════════════════════════════════
/*
-- Remover contas
ALTER TABLE perfis    DROP COLUMN IF EXISTS conta_id;
ALTER TABLE perfis    DROP COLUMN IF EXISTS fazenda_ativa_id;
ALTER TABLE fazendas  DROP COLUMN IF EXISTS conta_id;
ALTER TABLE produtores DROP COLUMN IF EXISTS conta_id;
DROP TABLE IF EXISTS contas CASCADE;

-- Reativar RLS com owner_user_id
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'fazendas' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON fazendas';
  END LOOP;
END $$;

CREATE POLICY "fazendas_select" ON fazendas FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );
CREATE POLICY "fazendas_insert" ON fazendas FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "fazendas_update" ON fazendas FOR UPDATE
  USING (owner_user_id = auth.uid() OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo'));
CREATE POLICY "fazendas_delete" ON fazendas FOR DELETE
  USING (owner_user_id = auth.uid() OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo'));

NOTIFY pgrst, 'reload schema';
*/

-- ============================================================
-- SEÇÃO WhatsApp IA — Sessões conversacionais
-- Execute no Supabase SQL Editor
-- ============================================================

-- 1. Campo whatsapp no perfil (vincular número ao usuário)
ALTER TABLE perfis ADD COLUMN IF NOT EXISTS whatsapp text;
CREATE UNIQUE INDEX IF NOT EXISTS perfis_whatsapp_idx ON perfis (whatsapp) WHERE whatsapp IS NOT NULL;

-- 2. Campo origem em lancamentos (rastrear o que veio do WhatsApp)
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS origem text;

-- 3. Campo origem em movimentacoes_estoque
ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS origem text;

-- 4. Campo origem em romaneios
ALTER TABLE romaneios ADD COLUMN IF NOT EXISTS origem text;

-- 5. Tabela de sessões conversacionais do WhatsApp
CREATE TABLE IF NOT EXISTS sessoes_whatsapp (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone        text NOT NULL UNIQUE,
  usuario_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  fazenda_id      uuid REFERENCES fazendas(id) ON DELETE CASCADE,
  fazenda_nome    text DEFAULT '',
  fluxo           text,
  etapa           text,
  dados           jsonb DEFAULT '{}',
  aguardando_foto boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Expirar sessões antigas automaticamente (limpeza via updated_at)
CREATE INDEX IF NOT EXISTS sessoes_whatsapp_telefone_idx ON sessoes_whatsapp (telefone);
CREATE INDEX IF NOT EXISTS sessoes_whatsapp_updated_idx ON sessoes_whatsapp (updated_at);

-- RLS — somente service role acessa (webhook usa service role key)
ALTER TABLE sessoes_whatsapp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sessoes_whatsapp_service_only" ON sessoes_whatsapp
  USING (true) WITH CHECK (true);

-- 6. Histórico de mensagens WhatsApp (auditoria)
CREATE TABLE IF NOT EXISTS historico_whatsapp (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone    text NOT NULL,
  fazenda_id  uuid REFERENCES fazendas(id) ON DELETE SET NULL,
  direcao     text CHECK (direcao IN ('entrada', 'saida')),
  tipo        text,   -- text | audio | image
  conteudo    text,
  intencao    text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historico_whatsapp_telefone_idx ON historico_whatsapp (telefone);
ALTER TABLE historico_whatsapp ENABLE ROW LEVEL SECURITY;
CREATE POLICY "historico_whatsapp_service_only" ON historico_whatsapp
  USING (true) WITH CHECK (true);

-- ============================================================
-- SEÇÃO Pendências Fiscais
-- Execute no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS pendencias_fiscais (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id       uuid NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  lancamento_id    uuid REFERENCES lancamentos(id) ON DELETE SET NULL,
  movimentacao_id  uuid REFERENCES movimentacoes_estoque(id) ON DELETE SET NULL,
  tipo             text NOT NULL DEFAULT 'outro' CHECK (tipo IN ('abastecimento','entrada_estoque','operacao_lavoura','saida_estoque','lancamento_cp','outro')),
  status           text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando','recebida','dispensada')),
  descricao        text NOT NULL,
  valor            numeric(14,2),
  data_operacao    date NOT NULL DEFAULT CURRENT_DATE,
  fornecedor_nome  text,
  chave_acesso     text,
  xml_storage_path text,
  origem           text DEFAULT 'manual' CHECK (origem IN ('manual','whatsapp','sistema')),
  observacoes      text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pendencias_fiscais_fazenda_idx ON pendencias_fiscais (fazenda_id, status);
ALTER TABLE pendencias_fiscais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pendencias_fiscais_fazenda" ON pendencias_fiscais
  USING (fazenda_id IN (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo'));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- SEÇÃO Abastecimentos de Máquinas
-- Execute no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS abastecimentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id       uuid NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  bomba_id         uuid NOT NULL REFERENCES bombas_combustivel(id) ON DELETE RESTRICT,
  maquina_id       uuid REFERENCES maquinas(id) ON DELETE SET NULL,
  funcionario_id   uuid REFERENCES funcionarios(id) ON DELETE SET NULL,
  destino_livre    text,
  quantidade_l     numeric(10,2) NOT NULL CHECK (quantidade_l > 0),
  valor_unitario   numeric(14,4) NOT NULL CHECK (valor_unitario >= 0),
  valor_total      numeric(14,2) NOT NULL CHECK (valor_total >= 0),
  horimetro        numeric(12,1),
  data             date NOT NULL DEFAULT CURRENT_DATE,
  observacao       text,
  lancamento_id    uuid REFERENCES lancamentos(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abastecimentos_fazenda_data_idx ON abastecimentos (fazenda_id, data DESC);
CREATE INDEX IF NOT EXISTS abastecimentos_bomba_idx        ON abastecimentos (bomba_id);
CREATE INDEX IF NOT EXISTS abastecimentos_maquina_idx      ON abastecimentos (maquina_id);

ALTER TABLE abastecimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abastecimentos_fazenda" ON abastecimentos
  USING (fazenda_id IN (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo'));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- SEÇÃO Horímetro/Odômetro em Máquinas
-- Execute no Supabase SQL Editor
-- ============================================================
ALTER TABLE maquinas ADD COLUMN IF NOT EXISTS horimetro_atual numeric(12,1);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- SEÇÃO Monitoramento de Pragas & Doenças
-- Execute no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS monitoramento_pragas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id          uuid NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  talhao_id           uuid REFERENCES talhoes(id) ON DELETE SET NULL,
  ciclo_id            uuid REFERENCES ciclos(id) ON DELETE SET NULL,
  data                date NOT NULL DEFAULT CURRENT_DATE,
  tipo                text NOT NULL CHECK (tipo IN ('praga','doenca','planta_daninha')),
  nome                text NOT NULL,
  nivel               integer NOT NULL CHECK (nivel BETWEEN 1 AND 4),
  percentual_plantas  numeric(5,2),
  estagio             text,
  acao_recomendada    text,
  observacoes         text,
  usuario_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monitoramento_pragas_fazenda_idx ON monitoramento_pragas (fazenda_id, data DESC);
CREATE INDEX IF NOT EXISTS monitoramento_pragas_talhao_idx  ON monitoramento_pragas (talhao_id);
CREATE INDEX IF NOT EXISTS monitoramento_pragas_ciclo_idx   ON monitoramento_pragas (ciclo_id);
CREATE INDEX IF NOT EXISTS monitoramento_pragas_nivel_idx   ON monitoramento_pragas (nivel);

ALTER TABLE monitoramento_pragas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitoramento_pragas_fazenda" ON monitoramento_pragas
  USING (fazenda_id IN (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo'));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Migration: Seed Anos Safra padrão (2025/2026 → 2031/2032)
-- Aplica em todas as fazendas existentes que ainda não têm
-- nenhum registro em anos_safra.
-- ============================================================
DO $$
DECLARE
  faz_id uuid;
BEGIN
  FOR faz_id IN SELECT id FROM fazendas LOOP
    IF NOT EXISTS (SELECT 1 FROM anos_safra WHERE fazenda_id = faz_id) THEN
      INSERT INTO anos_safra (fazenda_id, descricao, data_inicio, data_fim) VALUES
        (faz_id, '2025/2026', '2025-10-01', '2026-09-30'),
        (faz_id, '2026/2027', '2026-10-01', '2027-09-30'),
        (faz_id, '2027/2028', '2027-10-01', '2028-09-30'),
        (faz_id, '2028/2029', '2028-10-01', '2029-09-30'),
        (faz_id, '2029/2030', '2029-10-01', '2030-09-30'),
        (faz_id, '2030/2031', '2030-10-01', '2031-09-30'),
        (faz_id, '2031/2032', '2031-10-01', '2032-09-30');
    END IF;
  END LOOP;
END $$;

-- WhatsApp: campo whatsapp na tabela usuarios (vincula número ao usuário local)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS whatsapp text;
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_whatsapp_idx ON usuarios (whatsapp) WHERE whatsapp IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- MÓDULO DE INTEGRAÇÕES — Catálogo central + config por fazenda
-- ────────────────────────────────────────────────────────────

-- Catálogo global (gerenciado pela Raccotlo, sem fazenda_id)
CREATE TABLE IF NOT EXISTS integracoes_catalogo (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria        text NOT NULL,   -- 'balanca' | 'comunicacao' | 'mercado' | 'bancario'
  nome             text NOT NULL,
  fabricante       text,
  descricao        text,
  icone            text DEFAULT '🔌',
  config_schema    jsonb,
  config_padrao    jsonb DEFAULT '{}',
  requer_hardware  boolean DEFAULT false,
  requer_api_key   boolean DEFAULT false,
  ativo            boolean DEFAULT true,
  ordem            integer DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

-- Integrações habilitadas por fazenda
CREATE TABLE IF NOT EXISTS integracoes_fazenda (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id     uuid REFERENCES fazendas(id) ON DELETE CASCADE,
  integracao_id  uuid REFERENCES integracoes_catalogo(id),
  config         jsonb DEFAULT '{}',
  ativo          boolean DEFAULT false,
  testado_em     timestamptz,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(fazenda_id, integracao_id)
);

-- RLS
ALTER TABLE integracoes_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE integracoes_fazenda  ENABLE ROW LEVEL SECURITY;

-- Catálogo: todos podem ler
CREATE POLICY "integracoes_catalogo_read" ON integracoes_catalogo
  FOR SELECT USING (true);

-- Config por fazenda: acesso ao próprio tenant
CREATE POLICY "integracoes_fazenda_tenant" ON integracoes_fazenda
  FOR ALL USING (
    fazenda_id IN (
      SELECT fazenda_id FROM perfis WHERE user_id = auth.uid()
      UNION
      SELECT id FROM fazendas WHERE EXISTS (
        SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo'
      )
    )
  );

-- ── Seed: balanças pré-configuradas ─────────────────────────

INSERT INTO integracoes_catalogo (categoria, nome, fabricante, descricao, icone, config_padrao, requer_hardware, requer_api_key, ordem)
VALUES

('balanca', 'Toledo Prix / ICS', 'Mettler-Toledo',
 'Balança Toledo via RS-232. Envia peso continuamente sem necessidade de comando. Protocolo padrão 9600-8N1.',
 '⚖️',
 '{"baudRate":9600,"dataBits":8,"stopBits":1,"parity":"none","commandToSend":"","responseRegex":"([+-]?\\d+\\.?\\d*)\\s*[kK][gG]","weightUnit":"kg"}',
 true, false, 1),

('balanca', 'Filizola MK-III / PDV', 'Filizola',
 'Balança Filizola via RS-232. Protocolo contínuo 9600-8N1. Compatível com série MK e PDV.',
 '⚖️',
 '{"baudRate":9600,"dataBits":8,"stopBits":1,"parity":"none","commandToSend":"","responseRegex":"([+-]?\\d+\\.?\\d*)\\s*[kK][gG]","weightUnit":"kg"}',
 true, false, 2),

('balanca', 'Urano UR-E / POP', 'Urano',
 'Balança Urano via RS-232. Envia peso ao receber comando "P". Protocolo 9600-8N1.',
 '⚖️',
 '{"baudRate":9600,"dataBits":8,"stopBits":1,"parity":"none","commandToSend":"P","responseRegex":"([+-]?\\d+\\.?\\d*)\\s*[kK][gG]","weightUnit":"kg"}',
 true, false, 3),

('balanca', 'Digilog IW / DL', 'Digilog',
 'Balança Digilog via RS-232. Protocolo contínuo 9600-8N1.',
 '⚖️',
 '{"baudRate":9600,"dataBits":8,"stopBits":1,"parity":"none","commandToSend":"","responseRegex":"([+-]?\\d+\\.?\\d*)\\s*[kK][gG]","weightUnit":"kg"}',
 true, false, 4),

('balanca', 'Micheletti LD / BW', 'Micheletti',
 'Balança Micheletti via RS-232. Protocolo contínuo 4800-8N1.',
 '⚖️',
 '{"baudRate":4800,"dataBits":8,"stopBits":1,"parity":"none","commandToSend":"","responseRegex":"([+-]?\\d+\\.?\\d*)\\s*[kK][gG]","weightUnit":"kg"}',
 true, false, 5),

('balanca', 'Genérica RS-232', NULL,
 'Configuração manual para qualquer balança com saída serial RS-232. Ajuste o protocolo conforme o manual do equipamento.',
 '⚖️',
 '{"baudRate":9600,"dataBits":8,"stopBits":1,"parity":"none","commandToSend":"","responseRegex":"([+-]?\\d+\\.?\\d*)\\s*[kK][gG]","weightUnit":"kg"}',
 true, false, 6),

('comunicacao', 'WhatsApp (Evolution API)', 'Evolution API',
 'Bot de WhatsApp via Evolution API. Responde consultas de saldo, estoque, lavoura e registra operações por voz ou texto.',
 '💬',
 '{"server_url":"","instance":"arato","api_key":""}',
 false, true, 10),

('comunicacao', 'E-mail Transacional (Resend)', 'Resend',
 'Envio de e-mails: alertas de vencimento, relatório semanal e boas-vindas para novos usuários.',
 '📧',
 '{"api_key":"","from_address":"noreply@arato.agr.br"}',
 false, true, 11),

('mercado', 'Cotações de Commodities', 'Arato',
 'Atualização automática às 7h: soja, milho e algodão (B3 + CBOT), câmbio USD/BRL. Sem configuração necessária.',
 '📈',
 '{}',
 false, false, 20),

('bancario', 'Importação OFX', 'Todos os bancos',
 'Importa extrato bancário no formato OFX (BB, Itaú, Bradesco, Sicoob, Sicredi, Caixa). Conciliação automática com CP/CR.',
 '🏦',
 '{}',
 false, false, 30);


-- ────────────────────────────────────────────────────────────
-- MÓDULO DE RECOMENDAÇÕES AGRONÔMICAS
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recomendacoes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id             uuid REFERENCES fazendas(id) ON DELETE CASCADE NOT NULL,
  ciclo_id               uuid REFERENCES ciclos(id),
  tipo                   text NOT NULL CHECK (tipo IN ('pulverizacao','adubacao','plantio','correcao_solo','tratamento_sementes','colheita')),
  status                 text DEFAULT 'pendente' CHECK (status IN ('pendente','em_execucao','concluida','cancelada')),

  -- Identificação
  codigo                 text,
  agronomo_nome          text,
  agronomo_crea          text,

  -- Timing
  data_recomendacao      date NOT NULL DEFAULT CURRENT_DATE,
  data_prevista_inicio   date,
  data_prevista_fim      date,

  -- Área e remonte
  remonte_pct            numeric DEFAULT 0,
  area_total_recomendada_ha numeric,

  -- Condições de aplicação (pulverização)
  vazao_lha              numeric,
  cap_tanque_l           numeric,
  bico                   text,
  pressao_min            numeric,
  pressao_max            numeric,
  ph_min                 numeric,
  ph_max                 numeric,
  velocidade_min         numeric,
  velocidade_max         numeric,
  vento_max              numeric,
  umidade_min            numeric,
  umidade_max            numeric,
  temperatura_min        numeric,
  temperatura_max        numeric,

  -- Observações
  observacoes            text,

  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recomendacao_talhoes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recomendacao_id       uuid REFERENCES recomendacoes(id) ON DELETE CASCADE,
  talhao_id             uuid REFERENCES talhoes(id),
  talhao_nome           text NOT NULL,
  area_recomendada_ha   numeric NOT NULL,
  area_executada_ha     numeric,
  concluido             boolean DEFAULT false,
  ordem                 integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recomendacao_produtos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recomendacao_id  uuid REFERENCES recomendacoes(id) ON DELETE CASCADE,
  insumo_id        uuid REFERENCES insumos(id),
  produto_nome     text NOT NULL,
  dose_ha          numeric NOT NULL,
  unidade          text NOT NULL DEFAULT 'L/ha',
  quantidade_total numeric,
  ordem            integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recomendacao_execucoes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recomendacao_id  uuid REFERENCES recomendacoes(id) ON DELETE CASCADE,
  operador_nome    text,
  data_inicio      timestamptz DEFAULT now(),
  data_fim         timestamptz,
  observacoes      text,
  origem           text DEFAULT 'web',   -- 'web' | 'offline'
  sincronizado_em  timestamptz,
  created_at       timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE recomendacoes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recomendacao_talhoes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE recomendacao_produtos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recomendacao_execucoes   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rec_tenant"     ON recomendacoes          FOR ALL USING (fazenda_id IN (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid()) OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo'));
CREATE POLICY "rec_tal_tenant" ON recomendacao_talhoes   FOR ALL USING (recomendacao_id IN (SELECT id FROM recomendacoes WHERE fazenda_id IN (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())));
CREATE POLICY "rec_prod_tenant"ON recomendacao_produtos  FOR ALL USING (recomendacao_id IN (SELECT id FROM recomendacoes WHERE fazenda_id IN (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())));
CREATE POLICY "rec_exec_tenant"ON recomendacao_execucoes FOR ALL USING (recomendacao_id IN (SELECT id FROM recomendacoes WHERE fazenda_id IN (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())));

-- Novo perfil agronomo/operador ao enum role (se usar check constraint)
-- ALTER TABLE perfis DROP CONSTRAINT IF EXISTS perfis_role_check;
-- ALTER TABLE perfis ADD CONSTRAINT perfis_role_check CHECK (role IN ('raccotlo','client','agronomo','operador','admin'));

-- ============================================================
-- Seção 70 — Máquinas e Veículos: chassi + campos de seguro
-- ============================================================
ALTER TABLE maquinas
  ADD COLUMN IF NOT EXISTS chassi                    text,
  ADD COLUMN IF NOT EXISTS seguro_seguradora         text,
  ADD COLUMN IF NOT EXISTS seguro_corretora          text,
  ADD COLUMN IF NOT EXISTS seguro_numero_apolice     text,
  ADD COLUMN IF NOT EXISTS seguro_data_contratacao   date,
  ADD COLUMN IF NOT EXISTS seguro_vencimento_apolice date,
  ADD COLUMN IF NOT EXISTS seguro_premio             numeric(12,2);

-- Adiciona 'carro' ao tipo (se houver check constraint)
-- Se não houver constraint, apenas o código TypeScript controla
ALTER TABLE maquinas DROP CONSTRAINT IF EXISTS maquinas_tipo_check;
ALTER TABLE maquinas ADD CONSTRAINT maquinas_tipo_check
  CHECK (tipo IN ('trator','colheitadeira','pulverizador','plantadeira','caminhao','carro','implemento','outro'));

-- ============================================================
-- Seção 71 — Garantir coluna auto em lancamentos e movimentacoes_estoque
-- Execute no Supabase SQL Editor se os inserts do bot estiverem falhando
-- ============================================================
ALTER TABLE lancamentos           ADD COLUMN IF NOT EXISTS auto boolean DEFAULT false;
ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS auto boolean DEFAULT false;
ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS valor_unitario numeric(14,4);

-- Seção 71 complemento — coluna origem (rastrear registros do WhatsApp)
ALTER TABLE lancamentos           ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS origem text;

-- ============================================================
-- Seção 72 — Colunas do bot WhatsApp em lancamentos + sessoes_whatsapp
-- Execute no Supabase SQL Editor (necessário para o bot funcionar)
-- ============================================================

-- Colunas de baixa e conta bancária nos lançamentos
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS conta_bancaria  uuid REFERENCES contas_bancarias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_baixa      date,
  ADD COLUMN IF NOT EXISTS valor_pago      numeric(15,2),
  ADD COLUMN IF NOT EXISTS pessoa_id       uuid REFERENCES pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS safra_id        uuid;

-- Tabela de sessões conversacionais do WhatsApp (histórico de contexto)
CREATE TABLE IF NOT EXISTS sessoes_whatsapp (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone        text NOT NULL UNIQUE,
  usuario_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  fazenda_id      uuid REFERENCES fazendas(id) ON DELETE CASCADE,
  fazenda_nome    text DEFAULT '',
  fluxo           text,
  etapa           text,
  dados           jsonb DEFAULT '{}',
  aguardando_foto boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessoes_whatsapp_telefone_idx ON sessoes_whatsapp (telefone);
CREATE INDEX IF NOT EXISTS sessoes_whatsapp_updated_idx  ON sessoes_whatsapp (updated_at);

ALTER TABLE sessoes_whatsapp ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sessoes_whatsapp' AND policyname = 'sessoes_whatsapp_service_only'
  ) THEN
    CREATE POLICY "sessoes_whatsapp_service_only" ON sessoes_whatsapp USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- SEÇÃO 73 — Bomba Combustível: flag consume_estoque
-- ============================================================

-- Flag que indica se a bomba controla estoque interno da fazenda.
-- FALSE = posto externo / despesa direta (não debita estoque, mas registra no histórico).
ALTER TABLE bombas_combustivel
  ADD COLUMN IF NOT EXISTS consume_estoque boolean DEFAULT true;

-- Criar uma bomba virtual "Posto" para cada fazenda que ainda não tiver
-- (opcional — o usuário pode criar manualmente no cadastro)
-- INSERT INTO bombas_combustivel (fazenda_id, nome, tipo, consume_estoque)
-- SELECT id, 'Posto', 'diesel_s10', false FROM fazendas
-- WHERE id NOT IN (SELECT DISTINCT fazenda_id FROM bombas_combustivel WHERE consume_estoque = false);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- SEÇÃO 74 — Abastecimentos: bomba_id opcional + pendencias origem
-- ============================================================

-- bomba_id pode ser NULL quando o abastecimento é em posto externo
-- sem bomba cadastrada (registrado pelo bot sem bomba_nome)
ALTER TABLE abastecimentos
  ALTER COLUMN bomba_id DROP NOT NULL;

-- Alarga constraint de origem para incluir 'whatsapp' (bot)
ALTER TABLE pendencias_fiscais
  DROP CONSTRAINT IF EXISTS pendencias_fiscais_origem_check;
ALTER TABLE pendencias_fiscais
  ADD CONSTRAINT pendencias_fiscais_origem_check
  CHECK (origem IN ('manual','whatsapp','sistema'));

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- SEÇÃO 75 — lancamentos.nf_entrada_id — vínculo fiscal real
-- ============================================================
-- Permite vincular um lançamento CP/CR a uma NF de entrada real
-- para conformidade com LCDPR e SPED ECD.
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS nf_entrada_id UUID REFERENCES nf_entradas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lancamentos_nf_entrada ON lancamentos(nf_entrada_id);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- SEÇÃO 76 — lancamentos.ciclo_id — vínculo com ciclo agrícola
-- ============================================================
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS ciclo_id UUID REFERENCES ciclos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lancamentos_ciclo ON lancamentos(ciclo_id);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- SEÇÃO 77 — pendencias_operacionais — registros do bot com dados incompletos
-- ============================================================
-- Criada quando o bot não encontra insumo, talhão ou outro dado necessário.
-- Ao resolver, o sistema reprocessa: estoque, custo, lancamento CP.
CREATE TABLE IF NOT EXISTS pendencias_operacionais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id UUID NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL DEFAULT 'operacao_lavoura',
  subtipo VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'resolvida', 'cancelada')),
  motivo VARCHAR(200),
  descricao TEXT,
  dados_originais JSONB NOT NULL DEFAULT '{}',
  operacao_id UUID,
  produto_nome_pendente VARCHAR(200),
  talhao_nome_pendente VARCHAR(200),
  origem VARCHAR(50) DEFAULT 'whatsapp',
  criado_em TIMESTAMPTZ DEFAULT NOW(),
  resolvido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pendencias_op_fazenda_status
  ON pendencias_operacionais(fazenda_id, status);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- SEÇÃO 78 — Cessão de Contratos de Grãos
-- ============================================================
-- Permite que um contrato de venda seja dado em cessão a um fornecedor,
-- quitando débitos (CP) que o produtor tem com esse fornecedor.

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS dado_em_cessao        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cessao_fornecedor_id  uuid REFERENCES pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cessao_fornecedor_nome text,
  ADD COLUMN IF NOT EXISTS cessao_data           date,
  ADD COLUMN IF NOT EXISTS cessao_obs            text;

CREATE TABLE IF NOT EXISTS contrato_cessao_debitos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id   UUID NOT NULL REFERENCES contratos(id)   ON DELETE CASCADE,
  fazenda_id    UUID NOT NULL REFERENCES fazendas(id)    ON DELETE CASCADE,
  lancamento_id UUID NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
  valor_cessao  NUMERIC(16,2) NOT NULL DEFAULT 0,
  obs           TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cessao_contrato   ON contrato_cessao_debitos(contrato_id);
CREATE INDEX IF NOT EXISTS idx_cessao_lancamento ON contrato_cessao_debitos(lancamento_id);
CREATE INDEX IF NOT EXISTS idx_contratos_cessao  ON contratos(fazenda_id, dado_em_cessao) WHERE dado_em_cessao = true;

-- ────────────────────────────────────────────────────────────
-- 79. COLUNAS FALTANTES EM contratos (batch completo)
-- Muitas colunas foram adicionadas no código mas nunca nas migrations.
-- Este ALTER cobre todas de uma vez com ADD COLUMN IF NOT EXISTS.
-- ────────────────────────────────────────────────────────────
ALTER TABLE contratos
  -- campos básicos possivelmente ausentes
  ADD COLUMN IF NOT EXISTS tipo            text DEFAULT 'venda',
  ADD COLUMN IF NOT EXISTS numero          text,
  ADD COLUMN IF NOT EXISTS data_contrato   date,
  ADD COLUMN IF NOT EXISTS modalidade      text DEFAULT 'fixo',
  ADD COLUMN IF NOT EXISTS moeda           text DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS frete           text,
  -- campos financeiros
  ADD COLUMN IF NOT EXISTS data_pagamento  date,
  ADD COLUMN IF NOT EXISTS lancamento_cr_id uuid REFERENCES lancamentos(id) ON DELETE SET NULL,
  -- campos da reescrita da sessão 10 (alguns podem já existir via migration anterior)
  ADD COLUMN IF NOT EXISTS num_lancamento        integer,
  ADD COLUMN IF NOT EXISTS safra                 text,
  ADD COLUMN IF NOT EXISTS autorizacao           text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS confirmado            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS a_fixar               boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS venda_a_ordem         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS produtor_id           uuid REFERENCES produtores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS produtor_nome         text,
  ADD COLUMN IF NOT EXISTS pessoa_id             uuid REFERENCES pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nr_contrato_cliente   text,
  ADD COLUMN IF NOT EXISTS contato_broker        text,
  ADD COLUMN IF NOT EXISTS grupo_vendedor        text,
  ADD COLUMN IF NOT EXISTS vendedor              text,
  ADD COLUMN IF NOT EXISTS saldo_tipo            text DEFAULT 'peso_saida',
  ADD COLUMN IF NOT EXISTS valor_frete           numeric(14,4),
  ADD COLUMN IF NOT EXISTS natureza_operacao     text,
  ADD COLUMN IF NOT EXISTS cfop                  text,
  ADD COLUMN IF NOT EXISTS deposito_carregamento text,
  ADD COLUMN IF NOT EXISTS deposito_fiscal       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS propriedade           text,
  ADD COLUMN IF NOT EXISTS empreendimento        text,
  ADD COLUMN IF NOT EXISTS seguradora            text,
  ADD COLUMN IF NOT EXISTS corretora             text,
  ADD COLUMN IF NOT EXISTS cte_numero            text,
  ADD COLUMN IF NOT EXISTS terceiro              text,
  ADD COLUMN IF NOT EXISTS observacao_interna    text,
  ADD COLUMN IF NOT EXISTS ano_safra_id          uuid REFERENCES anos_safra(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ciclo_id              uuid REFERENCES ciclos(id) ON DELETE SET NULL,
  -- cessão
  ADD COLUMN IF NOT EXISTS dado_em_cessao        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cessao_fornecedor_id  uuid REFERENCES pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cessao_fornecedor_nome text,
  ADD COLUMN IF NOT EXISTS cessao_data           date,
  ADD COLUMN IF NOT EXISTS cessao_obs            text,
  -- arrendamento
  ADD COLUMN IF NOT EXISTS is_arrendamento       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS arrendamento_id       uuid REFERENCES arrendamentos(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
