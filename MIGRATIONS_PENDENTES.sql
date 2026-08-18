-- =============================================================================
-- MIGRATIONS PENDENTES — RacTech
-- =============================================================================
-- Execute ESTE arquivo no Supabase SQL Editor para atualizar o schema.
-- É 100% seguro rodar múltiplas vezes: usa ADD COLUMN IF NOT EXISTS,
-- CREATE TABLE IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, etc.
--
-- QUANDO RODAR: sempre que uma nova versão do sistema adicionar colunas novas.
-- COMO RODAR: Supabase → SQL Editor → cole o conteúdo → Run (F5)
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 1: Remove check constraints rígidos (unidade / categoria)
-- Evita erros do tipo "violates check constraint" ao usar valores novos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE insumos               DROP CONSTRAINT IF EXISTS insumos_unidade_check;
ALTER TABLE insumos               DROP CONSTRAINT IF EXISTS insumos_categoria_check;
ALTER TABLE nf_entrada_itens      DROP CONSTRAINT IF EXISTS nf_entrada_itens_unidade_check;
ALTER TABLE movimentacoes_estoque DROP CONSTRAINT IF EXISTS movimentacoes_estoque_unidade_check;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 2: Tabela bancos (Seção 120)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bancos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_compe VARCHAR(3)  NOT NULL UNIQUE,
  nome         TEXT        NOT NULL,
  nome_curto   VARCHAR(30) NOT NULL,
  cnpj         VARCHAR(14) NOT NULL,
  ispb         VARCHAR(8),
  ativo        BOOLEAN     NOT NULL DEFAULT true
);
INSERT INTO bancos (codigo_compe, nome, nome_curto, cnpj, ispb) VALUES
  ('001','Banco do Brasil S.A.','BB','00000000000191','00000000'),
  ('033','Banco Santander (Brasil) S.A.','Santander','90400888000142','90400888'),
  ('041','Banco do Estado do Rio Grande do Sul S.A.','Banrisul','92702067000196','92702067'),
  ('077','Banco Inter S.A.','Inter','00416968000101','00416968'),
  ('104','Caixa Econômica Federal','CEF','00360305000104','00360305'),
  ('208','Banco BTG Pactual S.A.','BTG Pactual','30306294000145','30306294'),
  ('237','Banco Bradesco S.A.','Bradesco','60746948000112','60746948'),
  ('260','Nu Pagamentos S.A.','Nubank','18236120000158','18236120'),
  ('336','Banco C6 S.A.','C6 Bank','31872495000172','31872495'),
  ('341','Itaú Unibanco S.A.','Itaú','60701190000104','60701190'),
  ('422','Banco Safra S.A.','Safra','58160789000128','58160789'),
  ('748','Banco Cooperativo Sicredi S.A.','Sicredi','01181521000155','01181521'),
  ('756','Banco Cooperativo do Brasil S.A.','Sicoob','02038232000164','02038232')
ON CONFLICT (codigo_compe) DO NOTHING;

ALTER TABLE contas_bancarias
  ADD COLUMN IF NOT EXISTS banco_id   UUID REFERENCES bancos(id),
  ADD COLUMN IF NOT EXISTS agencia_dv VARCHAR(1),
  ADD COLUMN IF NOT EXISTS conta_dv   VARCHAR(1);

ALTER TABLE bancos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='bancos' AND policyname='bancos_select_public') THEN
    CREATE POLICY "bancos_select_public" ON bancos FOR SELECT USING (true);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 3: Monitoramento Pragas — campos adicionais (Seção 122)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE monitoramento_pragas
  ADD COLUMN IF NOT EXISTS gps_lat          numeric(10,7),
  ADD COLUMN IF NOT EXISTS gps_lng          numeric(11,7),
  ADD COLUMN IF NOT EXISTS gps_accuracy_m   numeric(8,2),
  ADD COLUMN IF NOT EXISTS foto_url         text,
  ADD COLUMN IF NOT EXISTS foto_url_2       text,
  ADD COLUMN IF NOT EXISTS foto_url_3       text,
  ADD COLUMN IF NOT EXISTS recomendacao_id  uuid REFERENCES recomendacoes(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitoramento_pragas' AND column_name='data_monitoramento') THEN
    ALTER TABLE monitoramento_pragas ADD COLUMN data_monitoramento date;
    UPDATE monitoramento_pragas SET data_monitoramento = data WHERE data_monitoramento IS NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='monitoramento_pragas' AND column_name='estagio_cultura') THEN
    ALTER TABLE monitoramento_pragas ADD COLUMN estagio_cultura text;
    UPDATE monitoramento_pragas SET estagio_cultura = estagio WHERE estagio_cultura IS NULL;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 4: Leituras Pluviométricas (Seção 123)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leituras_pluviometricas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id   uuid NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  talhao_id    uuid REFERENCES talhoes(id) ON DELETE SET NULL,
  data         date NOT NULL DEFAULT CURRENT_DATE,
  hora         time,
  chuva_mm     numeric(8,2) NOT NULL CHECK (chuva_mm >= 0),
  duracao_min  integer,
  intensidade  text,
  fonte        text NOT NULL DEFAULT 'manual',
  ponto_nome   text,
  operador     text,
  observacao   text,
  usuario_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leituras_pluv_fazenda ON leituras_pluviometricas (fazenda_id, data DESC);
