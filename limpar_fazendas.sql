-- ============================================================
-- Apagar fazendas e produtores de teste
-- Execute no Supabase SQL Editor
-- ============================================================

truncate table fazendas          cascade;
truncate table produtores        cascade;
truncate table pessoas           cascade;
truncate table funcionarios      cascade;
truncate table maquinas          cascade;
truncate table bombas_combustivel cascade;
truncate table depositos         cascade;
truncate table grupos_insumos    cascade;
truncate table subgrupos_insumos cascade;
truncate table anos_safra        cascade;
truncate table ciclos            cascade;

-- ATENÇÃO: isso também apaga o vínculo do seu perfil com a fazenda.
-- Após rodar, cadastre a fazenda real em Cadastros → Fazendas,
-- depois atualize seu perfil no Supabase:
-- update perfis set fazenda_id = '<novo_id>' where id = auth.uid();
