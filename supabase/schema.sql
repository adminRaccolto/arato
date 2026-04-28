-- ============================================================
-- RacTech — Schema PostgreSQL (Supabase)
-- Execute no painel Supabase: SQL Editor → New query → Run
-- ============================================================

-- Extensão para UUID
create extension if not exists "pgcrypto";

-- ============================================================
-- FAZENDAS
-- ============================================================
create table fazendas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  cnpj          text,
  car           text,
  nirf          text,
  itr           text,
  municipio     text not null,
  estado        char(2) not null default 'MT',
  area_total_ha numeric(10,2) not null default 0,
  created_at    timestamptz default now()
);

-- ============================================================
-- TALHÕES
-- ============================================================
create table talhoes (
  id          uuid primary key default gen_random_uuid(),
  fazenda_id  uuid not null references fazendas(id) on delete cascade,
  nome        text not null,
  area_ha     numeric(10,2) not null,
  tipo_solo   text,
  lat         numeric(10,7),
  lng         numeric(10,7),
  created_at  timestamptz default now()
);

-- ============================================================
-- SAFRAS
-- ============================================================
create table safras (
  id                    uuid primary key default gen_random_uuid(),
  fazenda_id            uuid not null references fazendas(id) on delete cascade,
  cultura               text not null,
  ano_agricola          text not null,
  status                text not null default 'planejada'
                        check (status in ('planejada','em_andamento','colhida','cancelada')),
  area_ha               numeric(10,2) not null,
  data_plantio          date,
  data_colheita         date,
  produtividade_sc_ha   numeric(8,2),
  created_at            timestamptz default now()
);

-- ============================================================
-- OPERAÇÕES DE LAVOURA
-- ============================================================
create table operacoes (
  id          uuid primary key default gen_random_uuid(),
  safra_id    uuid not null references safras(id) on delete cascade,
  talhao_id   uuid references talhoes(id),
  nome        text not null,
  tipo        text not null,
  data_prev   date,
  data_real   date,
  status      text not null default 'pendente'
              check (status in ('pendente','em_andamento','concluida','cancelada')),
  custo_ha    numeric(10,2),
  auto        boolean default false,
  created_at  timestamptz default now()
);

-- ============================================================
-- INSUMOS (ESTOQUE)
-- ============================================================
create table insumos (
  id              uuid primary key default gen_random_uuid(),
  fazenda_id      uuid not null references fazendas(id) on delete cascade,
  nome            text not null,
  categoria       text not null
                  check (categoria in ('semente','fertilizante','defensivo','inoculante','outros')),
  unidade         text not null
                  check (unidade in ('kg','L','sc','ton','unid')),
  fabricante      text,
  estoque         numeric(12,3) not null default 0,
  estoque_minimo  numeric(12,3) not null default 0,
  valor_unitario  numeric(12,4) not null default 0,
  lote            text,
  validade        date,
  created_at      timestamptz default now()
);

-- ============================================================
-- MOVIMENTAÇÕES DE ESTOQUE
-- ============================================================
create table movimentacoes_estoque (
  id          uuid primary key default gen_random_uuid(),
  insumo_id   uuid not null references insumos(id) on delete cascade,
  fazenda_id  uuid not null references fazendas(id),
  tipo        text not null check (tipo in ('entrada','saida')),
  quantidade  numeric(12,3) not null,
  data        date not null,
  talhao      text,
  safra       text,
  operacao    text,
  nf_entrada  text,
  observacao  text,
  auto        boolean default false,
  created_at  timestamptz default now()
);

-- Trigger: atualiza estoque automaticamente
create or replace function atualizar_estoque()
returns trigger as $$
begin
  if NEW.tipo = 'entrada' then
    update insumos set estoque = estoque + NEW.quantidade where id = NEW.insumo_id;
  elsif NEW.tipo = 'saida' then
    update insumos set estoque = estoque - NEW.quantidade where id = NEW.insumo_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_atualizar_estoque
after insert on movimentacoes_estoque
for each row execute function atualizar_estoque();

-- ============================================================
-- LANÇAMENTOS FINANCEIROS (CP/CR)
-- ============================================================
create table lancamentos (
  id                 uuid primary key default gen_random_uuid(),
  fazenda_id         uuid not null references fazendas(id) on delete cascade,
  tipo               text not null check (tipo in ('receber','pagar')),
  moeda              text not null default 'BRL' check (moeda in ('BRL','USD','barter')),
  descricao          text not null,
  categoria          text not null,
  data_lancamento    date not null,
  data_vencimento    date not null,
  data_baixa         date,
  valor              numeric(14,2) not null,
  valor_pago         numeric(14,2),
  status             text not null default 'em_aberto'
                     check (status in ('em_aberto','vencido','vencendo','baixado')),
  auto               boolean default false,
  cotacao_usd        numeric(8,4),
  sacas              numeric(12,2),
  cultura_barter     text,
  preco_saca_barter  numeric(10,2),
  nfe_numero         text,
  conta_bancaria     text,
  observacao         text,
  created_at         timestamptz default now()
);

-- ============================================================
-- CONTRATOS DE VENDA DE GRÃOS
-- ============================================================
create table contratos (
  id              uuid primary key default gen_random_uuid(),
  fazenda_id      uuid not null references fazendas(id) on delete cascade,
  numero          text not null,
  comprador       text not null,
  produto         text not null,
  safra           text not null,
  modalidade      text not null default 'fixo'
                  check (modalidade in ('fixo','a_fixar','barter')),
  moeda           text not null default 'BRL' check (moeda in ('BRL','USD')),
  preco           numeric(12,4) not null,
  quantidade_sc   numeric(12,2) not null,
  entregue_sc     numeric(12,2) not null default 0,
  data_contrato   date not null,
  data_entrega    date not null,
  status          text not null default 'aberto'
                  check (status in ('aberto','parcial','encerrado','cancelado')),
  observacao      text,
  created_at      timestamptz default now()
);