CREATE INDEX IF NOT EXISTS idx_leituras_pluv_talhao  ON leituras_pluviometricas (talhao_id);
ALTER TABLE leituras_pluviometricas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='leituras_pluviometricas' AND policyname='leituras_pluv_fazenda') THEN
    CREATE POLICY "leituras_pluv_fazenda" ON leituras_pluviometricas FOR ALL
      USING (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'))
      WITH CHECK (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'));
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 5: Múltiplos CARs por Fazenda (Seção 124)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fazenda_cars (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id         uuid NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  numero             text NOT NULL,
  estado             text NOT NULL DEFAULT '',
  municipio          text,
  area_ha            numeric(14,4),
  area_preservada_ha numeric(14,4),
  status             text NOT NULL DEFAULT 'ativo',
  data_inscricao     date,
  data_aprovacao     date,
  vencimento         date,
  observacao         text,
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fazenda_cars_fazenda ON fazenda_cars (fazenda_id);
ALTER TABLE fazenda_cars ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fazenda_cars' AND policyname='fazenda_cars_tenant') THEN
    CREATE POLICY "fazenda_cars_tenant" ON fazenda_cars FOR ALL
      USING (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'))
      WITH CHECK (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS car_matriculas (
  car_id        uuid NOT NULL REFERENCES fazenda_cars(id) ON DELETE CASCADE,
  matricula_id  uuid NOT NULL REFERENCES matriculas_imoveis(id) ON DELETE CASCADE,
  PRIMARY KEY (car_id, matricula_id)
);
ALTER TABLE car_matriculas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='car_matriculas' AND policyname='car_matriculas_tenant') THEN
    CREATE POLICY "car_matriculas_tenant" ON car_matriculas FOR ALL
      USING (car_id IN (SELECT c.id FROM fazenda_cars c JOIN fazendas f ON f.id=c.fazenda_id JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'))
      WITH CHECK (car_id IN (SELECT c.id FROM fazenda_cars c JOIN fazendas f ON f.id=c.fazenda_id JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'));
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 6: NF Entradas — impostos adicionais (Seção 125)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE nf_entradas
  ADD COLUMN IF NOT EXISTS valor_produtos   numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_ipi        numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_st         numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_fcp_st     numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_difal      numeric(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_desconto   numeric(15,2) DEFAULT 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 7: Lançamentos — Talhão + Mão de Obra (Seção 126) ← FIX DO ERRO ATUAL
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS talhao_id           uuid REFERENCES talhoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS funcionario_id      uuid REFERENCES funcionarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_mao_obra       text,
  ADD COLUMN IF NOT EXISTS unidade_mao_obra    text,
  ADD COLUMN IF NOT EXISTS quantidade_mao_obra numeric(12,4);
CREATE INDEX IF NOT EXISTS idx_lancamentos_talhao_id   ON lancamentos(talhao_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_funcionario  ON lancamentos(funcionario_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 8: NIRF / ITR / CCIR por Fazenda (Seção 127)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fazenda_nirfs (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id  uuid NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  numero      text NOT NULL,
  situacao    text NOT NULL DEFAULT 'ativo',
  area_ha     numeric(14,4),
  observacao  text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fazenda_nirfs_fazenda ON fazenda_nirfs(fazenda_id);
ALTER TABLE fazenda_nirfs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fazenda_nirfs' AND policyname='fazenda_nirfs_tenant') THEN
    CREATE POLICY "fazenda_nirfs_tenant" ON fazenda_nirfs FOR ALL
      USING (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'))
      WITH CHECK (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS nirf_matriculas (
  nirf_id      uuid NOT NULL REFERENCES fazenda_nirfs(id) ON DELETE CASCADE,
  matricula_id text NOT NULL,
  PRIMARY KEY (nirf_id, matricula_id)
);
ALTER TABLE nirf_matriculas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='nirf_matriculas' AND policyname='nirf_matriculas_tenant') THEN
    CREATE POLICY "nirf_matriculas_tenant" ON nirf_matriculas FOR ALL
      USING (nirf_id IN (SELECT n.id FROM fazenda_nirfs n JOIN fazendas f ON f.id=n.fazenda_id JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'))
      WITH CHECK (nirf_id IN (SELECT n.id FROM fazenda_nirfs n JOIN fazendas f ON f.id=n.fazenda_id JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS fazenda_itrs (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id         uuid NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  exercicio          text NOT NULL,
  numero_declaracao  text,
  nirf_numero        text,
  vencimento         date,
  area_tributavel_ha numeric(14,4),
  valor_apurado      numeric(15,2),
  status_pagamento   text NOT NULL DEFAULT 'pendente',
  observacao         text,
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fazenda_itrs_fazenda ON fazenda_itrs(fazenda_id);
ALTER TABLE fazenda_itrs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fazenda_itrs' AND policyname='fazenda_itrs_tenant') THEN
    CREATE POLICY "fazenda_itrs_tenant" ON fazenda_itrs FOR ALL
      USING (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'))
      WITH CHECK (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS itr_matriculas (
  itr_id       uuid NOT NULL REFERENCES fazenda_itrs(id) ON DELETE CASCADE,
  matricula_id text NOT NULL,
  PRIMARY KEY (itr_id, matricula_id)
);

CREATE TABLE IF NOT EXISTS fazenda_ccirs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fazenda_id    uuid NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  numero        text NOT NULL,
  exercicio     text,
  vencimento    date,
  area_ha       numeric(14,4),
  modulo_fiscal numeric(10,4),
  situacao      text NOT NULL DEFAULT 'regular',
  observacao    text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fazenda_ccirs_fazenda ON fazenda_ccirs(fazenda_id);
ALTER TABLE fazenda_ccirs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fazenda_ccirs' AND policyname='fazenda_ccirs_tenant') THEN
    CREATE POLICY "fazenda_ccirs_tenant" ON fazenda_ccirs FOR ALL
      USING (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'))
      WITH CHECK (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ccir_matriculas (
  ccir_id      uuid NOT NULL REFERENCES fazenda_ccirs(id) ON DELETE CASCADE,
  matricula_id text NOT NULL,
  PRIMARY KEY (ccir_id, matricula_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 9: Talhões — tipo de posse + arrendamento (Seção 128)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE talhoes
  ADD COLUMN IF NOT EXISTS tipo_posse      text NOT NULL DEFAULT 'proprio',
  ADD COLUMN IF NOT EXISTS arrendamento_id uuid REFERENCES arrendamentos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_talhoes_arrendamento ON talhoes(arrendamento_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 10: Abastecimento — insumo e ciclo (Seção 130)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE abastecimentos
  ALTER COLUMN valor_unitario SET DEFAULT 0,
  ALTER COLUMN valor_total    SET DEFAULT 0,
  ADD COLUMN IF NOT EXISTS insumo_id         uuid REFERENCES insumos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ciclo_id          uuid REFERENCES ciclos(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_combustivel  text,
  ADD COLUMN IF NOT EXISTS maquina_descricao text,
  ADD COLUMN IF NOT EXISTS km               numeric(12,1),
  ADD COLUMN IF NOT EXISTS operador         text;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 11: Plantio — insumo de semente (Seção 131)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE plantios
  ADD COLUMN IF NOT EXISTS insumo_id             uuid REFERENCES insumos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantidade_semente_kg numeric(12,3),
  ADD COLUMN IF NOT EXISTS custo_semente_total   numeric(15,2) DEFAULT 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 12: Romaneio — insumo e depósito (Seção 132)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE romaneios
  ADD COLUMN IF NOT EXISTS insumo_id   uuid REFERENCES insumos(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deposito_id uuid REFERENCES depositos(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 13: Imóveis Urbanos como garantia (Seção 135)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS imoveis_urbanos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id      uuid NOT NULL REFERENCES fazendas(id) ON DELETE CASCADE,
  matricula       text,
  tipo            text NOT NULL DEFAULT 'outro',
  descricao       text NOT NULL,
  logradouro      text, numero_end text, complemento text, bairro text, cep text,
  municipio       text,
  estado          text NOT NULL DEFAULT 'MT',
  area_m2         numeric(14,2),
  valor_avaliacao numeric(15,2),
  observacao      text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imoveis_urbanos_fazenda ON imoveis_urbanos(fazenda_id);
ALTER TABLE imoveis_urbanos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='imoveis_urbanos' AND policyname='imoveis_urbanos_tenant') THEN
    CREATE POLICY "imoveis_urbanos_tenant" ON imoveis_urbanos FOR ALL
      USING (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'))
      WITH CHECK (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role='raccotlo'));
  END IF;
END $$;

ALTER TABLE garantias_contrato
  ADD COLUMN IF NOT EXISTS imovel_urbano_id uuid REFERENCES imoveis_urbanos(id) ON DELETE SET NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 14: Lançamentos — campos adicionais (Migrations 140, 146)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE lancamentos
  ADD COLUMN IF NOT EXISTS contrato_financeiro_id uuid REFERENCES contratos_financeiros(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS forma_pagamento        text,
  ADD COLUMN IF NOT EXISTS conta_pagamento        text;
CREATE INDEX IF NOT EXISTS idx_lancamentos_contrato_financeiro ON lancamentos(contrato_financeiro_id)
  WHERE contrato_financeiro_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 15: Contratos Financeiros — campos adicionais (Migration 141)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE parcelas_liberacao
  ADD COLUMN IF NOT EXISTS valor_liberado     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS valor_liberado_brl NUMERIC(14,2);
UPDATE parcelas_liberacao SET valor_liberado=valor, valor_liberado_brl=valor
  WHERE valor_liberado IS NULL AND valor IS NOT NULL;

ALTER TABLE contratos_financeiros
  ADD COLUMN IF NOT EXISTS periodicidade_meses   INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS carencia_tipo         TEXT DEFAULT 'so_juros',
  ADD COLUMN IF NOT EXISTS crescimento_pct       NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS rateio_por_vencimento BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fiscal                BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS valor_financiado_brl  NUMERIC(16,2),
  ADD COLUMN IF NOT EXISTS codigo                TEXT,
  ADD COLUMN IF NOT EXISTS ano_safra_id          UUID REFERENCES anos_safra(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS forma_pagamento       TEXT,
  ADD COLUMN IF NOT EXISTS local_pagamento       TEXT,
  ADD COLUMN IF NOT EXISTS data_entrega_produto  DATE;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 16: Fazendas — produtor_id (Migration 144)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE fazendas ADD COLUMN IF NOT EXISTS produtor_id UUID REFERENCES produtores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fazendas_produtor_id ON fazendas(produtor_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 17: RLS Lançamentos por conta_id (Migration 145)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow_all_lancamentos" ON lancamentos;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lancamentos' AND policyname='lancamentos_tenant') THEN
    CREATE POLICY "lancamentos_tenant" ON lancamentos FOR ALL
      USING (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role LIKE 'raccotlo%'))
      WITH CHECK (fazenda_id IN (SELECT f.id FROM fazendas f JOIN perfis p ON p.conta_id=f.conta_id WHERE p.user_id=auth.uid())
        OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role LIKE 'raccotlo%'));
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 18: Produtores — RLS completo (Migrations 149, 150)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename='produtores' LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || pol.policyname || '" ON produtores';
  END LOOP;
END $$;
ALTER TABLE produtores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "produtores_select" ON produtores FOR SELECT
  USING (conta_id IN (SELECT conta_id FROM perfis WHERE user_id=auth.uid() AND conta_id IS NOT NULL)
    OR conta_id IS NULL OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role LIKE 'raccotlo%'));
CREATE POLICY "produtores_insert" ON produtores FOR INSERT WITH CHECK (true);
CREATE POLICY "produtores_update" ON produtores FOR UPDATE
  USING (conta_id IN (SELECT conta_id FROM perfis WHERE user_id=auth.uid() AND conta_id IS NOT NULL)
    OR conta_id IS NULL OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role LIKE 'raccotlo%'))
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "produtores_delete" ON produtores FOR DELETE
  USING (conta_id IN (SELECT conta_id FROM perfis WHERE user_id=auth.uid() AND conta_id IS NOT NULL)
    OR conta_id IS NULL OR EXISTS (SELECT 1 FROM perfis WHERE user_id=auth.uid() AND role LIKE 'raccotlo%'));


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 19: Inscrições Estaduais — fazenda_id (Migration 152)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE produtor_inscricoes_estaduais
  ADD COLUMN IF NOT EXISTS fazenda_id UUID REFERENCES fazendas(id) ON DELETE CASCADE;
UPDATE produtor_inscricoes_estaduais pie
  SET fazenda_id = p.fazenda_id
  FROM produtores p
  WHERE pie.produtor_id = p.id AND pie.fazenda_id IS NULL AND p.fazenda_id IS NOT NULL;

DROP POLICY IF EXISTS "prod_ies_insert" ON produtor_inscricoes_estaduais;
CREATE POLICY "prod_ies_insert" ON produtor_inscricoes_estaduais FOR INSERT WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 20: NF Entradas — safra, ciclo, cnpj_destino (jun/2026)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE nf_entradas
  ADD COLUMN IF NOT EXISTS ano_safra_id UUID REFERENCES anos_safra(id),
  ADD COLUMN IF NOT EXISTS ciclo_id     UUID REFERENCES ciclos(id),
  ADD COLUMN IF NOT EXISTS cnpj_destino TEXT;
CREATE INDEX IF NOT EXISTS idx_nf_entradas_ano_safra      ON nf_entradas(ano_safra_id);
CREATE INDEX IF NOT EXISTS idx_nf_entradas_ciclo          ON nf_entradas(ciclo_id);
CREATE INDEX IF NOT EXISTS idx_nf_entradas_cnpj_destino   ON nf_entradas(fazenda_id, cnpj_destino);


-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 21: hub_acesso em usuarios — nível de acesso HUB para equipe Raccotlo
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS hub_acesso text;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 23: RLS grupos_usuarios — isolamento por fazenda (jun/2026)
-- Antes: policy "allow_all" com using(true) expunha grupos de todos os clientes
-- Agora: cada fazenda só enxerga seus próprios grupos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE grupos_usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_grupos_usuarios" ON grupos_usuarios;

CREATE POLICY "grupos_usuarios_select" ON grupos_usuarios
  FOR SELECT USING (
    fazenda_id IN (
      SELECT f.id FROM fazendas f
      INNER JOIN perfis p ON p.conta_id = f.conta_id
      WHERE p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

CREATE POLICY "grupos_usuarios_insert" ON grupos_usuarios
  FOR INSERT WITH CHECK (
    fazenda_id IN (
      SELECT f.id FROM fazendas f
      INNER JOIN perfis p ON p.conta_id = f.conta_id
      WHERE p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

CREATE POLICY "grupos_usuarios_update" ON grupos_usuarios
  FOR UPDATE USING (
    fazenda_id IN (
      SELECT f.id FROM fazendas f
      INNER JOIN perfis p ON p.conta_id = f.conta_id
      WHERE p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

CREATE POLICY "grupos_usuarios_delete" ON grupos_usuarios
  FOR DELETE USING (
    fazenda_id IN (
      SELECT f.id FROM fazendas f
      INNER JOIN perfis p ON p.conta_id = f.conta_id
      WHERE p.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role = 'raccotlo')
  );

-- ─────────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- BLOCO 24: fix grupos_usuarios — adiciona fazenda_id + backfill + RLS corrigida
-- Problema: coluna fazenda_id não existia na tabela grupos_usuarios;
--           RLS do Bloco 23 usava conta_id chain que falha quando conta_id é NULL.
-- Execute no Supabase SQL Editor (pode rodar mesmo se Bloco 23 já rodou).
-- =============================================================================

-- 1. Adicionar coluna fazenda_id (se ainda não existe)
ALTER TABLE grupos_usuarios
  ADD COLUMN IF NOT EXISTS fazenda_id uuid REFERENCES fazendas(id) ON DELETE CASCADE;

-- 2. Backfill: preenche fazenda_id vazio usando os usuários do grupo
UPDATE grupos_usuarios
SET fazenda_id = (
  SELECT u.fazenda_id
  FROM usuarios u
  WHERE u.grupo_id = grupos_usuarios.id
    AND u.fazenda_id IS NOT NULL
  LIMIT 1
)
WHERE fazenda_id IS NULL
  AND EXISTS (
    SELECT 1 FROM usuarios u
    WHERE u.grupo_id = grupos_usuarios.id AND u.fazenda_id IS NOT NULL
  );

-- 3. Garantir RLS ativo
ALTER TABLE grupos_usuarios ENABLE ROW LEVEL SECURITY;

-- 4. Recriar todas as policies (drop + create para garantir estado limpo)
DROP POLICY IF EXISTS "allow_all_grupos_usuarios"  ON grupos_usuarios;
DROP POLICY IF EXISTS "grupos_usuarios_select"     ON grupos_usuarios;
DROP POLICY IF EXISTS "grupos_usuarios_insert"     ON grupos_usuarios;
DROP POLICY IF EXISTS "grupos_usuarios_update"     ON grupos_usuarios;
DROP POLICY IF EXISTS "grupos_usuarios_delete"     ON grupos_usuarios;

CREATE POLICY "grupos_usuarios_select" ON grupos_usuarios
  FOR SELECT USING (
    -- Match direto pela fazenda ativa do usuário (cobre conta_id NULL)
    fazenda_id = (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())
    OR
    -- Match pela conta (farm-switcher com múltiplas fazendas)
    fazenda_id IN (
      SELECT f.id FROM fazendas f
      INNER JOIN perfis p ON p.conta_id = f.conta_id
      WHERE p.user_id = auth.uid()
        AND p.conta_id IS NOT NULL
    )
    OR
    -- Bypass raccotlo
    EXISTS (
      SELECT 1 FROM perfis
      WHERE user_id = auth.uid()
        AND role IN ('raccotlo', 'raccotlo_gestor', 'raccotlo_seletor')
    )
  );

CREATE POLICY "grupos_usuarios_insert" ON grupos_usuarios
  FOR INSERT WITH CHECK (
    fazenda_id = (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role IN ('raccotlo', 'raccotlo_gestor'))
  );

CREATE POLICY "grupos_usuarios_update" ON grupos_usuarios
  FOR UPDATE USING (
    fazenda_id = (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role IN ('raccotlo', 'raccotlo_gestor'))
  );

CREATE POLICY "grupos_usuarios_delete" ON grupos_usuarios
  FOR DELETE USING (
    fazenda_id = (SELECT fazenda_id FROM perfis WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM perfis WHERE user_id = auth.uid() AND role IN ('raccotlo', 'raccotlo_gestor'))
  );

-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
-- =============================================================================
-- FIM — execute este arquivo no Supabase SQL Editor
-- =============================================================================

-- ============================================================
-- GRUPO TIEMANN — Reimportação v2 (schema corrigido)
-- Data de referência: 2026-08-17
-- Regra: data_vencimento <= '2026-08-17' → status='pago'
-- PTAX referência: 5,45 para contratos USD/TFBD-indexados
-- faz Kuluene (Canarana)    : 'e6b2279e-18e5-4a23-bce1-0b71c3e3981d'
-- faz Couto  (Campinápolis) : '81227f08-647e-40b5-9256-eb2d98a4323c'
-- JUNIOR produtor_id        : '6183ee4f-a042-4c6b-99dd-2f52475bb43d'
-- PAI    produtor_id        : subquery CPF 310.206.740-91
-- ============================================================

BEGIN;

-- ============================================================
-- 1. BANCOS / CREDORES — pessoas (usa fazenda_id, não conta_id)
--    cliente=false, fornecedor=true
--    Inserir nas duas fazendas pois contratos cruzam as duas
-- ============================================================
INSERT INTO pessoas (fazenda_id, nome, tipo, cliente, fornecedor, cpf_cnpj, municipio, estado)
SELECT t.fazenda_id::uuid, t.nome, t.tipo::text, false, true, t.cpf_cnpj, t.municipio, t.estado
FROM (VALUES
  -- Kuluene (contratos PAI)
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d','Caixa Econômica Federal',          'pj','00.360.305/0001-04','Brasília',           'DF'),
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d','Banco Bradesco S.A.',               'pj','60.746.948/0001-12','Osasco',             'SP'),
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d','Banco Cooperativo Sicredi S.A.',    'pj','01.181.521/0001-55','Porto Alegre',       'RS'),
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d','Sicredi Araxingu (Bansicredi 748)','pj','33.021.064/0001-28','Paragominas',        'PA'),
  -- Couto (contratos PAI Couto + JUNIOR)
  ('81227f08-647e-40b5-9256-eb2d98a4323c','Caixa Econômica Federal',          'pj','00.360.305/0001-04','Brasília',           'DF'),
  ('81227f08-647e-40b5-9256-eb2d98a4323c','Banco Bradesco S.A.',               'pj','60.746.948/0001-12','Osasco',             'SP'),
  ('81227f08-647e-40b5-9256-eb2d98a4323c','Banco Santander (Brasil) S.A.',     'pj','90.400.888/0001-42','São Paulo',          'SP'),
  ('81227f08-647e-40b5-9256-eb2d98a4323c','Sicredi Araxingu (Bansicredi 748)','pj','33.021.064/0001-28','Paragominas',        'PA')
) AS t(fazenda_id, nome, tipo, cpf_cnpj, municipio, estado)
WHERE NOT EXISTS (
  SELECT 1 FROM pessoas p
  WHERE p.fazenda_id = t.fazenda_id::uuid AND p.cpf_cnpj = t.cpf_cnpj
);

-- ============================================================
-- 2. CONTRATOS FINANCEIROS
-- Colunas corretas do schema real:
--   fazenda_id, pessoa_id, produtor_id, descricao, credor,
--   tipo, tipo_calculo, moeda, valor_financiado, data_contrato,
--   taxa_tipo, indexador, spread_aa, taxa_juros_aa,
--   periodicidade_meses, carencia_meses, observacao,
--   status, rateio_por_vencimento, fiscal, numero_documento
-- ============================================================
INSERT INTO contratos_financeiros
  (fazenda_id, pessoa_id, produtor_id,
   descricao, credor, numero_documento,
   tipo, tipo_calculo, moeda,
   valor_financiado, data_contrato,
   taxa_tipo, indexador, spread_aa, taxa_juros_aa,
   periodicidade_meses, carencia_meses,
   observacao, status, rateio_por_vencimento, fiscal)
VALUES

  -- ── PAI / CAIXA ──────────────────────────────────────────

  -- CRH 1771329
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='00.360.305/0001-04' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'CAIXA CRH — Correção Intensiva do Solo (São Gabriel)','Caixa Econômica Federal','1771329/7475/2022',
   'investimento','sac_crescente','BRL',
   3000000.00,'2022-03-18',
   'fixa',NULL,NULL,13.0,
   12,0,
   'CRH MCR 6.3 Recursos Livres 13%aa. Parcelas crescentes (juros compostos acumulados). Fazenda São Gabriel Canarana.',
   'ativo',false,false),

  -- CRP 109584 Emp 1462362
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='00.360.305/0001-04' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'CAIXA CRP — Colheitadeiras (Emp. 1462362)','Caixa Econômica Federal','109584/7475/2022-Emp1',
   'investimento','sac_crescente','BRL',
   1215500.00,'2021-08-25',
   'variavel','TR',10.0,NULL,
   12,0,
   'CRP Poupança Rural Livre 10%aa. Emp. 1462362. Indexada TR. Cédula 109584/7475/2022.',
   'ativo',false,false),

  -- CRP 109584 Emp 1462363
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='00.360.305/0001-04' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'CAIXA CRP — Colheitadeiras (Emp. 1462363)','Caixa Econômica Federal','109584/7475/2022-Emp2',
   'investimento','sac_crescente','BRL',
   187000.00,'2021-08-25',
   'variavel','TR',10.0,NULL,
   12,0,
   'CRP Poupança Rural Livre 10%aa. Emp. 1462363. Cédula 109584/7475/2022.',
   'ativo',false,false),

  -- CRP 1458537
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='00.360.305/0001-04' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'CAIXA CRP — Semeadora Stara Hercules 6.0','Caixa Econômica Federal','1458537/7475/2022',
   'investimento','sac_crescente','BRL',
   1249500.00,'2022-05-04',
   'variavel','TR',10.0,NULL,
   12,0,
   'CRP Poupança Rural Livre 10%aa. FINAME 2.649.822. São Gabriel Mat. 2075.',
   'ativo',false,false),

  -- CRH 104218 Emp 1411585
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='00.360.305/0001-04' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'CAIXA CRH — Correção Solo Emp.1411585 (São Gabriel)','Caixa Econômica Federal','104218/7475/2022-Emp1',
   'investimento','sac_crescente','BRL',
   4077540.00,'2022-01-24',
   'fixa',NULL,NULL,7.0,
   12,0,
   'CRH MCR 6.3 Recursos Livres Equalizáveis 7%aa. Total cédula R$5.000.000. São Gabriel mats. 0.92/1.438/2.075/2.428/10.766.',
   'ativo',false,false),

  -- CRH 104218 Emp 1411586 (Couto)
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='00.360.305/0001-04' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'CAIXA CRH — Correção Solo Emp.1411586 (Flor da Mata) [ESTIMADO]','Caixa Econômica Federal','104218/7475/2022-Emp2',
   'investimento','sac_crescente','BRL',
   922460.00,'2022-01-24',
   'fixa',NULL,NULL,7.0,
   12,0,
   'ESTIMADO. CRH MCR 6.3 7%aa. Emp.1411586 cédula 104218. Flor da Mata Mat.2809 Campinápolis. Parcelas pela proporção 922.460/4.077.540 das fichas do Emp.1411585.',
   'ativo',false,false),

  -- ── PAI / BRADESCO ───────────────────────────────────────

  -- CCB 6131996 FINAME TFBD SAC
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='60.746.948/0001-12' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'Bradesco CCB 6131996 — FINAME TFBD (Semeadora Adubadora)','Banco Bradesco S.A.','6131996',
   'investimento','sac','BRL',
   1400000.00,'2025-04-04',
   'variavel','Outro',NULL,8.0,
   12,0,
   'BNDES FINAME Taxa Fixa em Dólar (TFBD) 8%aa SAC. Indexado PTAX diária. Valores convertidos a PTAX 5,45.',
   'ativo',false,false),

  -- CCB 6156514 FINAME TFBD SAC (Couto)
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='60.746.948/0001-12' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'Bradesco CCB 6156514 — FINAME TFBD (Pulverizador Uniport 3030)','Banco Bradesco S.A.','6156514',
   'investimento','sac','BRL',
   880000.00,'2025-06-04',
   'variavel','Outro',NULL,8.4708,
   12,0,
   'BNDES FINAME TFBD 8,4708%aa (0,6799%am) SAC anual. Indexado PTAX diária. Fazenda Flor da Mata / Irmãos Tomain Gleba B Campinápolis.',
   'ativo',false,false),

  -- CPR 2372291 Soja 29.800sc
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='60.746.948/0001-12' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'Bradesco CPR 2372291 — Soja 29.800sc TFBD Prefixada','Banco Bradesco S.A.','237/2291/2026/001',
   'cpr','outros','USD',
   2980000.00,'2026-03-10',
   'fixa','Outro',NULL,5.33727,
   12,0,
   'CPR-LF Lei 13.476/2017. 29.800 sc × R$100/sc = US$568.008,54 a PTAX 5,2464. Prefixado 5,33727%aa. Conversão pela PTAX BCSS D-1. PTAX ref. 5,45. Garantia: CCB 313202 + Fazenda Estrela Mat.10766 Canarana.',
   'ativo',false,false),

  -- CCB 313202 Limite Revolving (sem parcelas)
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='60.746.948/0001-12' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'Bradesco CCB 313202 — Limite de Crédito Revolving','Banco Bradesco S.A.','313202',
   'outros','outros','BRL',
   2982000.00,'2026-01-26',
   NULL,NULL,NULL,NULL,
   0,0,
   'Limite de crédito rotativo emitido 26/01/2026. Vinculado ao CPR 2372291 como garantia. Sem cronograma fixo.',
   'ativo',false,false),

  -- ── PAI / SICREDI ────────────────────────────────────────

  -- MODERFROTA C00522338-1
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='01.181.521/0001-55' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'Sicredi MODERFROTA C00522338-1 — Kuluene','Banco Cooperativo Sicredi S.A.','C00522338-1',
   'investimento','sac','BRL',
   314500.00,'2021-07-15',
   'fixa',NULL,NULL,7.5,
   12,0,
   'BNDES MODERFROTA via Banco Cooperativo Sicredi 7,5%aa SAC anual.',
   'ativo',false,false),

  -- MODERAGRO C00522489-2
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='01.181.521/0001-55' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'Sicredi MODERAGRO C00522489-2 — Kuluene','Banco Cooperativo Sicredi S.A.','C00522489-2',
   'investimento','sac','BRL',
   408000.00,'2021-09-15',
   'fixa',NULL,NULL,6.0,
   12,0,
   'BNDES MODERAGRO via Banco Cooperativo Sicredi 6%aa SAC anual.',
   'ativo',false,false),

  -- FCO C10524141-1
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'Sicredi FCO Desenvolvimento Rural C10524141-1','Sicredi Araxingu (Bansicredi 748)','C10524141-1',
   'investimento','sac','BRL',
   346750.00,'2022-10-01',
   'fixa',NULL,NULL,6.09,
   12,12,
   'FCO Desenvolvimento Rural 6,09%aa SAC. Sicredi Araxingu 748. P1 carência (só juros).',
   'ativo',false,false),

  -- Solar CDI C10532360-4
  ('e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'Sicredi CCB Solar C10532360-4 — Energia Fotovoltaica','Sicredi Araxingu (Bansicredi 748)','C10532360-4',
   'investimento','sac','BRL',
   255000.00,'2021-08-10',
   'variavel','CDI',0.5391,NULL,
   1,0,
   'CCB Energia Solar CDI+0,5391%am. 72 parcelas mensais 10/08/2021–10/07/2027. Saldo devedor 03/07/2026: R$81.529,05. Fichas exatas P62–P72; P1–P61 estimados.',
   'ativo',false,false),

  -- CPR C40520782-0 PAI Couto
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   (SELECT id FROM produtores WHERE cpf_cnpj ILIKE '%310.206.740%' LIMIT 1),
   'Sicredi CPR TFBD C40520782-0 — Couto (PAI)','Sicredi Araxingu (Bansicredi 748)','C40520782-0',
   'cpr','sac_crescente','BRL',
   3000000.00,'2025-03-13',
   'variavel','CDI',4.59,NULL,
   12,0,
   'CPR TFBD CDI+4,59%aa pós-fixada. 5 parcelas anuais 13/03/2025–13/03/2029. Fazenda Couto Campinápolis.',
   'ativo',false,false),

  -- ── JUNIOR / CAIXA ───────────────────────────────────────

  -- CRH 191418 Emp 2160399
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='00.360.305/0001-04' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'CAIXA CRH — Solo Emp.2160399 (Couto)','Caixa Econômica Federal','191418/7475/2023-Emp1',
   'investimento','sac_crescente','BRL',
   3327266.65,'2023-10-27',
   'variavel','Outro',NULL,8.5,
   12,0,
   'CRH Recursos Livres Equalizáveis 8,5%aa. Total cédula 191418 = R$4.812.162,51. Irmãos Tomain Mat.2270/Flor da Mata Mat.2809/Alvorada Mat.4468 Campinápolis.',
   'ativo',false,false),

  -- CRH 191418 Emp 2160400
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='00.360.305/0001-04' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'CAIXA CRH — Solo Emp.2160400 (Couto)','Caixa Econômica Federal','191418/7475/2023-Emp2',
   'investimento','sac_crescente','BRL',
   1484895.86,'2023-10-27',
   'variavel','Outro',NULL,8.5,
   12,0,
   'CRH Recursos Livres Equalizáveis 8,5%aa. Emp.2160400 cédula 191418. Fazendas Campinápolis.',
   'ativo',false,false),

  -- CRP 1500184 Trator JD 7230J
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='00.360.305/0001-04' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'CAIXA CRP — Trator John Deere 7230J (FINAME 3265986)','Caixa Econômica Federal','1500184/7475/2022',
   'investimento','sac_crescente','BRL',
   918000.00,'2022-07-07',
   'variavel','TR',10.0,NULL,
   12,0,
   'CRP Poupança Rural Livre 10%aa. Trator JD 7230J FINAME 3265986. Irmãos Tomain Gleba 3 Mat.2270 Campinápolis.',
   'ativo',false,false),

  -- ── JUNIOR / SANTANDER ───────────────────────────────────

  -- CRH Santander 099900314681
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='90.400.888/0001-42' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Santander CRH 099900314681 — CDI+4,07%aa','Banco Santander (Brasil) S.A.','099900314681',
   'investimento','sac','BRL',
   4000000.00,'2023-08-10',
   'variavel','CDI',4.07,NULL,
   12,0,
   'CRH CDI+4,07%aa pós-fixada. Juros CDI debitados separadamente. Irmãos Tomain Mat.2270.',
   'ativo',false,false),

  -- CPR Santander 099900316445 (LIQUIDADO)
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='90.400.888/0001-42' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Santander CPR 099900316445 — R$5M CDI+4,49%aa (LIQUIDADO)','Banco Santander (Brasil) S.A.','099900316445',
   'cpr','outros','BRL',
   5000000.00,'2024-03-14',
   'variavel','CDI',4.49,NULL,
   12,0,
   'CPR-LF bullet R$5.000.000. 3.125.000 kg SOJA × R$1,60/kg. LIQUIDADO em 14/03/2025.',
   'quitado',false,false),

  -- ── JUNIOR / SICREDI ─────────────────────────────────────

  -- FCO C20522545-0
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Sicredi FCO Rural C20522545-0 — Couto (JUNIOR)','Sicredi Araxingu (Bansicredi 748)','C20522545-0',
   'investimento','sac','BRL',
   720060.00,'2023-07-01',
   'fixa',NULL,NULL,9.05,
   12,12,
   'FCO Rural 9,05%aa SAC. P1 carência (só juros). Sicredi Araxingu 748.',
   'ativo',false,false),

  -- CBO C30523740-0
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Sicredi CBO LCA C30523740-0 — CDI+4,10%aa','Sicredi Araxingu (Bansicredi 748)','C30523740-0',
   'investimento','sac_crescente','BRL',
   4000000.00,'2023-10-02',
   'variavel','CDI',4.10,NULL,
   12,0,
   'CBO Investimento LCA Pós CDI+4,10%aa. 5 parcelas anuais.',
   'ativo',false,false),

  -- CPR C40520761-8
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Sicredi CPR Agrícola C40520761-8 — CDI+4,59%aa','Sicredi Araxingu (Bansicredi 748)','C40520761-8',
   'cpr','sac_crescente','BRL',
   7000000.00,'2024-03-14',
   'variavel','CDI',4.59,NULL,
   12,0,
   'CPR Agrícola CDI+4,59%aa. 5 parcelas anuais.',
   'ativo',false,false),

  -- CPR C40522367-2
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Sicredi CPR Poupança Pós C40522367-2 — CDI+4,84%aa','Sicredi Araxingu (Bansicredi 748)','C40522367-2',
   'cpr','sac_crescente','BRL',
   3000000.00,'2024-07-04',
   'variavel','CDI',4.84,NULL,
   12,0,
   'CPR Poupança Pós CDI+4,84%aa. 5 parcelas anuais.',
   'ativo',false,false),

  -- CCE C50521070-0 bullet USD 2027
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Sicredi CCE 600D MELP C50521070-0 — USD Bullet 2027','Sicredi Araxingu (Bansicredi 748)','C50521070-0',
   'outros','outros','USD',
   1349985.46,'2025-06-24',
   'fixa','Outro',NULL,9.2,
   12,0,
   'CCE USD bullet venc. 24/06/2027. PTAX ref. 5,45. Valor BRL = US$247.703 × 5,45.',
   'ativo',false,false),

  -- CCE C50521071-8 bullet USD 2028
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Sicredi CCE 600D MELP C50521071-8 — USD Bullet 2028','Sicredi Araxingu (Bansicredi 748)','C50521071-8',
   'outros','outros','USD',
   1252650.46,'2025-06-24',
   'fixa','Outro',NULL,9.2,
   12,0,
   'CCE USD bullet venc. 20/06/2028. PTAX ref. 5,45.',
   'ativo',false,false),

  -- CCE C50521072-6 bullet USD 2029
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Sicredi CCE 600D MELP C50521072-6 — USD Bullet 2029','Sicredi Araxingu (Bansicredi 748)','C50521072-6',
   'outros','outros','USD',
   1168406.46,'2025-06-24',
   'fixa','Outro',NULL,9.2,
   12,0,
   'CCE USD bullet venc. 20/06/2029. PTAX ref. 5,45.',
   'ativo',false,false),

  -- CCE C50521073-4 bullet USD 2030
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Sicredi CCE 600D MELP C50521073-4 — USD Bullet 2030','Sicredi Araxingu (Bansicredi 748)','C50521073-4',
   'outros','outros','USD',
   1094779.93,'2025-06-24',
   'fixa','Outro',NULL,9.2,
   12,0,
   'CCE USD bullet venc. 24/06/2030. PTAX ref. 5,45.',
   'ativo',false,false),

  -- CPR C60520778-6
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='33.021.064/0001-28' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Sicredi CPR Agrícola C60520778-6 — CDI+5,00%aa','Sicredi Araxingu (Bansicredi 748)','C60520778-6',
   'cpr','sac_crescente','BRL',
   2500000.00,'2026-05-25',
   'variavel','CDI',5.00,NULL,
   12,0,
   'CPR Agrícola CDI+5,00%aa. 5 parcelas anuais. Contratado 25/05/2026. Todas a vencer.',
   'ativo',false,false),

  -- ── JUNIOR / BRADESCO ────────────────────────────────────

  -- SFH 756328 (sem parcelas detalhadas nesta importação)
  ('81227f08-647e-40b5-9256-eb2d98a4323c',
   (SELECT id FROM pessoas WHERE cpf_cnpj='60.746.948/0001-12' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c' LIMIT 1),
   '6183ee4f-a042-4c6b-99dd-2f52475bb43d',
   'Bradesco 756328 — Financiamento Imóvel SFH SAC (JUNIOR)','Banco Bradesco S.A.','756328',
   'outros','sac','BRL',
   480000.00,'2015-02-13',
   'variavel','TR',NULL,8.83,
   1,0,
   'SFH 8,83%nom/9,20%ef SAC. Imóvel R$600.000, financia R$480.000. Parcela base ~R$5.132 + R$132,72 seguro + R$25 adm. 300 parcelas mensais até 02/2040. Parcelas não detalhadas.',
   'ativo',false,false);

-- ============================================================
-- 3. PARCELAS — schema correto:
--   contrato_id, fazenda_id, num_parcela, data_vencimento,
--   amortizacao, juros, despesas_acessorios, valor_parcela,
--   saldo_devedor, status ('em_aberto' | 'pago' | 'vencido')
-- ============================================================

-- Helper: função de status por data
-- status = 'pago' se data_vencimento <= '2026-08-17', senão 'em_aberto'

-- ── 3A. CRH 1771329 (amort 333.333,33 × 9)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='1771329/7475/2022' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,amort,juros,0,amort+juros,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2024-07-18',333333.33, 95288.21,2666666.67),
  (2,'2025-07-18',333333.33,150935.46,2333333.34),
  (3,'2026-07-18',333333.33,213890.25,2000000.01),
  (4,'2027-07-18',333333.33,285029.65,1666666.68),
  (5,'2028-07-18',333333.33,365522.78,1333333.35),
  (6,'2029-07-18',333333.33,456254.14,1000000.02),
  (7,'2030-07-18',333333.33,558900.40, 666666.69),
  (8,'2031-07-18',333333.33,674890.90, 333333.36),
  (9,'2032-07-18',333333.34,806133.00,       0.00)
) AS t(num,venc,amort,juros,saldo);

-- ── 3B. CRP 109584 Emp 1462362 (amort 151.937,50 × 8)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='109584/7475/2022-Emp1' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,151937.50,total-151937.50,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2023-02-01',162060.03,1063562.50),
  (2,'2024-02-01',178261.96, 911625.00),
  (3,'2025-02-03',196195.07, 759687.50),
  (4,'2026-02-02',215758.23, 607750.00),
  (5,'2027-02-01',237272.08, 455812.50),
  (6,'2028-02-01',260993.28, 303875.00),
  (7,'2029-02-01',287099.17, 151937.50),
  (8,'2030-02-01',315809.01,       0.00)
) AS t(num,venc,total,saldo);

-- ── 3C. CRP 109584 Emp 1462363 (amort 23.375,00 × 8)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='109584/7475/2022-Emp2' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,23375.00,total-23375.00,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2023-02-01', 24932.31,163625.00),
  (2,'2024-02-01', 27424.91,140250.00),
  (3,'2025-02-03', 30183.85,116875.00),
  (4,'2026-02-02', 33193.57, 93500.00),
  (5,'2027-02-01', 36503.38, 70125.00),
  (6,'2028-02-01', 40152.78, 46750.00),
  (7,'2029-02-01', 44169.03, 23375.00),
  (8,'2030-02-01', 48585.85,     0.00)
) AS t(num,venc,total,saldo);

-- ── 3D. CRP 1458537 (amort 156.187,50 × 8)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='1458537/7475/2022' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,156187.50,total-156187.50,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2023-02-06',167290.65,1093312.50),
  (2,'2024-02-05',183966.95, 937125.00),
  (3,'2025-02-04',202316.01, 780937.50),
  (4,'2026-02-04',222547.61, 624750.00),
  (5,'2027-02-04',244802.36, 468562.50),
  (6,'2028-02-04',269275.81, 312375.00),
  (7,'2029-02-04',296210.80, 156187.50),
  (8,'2030-02-04',325831.82,      0.00)
) AS t(num,venc,total,saldo);

-- ── 3E. CRH 104218 Emp 1411585 (amort 582.505,71 × 7)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='104218/7475/2022-Emp1' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,582505.71,total-582505.71,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2025-12-10',756081.50,3495034.29),
  (2,'2026-12-10',809007.36,2912528.58),
  (3,'2027-12-10',865637.66,2330022.87),
  (4,'2028-12-10',926242.12,1747517.16),
  (5,'2029-12-10',991068.41,1165011.45),
  (6,'2030-12-10',1060443.32, 582505.74),
  (7,'2031-12-10',1134674.30,      0.03)
) AS t(num,venc,total,saldo);

