/**
 * Extração do banco Agro1 (Firebird) para JSON
 * Docker container fb25 deve estar rodando na porta 13050.
 *
 * Uso: node scripts/migracao/01-extrair-agro1.js
 * Saída: scripts/migracao/dados/
 */

const Firebird = require("node-firebird");
const fs       = require("fs");
const path     = require("path");

const OPTIONS = {
  host:           "127.0.0.1",
  port:           13050,
  database:       "/firebird/data/AG2006.FDB",
  user:           "SYSDBA",
  password:       "masterkey",
  lowercase_keys: false,
};

// Mapeamento de moedas do Agro1
const MOEDAS = {
  1: "BRL", 2: "USD", 3: "UFE", 4: "UPF",
  5: "SC_SOJA", 6: "SC_MILHO", 7: "SC_ALGODAO",
  8: "LLE", 9: "ARROBA", 10: "BRL",
};

const CD_SAFRA_2627 = 10; // 2026/2027

const OUT_DIR = path.join(__dirname, "dados");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function query(db, sql, params = []) {
  return new Promise((res, rej) =>
    db.query(sql, params, (err, result) => {
      if (err) { console.error("  SQL ERR:", err.message.split("\n")[0], "\n  SQL:", sql.slice(0, 120)); rej(err); }
      else res(result ?? []);
    })
  );
}

