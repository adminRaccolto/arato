-- Limpeza de produtos agrícolas genéricos criados automaticamente e sem uso (05/11/2026).
-- 50 produtos. Os do Flávio ficam de fora. Rode inteiro no SQL Editor do Supabase.
-- Guarda cópia em _backup_produtos_genericos_20261105. Só apaga o que continua sem uso na hora de rodar.
-- Qualquer erro desfaz tudo.
BEGIN;

CREATE TEMP TABLE _lista (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _lista (id) VALUES
  ('ab9523a0-7ede-45f7-8b50-73ebe5be01aa'::uuid), -- Adriane Steinmetz · Sorgo
  ('8c8a96eb-2382-49d9-9195-1621b7453a38'::uuid), -- Adriane Steinmetz · Trigo
  ('ef429e15-5944-49c4-a404-b0c73ed542dd'::uuid), -- Anderson Matte · Algodão em Pluma
  ('a2734e1f-c0af-4420-a827-d4e0583f4b0a'::uuid), -- Anderson Matte · Arroz
  ('6ba833eb-5df1-4c69-b098-c72813e678f2'::uuid), -- Anderson Matte · Sorgo
  ('0c253b4b-3497-4bbb-accc-0576d3e1c8b1'::uuid), -- Anderson Matte · Trigo
  ('487a8626-ce83-4609-889e-7fc0799ce1e0'::uuid), -- Cleber Henrique Rodrig · Algodão em Pluma
  ('e1093cef-0f4e-45c7-b90c-8b40de4760e1'::uuid), -- Cleber Henrique Rodrig · Algodão em Pluma
  ('6115b287-04be-40f0-aac0-322c78f8dab9'::uuid), -- Cleber Henrique Rodrig · Arroz
  ('d68d2c04-b2c8-4f0e-9dae-6342ce0a4826'::uuid), -- Cleber Henrique Rodrig · Arroz
  ('f0bd5821-6473-4b04-a4f4-9818903414f1'::uuid), -- Cleber Henrique Rodrig · Arroz
  ('1eaf1b37-f099-43f8-be32-27d0139afd5a'::uuid), -- Cleber Henrique Rodrig · Milho
  ('bfb75478-37fe-46ae-8f7a-75dfc3d5375d'::uuid), -- Cleber Henrique Rodrig · Milho
  ('80c79e28-a4c3-4fb4-8493-aa360f0b4938'::uuid), -- Cleber Henrique Rodrig · Soja
  ('e0d7a4bc-1eac-4eca-8f5a-9ec1b963573e'::uuid), -- Cleber Henrique Rodrig · Soja
  ('1e2de8b8-555d-4f7b-a925-9ccd03400282'::uuid), -- Cleber Henrique Rodrig · Sorgo
  ('41bef5e1-5129-4a1c-8c38-e74f72b33541'::uuid), -- Cleber Henrique Rodrig · Sorgo
  ('3d3388fc-f0ee-4429-9fa5-b8fd0c1d8618'::uuid), -- Cleber Henrique Rodrig · Trigo
  ('e653b45f-8aad-4641-8060-31c4452b563f'::uuid), -- Cleber Henrique Rodrig · Trigo
  ('826bcf92-d0ba-4211-9a31-906834637244'::uuid), -- Grupo Ogliari · Algodão em Pluma
  ('d6f4e478-86cb-46a3-a096-907045af522e'::uuid), -- Grupo Ogliari · Algodão em Pluma
  ('e18e407b-83b8-4dac-b5d5-e001f2ec993b'::uuid), -- Grupo Ogliari · Algodão em Pluma
  ('9ca36ef3-de97-4f4d-8890-9bbac8c68477'::uuid), -- Grupo Ogliari · Arroz
  ('bb93e60d-6a43-4722-bd48-422a82a19231'::uuid), -- Grupo Ogliari · Arroz
  ('ebe9fc99-2a7e-4cf5-bf13-e4ca9fce3883'::uuid), -- Grupo Ogliari · Arroz
  ('2c94962b-7084-4973-ad1e-2fc94f8882a0'::uuid), -- Grupo Ogliari · Milho
  ('7ff3b07c-f803-4a87-aeac-6708fba6b850'::uuid), -- Grupo Ogliari · Milho
  ('a4888130-461c-4fd3-a7fe-b894fb3fc028'::uuid), -- Grupo Ogliari · Soja
  ('b6157d4f-adbb-4985-aeb9-31045e9bd99c'::uuid), -- Grupo Ogliari · Soja
  ('1dfbec62-eb3c-4a09-a9b8-2ef6ad55cf8a'::uuid), -- Grupo Ogliari · Sorgo
  ('2945dd26-7afc-489e-8610-0d18eadec7ef'::uuid), -- Grupo Ogliari · Sorgo
  ('5e9fef1f-6503-4331-93b3-cd822cb78437'::uuid), -- Grupo Ogliari · Sorgo
  ('b259c3c8-713e-4b82-956f-66c7f31ca1ef'::uuid), -- Grupo Ogliari · Sorgo
  ('05d19e4c-00ce-4f79-b814-efc061dc14d9'::uuid), -- Grupo Ogliari · Trigo
  ('0b508a4f-58ea-4647-a383-ec9aa316b677'::uuid), -- Grupo Ogliari · Trigo
  ('7e4675d5-b9fc-429e-9049-9dc81881a930'::uuid), -- Grupo Ogliari · Trigo
  ('8bb9b968-3c8e-487f-9343-68002fb718f9'::uuid), -- Grupo Ogliari · Trigo
  ('1bb3ef56-6184-4d32-a74c-364e28fe1f57'::uuid), -- Habio Pereira Marciano · Algodão em Pluma
  ('3a6875a5-8c95-4f78-882c-da14df861221'::uuid), -- Habio Pereira Marciano · Arroz
  ('a819f1c3-6159-4bcc-8c44-87dd8a629c87'::uuid), -- Habio Pereira Marciano · Milho
  ('7f784c81-75f9-482e-97fb-53be20e748e7'::uuid), -- Habio Pereira Marciano · Soja
  ('b5358e50-53bd-4b78-8220-12d6ebff782b'::uuid), -- Habio Pereira Marciano · Sorgo
  ('af3b66cc-ad64-4af9-9822-6643da72e294'::uuid), -- Habio Pereira Marciano · Trigo
  ('12bf84b7-e69c-4273-afb0-da68f7bdb65b'::uuid), -- Odir Grendene · Arroz
  ('ec8c32cd-25f5-4f86-b66f-5e75febc369e'::uuid), -- Raccolto · Algodão em Pluma
  ('046d6d21-5212-408f-adf9-edcf9a7baeff'::uuid), -- Raccolto · Arroz
  ('8be579e9-2855-4656-8f33-997ee8a80113'::uuid), -- Raccolto · Sorgo
  ('9dd0ae39-b7bf-45ed-9749-c1942b820bdc'::uuid), -- Raccolto · Trigo
  ('166eec41-074a-4fa5-8536-9e6b97424599'::uuid), -- Sidinei · Arroz
  ('b2334d16-1ab6-45bf-8dc1-cd133724de3a'::uuid) -- Sidinei · Arroz
;

CREATE TABLE IF NOT EXISTS _backup_produtos_genericos_20261105 AS
  SELECT i.* FROM insumos i JOIN _lista l ON l.id = i.id;
ALTER TABLE _backup_produtos_genericos_20261105 ENABLE ROW LEVEL SECURITY;

CREATE TEMP TABLE _apagar ON COMMIT DROP AS
  SELECT i.id FROM insumos i JOIN _lista l ON l.id = i.id
  WHERE i.categoria = 'produto_agricola'
    AND coalesce(i.estoque, 0) = 0
    AND i.cultura_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM contratos r WHERE r.produto_agricola_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM pulverizacao_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM recomendacoes_plantio_produtos r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM estoque_terceiros r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM transferencias_estoque_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM orcamento_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM estoque_terceiros_baixas r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM romaneios_entrada r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM arrendamentos r WHERE r.produto_agricola_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM arrendamentos r WHERE r.produto_agricola_id_milho = i.id)
    AND NOT EXISTS (SELECT 1 FROM pedidos_compra_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM romaneios r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM abastecimentos r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM abastecimentos r WHERE r.insumo_movimentado_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM regras_classificacao_nf r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM recomendacoes_pulverizacao_produtos r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM ciclos r WHERE r.produto_agricola_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM correcoes_solo_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM recomendacoes_corretivo_produtos r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM tratamento_sementes r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM recomendacoes_adubacao_produtos r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM aplicacoes_aereas_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM nf_entrada_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM plantios r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM nf_importada_itens_sieg r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM tratamento_receitas_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM recomendacao_produtos r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM notas_proprias_externas_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM bombas_combustivel r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM movimentacoes_estoque r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM tratamento_sementes_itens r WHERE r.insumo_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM adubacoes_base_itens r WHERE r.insumo_id = i.id);

DELETE FROM insumos WHERE id IN (SELECT id FROM _apagar);

COMMIT;

-- Resultado: 50 na lista, quantos saíram e quantos ficaram porque passaram a ser usados
SELECT count(*) AS na_copia,
       count(*) FILTER (WHERE i.id IS NULL) AS apagados,
       count(*) FILTER (WHERE i.id IS NOT NULL) AS mantidos
FROM _backup_produtos_genericos_20261105 b LEFT JOIN insumos i ON i.id = b.id;