-- ── 3F. CRH 104218 Emp 1411586 (amort 131.780,00 × 7) [ESTIMADO]
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='104218/7475/2022-Emp2' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,131780.00,total-131780.00,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2025-12-10',171078.43,790680.00),
  (2,'2026-12-10',183056.54,658900.00),
  (3,'2027-12-10',195887.38,527120.00),
  (4,'2028-12-10',209593.76,395340.00),
  (5,'2029-12-10',224261.39,263560.00),
  (6,'2030-12-10',239983.48,131780.00),
  (7,'2031-12-10',256790.07,     0.00)
) AS t(num,venc,total,saldo);

-- ── 3G. Bradesco CCB 6131996 FINAME TFBD SAC 8%aa (amort 200.000 × 7)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='6131996' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,200000.00,juros,0,200000.00+juros,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2025-04-15',112000.00,1200000.00),
  (2,'2026-04-15', 96000.00,1000000.00),
  (3,'2027-04-15', 80000.00, 800000.00),
  (4,'2028-04-15', 64000.00, 600000.00),
  (5,'2029-04-15', 48000.00, 400000.00),
  (6,'2030-04-15', 32000.00, 200000.00),
  (7,'2031-04-15', 16000.00,      0.00)
) AS t(num,venc,juros,saldo);