-- ============================================================
-- ROMANEIOS (PESAGEM DE CAMINHÃO)
-- ============================================================
create table romaneios (
  id               uuid primary key default gen_random_uuid(),
  contrato_id      uuid not null references contratos(id) on delete cascade,
  fazenda_id       uuid not null references fazendas(id),
  numero           text not null,
  placa            text not null,
  peso_bruto_kg    numeric(10,2) not null,
  tara_kg          numeric(10,2) not null,
  peso_liquido_kg  numeric(10,2) generated always as (peso_bruto_kg - tara_kg) stored,
  sacas            numeric(10,2) generated always as (floor((peso_bruto_kg - tara_kg) / 60)) stored,
  data             date not null,
  nfe_numero       text,
  nfe_status       text default 'gerando'
                   check (nfe_status in ('gerando','autorizada','cancelada','rejeitada')),
  nfe_chave        text,
  created_at       timestamptz default now()
);

-- Trigger: atualiza entregue_sc no contrato após romaneio
create or replace function atualizar_contrato_romaneio()
returns trigger as $$
begin
  update contratos
  set
    entregue_sc = (select coalesce(sum(sacas),0) from romaneios where contrato_id = NEW.contrato_id),
    status = case
      when (select coalesce(sum(sacas),0) from romaneios where contrato_id = NEW.contrato_id) >= quantidade_sc then 'encerrado'
      when (select coalesce(sum(sacas),0) from romaneios where contrato_id = NEW.contrato_id) > 0             then 'parcial'
      else 'aberto'
    end
  where id = NEW.contrato_id;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_atualizar_contrato
after insert on romaneios
for each row execute function atualizar_contrato_romaneio();

-- ============================================================
-- NOTAS FISCAIS
-- ============================================================
create table notas_fiscais (
  id                   uuid primary key default gen_random_uuid(),
  fazenda_id           uuid not null references fazendas(id) on delete cascade,
  romaneio_id          uuid references romaneios(id),
  numero               text not null,
  serie                text not null default '1',
  tipo                 text not null check (tipo in ('saida','entrada')),
  cfop                 text not null,
  natureza             text not null,
  destinatario         text not null,
  cnpj_destinatario    text,
  valor_total          numeric(14,2) not null,
  data_emissao         date not null,
  status               text not null default 'em_digitacao'
                       check (status in ('autorizada','cancelada','rejeitada','denegada','em_digitacao')),
  chave_acesso         text,
  xml_url              text,
  danfe_url            text,
  auto                 boolean default false,
  created_at           timestamptz default now()
);

-- ============================================================
-- CONFIGURAÇÕES DA EMPRESA
-- ============================================================
create table configuracoes (
  id                  uuid primary key default gen_random_uuid(),
  fazenda_id          uuid not null references fazendas(id) on delete cascade,
  email_principal     text,
  email_relatorios    text,
  cert_a1_validade    date,
  cert_a1_storage_key text,  -- path no Supabase Storage
  automacoes          jsonb default '{}',
  created_at          timestamptz default now(),
  unique (fazenda_id)
);

-- ============================================================
-- RLS (Row Level Security) — cada fazenda vê só seus dados
-- ============================================================
alter table fazendas               enable row level security;
alter table talhoes                enable row level security;
alter table safras                 enable row level security;
alter table operacoes              enable row level security;
alter table insumos                enable row level security;
alter table movimentacoes_estoque  enable row level security;
alter table lancamentos            enable row level security;
alter table contratos              enable row level security;
alter table romaneios              enable row level security;
alter table notas_fiscais          enable row level security;
alter table configuracoes          enable row level security;

-- Políticas permissivas (ajustar com auth quando implementar login)
-- Por ora: acesso total (dev/staging)
create policy "acesso_total" on fazendas              for all using (true);
create policy "acesso_total" on talhoes               for all using (true);
create policy "acesso_total" on safras                for all using (true);
create policy "acesso_total" on operacoes             for all using (true);
create policy "acesso_total" on insumos               for all using (true);
create policy "acesso_total" on movimentacoes_estoque for all using (true);
create policy "acesso_total" on lancamentos           for all using (true);
create policy "acesso_total" on contratos             for all using (true);
create policy "acesso_total" on romaneios             for all using (true);
create policy "acesso_total" on notas_fiscais         for all using (true);
create policy "acesso_total" on configuracoes         for all using (true);

-- ============================================================
-- DADOS INICIAIS — Fazenda demo
-- ============================================================
insert into fazendas (id, nome, cnpj, car, nirf, municipio, estado, area_total_ha) values
  ('00000000-0000-0000-0000-000000000001',
   'Fazenda Santa Fé',
   '12.345.678/0001-99',
   'MT-5108402-3B82F4A15C2E4D7891234567890ABCDE',
   '7.654.321-0',
   'Nova Mutum', 'MT', 4820);

insert into configuracoes (fazenda_id, email_principal, email_relatorios, cert_a1_validade) values
  ('00000000-0000-0000-0000-000000000001',
   'contato@fazendasantafe.com.br',
   'carlos@fazendasantafe.com.br',
   '2026-04-21');
