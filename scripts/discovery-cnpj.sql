-- ============================================================
-- DESCOBERTA — o que existe para cada CNPJ
-- Execute no Supabase SQL Editor antes de replicar
-- ============================================================

\set cnpj_origem   '49.578.526/0001-42'
\set cnpj_destino  '51.499.616/0001-90'

-- 1. Pessoas (fornecedores/compradores/arrendantes)
SELECT 'pessoas' AS tabela, id, nome, cpf_cnpj, fazenda_id
FROM pessoas
WHERE replace(replace(replace(replace(cpf_cnpj,'.',''),'-',''),'/',''),' ','')
   IN ('49578526000142','51499616000190');

-- 2. Produtores (donos de fazendas)
SELECT 'produtores' AS tabela, id, nome, cpf_cnpj, fazenda_id, conta_id
FROM produtores
WHERE replace(replace(replace(replace(cpf_cnpj,'.',''),'-',''),'/',''),' ','')
   IN ('49578526000142','51499616000190');

-- 3. Contas (tenant raiz do SaaS)
SELECT 'contas' AS tabela, id, nome, tipo, status
FROM contas
WHERE id IN (
  SELECT conta_id FROM fazendas
  WHERE id IN (
    SELECT fazenda_id FROM pessoas
    WHERE replace(replace(replace(replace(cpf_cnpj,'.',''),'-',''),'/',''),' ','')
       IN ('49578526000142','51499616000190')
    UNION
    SELECT fazenda_id FROM produtores
    WHERE replace(replace(replace(replace(cpf_cnpj,'.',''),'-',''),'/',''),' ','')
       IN ('49578526000142','51499616000190')
  )
);

-- 4. Contratos financeiros vinculados a qualquer um dos CNPJs
SELECT
  cf.id,
  cf.numero_contrato,
  cf.descricao,
  cf.credor,
  cf.credor_cpf_cnpj,
  cf.tipo,
  cf.moeda,
  cf.valor_total,
  cf.taxa_juros_am,
  cf.data_contrato,
  cf.prazo_meses,
  cf.periodicidade_pagamento,
  cf.estrutura_pagamento,
  cf.tipo_amortizacao,
  cf.linha_credito,
  cf.status,
  p.cpf_cnpj  AS pessoa_cpf_cnpj,
  p.nome      AS pessoa_nome,
  pr.cpf_cnpj AS produtor_cpf_cnpj,
  pr.nome     AS produtor_nome,
  cf.fazenda_id
FROM contratos_financeiros cf
LEFT JOIN pessoas    p  ON p.id  = cf.pessoa_id
LEFT JOIN produtores pr ON pr.id = cf.produtor_id
WHERE
  replace(replace(replace(replace(cf.credor_cpf_cnpj,'.',''),'-',''),'/',''),' ','')
     IN ('49578526000142','51499616000190')
  OR replace(replace(replace(replace(p.cpf_cnpj,'.',''),'-',''),'/',''),' ','')
     IN ('49578526000142','51499616000190')
  OR replace(replace(replace(replace(pr.cpf_cnpj,'.',''),'-',''),'/',''),' ','')
     IN ('49578526000142','51499616000190')
ORDER BY cf.data_contrato;

-- 5. Parcelas dos contratos encontrados
SELECT
  pp.contrato_id,
  cf.numero_contrato,
  COUNT(*)               AS total_parcelas,
  SUM(pp.valor_parcela)  AS total_valor,
  MIN(pp.data_vencimento) AS primeira_parcela,
  MAX(pp.data_vencimento) AS ultima_parcela
FROM parcelas_pagamento pp
JOIN contratos_financeiros cf ON cf.id = pp.contrato_id
WHERE cf.id IN (
  SELECT cf2.id FROM contratos_financeiros cf2
  LEFT JOIN pessoas    p2  ON p2.id  = cf2.pessoa_id
  LEFT JOIN produtores pr2 ON pr2.id = cf2.produtor_id
  WHERE
    replace(replace(replace(replace(cf2.credor_cpf_cnpj,'.',''),'-',''),'/',''),' ','')
       IN ('49578526000142','51499616000190')
    OR replace(replace(replace(replace(p2.cpf_cnpj,'.',''),'-',''),'/',''),' ','')
       IN ('49578526000142','51499616000190')
    OR replace(replace(replace(replace(pr2.cpf_cnpj,'.',''),'-',''),'/',''),' ','')
       IN ('49578526000142','51499616000190')
)
GROUP BY pp.contrato_id, cf.numero_contrato;