-- ── 3H. Bradesco CCB 6156514 FINAME TFBD SAC 8.4708%aa (amort 125.714,29 × 7)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='6156514' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,125714.29,total-125714.29,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2026-06-15',200257.33,754285.71),
  (2,'2027-06-15',189607.89,628571.42),
  (3,'2028-06-15',178959.14,502857.13),
  (4,'2029-06-15',168309.72,377142.84),
  (5,'2030-06-15',157660.86,251428.55),
  (6,'2031-06-15',147011.99,125714.26),
  (7,'2032-06-15',136363.14,     0.00)
) AS t(num,venc,total,saldo);

-- ── 3I. Bradesco CPR 2372291 4 anuais [ESTIMADO juros]
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='237/2291/2026/001' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,745000.00,total-745000.00,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2027-03-11',904050.65,2235000.00),
  (2,'2028-03-13',864288.22,1490000.00),
  (3,'2029-03-12',824524.79, 745000.00),
  (4,'2030-02-18',782461.83,      0.00)
) AS t(num,venc,total,saldo);

-- ── 3J. Sicredi MODERFROTA C00522338-1 (amort 44.928,57 × 7)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C00522338-1' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,amort,total-amort,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2021-07-15',64764.96,44928.57,269571.43),
  (2,'2022-07-15',65146.38,44928.57,224642.86),
  (3,'2023-07-15',61872.21,44928.57,179714.29),
  (4,'2024-07-15',58348.22,44928.57,134785.72),
  (5,'2025-07-15',55167.77,44928.57, 89857.15),
  (6,'2026-07-15',51095.30,44928.57, 44928.58),
  (7,'2027-07-15',44928.58,44928.58,     0.00)
) AS t(num,venc,total,amort,saldo);

