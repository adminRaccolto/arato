/**
 * Extração COMPLETA do banco Agro1 (Firebird) do cliente Hábio Marciano Pereira
 * Container Docker: fb25_habio_sc, porta 13055
 * Arquivo: /firebird/data/AG2006.fdb (234MB, Firebird 2.5, ODS 11.2, charset NONE/Win1252)
 *
 * ENCODING: Todos os campos de texto usam CAST(campo AS VARCHAR(n) CHARACTER SET ISO8859_1)
 *           para forçar a conversão correta de Win1252 → UTF-8.
 *
 * Uso: node scripts/migracao/01-extrair-habio.js
 * Saída: scripts/migracao/dados_habio/
 */

const Firebird = require("node-firebird");
const fs       = require("fs");
const path     = require("path");

const OPTIONS = {
  host:           "127.0.0.1",
  port:           13055,
  database:       "/firebird/data/AG2006.fdb",
  user:           "SYSDBA",
  password:       "masterkey",
  lowercase_keys: false,
};

// Helper: CAST de texto para ISO8859_1 (resolve acentos Win1252)
const c = (campo, len = 200) =>
  `TRIM(CAST(${campo} AS VARCHAR(${len}) CHARACTER SET ISO8859_1))`;

// Moedas do Agro1
const MOEDAS = {
  1:  "BRL",
  2:  "USD",
  3:  "UFE",
  4:  "UPF",
  5:  "SC_SOJA",
  6:  "SC_MILHO",
  7:  "SC_ALGODAO",
  8:  "LLE",
  9:  "ARROBA",
  10: "BRL",
};

const OUT_DIR = path.join(__dirname, "dados_habio");
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function query(db, sql, params = []) {
  return new Promise((res, rej) =>
    db.query(sql, params, (err, result) => {
      if (err) {
        console.error("  SQL ERR:", err.message.split("\n")[0]);
        console.error("  SQL:", sql.slice(0, 160));
        rej(err);
      } else {
        res(result ?? []);
      }
    })
  );
}

