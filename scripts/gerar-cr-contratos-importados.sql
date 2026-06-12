-- =============================================================================
-- Gera lançamentos CR (Contas a Receber) para contratos importados sem CR
-- Rode no Supabase SQL Editor — seguro (idempotente: só processa sem lancamento_cr_id)
--
-- NOTA: quantidade_sc armazena KG (não sacas). preco é em R$/sc ou US$/sc.
-- Fórmula correta: valor = (quantidade_kg / 60) * preco_por_sc
-- =============================================================================

-- ─── Passo 1: Limpa CRs gerados incorretamente por versões anteriores deste script ──
-- (somente os marcados com a observação de importação retroativa)
DO $$
DECLARE
  ids_errados UUID[];
BEGIN
  -- Coleta IDs dos CRs retroativos que estão vinculados a contratos
  SELECT ARRAY_AGG(lancamento_cr_id)
  INTO ids_errados
  FROM contratos
  WHERE lancamento_cr_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM lancamentos l
      WHERE l.id = contratos.lancamento_cr_id
        AND l.observacao = 'CR gerado retroativamente — contrato importado sem financeiro'
    );

  IF ids_errados IS NOT NULL AND array_length(ids_errados, 1) > 0 THEN
    -- Desvincula contratos antes de deletar
    UPDATE contratos SET lancamento_cr_id = NULL
    WHERE lancamento_cr_id = ANY(ids_errados);

    -- Deleta os lançamentos incorretos
    DELETE FROM lancamentos WHERE id = ANY(ids_errados);

    RAISE NOTICE '=== % CR(s) incorreto(s) removido(s) ===', array_length(ids_errados, 1);
  ELSE
    RAISE NOTICE '=== Nenhum CR incorreto encontrado para limpar ===';
  END IF;
END $$;

-- ─── Passo 2: Gera os CRs com o valor correto ────────────────────────────────
DO $$
DECLARE
  c        RECORD;
  lanc_id  UUID;
  v_status TEXT;
  v_venc   DATE;
  v_valor  NUMERIC;
  v_sacas  NUMERIC;
  contador INTEGER := 0;
BEGIN
  FOR c IN
    SELECT
      id, fazenda_id, comprador, numero,
      quantidade_sc, preco, moeda, cotacao_usd,
      status, data_entrega, data_pagamento,
      ciclo_id, ano_safra_id,
      COALESCE(is_arrendamento, false) AS is_arrendamento
    FROM contratos
    WHERE lancamento_cr_id IS NULL          -- sem CR gerado
      AND COALESCE(is_arrendamento, false) = false  -- exclui comprometimentos de arrendamento
      AND status != 'cancelado'
      AND quantidade_sc > 0
      AND preco > 0
      AND fazenda_id IS NOT NULL
    ORDER BY data_contrato ASC NULLS LAST
  LOOP
    -- quantidade_sc armazena KG — converter para sacas antes de multiplicar pelo preço
    v_sacas := ROUND(c.quantidade_sc / 60.0, 4);
    v_valor := ROUND(v_sacas * c.preco, 2);

    -- Status do lançamento:
    -- encerrado + data no passado → baixado (entregue e presumidamente pago)
    -- todos os outros → em_aberto
    IF c.status = 'encerrado' THEN
      BEGIN
        IF c.data_entrega::date <= CURRENT_DATE THEN
          v_status := 'baixado';
        ELSE
          v_status := 'em_aberto';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_status := 'em_aberto';
      END;
    ELSE
      v_status := 'em_aberto';
    END IF;

    -- Data de vencimento: cast seguro (ignora strings inválidas)
    BEGIN
      v_venc := c.data_pagamento::date;
    EXCEPTION WHEN OTHERS THEN
      v_venc := NULL;
    END;
    IF v_venc IS NULL THEN
      BEGIN
        v_venc := c.data_entrega::date;
      EXCEPTION WHEN OTHERS THEN
        v_venc := CURRENT_DATE;
      END;
    END IF;
    IF v_venc IS NULL THEN v_venc := CURRENT_DATE; END IF;

    -- Insere o lançamento CR
    INSERT INTO lancamentos (
      fazenda_id,
      tipo,
      descricao,
      categoria,
      data_lancamento,
      data_vencimento,
      valor,
      moeda,
      cotacao_usd,
      status,
      safra_id,        -- campo legado — aponta para ciclo_id
      ano_safra_id,
      observacao,
      auto
    ) VALUES (
      c.fazenda_id,
      'receber',
      'Venda de grãos — ' || c.comprador
        || ' (Contrato ' || COALESCE(c.numero, RIGHT(c.id::text, 6)) || ')',
      'Receita Grãos',
      CURRENT_DATE,
      v_venc,
      v_valor,
      c.moeda,
      c.cotacao_usd,
      v_status,
      c.ciclo_id,
      c.ano_safra_id,
      'CR gerado retroativamente — contrato importado sem financeiro',
      true
    )
    RETURNING id INTO lanc_id;

    -- Vincula o CR ao contrato
    UPDATE contratos
    SET lancamento_cr_id = lanc_id
    WHERE id = c.id;

    contador := contador + 1;
    RAISE NOTICE 'Contrato % → CR % | % sc × % = % % | status: %',
      COALESCE(c.numero, c.id::text), lanc_id, v_sacas, c.preco, v_valor, c.moeda, v_status;
  END LOOP;

  RAISE NOTICE '=== % lançamento(s) CR gerado(s) ===', contador;
END $$;