-- ── 3K. Sicredi MODERAGRO C00522489-2 (amort 58.285,71 × 7)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C00522489-2' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,amort,total-amort,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2021-09-15',80273.97,58285.71,349714.29),
  (2,'2022-09-15',79268.49,58285.71,291428.58),
  (3,'2023-09-15',75771.36,58285.71,233142.87),
  (4,'2024-09-15',72325.12,58285.71,174857.16),
  (5,'2025-09-15',68886.94,58285.72,116571.44),
  (6,'2026-09-15',63478.42,58285.72, 58285.72),
  (7,'2027-09-15',58285.72,58285.72,     0.00)
) AS t(num,venc,total,amort,saldo);

-- ── 3L. Sicredi FCO C10524141-1 (P1 carência; P2-P8 amort 49.535,71)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C10524141-1' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,amort,total-amort,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2022-10-01', 15987.28,     0.00,346750.00),
  (2,'2023-10-01', 69936.29,49535.71,297214.29),
  (3,'2024-10-01', 67022.06,49535.71,247678.58),
  (4,'2025-10-01', 64148.75,49535.71,198142.87),
  (5,'2026-10-01', 58493.52,49535.71,148607.16),
  (6,'2027-10-01', 49535.72,49535.72, 99071.44),
  (7,'2028-10-01', 49535.72,49535.72, 49535.72),
  (8,'2029-10-01', 49535.72,49535.72,     0.00)
) AS t(num,venc,total,amort,saldo);

