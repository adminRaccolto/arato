-- ============================================================
-- RacTech — Limpar todos os dados de teste
-- Execute no Supabase SQL Editor
-- ============================================================

-- Ordem importa: tabelas filhas antes das pai

truncate table romaneios            cascade;
truncate table notas_fiscais        cascade;
truncate table contratos            cascade;
truncate table operacoes            cascade;
truncate table safras               cascade;
truncate table movimentacoes_estoque cascade;
truncate table nf_entrada_itens     cascade;
truncate table nf_entradas          cascade;
truncate table estoque_terceiros    cascade;
truncate table historico_manutencao cascade;
truncate table lancamentos          cascade;
truncate table insumos              cascade;
truncate table talhoes              cascade;
truncate table matriculas_imoveis   cascade;

-- Cadastros mestres (descomente se quiser apagar também)
-- truncate table fazendas             cascade;
-- truncate table produtores           cascade;
-- truncate table pessoas              cascade;
-- truncate table funcionarios         cascade;
-- truncate table maquinas             cascade;
-- truncate table bombas_combustivel   cascade;
-- truncate table depositos            cascade;
-- truncate table grupos_insumos       cascade;
-- truncate table subgrupos_insumos    cascade;
-- truncate table anos_safra           cascade;
-- truncate table ciclos               cascade;