function salvar(nome, dados) {
  const arquivo = path.join(OUT_DIR, `${nome}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), "utf8");
  console.log(`  ✅ ${nome}.json — ${dados.length} registros`);
  return dados;
}

function iso(d) {
  if (!d) return null;
  try { return new Date(d).toISOString().slice(0, 10); }
  catch { return null; }
}

function fmtCpfCnpj(doc) {
  if (!doc) return null;
  const d = String(doc).replace(/\D/g, "");
  if (d.length === 14) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
  if (d.length === 11) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  if (d.length > 0)   return d;
  return null;
}

// ── Extração ────────────────────────────────────────────────────────────────
async function extrair(db) {

  // ══════════════════════════════════════════════════════
  // 0. TABELAS DE REFERÊNCIA
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 0. Tabelas de Referência ═══");

  const cidades = await query(db, `
    SELECT CODIGO, ${c("NOME",100)} AS NOME, ID_UF FROM CIDADES`);
  const estados = await query(db, `
    SELECT ID, ${c("UF",5)} AS UF, ${c("UF_NOME",80)} AS UF_NOME FROM ESTADOS_UF`);
  const cidMap  = Object.fromEntries(cidades.map(c => [c.CODIGO, c]));
  const ufMap   = Object.fromEntries(estados.map(e => [e.ID, e.UF]));
  const cidNome = (cod) => cidMap[cod]?.NOME ?? null;
  const ufNome  = (cod) => ufMap[cidMap[cod]?.ID_UF] ?? null;
  console.log(`  📌 ${cidades.length} cidades, ${estados.length} estados`);

  const unidades = await query(db, `
    SELECT CODIGO AS CD_UNIDADE,
           ${c("DESCRICAO",60)} AS DESCRICAO,
           ${c("ABREVIATURA",15)} AS ABREVIATURA
    FROM UNIDADESMEDIDA`);
  const unidMap = Object.fromEntries(
    unidades.map(u => [u.CD_UNIDADE, (u.ABREVIATURA || u.DESCRICAO || "").trim()])
  );
  salvar("referencias_unidades", unidades);

  const safras = await query(db, `
    SELECT CODIGO, ${c("DESCRICAO",50)} AS DESCRICAO,
           DATA_INICIAL, DATA_FINAL
    FROM SAFRAS ORDER BY DATA_INICIAL`);
  const safraDescMap = Object.fromEntries(safras.map(s => [s.CODIGO, s.DESCRICAO]));
  salvar("safras", safras.map(s => ({
    CODIGO:       s.CODIGO,
    DESCRICAO:    s.DESCRICAO,
    DATA_INICIAL: iso(s.DATA_INICIAL),
    DATA_FINAL:   iso(s.DATA_FINAL),
  })));

  // ══════════════════════════════════════════════════════
  // 1. PROPRIEDADES (Fazendas)
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 1. Propriedades (Fazendas) ═══");

  const props = await query(db, `
    SELECT
      PR.CD_PROPRIEDADE,
      ${c("PR.DESCRICAO",200)}   AS DESCRICAO,
      ${c("PR.ABREVIATURA",20)}  AS ABREVIATURA,
      ${c("PR.LOCALIZACAO",200)} AS LOCALIZACAO,
      PR.CIDADE AS CD_CIDADE,
      ${c("PR.CEP",10)}          AS CEP,
      ${c("PR.ENDERECO",200)}    AS ENDERECO,
      ${c("PR.NUMERO",20)}       AS NUMERO,
      ${c("PR.COMPLEMENTO",100)} AS COMPLEMENTO,
      ${c("PR.BAIRRO",100)}      AS BAIRRO,
      PR.AREA_TOTAL,
      PR.ST_ATIVO,
      PR.AREA_TOTAL
    FROM PROPRIEDADES PR
    ORDER BY PR.CD_PROPRIEDADE`);

  salvar("propriedades", props.map(p => ({
    CD_PROPRIEDADE: p.CD_PROPRIEDADE,
    DESCRICAO:      p.DESCRICAO,
    ABREVIATURA:    p.ABREVIATURA,
    CIDADE:         cidNome(p.CD_CIDADE),
    ESTADO:         ufNome(p.CD_CIDADE),
    CEP:            p.CEP,
    ENDERECO:       p.ENDERECO,
    NUMERO:         p.NUMERO,
    COMPLEMENTO:    p.COMPLEMENTO,
    BAIRRO:         p.BAIRRO,
    AREA_TOTAL:     p.AREA_TOTAL,
    ST_ATIVO:       p.ST_ATIVO,
  })));

  // ══════════════════════════════════════════════════════
  // 2. GLEBAS (Talhões)
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 2. Glebas (Talhões) ═══");

  const glebas = await query(db, `
    SELECT
      G.CD_GLEBA, G.CD_PROPRIEDADE,
      ${c("G.DESCRICAO",100)} AS DESCRICAO,
      G.AREA_TOTAL, G.AREA_PROPRIA, G.AREA_ARRENDADA,
      G.ST_ATIVO
    FROM GLEBAS G
    ORDER BY G.CD_PROPRIEDADE, G.DESCRICAO`);

  salvar("glebas", glebas);

  // ══════════════════════════════════════════════════════
  // 3. EMPREENDIMENTOS (Ciclos de Safra)
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 3. Empreendimentos (Ciclos) ═══");

  const empreend = await query(db, `
    SELECT
      E.CD_EMPREEND, E.CD_PROPRIEDADE,
      ${c("E.DESCRICAO",200)}      AS DESCRICAO,
      E.CD_SAFRA,
      ${c("S.DESCRICAO",50)}       AS SAFRA_DESC,
      ${c("PR.DESCRICAO",200)}     AS PROPRIEDADE_NOME,
      E.DATA_INICIO, E.DATA_TERMINO,
      E.AREA_TOTAL, E.PRODUTIVIDADE, E.PRODUCAO,
      E.CD_MOEDA AS MOEDA_PRECO,
      E.VL_MEDIO_VENDA, E.VL_MEDIO_VENDA_CONV,
      E.ST_ATIVO, E.ST_ENCERRADO,
      ${c("E.TIPO_EMPREEND",20)}   AS TIPO_EMPREEND
    FROM EMPREENDIMENTOS E
    LEFT JOIN SAFRAS S ON S.CODIGO = E.CD_SAFRA
    LEFT JOIN PROPRIEDADES PR ON PR.CD_PROPRIEDADE = E.CD_PROPRIEDADE
    ORDER BY E.DATA_INICIO DESC, E.DESCRICAO`);

  salvar("empreendimentos", empreend.map(e => ({
    CD_EMPREEND:      e.CD_EMPREEND,
    CD_PROPRIEDADE:   e.CD_PROPRIEDADE,
    PROPRIEDADE_NOME: e.PROPRIEDADE_NOME,
    DESCRICAO:        e.DESCRICAO,
    CD_SAFRA:         e.CD_SAFRA,
    SAFRA_DESC:       e.SAFRA_DESC,
    DATA_INICIO:      iso(e.DATA_INICIO),
    DATA_TERMINO:     iso(e.DATA_TERMINO),
    AREA_TOTAL:       e.AREA_TOTAL,
    PRODUTIVIDADE:    e.PRODUTIVIDADE,
    PRODUCAO:         e.PRODUCAO,
    MOEDA_PRECO:      MOEDAS[e.MOEDA_PRECO] ?? ("MOEDA_" + e.MOEDA_PRECO),
    VL_MEDIO_VENDA:   e.VL_MEDIO_VENDA,
    VL_MEDIO_VENDA_CONV: e.VL_MEDIO_VENDA_CONV,
    ST_ATIVO:         e.ST_ATIVO,
    ST_ENCERRADO:     e.ST_ENCERRADO,
    TIPO_EMPREEND:    e.TIPO_EMPREEND,
  })));

  // Vínculo Empreendimento ↔ Gleba
  const empGlebas = await query(db, `
    SELECT CD_EMPREEND, CD_GLEBA FROM EMPREENDIMENTOS_GLEBAS
    ORDER BY CD_EMPREEND, CD_GLEBA`);
  salvar("empreendimentos_glebas", empGlebas);

  // ══════════════════════════════════════════════════════
  // 4. PESSOAS (Fornecedores + Clientes + Produtores)
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 4. Pessoas ═══");

  const rawPessoas = await query(db, `
    SELECT
      P.CODIGO,
      ${c("P.NOME",200)}           AS NOME,
      ${c("P.NOME_FANTASIA",200)}  AS NOME_FANTASIA,
      P.PESSOA,
      ${c("P.PF_CPF",20)}          AS PF_CPF,
      ${c("P.PJ_CNPJ",20)}         AS PJ_CNPJ,
      ${c("P.PJ_INSC_ESTAD",30)}   AS PJ_INSC_ESTAD,
      ${c("P.ENDERECO",200)}       AS ENDERECO,
      ${c("P.BAIRRO",100)}         AS BAIRRO,
      ${c("P.CEP",10)}             AS CEP,
      ${c("P.NUMERO",20)}          AS NUMERO,
      ${c("P.FONE1",30)}           AS FONE1,
      ${c("P.FONE2",30)}           AS FONE2,
      ${c("P.EMAIL",100)}          AS EMAIL,
      P.CIDADE AS CD_CIDADE,
      CASE WHEN PF.CODIGO IS NOT NULL THEN 1 ELSE 0 END AS IS_FORNECEDOR,
      CASE WHEN PC.CODIGO IS NOT NULL THEN 1 ELSE 0 END AS IS_CLIENTE,
      CASE WHEN PP.CODIGO IS NOT NULL THEN 1 ELSE 0 END AS IS_PRODUTOR
    FROM PESSOAS P
    LEFT JOIN PESSOAS_FORNECEDORES PF ON PF.CODIGO = P.CODIGO
    LEFT JOIN PESSOAS_CLIENTES     PC ON PC.CODIGO = P.CODIGO
    LEFT JOIN PESSOAS_PRODUTORES   PP ON PP.CODIGO = P.CODIGO
    ORDER BY P.NOME`);

  const pessoas = rawPessoas.map(p => ({
    CODIGO:         p.CODIGO,
    NOME:           p.NOME,
    NOME_FANTASIA:  p.NOME_FANTASIA || null,
    TIPO:           p.PESSOA === "F" ? "pf" : "pj",
    CPF:            (p.PF_CPF || "").replace(/\D/g, "") || null,
    CNPJ:           (p.PJ_CNPJ || "").replace(/\D/g, "") || null,
    CPF_CNPJ_RAW:   (p.PJ_CNPJ || p.PF_CPF || "").replace(/\D/g, "") || null,
    CPF_CNPJ_FMT:   fmtCpfCnpj(p.PJ_CNPJ || p.PF_CPF),
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
    FORNECEDOR:     p.IS_FORNECEDOR === 1,
    CLIENTE:        p.IS_CLIENTE === 1,
    PRODUTOR:       p.IS_PRODUTOR === 1,
  }));
  salvar("pessoas", pessoas);

  // ══════════════════════════════════════════════════════
  // 5. CONTAS BANCÁRIAS
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 5. Contas Bancárias ═══");

  const bancos = await query(db, `
    SELECT
      CB.CD_LOC_PAGAMENTO AS CD_CONTA,
      ${c("CB.DESCRICAO",100)}  AS DESCRICAO,
      ${c("CB.NUM_CONTA",30)}   AS NUM_CONTA,
      CB.CD_AGENCIA,
      ${c("CB.TIPO_CONTA",20)}  AS TIPO_CONTA
    FROM CONTAS_BANCARIAS CB
    ORDER BY CB.DESCRICAO`);
  salvar("contas_bancarias", bancos);

  // ══════════════════════════════════════════════════════
  // 6. CONTAS A PAGAR/RECEBER — EM ABERTO
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 6. Contas a Pagar/Receber em Aberto ═══");

  const cpcrAberto = await query(db, `
    SELECT
      P.NR_SEQ_GEN,
      P.CD_PAG_REC,
      P.NR_PARCELA,
      P.OPERACAO_CONTA,
      P.DATA_VENCIMENTO,
      P.DT_LANCTO,
      P.DT_EMISSAO,
      P.VL_PARCELA,
      P.VL_TOTAL,
      P.VL_TOTAL_CONV,
      P.VL_PARCELA_CONV,
      P.CD_MOEDA,
      P.VL_COTACAO,
      P.ST_COTACAO_FIXA,
      P.DATA_QUITACAO,
      P.STATUS,
      SUBSTRING(P.OBS FROM 1 FOR 1000) AS OBS,
      ${c("P.NR_DOCUMENTO",50)}       AS NR_DOCUMENTO,
      P.CD_PESSOA,
      ${c("PS.NOME",200)}             AS PESSOA_NOME,
      ${c("PS.PJ_CNPJ",20)}           AS PESSOA_CNPJ,
      ${c("PS.PF_CPF",20)}            AS PESSOA_CPF,
      P.CD_LOCAL_PAGAMENTO,
      ${c("CB.DESCRICAO",100)}        AS CONTA_BANCARIA,
      P.CD_SAFRA,
      P.CD_EMPREEND,
      P.CD_PROPRIEDADE,
      P.ORIGEM,
      P.ST_TIPO_DOCUMENTO,
      P.ST_PREVISAO
    FROM CONTAS_PAG_REC_PARC P
    LEFT JOIN PESSOAS PS ON PS.CODIGO = P.CD_PESSOA
    LEFT JOIN CONTAS_BANCARIAS CB ON CB.CD_LOC_PAGAMENTO = P.CD_LOCAL_PAGAMENTO
    WHERE P.DATA_QUITACAO IS NULL
      AND (P.STATUS IS NULL OR P.STATUS = 'A' OR P.STATUS = '')
      AND (P.ST_PREVISAO IS NULL OR P.ST_PREVISAO = 'N')
    ORDER BY P.OPERACAO_CONTA, P.DATA_VENCIMENTO`);

  salvar("cpcr_em_aberto", cpcrAberto.map(p => ({
    NR_SEQ_GEN:      p.NR_SEQ_GEN,
    OPERACAO:        p.OPERACAO_CONTA === "P" ? "pagar" : "receber",
    NR_PARCELA:      p.NR_PARCELA,
    VENCIMENTO:      iso(p.DATA_VENCIMENTO),
    LANCAMENTO:      iso(p.DT_LANCTO) ?? iso(p.DT_EMISSAO),
    VL_PARCELA:      p.VL_PARCELA,
    VL_TOTAL:        p.VL_TOTAL,
    VL_PARCELA_CONV: p.VL_PARCELA_CONV,
    MOEDA:           MOEDAS[p.CD_MOEDA] ?? ("MOEDA_" + p.CD_MOEDA),
    CD_MOEDA:        p.CD_MOEDA,
    VL_COTACAO:      p.VL_COTACAO,
    ST_COTACAO_FIXA: p.ST_COTACAO_FIXA,
    NR_DOCUMENTO:    p.NR_DOCUMENTO,
    CD_PESSOA:       p.CD_PESSOA,
    PESSOA_NOME:     p.PESSOA_NOME,
    PESSOA_DOC:      fmtCpfCnpj(p.PESSOA_CNPJ || p.PESSOA_CPF),
    CD_LOCAL_PAG:    p.CD_LOCAL_PAGAMENTO,
    CONTA_BANCARIA:  p.CONTA_BANCARIA,
    CD_SAFRA:        p.CD_SAFRA,
    SAFRA_DESC:      safraDescMap[p.CD_SAFRA] ?? null,
    CD_EMPREEND:     p.CD_EMPREEND,
    CD_PROPRIEDADE:  p.CD_PROPRIEDADE,
    ORIGEM:          p.ORIGEM,
    OBS:             p.OBS,
  })));

  // ══════════════════════════════════════════════════════
  // 7. HISTÓRICO CP/CR — PAGOS/RECEBIDOS
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 7. Histórico CP/CR (Pagos/Recebidos) ═══");

  // Extrai historico em batches para evitar overflow do Firebird com JOINs grandes
  const pessoaNomeMap = Object.fromEntries(pessoas.map(p => [p.CODIGO, p.NOME]));
  const contaBancoMap = Object.fromEntries(bancos.map(b => [b.CD_CONTA, b.DESCRICAO]));

  const HIST_TOTAL = 4028;
  const HIST_BATCH = 500;
  const cpcrHist = [];
  console.log(`  Extraindo ${HIST_TOTAL} registros em batches de ${HIST_BATCH}...`);

  for (let skip = 0; skip < HIST_TOTAL + HIST_BATCH; skip += HIST_BATCH) {
    const batch = await query(db, `
      SELECT FIRST ${HIST_BATCH} SKIP ${skip}
        P.NR_SEQ_GEN,
        P.OPERACAO_CONTA,
        P.NR_PARCELA,
        P.DATA_VENCIMENTO,
        P.DATA_QUITACAO,
        P.DT_LANCTO,
        P.DT_EMISSAO,
        P.VL_PARCELA,
        P.VL_TOTAL,
        P.VL_PARCELA_CONV,
        P.VL_REC_PAG,
        P.VL_ACRESC_BAIXA,
        P.VL_DESC_BAIXA,
        P.CD_MOEDA,
        P.VL_COTACAO,
        SUBSTRING(P.OBS FROM 1 FOR 1000) AS OBS,
        SUBSTRING(P.NR_DOCUMENTO FROM 1 FOR 50) AS NR_DOCUMENTO,
        P.CD_PESSOA,
        P.CD_LOCAL_PAGAMENTO,
        P.CD_SAFRA,
        P.CD_EMPREEND,
        P.CD_PROPRIEDADE,
        P.ORIGEM
      FROM CONTAS_PAG_REC_PARC P
      WHERE P.DATA_QUITACAO IS NOT NULL
      ORDER BY P.DATA_QUITACAO DESC, P.OPERACAO_CONTA`);
    if (!batch.length) break;
    cpcrHist.push(...batch);
    process.stdout.write(`\r  ↳ ${cpcrHist.length} registros...`);
  }
  console.log("");

  salvar("cpcr_historico_pago", cpcrHist.map(p => ({
    NR_SEQ_GEN:      p.NR_SEQ_GEN,
    OPERACAO:        p.OPERACAO_CONTA === "P" ? "pagar" : "receber",
    NR_PARCELA:      p.NR_PARCELA,
    VENCIMENTO:      iso(p.DATA_VENCIMENTO),
    DATA_QUITACAO:   iso(p.DATA_QUITACAO),
    LANCAMENTO:      iso(p.DT_LANCTO) ?? iso(p.DT_EMISSAO),
    VL_PARCELA:      p.VL_PARCELA,
    VL_REC_PAG:      p.VL_REC_PAG,
    VL_ACRESC:       p.VL_ACRESC_BAIXA,
    VL_DESC:         p.VL_DESC_BAIXA,
    MOEDA:           MOEDAS[p.CD_MOEDA] ?? ("MOEDA_" + p.CD_MOEDA),
    CD_MOEDA:        p.CD_MOEDA,
    VL_COTACAO:      p.VL_COTACAO,
    NR_DOCUMENTO:    p.NR_DOCUMENTO ? String(p.NR_DOCUMENTO).trim() : null,
    CD_PESSOA:       p.CD_PESSOA,
    PESSOA_NOME:     pessoaNomeMap[p.CD_PESSOA] ?? null,
    CD_LOCAL_PAG:    p.CD_LOCAL_PAGAMENTO,
    CONTA_BANCARIA:  contaBancoMap[p.CD_LOCAL_PAGAMENTO] ?? null,
    CD_SAFRA:        p.CD_SAFRA,
    SAFRA_DESC:      safraDescMap[p.CD_SAFRA] ?? null,
    CD_EMPREEND:     p.CD_EMPREEND,
    CD_PROPRIEDADE:  p.CD_PROPRIEDADE,
    ORIGEM:          p.ORIGEM,
    OBS:             p.OBS ? String(p.OBS).trim() : null,
  })));

  // ══════════════════════════════════════════════════════
  // 8. ARRENDAMENTOS
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 8. Arrendamentos ═══");

  const arrend = await query(db, `
    SELECT
      A.ID, A.NUMERO,
      A.DATA, A.VENCIMENTO,
      A.PROPRIETARIO_ARRENDAMENTE AS CD_PROPRIETARIO,
      ${c("PS.NOME",200)}             AS PROPRIETARIO_NOME,
      ${c("PS.PJ_CNPJ",20)}           AS PROPRIETARIO_CNPJ,
      ${c("PS.PF_CPF",20)}            AS PROPRIETARIO_CPF,
      ${c("A.LOCALIZACAO",200)}       AS LOCALIZACAO,
      A.AREA_ARRENDADA,
      A.VALOR,
      A.CD_MOEDA,
      A.QUANTIDADE,
      A.ST_ARECEBER_APAGAR,
      A.NR_PARCELAS_PAGTO,
      A.PERIODO_PAGTO_MESES,
      A.DATA_1_PAGTO,
      A.VALOR_CONVERTIDO,
      SUBSTRING(A.OBSERVACOES FROM 1 FOR 1000) AS OBSERVACOES,
      A.ST_QUITADO_TOTAL,
      A.CD_SAFRA,
      A.ST_GEROU_FINANCEIRO
    FROM ARRENDAMENTOS A
    LEFT JOIN PESSOAS PS ON PS.CODIGO = A.PROPRIETARIO_ARRENDAMENTE
    ORDER BY A.ID`);

  salvar("arrendamentos", arrend.map(a => ({
    ID:               a.ID,
    NUMERO:           a.NUMERO,
    DATA:             iso(a.DATA),
    VENCIMENTO:       iso(a.VENCIMENTO),
    CD_PROPRIETARIO:  a.CD_PROPRIETARIO,
    PROPRIETARIO_NOME: a.PROPRIETARIO_NOME,
    PROPRIETARIO_DOC: fmtCpfCnpj(a.PROPRIETARIO_CNPJ || a.PROPRIETARIO_CPF),
    LOCALIZACAO:      a.LOCALIZACAO,
    AREA_ARRENDADA:   a.AREA_ARRENDADA,
    VALOR:            a.VALOR,
    MOEDA:            MOEDAS[a.CD_MOEDA] ?? ("MOEDA_" + a.CD_MOEDA),
    CD_MOEDA:         a.CD_MOEDA,
    QUANTIDADE:       a.QUANTIDADE,
    TIPO_PAGTO:       a.ST_ARECEBER_APAGAR === "D" ? "debito" : "credito",
    NR_PARCELAS:      a.NR_PARCELAS_PAGTO,
    PERIODO_MESES:    a.PERIODO_PAGTO_MESES,
    DATA_1_PAGTO:     iso(a.DATA_1_PAGTO),
    VALOR_CONV:       a.VALOR_CONVERTIDO,
    OBSERVACOES:      a.OBSERVACOES,
    ST_QUITADO:       a.ST_QUITADO_TOTAL === "S",
    CD_SAFRA:         a.CD_SAFRA,
    SAFRA_DESC:       safraDescMap[a.CD_SAFRA] ?? null,
    ST_GEROU_FIN:     a.ST_GEROU_FINANCEIRO === "S",
  })));

  // Parcelas de arrendamento
  const arrendParc = await query(db, `
    SELECT
      AP.ID, AP.ID_ARRENDAMENTO,
      AP.NR_SEQ_PARCELA, AP.DATA_VENCIMENTO,
      AP.VL_PARCELA, AP.PE_VALOR, AP.NR_DIAS,
      AP.CD_SAFRA
    FROM ARRENDAMENTOS_PARC AP
    ORDER BY AP.ID_ARRENDAMENTO, AP.NR_SEQ_PARCELA`);

  salvar("arrendamentos_parcelas", arrendParc.map(ap => ({
    ID:               ap.ID,
    ID_ARRENDAMENTO:  ap.ID_ARRENDAMENTO,
    NR_PARCELA:       ap.NR_SEQ_PARCELA,
    VENCIMENTO:       iso(ap.DATA_VENCIMENTO),
    VALOR:            ap.VL_PARCELA,
    PE_VALOR:         ap.PE_VALOR,
    NR_DIAS:          ap.NR_DIAS,
    CD_SAFRA:         ap.CD_SAFRA,
    SAFRA_DESC:       safraDescMap[ap.CD_SAFRA] ?? null,
  })));

  // ══════════════════════════════════════════════════════
  // 9. MÁQUINAS
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 9. Máquinas ═══");

  const maquinas = await query(db, `
    SELECT
      M.ID,
      ${c("M.DESCRICAO",200)}    AS DESCRICAO,
      ${c("M.MODELO",100)}       AS MODELO,
      ${c("M.ABREVIATURA",30)}   AS ABREVIATURA,
      M.ANO_MODELO, M.ANO_FABRICACAO,
      ${c("M.PLACA",15)}         AS PLACA,
      ${c("M.CHASSI",50)}        AS CHASSI,
      ${c("M.RENAVAM",20)}       AS RENAVAM,
      ${c("M.COR",30)}           AS COR,
      ${c("M.UF_PLACA",5)}       AS UF_PLACA,
      ${c("M.ANTT",30)}          AS ANTT,
      M.CAPACIDADE_TANQUE,
      M.TARA, M.CAP_KG,
      ${c("M.TP_RODADO",20)}     AS TP_RODADO,
      ${c("M.TP_CARROCERIA",20)} AS TP_CARROCERIA,
      ${c("M.TP_VEICULO",20)}    AS TP_VEICULO,
      M.CD_PROPRIEDADE,
      SUBSTRING(M.OBS FROM 1 FOR 1000) AS OBS,
      M.HORIMETRO,
      M.NRO_HORIMETRO,
      M.DT_BAIXA,
      M.VALOR_GARANTIA,
      M.SEGURO,
      ${c("M.SEGURADORA",100)}   AS SEGURADORA,
      ${c("M.NUM_APOLICE",30)}   AS NUM_APOLICE,
      M.DT_VENC_SEGURO,
      ${c("M.STATUS_IRRIGACAO",20)} AS STATUS_IRRIGACAO
    FROM MAQUINAS M
    WHERE M.DT_BAIXA IS NULL
    ORDER BY M.DESCRICAO`);

  salvar("maquinas", maquinas.map(m => ({
    ID:            m.ID,
    DESCRICAO:     m.DESCRICAO,
    MODELO:        m.MODELO,
    ABREVIATURA:   m.ABREVIATURA,
    ANO_MODELO:    m.ANO_MODELO,
    ANO_FABRIC:    m.ANO_FABRICACAO,
    PLACA:         m.PLACA,
    CHASSI:        m.CHASSI,
    RENAVAM:       m.RENAVAM,
    COR:           m.COR,
    UF_PLACA:      m.UF_PLACA,
    ANTT:          m.ANTT,
    CAP_TANQUE:    m.CAPACIDADE_TANQUE,
    TARA:          m.TARA,
    CAP_KG:        m.CAP_KG,
    TP_RODADO:     m.TP_RODADO,
    TP_CARROCERIA: m.TP_CARROCERIA,
    TP_VEICULO:    m.TP_VEICULO,
    CD_PROPRIEDADE: m.CD_PROPRIEDADE,
    HORIMETRO:     m.NRO_HORIMETRO ?? m.HORIMETRO,
    VALOR_GARANTIA: m.VALOR_GARANTIA,
    SEGURO:        m.SEGURO,
    SEGURADORA:    m.SEGURADORA,
    NUM_APOLICE:   m.NUM_APOLICE,
    DT_VENC_SEGURO: iso(m.DT_VENC_SEGURO),
    OBS:           m.OBS,
  })));

  // ══════════════════════════════════════════════════════
  // 10. INSUMOS (Itens de Estoque)
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 10. Insumos (Itens de Estoque) ═══");

  const insumos = await query(db, `
    SELECT
      I.ID, I.CODIGO,
      ${c("I.DESCRICAO",300)}       AS DESCRICAO,
      ${c("I.GRUPO",100)}           AS GRUPO,
      I.CD_UNIDADE,
      I.QT_ESTOQUE_MINIMO,
      I.QT_ESTOQUE_MAXIMO,
      ${c("I.NCM",20)}              AS NCM,
      ${c("I.CODIGO_BARRAS",50)}    AS CODIGO_BARRAS,
      I.ST_ATIVO,
      ${c("I.TIPO",20)}             AS TIPO,
      ${c("I.PRINCIPIO_ATIVO",200)} AS PRINCIPIO_ATIVO,
      ${c("I.FABRICANTE",200)}      AS FABRICANTE
    FROM ITENS_ESTOQUE I
    ORDER BY I.DESCRICAO`);

  salvar("insumos", insumos.map(i => ({
    ID:             i.ID,
    CODIGO:         i.CODIGO,
    DESCRICAO:      i.DESCRICAO,
    GRUPO:          i.GRUPO,
    UNIDADE:        unidMap[i.CD_UNIDADE] ?? String(i.CD_UNIDADE ?? "un"),
    CD_UNIDADE:     i.CD_UNIDADE,
    NCM:            i.NCM,
    CODIGO_BARRAS:  i.CODIGO_BARRAS,
    ST_ATIVO:       i.ST_ATIVO,
    TIPO:           i.TIPO,
    PRINCIPIO_ATIVO: i.PRINCIPIO_ATIVO,
    FABRICANTE:     i.FABRICANTE,
    QT_MINIMO:      i.QT_ESTOQUE_MINIMO,
    QT_MAXIMO:      i.QT_ESTOQUE_MAXIMO,
  })));

  // Posição atual de estoque (saldo por item)
  console.log("\n  ↳ Calculando posição de estoque...");
  const posicaoEstq = await query(db, `
    SELECT
      M.CD_ITEM_ESTOQUE AS ID_ITEM,
      M.CD_DEPOSITO,
      SUM(M.QUANTIDADE * CASE WHEN M.OPERACAO_ESTOQUE = 'E' THEN 1 ELSE -1 END) AS SALDO,
      MAX(M.VL_UNITARIO) AS ULTIMO_PRECO
    FROM MOVTOESTQ M
    WHERE M.CD_ITEM_ESTOQUE IS NOT NULL
    GROUP BY M.CD_ITEM_ESTOQUE, M.CD_DEPOSITO
    HAVING SUM(M.QUANTIDADE * CASE WHEN M.OPERACAO_ESTOQUE = 'E' THEN 1 ELSE -1 END) > 0.001`);
  salvar("estoque_posicao", posicaoEstq);

  // ══════════════════════════════════════════════════════
  // 11. CONTRATOS DE PRODUTO
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 11. Contratos de Produto ═══");

  const contratos = await query(db, `
    SELECT
      C.ID,
      ${c("C.NUMERO",50)}          AS NUMERO,
      C.DATA, C.CD_SAFRA,
      ${c("S.DESCRICAO",50)}       AS SAFRA_DESC,
      C.CD_EMPREEND,
      ${c("E.DESCRICAO",200)}      AS EMPREEND_NOME,
      C.CD_MOEDA, C.VALOR_COTACAO, C.ST_COTACAO_FIXA,
      C.VALOR_TOTAL, C.VALOR_TOTAL_FINANC,
      ${c("C.ST_TIPO",5)}          AS ST_TIPO,
      ${c("C.ST_TIPO_ES",5)}       AS ST_TIPO_ES,
      C.ST_CONFIRMADO,
      C.CD_CLIENTE,
      ${c("PS.NOME",200)}          AS CLIENTE_NOME,
      ${c("PS.PJ_CNPJ",20)}        AS CLIENTE_CNPJ,
      SUBSTRING(C.OBSERVACAO FROM 1 FOR 2000) AS OBSERVACAO,
      C.CD_PROPRIEDADE
    FROM CONTRATOS C
    LEFT JOIN PESSOAS PS ON PS.CODIGO = C.CD_CLIENTE
    LEFT JOIN SAFRAS S ON S.CODIGO = C.CD_SAFRA
    LEFT JOIN EMPREENDIMENTOS E ON E.CD_EMPREEND = C.CD_EMPREEND AND E.CD_PRODUTOR = C.CD_PRODUTOR
    ORDER BY C.DATA DESC`);

  salvar("contratos", contratos.map(c2 => ({
    ID:              c2.ID,
    NUMERO:          c2.NUMERO,
    DATA:            iso(c2.DATA),
    CD_SAFRA:        c2.CD_SAFRA,
    SAFRA_DESC:      c2.SAFRA_DESC,
    CD_EMPREEND:     c2.CD_EMPREEND,
    EMPREEND_NOME:   c2.EMPREEND_NOME,
    MOEDA:           MOEDAS[c2.CD_MOEDA] ?? ("MOEDA_" + c2.CD_MOEDA),
    CD_MOEDA:        c2.CD_MOEDA,
    VALOR_COTACAO:   c2.VALOR_COTACAO,
    ST_COTACAO_FIXA: c2.ST_COTACAO_FIXA,
    VALOR_TOTAL:     c2.VALOR_TOTAL,
    VALOR_FINANC:    c2.VALOR_TOTAL_FINANC,
    TIPO:            c2.ST_TIPO,
    TIPO_ES:         c2.ST_TIPO_ES,
    CONFIRMADO:      c2.ST_CONFIRMADO === "S",
    CD_CLIENTE:      c2.CD_CLIENTE,
    CLIENTE_NOME:    c2.CLIENTE_NOME,
    CLIENTE_DOC:     fmtCpfCnpj(c2.CLIENTE_CNPJ),
    OBSERVACAO:      c2.OBSERVACAO,
    CD_PROPRIEDADE:  c2.CD_PROPRIEDADE,
  })));

  // Itens de contratos
  const contItens = await query(db, `
    SELECT
      CI.ID_CONTRATO,
      CI.NR_SEQ_ITEM,
      CI.CD_ITEM,
      CI.ID_ITEM,
      ${c("IE.DESCRICAO",300)}   AS PRODUTO,
      CI.CD_UNIDADE,
      CI.QUANTIDADE,
      CI.QUANTIDADE_KG,
      CI.VALOR_UNITARIO,
      CI.VALOR_TOTAL,
      CI.AREA_PLANTIO,
      ${c("CI.STATUS",20)}       AS STATUS
    FROM CONTRATOS_ITENS CI
    LEFT JOIN ITENS_ESTOQUE IE ON IE.ID = CI.ID_ITEM
    ORDER BY CI.ID_CONTRATO, CI.NR_SEQ_ITEM`);

  salvar("contratos_itens", contItens.map(i => ({
    ID_CONTRATO:    i.ID_CONTRATO,
    NR_SEQ_ITEM:    i.NR_SEQ_ITEM,
    CD_ITEM:        i.CD_ITEM ?? i.ID_ITEM,
    PRODUTO:        i.PRODUTO,
    UNIDADE:        unidMap[i.CD_UNIDADE] ?? String(i.CD_UNIDADE ?? "sc"),
    QUANTIDADE:     i.QUANTIDADE,
    QUANTIDADE_KG:  i.QUANTIDADE_KG,
    VL_UNITARIO:    i.VALOR_UNITARIO,
    VL_TOTAL:       i.VALOR_TOTAL,
    AREA_PLANTIO:   i.AREA_PLANTIO,
    STATUS:         i.STATUS,
  })));

  // ══════════════════════════════════════════════════════
  // 12. PEDIDOS DE COMPRA
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 12. Pedidos de Compra ═══");

  const pedidos = await query(db, `
    SELECT
      PC.ID,
      ${c("PC.NRO_PEDIDO",30)}      AS NRO_PEDIDO,
      PC.DATA_REGISTRO,
      PC.DATA_ENTREGA_TOTAL,
      PC.CD_SAFRA,
      ${c("S.DESCRICAO",50)}        AS SAFRA_DESC,
      PC.CD_MOEDA,
      PC.VL_COTACAO,
      PC.VALOR_TOTAL_LIQUIDO,
      PC.VALOR_TOTAL_LIQ_CONV,
      PC.ST_CANCELADO,
      PC.ST_CONFIRMADO,
      SUBSTRING(PC.OBSERVACOES FROM 1 FOR 2000) AS OBSERVACOES,
      PC.CD_FORNECEDOR,
      ${c("PS.NOME",200)}           AS FORNECEDOR_NOME,
      ${c("PS.PJ_CNPJ",20)}         AS FORNECEDOR_CNPJ,
      PC.CD_PROPRIEDADE
    FROM PEDIDOS_COMPRA PC
    LEFT JOIN PESSOAS PS ON PS.CODIGO = PC.CD_FORNECEDOR
    LEFT JOIN SAFRAS S ON S.CODIGO = PC.CD_SAFRA
    ORDER BY PC.DATA_REGISTRO DESC`);

  salvar("pedidos_compra", pedidos.map(p => ({
    ID:               p.ID,
    NRO_PEDIDO:       p.NRO_PEDIDO,
    DATA_REGISTRO:    iso(p.DATA_REGISTRO),
    DATA_ENTREGA:     iso(p.DATA_ENTREGA_TOTAL),
    CD_SAFRA:         p.CD_SAFRA,
    SAFRA_DESC:       p.SAFRA_DESC,
    MOEDA:            MOEDAS[p.CD_MOEDA] ?? ("MOEDA_" + p.CD_MOEDA),
    CD_MOEDA:         p.CD_MOEDA,
    VL_COTACAO:       p.VL_COTACAO,
    VALOR_TOTAL:      p.VALOR_TOTAL_LIQUIDO,
    VALOR_TOTAL_CONV: p.VALOR_TOTAL_LIQ_CONV,
    CANCELADO:        p.ST_CANCELADO === "S",
    CONFIRMADO:       p.ST_CONFIRMADO === "S",
    CD_FORNECEDOR:    p.CD_FORNECEDOR,
    FORNECEDOR_NOME:  p.FORNECEDOR_NOME,
    FORNECEDOR_DOC:   fmtCpfCnpj(p.FORNECEDOR_CNPJ),
    OBSERVACOES:      p.OBSERVACOES,
    CD_PROPRIEDADE:   p.CD_PROPRIEDADE,
  })));

  // Itens de pedidos
  const pedItens = await query(db, `
    SELECT
      IP.ID, IP.ID_PED_COMPRA,
      IP.CD_ITEM,
      ${c("IE.DESCRICAO",300)}    AS PRODUTO,
      IP.CD_UNIDADE,
      IP.QUANTIDADE,
      IP.QUANT_CONVERTIDA,
      IP.VALOR_UNITARIO,
      IP.VALOR_TOTAL,
      IP.CD_MOEDA,
      IP.VALOR_TOTAL_CONVERTIDO,
      IP.CD_EMPREENDIMENTO,
      ${c("E.DESCRICAO",200)}     AS EMPREEND_NOME,
      IP.ST_FECHADO
    FROM ITENS_PED_COMPRA IP
    LEFT JOIN ITENS_ESTOQUE IE ON IE.ID = IP.ID_ITEM_ESTOQUE
    LEFT JOIN EMPREENDIMENTOS E ON E.CD_EMPREEND = IP.CD_EMPREENDIMENTO
    ORDER BY IP.ID_PED_COMPRA, IP.ID`);

  salvar("pedidos_compra_itens", pedItens.map(i => ({
    ID:               i.ID,
    ID_PED_COMPRA:    i.ID_PED_COMPRA,
    CD_ITEM:          i.CD_ITEM,
    PRODUTO:          i.PRODUTO,
    UNIDADE:          unidMap[i.CD_UNIDADE] ?? String(i.CD_UNIDADE ?? "un"),
    QUANTIDADE:       i.QUANTIDADE,
    QT_CONVERTIDA:    i.QUANT_CONVERTIDA,
    VL_UNITARIO:      i.VALOR_UNITARIO,
    VL_TOTAL:         i.VALOR_TOTAL,
    MOEDA:            MOEDAS[i.CD_MOEDA] ?? ("MOEDA_" + i.CD_MOEDA),
    VL_TOTAL_CONV:    i.VALOR_TOTAL_CONVERTIDO,
    CD_EMPREEND:      i.CD_EMPREENDIMENTO,
    EMPREEND_NOME:    i.EMPREEND_NOME,
    ST_FECHADO:       i.ST_FECHADO,
  })));

  // ══════════════════════════════════════════════════════
  // 13. NOTAS FISCAIS (Cabeçalho)
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 13. Notas Fiscais ═══");

  const notas = await query(db, `
    SELECT
      N.ID,
      ${c("N.NUMERO_NF",20)}           AS NUMERO_NF,
      ${c("N.SERIE_NF",5)}             AS SERIE_NF,
      ${c("N.MODELO_NF",5)}            AS MODELO_NF,
      N.DATA_REGISTRO,
      N.DATA_SAIDA,
      ${c("N.NFECHAVEACESSO",60)}       AS CHAVE_NFE,
      ${c("N.NFEMOTIVO",300)}          AS MOTIVO_SEFAZ,
      ${c("N.NFEPROTOCOLOAUTORIZACAO",30)} AS PROTOCOLO,
      N.CANCELADA,
      N.DATA_CANCELAMENTO,
      N.ST_ENTRADA_SAI,
      N.VALOR_FINANCEIRO,
      N.VL_TOT_PRODUTOS,
      N.VL_TOT_NOTA,
      N.VL_DESCONTOS,
      N.VL_FRETE,
      N.CD_SAFRA,
      N.CD_EMPREEND,
      N.CD_PROPRIEDADE,
      N.CD_DESTINATARIO,
      ${c("N.D_RAZAO_SOCIAL",200)}      AS DESTINAT_NOME,
      ${c("N.D_CNPJ_CPF",20)}          AS DESTINAT_DOC,
      ${c("N.D_UF",5)}                 AS DESTINAT_UF,
      N.CD_EMITENTE,
      ${c("N.E_RAZAO_SOCIAL",200)}      AS EMIT_NOME,
      ${c("N.E_CNPJ_CPF",20)}          AS EMIT_DOC,
      SUBSTRING(N.OBS FROM 1 FOR 2000) AS OBS,
      N.ST_GEROU_FINANCEIRO,
      ${c("N.CTECHAVE",60)}             AS CTE_CHAVE
    FROM NOTAS N
    WHERE N.CANCELADA = 'N'
    ORDER BY N.DATA_REGISTRO DESC`);

  salvar("notas_fiscais", notas.map(n => ({
    ID:              n.ID,
    NUMERO:          n.NUMERO_NF,
    SERIE:           n.SERIE_NF,
    MODELO:          n.MODELO_NF,
    DATA_REG:        iso(n.DATA_REGISTRO),
    DATA_SAIDA:      iso(n.DATA_SAIDA),
    CHAVE_NFE:       n.CHAVE_NFE,
    PROTOCOLO:       n.PROTOCOLO,
    MOTIVO_SEFAZ:    n.MOTIVO_SEFAZ,
    CANCELADA:       n.CANCELADA !== "N",
    TIPO:            n.ST_ENTRADA_SAI === "E" ? "entrada" : "saida",
    VL_PRODUTOS:     n.VL_TOT_PRODUTOS,
    VL_TOTAL:        n.VL_TOT_NOTA,
    VL_FINANCEIRO:   n.VALOR_FINANCEIRO,
    VL_DESCONTOS:    n.VL_DESCONTOS,
    VL_FRETE:        n.VL_FRETE,
    CD_SAFRA:        n.CD_SAFRA,
    SAFRA_DESC:      safraDescMap[n.CD_SAFRA] ?? null,
    CD_EMPREEND:     n.CD_EMPREEND,
    CD_PROPRIEDADE:  n.CD_PROPRIEDADE,
    CD_DESTINATARIO: n.CD_DESTINATARIO,
    DESTINAT_NOME:   n.DESTINAT_NOME,
    DESTINAT_DOC:    fmtCpfCnpj(n.DESTINAT_DOC),
    DESTINAT_UF:     n.DESTINAT_UF,
    EMIT_NOME:       n.EMIT_NOME,
    EMIT_DOC:        fmtCpfCnpj(n.EMIT_DOC),
    OBS:             n.OBS,
    ST_GEROU_FIN:    n.ST_GEROU_FINANCEIRO === "S",
    CTE_CHAVE:       n.CTE_CHAVE,
  })));

  // Itens de notas fiscais
  console.log("  ↳ Extraindo itens das notas fiscais...");
  const notaItens = await query(db, `
    SELECT
      NI.ID_NOTA,
      NI.NR_SEQ_ITEM,
      NI.CD_ITEM,
      NI.ID_ITEM,
      ${c("IE.DESCRICAO",300)}         AS PRODUTO,
      ${c("NI.DESCRICAO_LIVRE",300)}   AS DESCRICAO_LIVRE,
      NI.CD_UNIDADE,
      NI.QUANTIDADE,
      NI.VL_UNITARIO,
      NI.VL_TOTAL,
      NI.VL_DESCONTO,
      NI.VL_FRETE,
      NI.ALIQ_ICMS,
      NI.VALOR_ICMS,
      ${c("NI.CD_SITUACAO_TRIB",10)}   AS CST_ICMS,
      ${c("NI.NCM_LIVRE",20)}          AS NCM_LIVRE,
      NI.CD_NAT_OPER                   AS CD_NAT_OPER_ID
    FROM NOTAS_ITENS NI
    JOIN NOTAS N ON N.ID = NI.ID_NOTA AND N.CANCELADA = 'N'
    LEFT JOIN ITENS_ESTOQUE IE ON IE.ID = NI.ID_ITEM
    ORDER BY NI.ID_NOTA, NI.NR_SEQ_ITEM`);

  salvar("notas_fiscais_itens", notaItens.map(i => ({
    ID_NOTA:     i.ID_NOTA,
    NR_SEQ_ITEM: i.NR_SEQ_ITEM,
    CD_ITEM:     i.CD_ITEM ?? i.ID_ITEM,
    PRODUTO:     i.PRODUTO || i.DESCRICAO_LIVRE,
    CFOP:        i.CD_NAT_OPER_ID,
    NCM:         i.NCM_LIVRE,
    UNIDADE:     unidMap[i.CD_UNIDADE] ?? String(i.CD_UNIDADE ?? "un"),
    QUANTIDADE:  i.QUANTIDADE,
    VL_UNIT:     i.VL_UNITARIO,
    VL_TOTAL:    i.VL_TOTAL,
    VL_DESC:     i.VL_DESCONTO,
    VL_FRETE:    i.VL_FRETE,
    ALIQ_ICMS:   i.ALIQ_ICMS,
    VL_ICMS:     i.VALOR_ICMS,
    CST_ICMS:    i.CST_ICMS,
  })));

  // ══════════════════════════════════════════════════════
  // 14. DÍVIDAS / CONTRATOS FINANCEIROS
  // ══════════════════════════════════════════════════════
  console.log("\n═══ 14. Dívidas / Contratos Financeiros ═══");

  // DIVIDAS_CAB está vazia (0 registros), mas DIVIDA_PARCELAS tem 165
  // Extraímos mesmo assim para integridade
  const divParc = await query(db, `
    SELECT
      DP.CD_DIVIDA,
      DP.CD_DIVIDA_PARC,
      DP.NUM_PARC,
      DP.DATA_VENCIMENTO,
      DP.SALDO_DEVEDOR,
      DP.VALOR_AMORTIZACAO,
      DP.VALOR_JUROS_ENCARGOS,
      DP.VALOR_PARCELAS,
      DP.VALOR_ACESSORIOS,
      DP.VALOR_PARCELAS_CONV
    FROM DIVIDA_PARCELAS DP
    ORDER BY DP.CD_DIVIDA, DP.NUM_PARC`);

  salvar("divida_parcelas", divParc.map(d => ({
    CD_DIVIDA:        d.CD_DIVIDA,
    CD_DIVIDA_PARC:   d.CD_DIVIDA_PARC,
    NUM_PARC:         d.NUM_PARC,
    VENCIMENTO:       iso(d.DATA_VENCIMENTO),
    SALDO_DEVEDOR:    d.SALDO_DEVEDOR,
    VL_AMORTIZACAO:   d.VALOR_AMORTIZACAO,
    VL_JUROS:         d.VALOR_JUROS_ENCARGOS,
    VL_PARCELA:       d.VALOR_PARCELAS,
    VL_ACESSORIOS:    d.VALOR_ACESSORIOS,
    VL_PARCELA_CONV:  d.VALOR_PARCELAS_CONV,
  })));

  // ══════════════════════════════════════════════════════
  // RESUMO FINAL
  // ══════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("📊 RESUMO DA EXTRAÇÃO — HÁBIO MARCIANO PEREIRA");
  console.log("═".repeat(60));

  const cpAbertos  = cpcrAberto.filter(p => p.OPERACAO === "pagar").length;
  const crAbertos  = cpcrAberto.filter(p => p.OPERACAO === "receber").length;
  const cpPagos    = cpcrHist.filter(p => p.OPERACAO === "pagar").length;
  const crRecebidos= cpcrHist.filter(p => p.OPERACAO === "receber").length;

  console.log(`Propriedades:             ${props.length}`);
  console.log(`Glebas (Talhões):         ${glebas.length}`);
  console.log(`Empreendimentos (Ciclos): ${empreend.length}`);
  console.log(`  ↳ vínculos gleba:       ${empGlebas.length}`);
  console.log(`Safras:                   ${safras.length}`);
  console.log(`Pessoas:                  ${pessoas.length}`);
  console.log(`  ↳ fornecedores:         ${pessoas.filter(p => p.FORNECEDOR).length}`);
  console.log(`  ↳ clientes:             ${pessoas.filter(p => p.CLIENTE).length}`);
  console.log(`Contas Bancárias:         ${bancos.length}`);
  console.log(`CP em aberto:             ${cpAbertos}`);
  console.log(`CR em aberto:             ${crAbertos}`);
  console.log(`CP pagos (histórico):     ${cpPagos}`);
  console.log(`CR recebidos (histórico): ${crRecebidos}`);
  console.log(`Arrendamentos:            ${arrend.length}`);
  console.log(`  ↳ parcelas:             ${arrendParc.length}`);
  console.log(`Máquinas ativas:          ${maquinas.length}`);
  console.log(`Insumos (total):          ${insumos.length}`);
  console.log(`Posição estoque positiva: ${posicaoEstq.length}`);
  console.log(`Contratos:                ${contratos.length}`);
  console.log(`  ↳ itens:                ${contItens.length}`);
  console.log(`Pedidos de Compra:        ${pedidos.length}`);
  console.log(`  ↳ itens:                ${pedItens.length}`);
  console.log(`Notas Fiscais:            ${notas.length}`);
  console.log(`  ↳ itens:                ${notaItens.length}`);
  console.log(`Dívida Parcelas:          ${divParc.length}`);
  console.log("═".repeat(60));
  console.log("✅ Extração concluída! Arquivos em: scripts/migracao/dados_habio/");
  console.log("📋 Próximo: node scripts/migracao/02-importar-habio.js");
}

// ── Conexão ───────────────────────────────────────────────────────────────
console.log("🔌 Conectando ao Firebird Hábio (porta 13055)...");
Firebird.attach(OPTIONS, async (err, db) => {
  if (err) {
    console.error("❌ Erro ao conectar:", err.message);
    console.error("   Verifique: docker ps | grep fb25_habio_sc");
    process.exit(1);
  }
  console.log("✅ Conectado!\n");
  try {
    await extrair(db);
  } catch (e) {
    console.error("\n❌ Erro na extração:", e.message);
    console.error(e.stack);
    process.exit(1);
  } finally {
    db.detach();
  }
});