-- ── 3M. Solar CDI C10532360-4 — P1-P61 estimados, P62-P72 exatos
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT
  (SELECT id FROM contratos_financeiros WHERE numero_documento='C10532360-4' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  n,
  ('2021-08-10'::date + ((n-1)*INTERVAL'1 month'))::date,
  ROUND((4270.00-(n-1)*25.5)::numeric,2),
  ROUND((7200.00-(n-1)*10.0)::numeric,2) - ROUND((4270.00-(n-1)*25.5)::numeric,2),
  0,
  ROUND((7200.00-(n-1)*10.0)::numeric,2),
  GREATEST(0, ROUND((255000.00 - n*3541.67)::numeric,2)),
  'pago'
FROM generate_series(1,61) AS n;

INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C10532360-4' AND fazenda_id='e6b2279e-18e5-4a23-bce1-0b71c3e3981d'::uuid LIMIT 1),
  'e6b2279e-18e5-4a23-bce1-0b71c3e3981d',
  num,venc::date,amort,juros,0,amort+juros,saldo,'em_aberto'
FROM (VALUES
  (62,'2026-09-10',2686.39,3836.25,78842.66),
  (63,'2026-10-10',2659.69,3797.99,76182.97),
  (64,'2026-11-10',2633.23,3760.33,73549.74),
  (65,'2026-12-10',2607.05,3722.93,70942.69),
  (66,'2027-01-10',2581.10,3685.84,68361.59),
  (67,'2027-02-10',2555.44,3649.22,65806.15),
  (68,'2027-03-10',2530.02,3613.02,63276.13),
  (69,'2027-04-10',2504.85,3577.01,60771.28),
  (70,'2027-05-10',2479.94,3541.44,58291.34),
  (71,'2027-06-10',2455.27,3506.20,55836.07),
  (72,'2027-07-10',2431.23,3472.06,53404.84)
) AS t(num,venc,amort,juros,saldo);

-- ── 3N. CPR C40520782-0 PAI Couto (amort ~600.000 × 5)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C40520782-0' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,amort,total-amort,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2025-03-13',1079228.66,600000.00,2400000.00),
  (2,'2026-03-13',1081947.15,600000.00,1800000.00),
  (3,'2027-03-13', 683092.03,599999.40,1200000.60),
  (4,'2028-03-13', 600000.30,600000.30, 600000.30),
  (5,'2029-03-13', 600000.30,600000.30,     0.00)
) AS t(num,venc,total,amort,saldo);