function salvar(nome, dados) {
  const arquivo = path.join(OUT_DIR, `${nome}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), "utf8");
  console.log(`  ✅ ${nome}.json — ${dados.length} registros`);
  return dados;
}

// Formata CNPJ/CPF para exibição
function fmtDoc(doc) {
  if (!doc) return null;
  const d = String(doc).replace(/\D/g, "").padStart(doc.length < 12 ? 11 : 14, "0");
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  return doc;
}

// ── Extração ─────────────────────────────────────────────────────────────────
async function extrair(db) {

  // ── Tabelas de referência ────────────────────────────────────────────────────
  const cidades = await query(db, "SELECT CODIGO, NOME, ID_UF FROM CIDADES");
  const estados = await query(db, "SELECT ID, UF FROM ESTADOS_UF");
  const cidMap  = Object.fromEntries(cidades.map(c => [c.CODIGO, c]));
  const ufMap   = Object.fromEntries(estados.map(e => [e.ID, e.UF]));
  const cidNome = (cod) => cidMap[cod]?.NOME ?? null;
  const ufNome  = (cod) => ufMap[cidMap[cod]?.ID_UF] ?? null;
  console.log(`  📌 ${cidades.length} cidades, ${estados.length} estados carregados`);

  const unidades = await query(db, "SELECT CODIGO AS CD_UNIDADE, DESCRICAO, ABREVIATURA FROM UNIDADESMEDIDA");
  const unidMap  = Object.fromEntries(unidades.map(u => [u.CD_UNIDADE, (u.ABREVIATURA ?? u.DESCRICAO ?? "").trim()]));

  // ── 1. PESSOAS (Fornecedores + Clientes) ────────────────────────────────────
  console.log("\n📦 1. Pessoas (Fornecedores e Clientes)");

  const rawPessoas = await query(db, `
    SELECT
      P.CODIGO, TRIM(P.NOME) AS NOME, TRIM(P.NOME_FANTASIA) AS NOME_FANTASIA,
      P.PESSOA,
      TRIM(P.PF_CPF) AS PF_CPF, TRIM(P.PJ_CNPJ) AS PJ_CNPJ,
      TRIM(P.PJ_INSC_ESTAD) AS PJ_INSC_ESTAD,
      TRIM(P.ENDERECO) AS ENDERECO, TRIM(P.BAIRRO) AS BAIRRO,
      TRIM(P.CEP) AS CEP, TRIM(P.NUMERO) AS NUMERO,
      TRIM(P.FONE1) AS FONE1, TRIM(P.FONE2) AS FONE2,
      TRIM(P.EMAIL) AS EMAIL, P.CIDADE AS CD_CIDADE,
      PF.CODIGO AS IS_FORNECEDOR,
      PC.CODIGO AS IS_CLIENTE
    FROM PESSOAS P
    LEFT JOIN PESSOAS_FORNECEDORES PF ON PF.CODIGO = P.CODIGO
    LEFT JOIN PESSOAS_CLIENTES PC ON PC.CODIGO = P.CODIGO
    WHERE PF.CODIGO IS NOT NULL OR PC.CODIGO IS NOT NULL
    ORDER BY P.NOME
  `);

  const pessoas = rawPessoas.map(p => ({
    CODIGO:         p.CODIGO,
    NOME:           p.NOME,
    NOME_FANTASIA:  p.NOME_FANTASIA || null,
    TIPO:           p.PESSOA === "F" ? "pf" : "pj",
    CPF:            p.PF_CPF || null,
    CNPJ:           p.PJ_CNPJ || null,
    CPF_CNPJ_FMT:   fmtDoc(p.PJ_CNPJ || p.PF_CPF),
    INSC_ESTADUAL:  p.PJ_INSC_ESTAD || null,
    ENDERECO:       p.ENDERECO,
    BAIRRO:         p.BAIRRO,
    NUMERO:         p.NUMERO,
    CEP:            p.CEP,
    CIDADE:         cidNome(p.CD_CIDADE),
    ESTADO:         ufNome(p.CD_CIDADE),
    FONE1:          p.FONE1,
    FONE2:          p.FONE2,
    EMAIL:          p.EMAIL,
    FORNECEDOR:     !!p.IS_FORNECEDOR,
    CLIENTE:        !!p.IS_CLIENTE,
  }));
  salvar("pessoas", pessoas);

  // ── 2. PRODUTOS (Itens de Estoque ativos) ────────────────────────────────────
  console.log("\n📦 2. Produtos / Itens de Estoque");

  const rawProdutos = await query(db, `
    SELECT
      I.ID, I.CODIGO, TRIM(I.DESCRICAO) AS DESCRICAO,
      TRIM(I.GRUPO) AS GRUPO,
      I.CD_UNIDADE,
      I.QT_ESTOQUE_MINIMO, I.QT_ESTOQUE_MAXIMO,
      I.NCM, TRIM(I.CODIGO_BARRAS) AS CODIGO_BARRAS,
      I.ST_ATIVO, I.TIPO,
      TRIM(I.PRINCIPIO_ATIVO) AS PRINCIPIO_ATIVO,
      TRIM(I.FABRICANTE) AS FABRICANTE
    FROM ITENS_ESTOQUE I
    WHERE I.ST_ATIVO = 'S'
    ORDER BY I.DESCRICAO
  `);

  const produtos = rawProdutos.map(p => ({
    ...p,
    UNIDADE: unidMap[p.CD_UNIDADE] ?? p.CD_UNIDADE,
  }));
  salvar("produtos", produtos);

  // ── 3. CONTAS A PAGAR abertas (STATUS em aberto) ─────────────────────────────
  console.log("\n📦 3. Contas a Pagar (parcelas em aberto)");

  // STATUS: os dados reais ficam em CONTAS_PAG_REC_PARC
  // STATUS = null/'' = em aberto; existência de DATA_QUITACAO = pago
  const rawCP = await query(db, `
    SELECT
      P.NR_SEQ_GEN, P.CD_PAG_REC, P.NR_PARCELA,
      P.DATA_VENCIMENTO, P.DT_LANCTO, P.DT_EMISSAO,
      P.VL_PARCELA,
      P.CD_MOEDA, P.VL_COTACAO, P.ST_COTACAO_FIXA,
      P.DATA_QUITACAO,
      P.STATUS,
      P.OBS AS OBSERVACAO,
      P.CD_PESSOA,
      P.CD_CONTA,
      P.CD_SAFRA,
      P.CD_EMPREEND,
      TRIM(PS.NOME) AS PESSOA_NOME,
      TRIM(PS.PJ_CNPJ) AS PESSOA_CNPJ,
      TRIM(PS.PF_CPF) AS PESSOA_CPF,
      TRIM(CB.DESCRICAO) AS CONTA_BANCARIA,
      TRIM(NR_DOCUMENTO) AS NR_DOCUMENTO,
      P.ORIGEM
    FROM CONTAS_PAG_REC_PARC P
    LEFT JOIN PESSOAS PS ON PS.CODIGO = P.CD_PESSOA
    LEFT JOIN CONTAS_BANCARIAS CB ON CB.CD_LOC_PAGAMENTO = P.CD_LOCAL_PAGAMENTO
    WHERE P.DATA_QUITACAO IS NULL
      AND (P.STATUS IS NULL OR P.STATUS = 'A' OR P.STATUS = '')
      AND P.OPERACAO_CONTA = 'P'
    ORDER BY P.DATA_VENCIMENTO
  `);

  const contasPagar = rawCP.map(p => ({
    ...p,
    MOEDA:          MOEDAS[p.CD_MOEDA] ?? ("MOEDA_" + p.CD_MOEDA),
    VALOR_BRL:      p.CD_MOEDA === 2 && p.VL_COTACAO
                      ? Number((p.VL_PARCELA * p.VL_COTACAO).toFixed(2))
                      : p.VL_PARCELA,
    COTACAO_USD:    p.CD_MOEDA === 2 ? p.VL_COTACAO : null,
    PESSOA_DOC_FMT: fmtDoc(p.PESSOA_CNPJ || p.PESSOA_CPF),
  }));
  salvar("contas_pagar_abertas", contasPagar);

  // ── 4. CONTAS BANCÁRIAS ───────────────────────────────────────────────────────
  console.log("\n📦 4. Contas Bancárias");

  const rawBancos = await query(db, `
    SELECT
      CB.CD_LOC_PAGAMENTO AS CD_CONTA, TRIM(CB.DESCRICAO) AS DESCRICAO,
      TRIM(CB.NUM_CONTA) AS NUM_CONTA, CB.CD_AGENCIA,
      CB.TIPO_CONTA
    FROM CONTAS_BANCARIAS CB
    ORDER BY CB.DESCRICAO
  `);
  salvar("contas_bancarias", rawBancos);

  // ── 5. CONTRATOS DE PRODUTO (todas as safras, destaque 2026/2027) ────────────
  console.log("\n📦 5. Contratos de Produto");

  const rawContratos = await query(db, `
    SELECT
      C.ID, TRIM(C.NUMERO) AS NUMERO,
      C.DATA, C.CD_SAFRA, C.CD_EMPREEND,
      C.CD_MOEDA, C.VALOR_COTACAO, C.ST_COTACAO_FIXA,
      C.VALOR_TOTAL, C.VALOR_TOTAL_FINANC,
      C.ST_TIPO, C.ST_TIPO_ES, C.ST_CONFIRMADO,
      TRIM(C.OBSERVACAO) AS OBSERVACAO,
      TRIM(PS.NOME) AS CLIENTE_NOME,
      TRIM(PS.PJ_CNPJ) AS CLIENTE_CNPJ,
      TRIM(S.DESCRICAO) AS SAFRA,
      TRIM(E.DESCRICAO) AS EMPREENDIMENTO
    FROM CONTRATOS C
    LEFT JOIN PESSOAS PS ON PS.CODIGO = C.CD_CLIENTE
    LEFT JOIN SAFRAS S ON S.CODIGO = C.CD_SAFRA
    LEFT JOIN EMPREENDIMENTOS E ON E.CD_EMPREEND = C.CD_EMPREEND
      AND E.CD_PRODUTOR = C.CD_PRODUTOR
    ORDER BY C.DATA DESC
  `);

  const contratos = rawContratos.map(c => ({
    ...c,
    MOEDA:      MOEDAS[c.CD_MOEDA] ?? ("MOEDA_" + c.CD_MOEDA),
    SAFRA_2627: c.CD_SAFRA === CD_SAFRA_2627,
  }));
  salvar("contratos_produto", contratos);

  // Itens dos contratos
  const rawItensContr = await query(db, `
    SELECT
      CI.ID_CONTRATO, CI.NR_SEQ_ITEM,
      TRIM(I.DESCRICAO) AS PRODUTO,
      CI.CD_ITEM, CI.CD_UNIDADE,
      CI.QUANTIDADE, CI.VALOR_UNITARIO, CI.VALOR_TOTAL,
      CI.AREA_PLANTIO, CI.STATUS
    FROM CONTRATOS_ITENS CI
    LEFT JOIN ITENS_ESTOQUE I ON I.ID = CI.ID_ITEM
    ORDER BY CI.ID_CONTRATO, CI.NR_SEQ_ITEM
  `);

  const itensContr = rawItensContr.map(i => ({
    ...i,
    UNIDADE: unidMap[i.CD_UNIDADE] ?? i.CD_UNIDADE,
  }));
  salvar("contratos_produto_itens", itensContr);

  // ── 6. CONTRATOS FINANCEIROS (DIVIDAS_CAB) ───────────────────────────────────
  console.log("\n📦 6. Contratos Financeiros");
  // DIVIDAS_CAB está vazia neste banco — registra apenas
  salvar("contratos_financeiros", []);
  salvar("contratos_financeiros_parcelas", []);
  console.log("  ℹ️  Nenhum contrato financeiro encontrado no banco");

  // ── 7. PEDIDOS DE COMPRA (safra 2026/2027) ────────────────────────────────────
  console.log("\n📦 7. Pedidos de Compra");

  const rawPedidos = await query(db, `
    SELECT
      PC.ID, TRIM(PC.NRO_PEDIDO) AS NRO_PEDIDO,
      PC.DATA_REGISTRO, PC.DATA_ENTREGA_TOTAL,
      PC.CD_SAFRA, TRIM(S.DESCRICAO) AS SAFRA,
      PC.CD_MOEDA, PC.VL_COTACAO, PC.ST_COTACAO_FIXA,
      PC.VALOR_TOTAL_LIQUIDO, PC.VALOR_TOTAL_LIQ_CONV,
      PC.ST_CANCELADO, PC.ST_CONFIRMADO,
      TRIM(PC.OBSERVACOES) AS OBSERVACOES,
      TRIM(PS.NOME) AS FORNECEDOR_NOME,
      TRIM(PS.PJ_CNPJ) AS FORNECEDOR_CNPJ
    FROM PEDIDOS_COMPRA PC
    LEFT JOIN PESSOAS PS ON PS.CODIGO = PC.CD_FORNECEDOR
    LEFT JOIN SAFRAS S ON S.CODIGO = PC.CD_SAFRA
    WHERE PC.ST_CANCELADO = 'N'
    ORDER BY PC.DATA_REGISTRO DESC
  `);

  const pedidos = rawPedidos.map(p => ({
    ...p,
    MOEDA:      MOEDAS[p.CD_MOEDA] ?? ("MOEDA_" + p.CD_MOEDA),
    SAFRA_2627: p.CD_SAFRA === CD_SAFRA_2627,
  }));
  salvar("pedidos_compra", pedidos);

  // Itens dos pedidos
  const rawItensPed = await query(db, `
    SELECT
      IP.ID, IP.ID_PED_COMPRA,
      TRIM(I.DESCRICAO) AS PRODUTO,
      IP.CD_ITEM, IP.CD_UNIDADE,
      IP.QUANTIDADE, IP.QUANT_CONVERTIDA,
      IP.VALOR_UNITARIO, IP.VALOR_TOTAL,
      IP.CD_MOEDA, IP.VALOR_TOTAL_CONVERTIDO,
      IP.CD_EMPREENDIMENTO,
      TRIM(E.DESCRICAO) AS EMPREENDIMENTO,
      IP.ST_FECHADO
    FROM ITENS_PED_COMPRA IP
    LEFT JOIN ITENS_ESTOQUE I ON I.ID = IP.ID_ITEM_ESTOQUE
    LEFT JOIN EMPREENDIMENTOS E ON E.CD_EMPREEND = IP.CD_EMPREENDIMENTO
      AND E.CD_PRODUTOR = IP.CD_PRODUTOR
    ORDER BY IP.ID_PED_COMPRA, IP.ID
  `);

  const itensPed = rawItensPed.map(i => ({
    ...i,
    UNIDADE: unidMap[i.CD_UNIDADE] ?? i.CD_UNIDADE,
    MOEDA:   MOEDAS[i.CD_MOEDA] ?? ("MOEDA_" + i.CD_MOEDA),
  }));
  salvar("pedidos_compra_itens", itensPed);

  // ── 8. BARTER (vazio neste banco) ─────────────────────────────────────────────
  console.log("\n📦 8. Barter");
  salvar("barter", []);
  console.log("  ℹ️  Nenhum contrato barter encontrado no banco");

  // ── 9. EMPREENDIMENTOS (= Ciclos no Arato) ────────────────────────────────────
  console.log("\n📦 9. Empreendimentos → Ciclos");

  const empreend = await query(db, `
    SELECT
      E.CD_EMPREEND, TRIM(E.DESCRICAO) AS DESCRICAO,
      E.CD_SAFRA, TRIM(S.DESCRICAO) AS SAFRA,
      E.CD_PROPRIEDADE, TRIM(PR.DESCRICAO) AS PROPRIEDADE,
      E.DATA_INICIO, E.DATA_TERMINO,
      E.AREA_TOTAL, E.PRODUTIVIDADE, E.PRODUCAO,
      E.CD_MOEDA AS MOEDA_PRECO,
      E.VL_MEDIO_VENDA, E.VL_MEDIO_VENDA_CONV,
      E.ST_ATIVO, E.ST_ENCERRADO,
      E.TIPO_EMPREEND
    FROM EMPREENDIMENTOS E
    LEFT JOIN SAFRAS S ON S.CODIGO = E.CD_SAFRA
    LEFT JOIN PROPRIEDADES PR ON PR.CD_PROPRIEDADE = E.CD_PROPRIEDADE
    ORDER BY E.DATA_INICIO DESC, E.DESCRICAO
  `);

  const empreendMap = empreend.map(e => ({
    ...e,
    MOEDA_PRECO: MOEDAS[e.MOEDA_PRECO] ?? ("MOEDA_" + e.MOEDA_PRECO),
    SAFRA_2627:  e.CD_SAFRA === CD_SAFRA_2627,
  }));
  salvar("empreendimentos", empreendMap);

  // ── 10. SAFRAS ─────────────────────────────────────────────────────────────────
  console.log("\n📦 10. Safras");
  const safras = await query(db, "SELECT CODIGO, TRIM(DESCRICAO) AS DESCRICAO, DATA_INICIAL, DATA_FINAL FROM SAFRAS ORDER BY DATA_INICIAL DESC");
  salvar("safras", safras);

  // ── 11. PROPRIEDADES + GLEBAS ──────────────────────────────────────────────────
  console.log("\n📦 11. Propriedades (Fazendas) e Glebas (Talhões)");

  const props = await query(db, `
    SELECT
      PR.CD_PROPRIEDADE, TRIM(PR.DESCRICAO) AS DESCRICAO,
      TRIM(PR.ABREVIATURA) AS ABREVIATURA,
      TRIM(PR.LOCALIZACAO) AS LOCALIZACAO,
      PR.CIDADE AS CD_CIDADE,
      TRIM(PR.MATRICULA) AS MATRICULA,
      PR.AREA_TOTAL, PR.ST_ATIVO
    FROM PROPRIEDADES PR
    ORDER BY PR.DESCRICAO
  `);

  const propsMap = props.map(p => ({
    ...p,
    CIDADE: cidNome(p.CD_CIDADE),
    ESTADO: ufNome(p.CD_CIDADE),
  }));
  salvar("propriedades", propsMap);

  const glebas = await query(db, `
    SELECT
      G.CD_GLEBA, G.CD_PROPRIEDADE,
      TRIM(G.DESCRICAO) AS DESCRICAO,
      G.AREA_TOTAL, G.AREA_PROPRIA, G.AREA_ARRENDADA,
      G.ST_ATIVO
    FROM GLEBAS G
    ORDER BY G.CD_PROPRIEDADE, G.DESCRICAO
  `);
  salvar("glebas", glebas);

  // ── 12. MOEDAS + cotações recentes ────────────────────────────────────────────
  console.log("\n📦 12. Moedas");
  const moedas = await query(db, "SELECT * FROM MOEDAS ORDER BY CD_MOEDA");
  salvar("moedas", moedas);

  // ── Resumo ─────────────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log("📊 RESUMO DA EXTRAÇÃO");
  console.log("─".repeat(60));
  console.log(`Pessoas (forn+clientes): ${pessoas.length}`);
  console.log(`Produtos ativos:         ${produtos.length}`);
  console.log(`CP em aberto:            ${contasPagar.length}`);
  console.log(`  ↳ em BRL:              ${contasPagar.filter(p=>p.CD_MOEDA===1).length}`);
  console.log(`  ↳ em USD:              ${contasPagar.filter(p=>p.CD_MOEDA===2).length}`);
  const outrasM = [...new Set(contasPagar.filter(p=>p.CD_MOEDA!==1&&p.CD_MOEDA!==2).map(p=>MOEDAS[p.CD_MOEDA]))];
  if(outrasM.length) console.log(`  ↳ outras moedas:       ${outrasM.join(', ')}`);
  console.log(`Contas bancárias:        ${rawBancos.length}`);
  console.log(`Contratos produto:       ${contratos.length}`);
  console.log(`  ↳ safra 2026/2027:     ${contratos.filter(c=>c.SAFRA_2627).length}`);
  console.log(`Pedidos de compra:       ${pedidos.length}`);
  console.log(`  ↳ safra 2026/2027:     ${pedidos.filter(p=>p.SAFRA_2627).length}`);
  console.log(`Empreendimentos:         ${empreend.length}`);
  console.log(`  ↳ safra 2026/2027:     ${empreend.filter(e=>e.SAFRA_2627).length}`);
  console.log(`Propriedades:            ${props.length}`);
  console.log(`Glebas (talhões):        ${glebas.length}`);
  console.log("─".repeat(60));
}

// ── Conexão ──────────────────────────────────────────────────────────────────
console.log("🔌 Conectando ao Firebird...");
Firebird.attach(OPTIONS, async (err, db) => {
  if (err) {
    console.error("❌ Erro ao conectar:", err.message);
    console.error("   Verifique: docker ps | grep fb25");
    process.exit(1);
  }
  console.log("✅ Conectado!\n");
  try {
    await extrair(db);
    console.log("\n🎉 Concluído! Arquivos em: scripts/migracao/dados/");
    console.log("📋 Próximo: node scripts/migracao/02-preview-migracao.js");
  } catch (e) {
    console.error("\n❌ Erro:", e.message);
  } finally {
    db.detach();
  }
});
