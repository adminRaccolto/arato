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
NOTIFY pgrst, 'reload schema';
-- =============================================================================
-- FIM — execute este arquivo no Supabase SQL Editor
-- =============================================================================