-- ── 3O. CRH 191418 Emp 2160399 (amort 554.544,44 × 6)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='191418/7475/2023-Emp1' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,554544.44,total-554544.44,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2025-09-04', 652018.18,2772722.21),
  (2,'2026-09-04', 707439.72,2218177.77),
  (3,'2027-09-04', 767572.08,1663633.33),
  (4,'2028-09-04', 832875.61,1109088.89),
  (5,'2029-09-04', 903605.03, 554544.45),
  (6,'2030-09-04', 980411.37,     0.01)
) AS t(num,venc,total,saldo);

-- ── 3P. CRH 191418 Emp 2160400 (amort 247.482,64 × 6)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='191418/7475/2023-Emp2' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,247482.64,total-247482.64,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2025-09-04', 286627.77,1237413.22),
  (2,'2026-09-04', 310991.13, 989930.58),
  (3,'2027-09-04', 337425.37, 742447.94),
  (4,'2028-09-04', 366132.85, 494965.30),
  (5,'2029-09-04', 397225.54, 247482.66),
  (6,'2030-09-04', 430989.65,     0.02)
) AS t(num,venc,total,saldo);

-- ── 3Q. CRP 1500184 JUNIOR (amort 114.750,00 × 8)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='1500184/7475/2022' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,114750.00,total-114750.00,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2023-02-06',121123.23,803250.00),
  (2,'2024-02-05',133197.34,688500.00),
  (3,'2025-02-05',146520.84,573750.00),
  (4,'2026-02-05',161172.93,459000.00),
  (5,'2027-02-05',177290.21,344250.00),
  (6,'2028-02-05',195014.17,229500.00),
  (7,'2029-02-05',214521.11,114750.00),
  (8,'2030-02-05',235973.16,     0.00)
) AS t(num,venc,total,saldo);

-- ── 3R. Santander CRH 099900314681 (amortizações variáveis, juros CDI em separado)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='099900314681' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,amort,0,0,amort,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2024-08-01',865123.60,3134876.40),
  (2,'2025-08-01',831290.22,2303586.18),
  (3,'2026-08-03',798605.41,1504980.77),
  (4,'2027-08-02',767457.12, 737523.65),
  (5,'2028-07-14',737523.65,     0.00)
) AS t(num,venc,amort,saldo);

-- ── 3S. Santander CPR 099900316445 (bullet PAGO)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
VALUES (
  (SELECT id FROM contratos_financeiros WHERE numero_documento='099900316445' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  1,'2025-03-14',5000000.00,0,0,5000000.00,0.00,'pago'
);

-- ── 3T. Sicredi FCO C20522545-0 JUNIOR (P1 carência; P2-P7 amort 120.010)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C20522545-0' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,amort,total-amort,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2023-07-01', 52891.50,     0.00,720060.00),
  (2,'2024-07-01',181296.38,120010.00,600050.00),
  (3,'2025-07-01',171374.28,120010.00,480040.00),
  (4,'2026-07-01',161101.42,120010.00,360030.00),
  (5,'2027-07-01',120010.00,120010.00,240020.00),
  (6,'2028-07-01',120010.00,120010.00,120010.00),
  (7,'2029-07-01',120010.00,120010.00,    0.00)
) AS t(num,venc,total,amort,saldo);

-- ── 3U. Sicredi CBO C30523740-0 (amort ~800.000 × 5)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C30523740-0' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,amort,total-amort,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2024-09-20',1328169.32,800000.00,3200000.00),
  (2,'2025-09-20',1430787.74,800000.00,2400000.00),
  (3,'2026-10-20',1137246.42,799999.20,1600000.80),
  (4,'2027-09-20', 800000.40,800000.40, 800000.40),
  (5,'2028-09-20', 800000.40,800000.40,     0.00)
) AS t(num,venc,total,amort,saldo);

-- ── 3V. Sicredi CPR C40520761-8 (amort ~1.400.000 × 5)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C40520761-8' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,amort,total-amort,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2025-03-13',2518200.24,1400000.00,5600000.00),
  (2,'2026-03-13',2524543.48,1400000.00,4200000.00),
  (3,'2027-03-13',1593881.46,1399998.60,2800001.40),
  (4,'2028-03-13',1400000.70,1400000.70,1400000.70),
  (5,'2029-03-13',1400000.70,1400000.70,     0.00)
) AS t(num,venc,total,amort,saldo);

-- ── 3W. Sicredi CPR C40522367-2 (amort ~600.000 × 5)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C40522367-2' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,amort,total-amort,0,total,saldo,
  CASE WHEN venc::date<='2026-08-17' THEN 'pago' ELSE 'em_aberto' END
FROM (VALUES
  (1,'2025-07-03',1096512.39,600000.00,2400000.00),
  (2,'2026-07-03',1089647.11,600000.00,1800000.00),
  (3,'2027-07-03', 599999.40,599999.40,1200000.60),
  (4,'2028-07-03', 600000.30,600000.30, 600000.30),
  (5,'2029-07-03', 600000.30,600000.30,     0.00)
) AS t(num,venc,total,amort,saldo);

-- ── 3X. CCEs bullet USD (uma parcela cada)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
VALUES (
  (SELECT id FROM contratos_financeiros WHERE numero_documento='C50521070-0' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c'::uuid,1,'2027-06-24'::date,
  1349985.46,34410.32,0,1384395.78,0,'em_aberto'
);

INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
VALUES (
  (SELECT id FROM contratos_financeiros WHERE numero_documento='C50521071-8' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c'::uuid,1,'2028-06-20'::date,
  1252650.46,31929.30,0,1284579.76,0,'em_aberto'
);

INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
VALUES (
  (SELECT id FROM contratos_financeiros WHERE numero_documento='C50521072-6' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c'::uuid,1,'2029-06-20'::date,
  1168406.46,29781.98,0,1198188.44,0,'em_aberto'
);

INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
VALUES (
  (SELECT id FROM contratos_financeiros WHERE numero_documento='C50521073-4' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c'::uuid,1,'2030-06-24'::date,
  1094779.93,27905.30,0,1122685.23,0,'em_aberto'
);

-- ── 3Y. Sicredi CPR C60520778-6 (amort ~500.000 × 5, todas a vencer)
INSERT INTO parcelas_pagamento
  (contrato_id,fazenda_id,num_parcela,data_vencimento,
   amortizacao,juros,despesas_acessorios,valor_parcela,saldo_devedor,status)
SELECT (SELECT id FROM contratos_financeiros WHERE numero_documento='C60520778-6' AND fazenda_id='81227f08-647e-40b5-9256-eb2d98a4323c'::uuid LIMIT 1),
  '81227f08-647e-40b5-9256-eb2d98a4323c',
  num,venc::date,500000.00,total-500000.00,0,total,saldo,'em_aberto'
FROM (VALUES
  (1,'2027-05-15',525933.83,2000000.00),
  (2,'2028-05-15',500000.25,1500000.00),
  (3,'2029-05-15',499999.50,1000000.50),
  (4,'2030-05-15',500000.25, 500000.25),
  (5,'2031-05-15',500000.25,     0.00)
) AS t(num,venc,total,saldo);

-- CCB 313202 (revolving, sem parcelas) e Bradesco 756328 (300 mensais, sem detalhar)

-- ============================================================
-- 4. LIMPEZA
-- ============================================================
COMMIT;
