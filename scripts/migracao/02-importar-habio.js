/**
 * Importação COMPLETA Agro1 → Arato para Hábio Marciano Pereira
 *
 * Conta:   e5106c5f-cdf2-40c8-8f87-ee0d2d5b3feb
 * J7:      79672ba8-e324-4195-885d-2ea70004a6ee  (já existe no Arato)
 * Owner:   09eb170a-82ca-4578-b6d0-17786a40ef82
 *
 * Uso: node scripts/migracao/02-importar-habio.js
 *
 * Ordem de execução:
 *   1. Fazenda Guasca (nova)
 *   2. Anos Safra para ambas as fazendas
 *   3. Talhões
 *   4. Ciclos
 *   5. Pessoas
 *   6. Contas Bancárias
 *   7. CP/CR em aberto → lancamentos
 *   8. CP/CR histórico → lancamentos (pago)
 *   9. Arrendamentos + parcelas
 *  10. Máquinas
 *  11. Insumos
 *  12. Contratos
 *  13. Pedidos de Compra + itens
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env.local") });
const { createClient } = require("@supabase/supabase-js");
const fs   = require("fs");
const path = require("path");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DIR = path.join(__dirname, "dados_habio");
const load = (n) => JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), "utf8"));

// ── IDs fixos ────────────────────────────────────────────────────────────────
const CONTA_ID   = "e5106c5f-cdf2-40c8-8f87-ee0d2d5b3feb";
const OWNER_UID  = "09eb170a-82ca-4578-b6d0-17786a40ef82";
const FAZ_J7_ID  = "79672ba8-e324-4195-885d-2ea70004a6ee";

// Safras Agro1 → Arato descricao
const SAFRA_AGRO1 = {
  5: "2021/2022",
  6: "2022/2023",
  7: "2023/2024",
  8: "2024/2025",
  9: "2025/2026",
  10: "2026/2027",
};

// Mapeamento de moeda Agro1 CD_MOEDA → string
const MOEDA_MAP = {
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

let erros = [];
let ok = {};

function logOk(label, n) {
  ok[label] = (ok[label] ?? 0) + n;
  console.log(`  ✅ ${label}: ${n}`);
}
function logErr(label, msg) {
  erros.push({ label, msg: String(msg).slice(0, 200) });
  console.error(`  ❌ ${label}: ${String(msg).slice(0, 120)}`);
}

function iso(d) {
  if (!d) return null;
  try { return new Date(d).toISOString().slice(0, 10); }
  catch { return null; }
}

function inferirCategoria(nome = "") {
  const n = nome.toLowerCase();
  if (/sement|soja seed|milho seed|algod.*seed|gergelim|trigo.*seed|pioneer|brevant|don mario|rnm|ag\d{4}|brevant/i.test(nome)) return "semente";
  if (/ureia|ure[iy]a|superfosfato|kcl|potassio|potass|npk|map|dap|fertiliz|adubo|sulfato|nitrato|boro|calcari|calcário|gesso|micronutri|ssfe|fosfato|cloreto de|kimber|makron|yaravita|aminoac|foliar|nutrifoliar|\d{2}-\d{2}-\d{2}/i.test(nome)) return "fertilizante";
  if (/herbicida|fungicida|inseticida|roundup|glifosat|priori|nativo|engeo|belt|karate|nematici|acaricida|dessec|azoxistro|thiametox|piraclo|imidaclo|clorotalonil|mancozebe|tebucon|metalaxil|propiconazol|lambda|abamect|adjuvante|espalhante|diquat|clomazona|mesotrione/i.test(nome)) return "defensivo";
  if (/diesel|gasolina|etanol|arla|combust|lubrif|hidráulic|hidraulic|fluido|graxa|graxas/i.test(n)) return "combustivel";
  if (/inoculante|rizobio|bioestimulante|nitragin|masterfix/i.test(n)) return "inoculante";
  return "material";
}

function mapUnidade(u = "") {
  const t = String(u).trim().toUpperCase().replace(/\./g,"");
  const m = {
    "KG":"kg","QUILO":"kg","QUILOGRAMA":"kg","KGS":"kg",
    "L":"L","LITRO":"L","LT":"L","LITROS":"L",
    "SC":"sc","SACA":"sc","SACAS":"sc",
    "T":"t","TON":"t","TONELADA":"t",
    "G":"g","GRAMA":"g","GR":"g",
    "UN":"un","UNID":"un","UNIDADE":"un","UND":"un",
    "HA":"outros","HECTARE":"outros",
    "ML":"mL",
    "MG":"outros",
    "CX":"cx","CAIXA":"cx",
    "KIT":"cx",
    "M":"m","M2":"m2","PC":"pc","PAR":"par",
  };
  return m[t] ?? "outros";
}

// Batch insert helper
async function insertBatch(table, rows, batchSize = 50) {
  let n = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sb.from(table).insert(batch);
    if (error) throw new Error(`${table}: ${error.message}`);
    n += batch.length;
  }
  return n;
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function importar() {
  // Carrega dados extraídos
  const propsSrc   = load("propriedades");
  const glebasSrc  = load("glebas");
  const emprSrc    = load("empreendimentos");
  const empGlSrc   = load("empreendimentos_glebas");
  const pessSrc    = load("pessoas");
  const bancosSrc  = load("contas_bancarias");
  const cpcrAb     = load("cpcr_em_aberto");
  const cpcrHist   = load("cpcr_historico_pago");
  const arrSrc     = load("arrendamentos");
  const arrParcSrc = load("arrendamentos_parcelas");
  const maqSrc     = load("maquinas");
  const insSrc     = load("insumos");
  const conSrc     = load("contratos");
  const conItSrc   = load("contratos_itens");
  const pedSrc     = load("pedidos_compra");
  const pedItSrc   = load("pedidos_compra_itens");

  // ═══════════════════════════════════════════════════════
  // 1. FAZENDA ESTÂNCIA GUASCA (nova)
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 1. Fazenda Estância Guasca ═══");

  const guascaProp = propsSrc.find(p => p.CD_PROPRIEDADE === 2);
  let FAZ_GUASCA_ID = null;

  // Verifica se já existe
  const { data: guascaExist } = await sb.from("fazendas")
    .select("id").eq("conta_id", CONTA_ID).ilike("nome", "%guasca%").maybeSingle();

  if (guascaExist) {
    FAZ_GUASCA_ID = guascaExist.id;
    console.log(`  ℹ️  Fazenda Guasca já existe: ${FAZ_GUASCA_ID}`);
  } else {
    const { data, error } = await sb.from("fazendas").insert({
      nome:           "Fazenda Estância Guasca",
      conta_id:       CONTA_ID,
      owner_user_id:  OWNER_UID,
      municipio:      guascaProp?.CIDADE ?? "Canarana",
      estado:         guascaProp?.ESTADO ?? "MT",
      area_total_ha:  guascaProp?.AREA_TOTAL ?? 1883,
    }).select("id").single();
    if (error) { logErr("fazenda_guasca", error.message); return; }
    FAZ_GUASCA_ID = data.id;
    logOk("fazenda_guasca criada", 1);
    console.log(`  ↳ ID: ${FAZ_GUASCA_ID}`);
  }

  // Mapa Agro1 → fazenda_id Arato
  const propFazMap = {
    1: FAZ_J7_ID,
    2: FAZ_GUASCA_ID,
  };

  // ═══════════════════════════════════════════════════════
  // 2. ANOS SAFRA
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 2. Anos Safra ═══");

  // J7 já tem 2025/2026 e 2026/2027. Precisa de 2024/2025.
  // Guasca não tem nenhum.
  const safrasNeeded = [
    { fazenda_id: FAZ_J7_ID,     descricao: "2024/2025", data_inicio: "2024-09-01", data_fim: "2025-08-31" },
    { fazenda_id: FAZ_J7_ID,     descricao: "2025/2026", data_inicio: "2025-09-01", data_fim: "2026-08-31" },
    { fazenda_id: FAZ_J7_ID,     descricao: "2026/2027", data_inicio: "2026-09-01", data_fim: "2027-08-31" },
    { fazenda_id: FAZ_GUASCA_ID, descricao: "2024/2025", data_inicio: "2024-09-01", data_fim: "2025-08-31" },
    { fazenda_id: FAZ_GUASCA_ID, descricao: "2025/2026", data_inicio: "2025-09-01", data_fim: "2026-08-31" },
    { fazenda_id: FAZ_GUASCA_ID, descricao: "2026/2027", data_inicio: "2026-09-01", data_fim: "2027-08-31" },
  ];

  // Busca os que já existem
  const { data: safrExist } = await sb.from("anos_safra")
    .select("id, descricao, fazenda_id")
    .in("fazenda_id", [FAZ_J7_ID, FAZ_GUASCA_ID]);

  const safrExistSet = new Set((safrExist ?? []).map(s => `${s.fazenda_id}_${s.descricao}`));

  const safrNovos = safrasNeeded.filter(s => !safrExistSet.has(`${s.fazenda_id}_${s.descricao}`));
  if (safrNovos.length) {
    const { error } = await sb.from("anos_safra").insert(safrNovos);
    if (error) logErr("anos_safra", error.message);
    else logOk("anos_safra inseridos", safrNovos.length);
  } else {
    console.log("  ℹ️  Todos os anos safra já existem");
  }

  // Busca mapa completo de anos safra
  const { data: todosSafras } = await sb.from("anos_safra")
    .select("id, descricao, fazenda_id")
    .in("fazenda_id", [FAZ_J7_ID, FAZ_GUASCA_ID]);

  const safraIdMap = {};
  for (const s of (todosSafras ?? [])) safraIdMap[`${s.fazenda_id}_${s.descricao}`] = s.id;

  function getSafraId(fazId, cdSafra) {
    const desc = SAFRA_AGRO1[cdSafra];
    if (!desc) return null;
    return safraIdMap[`${fazId}_${desc}`] ?? null;
  }

  // ═══════════════════════════════════════════════════════
  // 3. TALHÕES (Glebas)
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 3. Talhões ═══");

  const talhaoIdMap = {}; // CD_GLEBA → id Arato
  let talhaoSkip = 0;

  for (const g of glebasSrc) {
    const fazId = propFazMap[g.CD_PROPRIEDADE];
    if (!fazId) { logErr("talhao_sem_faz", `Gleba ${g.CD_GLEBA} prop ${g.CD_PROPRIEDADE}`); continue; }

    // Verifica duplicata por nome+fazenda
    const { data: ex } = await sb.from("talhoes")
      .select("id").eq("fazenda_id", fazId).eq("nome", g.DESCRICAO).maybeSingle();
    if (ex) { talhaoIdMap[g.CD_GLEBA] = ex.id; talhaoSkip++; continue; }

    const { data, error } = await sb.from("talhoes").insert({
      fazenda_id: fazId,
      nome:       g.DESCRICAO,
      area_ha:    g.AREA_TOTAL ?? 0,
    }).select("id").single();
    if (error) { logErr("talhao_" + g.DESCRICAO, error.message); continue; }
    talhaoIdMap[g.CD_GLEBA] = data.id;
    console.log(`  ✅ ${g.DESCRICAO} (${fazId === FAZ_J7_ID ? "J7" : "Guasca"})`);
  }
  logOk("talhoes", glebasSrc.length);
  console.log(`    ↳ novos: ${glebasSrc.length - talhaoSkip}, já existiam: ${talhaoSkip}`);

  // ═══════════════════════════════════════════════════════
  // 4. CICLOS (Empreendimentos)
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 4. Ciclos ═══");

  const cicloIdMap = {}; // CD_EMPREEND → id Arato
  let cicloSkip = 0;

  function extrairCultura(descr = "") {
    const d = descr.toLowerCase();
    if (d.includes("soja"))     return "Soja";
    if (d.includes("milho"))    return "Milho";
    if (d.includes("algodão") || d.includes("algodao")) return "Algodão";
    if (d.includes("gergelim")) return "Gergelim";
    if (d.includes("trigo"))    return "Trigo";
    if (d.includes("sorgo"))    return "Sorgo";
    if (d.includes("capim") || d.includes("braquiaria")) return "Pastagem";
    return descr.split(" ")[0] ?? "Outros";
  }

  for (const e of emprSrc) {
    const fazId = propFazMap[e.CD_PROPRIEDADE];
    if (!fazId) { logErr("ciclo_sem_faz", `Empreend ${e.CD_EMPREEND} prop ${e.CD_PROPRIEDADE}`); continue; }

    const anoSafraId = getSafraId(fazId, e.CD_SAFRA);
    const cultura    = extrairCultura(e.DESCRICAO ?? "");

    // Verifica duplicata
    const { data: ex } = await sb.from("ciclos")
      .select("id").eq("fazenda_id", fazId).eq("descricao", e.DESCRICAO).maybeSingle();
    if (ex) { cicloIdMap[e.CD_EMPREEND] = ex.id; cicloSkip++; continue; }

    const row = {
      fazenda_id:               fazId,
      ano_safra_id:             anoSafraId,
      descricao:                e.DESCRICAO,
      cultura,
      data_inicio:              e.DATA_INICIO ?? "2024-09-01",
      data_fim:                 e.DATA_TERMINO ?? "2025-08-31",
      area_plantada_ha:         e.AREA_TOTAL || null,
      produtividade_esperada_sc_ha: e.PRODUTIVIDADE ? Math.round(e.PRODUTIVIDADE / 60 * 10) / 10 : null,
      preco_esperado_sc:        e.VL_MEDIO_VENDA_CONV || null,
    };
    const { data, error } = await sb.from("ciclos").insert(row).select("id").single();
    if (error) { logErr("ciclo_" + e.DESCRICAO, error.message); continue; }
    cicloIdMap[e.CD_EMPREEND] = data.id;
    console.log(`  ✅ ${e.DESCRICAO}`);
  }
  logOk("ciclos", emprSrc.length);
  console.log(`    ↳ novos: ${emprSrc.length - cicloSkip}, já existiam: ${cicloSkip}`);

  // ═══════════════════════════════════════════════════════
  // 5. PESSOAS
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 5. Pessoas ═══");

  // Verifica duplicatas por cpf_cnpj nas duas fazendas
  const { data: pessExistAll } = await sb.from("pessoas")
    .select("id, cpf_cnpj, fazenda_id")
    .in("fazenda_id", [FAZ_J7_ID, FAZ_GUASCA_ID]);
  const docExist = new Set((pessExistAll ?? []).map(p => p.cpf_cnpj).filter(Boolean));
  const pessExistMap = Object.fromEntries((pessExistAll ?? [])
    .filter(p => p.cpf_cnpj).map(p => [p.cpf_cnpj, p.id]));

  const pessoaIdMap = {}; // CODIGO → id Arato
  let pessSkip = 0;

  for (const p of pessSrc) {
    const doc = p.CPF_CNPJ_RAW;

    if (doc && docExist.has(doc)) {
      pessoaIdMap[p.CODIGO] = pessExistMap[doc];
      pessSkip++;
      continue;
    }

    // Importa para J7 (fazenda principal)
    const row = {
      fazenda_id:    FAZ_J7_ID,
      nome:          p.NOME,
      tipo:          p.TIPO,
      cliente:       p.CLIENTE,
      fornecedor:    p.FORNECEDOR,
      cpf_cnpj:      doc || null,
      email:         p.EMAIL || null,
      telefone:      p.FONE1 || null,
      logradouro:    p.ENDERECO || null,
      numero:        p.NUMERO || null,
      bairro:        p.BAIRRO || null,
      cep:           p.CEP || null,
      municipio:     p.CIDADE || null,
      estado:        p.ESTADO || null,
      inscricao_est: p.INSC_ESTADUAL || null,
    };
    const { data, error } = await sb.from("pessoas").insert(row).select("id").single();
    if (error) { logErr("pessoa_" + p.NOME?.slice(0, 30), error.message); continue; }
    pessoaIdMap[p.CODIGO] = data.id;
    if (doc) { docExist.add(doc); pessExistMap[doc] = data.id; }
  }
  logOk("pessoas", Object.keys(pessoaIdMap).length + pessSkip);
  console.log(`    ↳ novas: ${Object.keys(pessoaIdMap).length - pessSkip}, já existiam: ${pessSkip}`);

  // ═══════════════════════════════════════════════════════
  // 6. CONTAS BANCÁRIAS
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 6. Contas Bancárias ═══");

  const contaBancMap = {}; // CD_CONTA → id Arato

  const { data: ctExist } = await sb.from("contas_bancarias")
    .select("id, nome").eq("fazenda_id", FAZ_J7_ID);
  const ctNomesEx = new Set((ctExist ?? []).map(c => c.nome?.toLowerCase()));

  for (const b of bancosSrc) {
    if (ctNomesEx.has(b.DESCRICAO?.toLowerCase())) {
      const ex = (ctExist ?? []).find(c => c.nome?.toLowerCase() === b.DESCRICAO?.toLowerCase());
      if (ex) contaBancMap[b.CD_CONTA] = ex.id;
      continue;
    }
    const row = {
      fazenda_id: FAZ_J7_ID,
      nome:       b.DESCRICAO,
      conta:      b.NUM_CONTA || null,
      moeda:      "BRL",
      ativa:      true,
      tipo_conta: "corrente",  // Agro1 não distingue tipo; corrente é padrão
    };
    const { data, error } = await sb.from("contas_bancarias").insert(row).select("id").single();
    if (error) { logErr("conta_bancaria_" + b.DESCRICAO, error.message); continue; }
    contaBancMap[b.CD_CONTA] = data.id;
    console.log(`  ✅ ${b.DESCRICAO}`);
  }
  logOk("contas_bancarias", bancosSrc.length);

  // ═══════════════════════════════════════════════════════
  // 7. CP/CR EM ABERTO
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 7. CP/CR em Aberto ═══");

  // Dedup: verifica se já existem lancamentos para essas fazendas com numero_documento ou
  // contagem igual à esperada — evita duplicatas em re-run
  const { count: lancExistCount } = await sb.from("lancamentos")
    .select("id", { count: "exact", head: true })
    .in("fazenda_id", [FAZ_J7_ID, FAZ_GUASCA_ID]);
  const lancJaMigrados = (lancExistCount ?? 0) >= (cpcrAb.length + cpcrHist.length - 200); // margem
  if (lancJaMigrados) {
    console.log(`  ℹ️  Lançamentos já migrados (${lancExistCount} no banco ≈ ${cpcrAb.length + cpcrHist.length} esperados) — pulando`);
  }

  const hoje = new Date();
  const lancAbRow = [];

  for (const p of cpcrAb) {
    const fazId   = propFazMap[p.CD_PROPRIEDADE] ?? FAZ_J7_ID;
    const pessId  = pessoaIdMap[p.CD_PESSOA] ?? null;
    const ctId    = contaBancMap[p.CD_LOCAL_PAG] ?? null;
    const cicloId = cicloIdMap[p.CD_EMPREEND] ?? null;
    const anoId   = getSafraId(fazId, p.CD_SAFRA);

    const venc     = p.VENCIMENTO;
    const vencDate = venc ? new Date(venc) : null;
    const status   = vencDate && vencDate < hoje ? "vencido" : "em_aberto";

    // Tratamento de moeda
    const moedaOrig = p.MOEDA;
    let moeda        = "BRL";
    let valor        = p.VL_PARCELA ?? 0;
    let valorOrig    = null;
    let moedaOriginal = null;
    let sacas        = null;
    let cultura_barter = null;

    if (moedaOrig === "USD") {
      moeda         = "USD";
      moedaOriginal = "USD";
      valor         = p.VL_PARCELA ?? 0;
    } else if (["SC_SOJA","SC_MILHO","SC_ALGODAO","ARROBA"].includes(moedaOrig)) {
      // Dívida em commodity — armazena em sacas + cultura_barter
      valorOrig      = p.VL_PARCELA;
      sacas          = moedaOrig !== "ARROBA" ? p.VL_PARCELA : null;
      cultura_barter = moedaOrig === "SC_SOJA" ? "soja" : moedaOrig === "SC_MILHO" ? "milho" : moedaOrig === "SC_ALGODAO" ? "algodao" : null;
      // Usa valor_convertido se disponível, senão 0
      valor          = p.VL_PARCELA_CONV && p.VL_PARCELA_CONV > 0 ? p.VL_PARCELA_CONV : 0;
    }

    const descricao = [
      p.PESSOA_NOME?.slice(0, 60) || "Fornecedor",
      p.NR_DOCUMENTO ? `Doc ${p.NR_DOCUMENTO}` : null,
      p.NR_PARCELA   ? `Parc ${p.NR_PARCELA}` : null,
      moedaOrig !== "BRL" ? `[${moedaOrig}: ${p.VL_PARCELA}]` : null,
    ].filter(Boolean).join(" — ");

    lancAbRow.push({
      fazenda_id:        fazId,
      tipo:              p.OPERACAO === "pagar" ? "pagar" : "receber",
      moeda,
      moeda_original:    moedaOriginal,  // apenas 'USD' ou null
      descricao,
      categoria:         p.OPERACAO === "pagar" ? "fornecedor" : "cliente",
      data_lancamento:   p.LANCAMENTO ?? new Date().toISOString().slice(0, 10),
      data_vencimento:   venc ?? new Date().toISOString().slice(0, 10),
      valor,
      valor_original:    valorOrig,
      status,
      auto:              false,
      cotacao_usd:       moeda === "USD" ? (p.VL_COTACAO || null) : null,
      sacas,
      cultura_barter,
      pessoa_id:         pessId,
      conta_bancaria_id: ctId,
      ciclo_id:          cicloId,
      ano_safra_id:      anoId,
      numero_documento:  p.NR_DOCUMENTO ? String(p.NR_DOCUMENTO).slice(0, 50) : null,
      observacao:        p.OBS ? String(p.OBS).slice(0, 1000) : null,
      origem_lancamento: "manual",
      natureza:          "real",
      num_parcela:       p.NR_PARCELA ?? null,
    });
  }

  let okCpAb = 0;
  if (!lancJaMigrados) {
    okCpAb = await insertBatch("lancamentos", lancAbRow, 50);
    logOk("lancamentos em_aberto", okCpAb);
  } else {
    console.log(`  ℹ️  CP/CR em aberto: pulado (já migrados)`);
  }
  console.log(`    ↳ CP em aberto: ${cpcrAb.filter(p=>p.OPERACAO==="pagar").length}`);
  console.log(`    ↳ CR em aberto: ${cpcrAb.filter(p=>p.OPERACAO==="receber").length}`);

  // ═══════════════════════════════════════════════════════
  // 8. CP/CR HISTÓRICO (PAGOS/RECEBIDOS)
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 8. CP/CR Histórico (Pagos/Recebidos) ═══");
  console.log(`  Total: ${cpcrHist.length} registros — inserindo em batches...`);

  const HIST_BATCH = 100;
  let histOk = 0;

  for (let i = 0; i < cpcrHist.length; i += HIST_BATCH) {
    const slice = cpcrHist.slice(i, i + HIST_BATCH);
    const rows = [];

    for (const p of slice) {
      const fazId   = propFazMap[p.CD_PROPRIEDADE] ?? FAZ_J7_ID;
      const pessId  = pessoaIdMap[p.CD_PESSOA] ?? null;
      const ctId    = contaBancMap[p.CD_LOCAL_PAG] ?? null;
      const cicloId = cicloIdMap[p.CD_EMPREEND] ?? null;
      const anoId   = getSafraId(fazId, p.CD_SAFRA);

      const moedaOrig = p.MOEDA;
      let moeda = "BRL";
      let valor = p.VL_PARCELA ?? 0;
      let moedaOriginal = null;
      let valorOrig = null;
      let sacas = null;
      let cultura_barter = null;

      if (moedaOrig === "USD") {
        moeda         = "USD";
        moedaOriginal = "USD";
      } else if (["SC_SOJA","SC_MILHO","SC_ALGODAO","ARROBA"].includes(moedaOrig)) {
        valorOrig      = p.VL_PARCELA;
        sacas          = moedaOrig !== "ARROBA" ? p.VL_PARCELA : null;
        cultura_barter = moedaOrig === "SC_SOJA" ? "soja" : moedaOrig === "SC_MILHO" ? "milho" : moedaOrig === "SC_ALGODAO" ? "algodao" : null;
        valor          = p.VL_PARCELA_CONV && p.VL_PARCELA_CONV > 0 ? p.VL_PARCELA_CONV : 0;
      }

      const descricao = [
        p.PESSOA_NOME?.slice(0, 60) || (p.OPERACAO === "pagar" ? "Fornecedor" : "Cliente"),
        p.NR_DOCUMENTO ? `Doc ${p.NR_DOCUMENTO}` : null,
        p.NR_PARCELA   ? `Parc ${p.NR_PARCELA}` : null,
        moedaOrig !== "BRL" ? `[${moedaOrig}: ${p.VL_PARCELA}]` : null,
      ].filter(Boolean).join(" — ");

      rows.push({
        fazenda_id:        fazId,
        tipo:              p.OPERACAO === "pagar" ? "pagar" : "receber",
        moeda,
        moeda_original:    moedaOriginal,
        descricao,
        categoria:         p.OPERACAO === "pagar" ? "fornecedor" : "cliente",
        data_lancamento:   p.LANCAMENTO ?? new Date().toISOString().slice(0, 10),
        data_vencimento:   p.VENCIMENTO ?? new Date().toISOString().slice(0, 10),
        data_baixa:        p.DATA_QUITACAO ?? null,
        valor,
        valor_pago:        p.VL_REC_PAG ?? valor,
        valor_original:    valorOrig,
        status:            "baixado",
        auto:              false,
        cotacao_usd:       moeda === "USD" ? (p.VL_COTACAO || null) : null,
        sacas,
        cultura_barter,
        pessoa_id:         pessId,
        conta_bancaria_id: ctId,
        ciclo_id:          cicloId,
        ano_safra_id:      anoId,
        numero_documento:  p.NR_DOCUMENTO ? String(p.NR_DOCUMENTO).slice(0, 50) : null,
        observacao:        p.OBS ? String(p.OBS).slice(0, 1000) : null,
        origem_lancamento: "manual",
        natureza:          "real",
        num_parcela:       p.NR_PARCELA ?? null,
      });
    }

    if (!lancJaMigrados) {
      const { error } = await sb.from("lancamentos").insert(rows);
      if (error) { logErr("hist_lancamentos_batch_" + i, error.message); continue; }
      histOk += rows.length;
      process.stdout.write(`\r  ↳ ${histOk}/${cpcrHist.length} inseridos...`);
    }
  }
  if (!lancJaMigrados) {
    console.log("");
    logOk("lancamentos_historico", histOk);
  } else {
    console.log("  ℹ️  Histórico: pulado (já migrado)");
  }

  // ═══════════════════════════════════════════════════════
  // 9. ARRENDAMENTOS
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 9. Arrendamentos ═══");

  const arrIdMap = {}; // ID Agro1 → id Arato
  const arrFazMap = {}; // ID Agro1 → fazenda_id (para usar nas parcelas)
  const arrMoedaMap = {}; // ID Agro1 → moeda (para parcelas)

  // Dedup: verifica arrendamentos existentes por proprietario_id + fazenda_id
  const { data: arrExist } = await sb.from("arrendamentos")
    .select("id, proprietario_id, fazenda_id, area_ha")
    .in("fazenda_id", [FAZ_J7_ID, FAZ_GUASCA_ID]);
  const arrExistSet = new Set((arrExist ?? []).map(a => `${a.fazenda_id}_${a.proprietario_id}_${a.area_ha}`));

  for (const a of arrSrc) {
    const fazId   = propFazMap[a.CD_PROPRIEDADE] ?? FAZ_J7_ID;
    const pessId  = pessoaIdMap[a.CD_PROPRIETARIO] ?? null;
    const anoId   = getSafraId(fazId, a.CD_SAFRA);

    const arrKey = `${fazId}_${pessId}_${a.AREA_ARRENDADA ?? 0}`;
    if (arrExistSet.has(arrKey)) {
      // Tenta recuperar o ID existente para as parcelas
      const ex = (arrExist ?? []).find(e => e.fazenda_id === fazId && e.proprietario_id === pessId);
      if (ex) { arrIdMap[a.ID] = ex.id; arrFazMap[a.ID] = fazId; arrMoedaMap[a.ID] = a.MOEDA; }
      console.log(`  ℹ️  Arrendamento ${a.ID} já existe`);
      continue;
    }

    const moeda = a.MOEDA;
    let forma_pagamento = "brl";
    if (moeda === "SC_SOJA")  forma_pagamento = "sc_soja";
    if (moeda === "SC_MILHO") forma_pagamento = "sc_milho";
    if (moeda === "ARROBA")   forma_pagamento = "sc_soja"; // mapear arroba para soja

    const areaHa = a.AREA_ARRENDADA ?? 1;
    const scHa = ["sc_soja","sc_milho"].includes(forma_pagamento) && areaHa > 0
                 ? Math.round(a.VALOR / areaHa * 100) / 100
                 : null;

    const row = {
      fazenda_id:         fazId,
      proprietario_id:    pessId,
      area_ha:            areaHa,
      forma_pagamento,
      sc_ha:              scHa,
      valor_brl:          forma_pagamento === "brl" ? (a.VALOR ?? 0) : null,
      inicio:             a.DATA ?? new Date().toISOString().slice(0, 10),
      vencimento:         a.VENCIMENTO ?? "2032-12-31",
      observacao:         a.OBSERVACOES || null,
      ano_safra_id:       anoId,
    };

    const { data, error } = await sb.from("arrendamentos").insert(row).select("id").single();
    if (error) { logErr("arrendamento_" + a.ID, error.message); continue; }
    arrIdMap[a.ID] = data.id;
    arrFazMap[a.ID] = fazId;
    arrMoedaMap[a.ID] = moeda;
    console.log(`  ✅ ${a.PROPRIETARIO_NOME} — ${areaHa} ha — ${a.VALOR} ${moeda}`);
  }
  logOk("arrendamentos", arrSrc.length);

  // Parcelas de arrendamento
  console.log("  ↳ Parcelas...");

  // Dedup: verifica parcelas existentes para esses arrendamentos
  const arrIdsParaCheck = Object.values(arrIdMap).filter(Boolean);
  let parcExistSet = new Set();
  if (arrIdsParaCheck.length) {
    const { data: parcExist } = await sb.from("arrendamento_pagamentos")
      .select("arrendamento_id, data_vencimento")
      .in("arrendamento_id", arrIdsParaCheck);
    parcExistSet = new Set((parcExist ?? []).map(p => `${p.arrendamento_id}_${p.data_vencimento}`));
  }

  const arrParcRows = [];
  for (const ap of arrParcSrc) {
    const arrId = arrIdMap[ap.ID_ARRENDAMENTO];
    if (!arrId) continue;
    const fazId = arrFazMap[ap.ID_ARRENDAMENTO] ?? FAZ_J7_ID;
    const moeda = arrMoedaMap[ap.ID_ARRENDAMENTO] ?? "SC_SOJA";

    // Dedup por arrendamento_id + data_vencimento
    const parcKey = `${arrId}_${ap.VENCIMENTO}`;
    if (parcExistSet.has(parcKey)) continue;

    const isSafrinha = ["SC_SOJA","SC_MILHO","ARROBA"].includes(moeda);
    const vencDate = ap.VENCIMENTO ? new Date(ap.VENCIMENTO) : null;
    const statusParc = vencDate && vencDate < hoje ? "pago" : "pendente";

    const anoSafraIdParc = getSafraId(fazId, ap.CD_SAFRA);

    arrParcRows.push({
      arrendamento_id:  arrId,
      fazenda_id:       fazId,
      ano_safra_id:     anoSafraIdParc,
      data_vencimento:  ap.VENCIMENTO,
      sacas_previstas:  isSafrinha ? (ap.VALOR ?? 0) : null,
      valor_previsto:   !isSafrinha ? (ap.VALOR ?? 0) : null,
      commodity:        moeda === "SC_SOJA" || moeda === "ARROBA" ? "soja" : moeda === "SC_MILHO" ? "milho" : null,
      status:           statusParc,
    });
  }
  if (arrParcRows.length) {
    const { error } = await sb.from("arrendamento_pagamentos").insert(arrParcRows);
    if (error) logErr("arrendamento_parcelas", error.message);
    else logOk("arrendamento_parcelas", arrParcRows.length);
  } else {
    console.log("  ℹ️  Parcelas: todas já existem ou sem arrendamentos");
  }

  // ═══════════════════════════════════════════════════════
  // 10. MÁQUINAS
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 10. Máquinas ═══");

  const maqIdMap = {}; // ID Agro1 → id Arato
  let maqSkip = 0;

  const { data: maqExist } = await sb.from("maquinas")
    .select("id, nome").eq("fazenda_id", FAZ_J7_ID);
  const maqNomesEx = new Set((maqExist ?? []).map(m => m.nome?.toLowerCase()));

  function mapTipoMaquina(tp = "") {
    const t = String(tp).toLowerCase();
    if (t.includes("trator") || t === "t")              return "trator";
    if (t.includes("colheita") || t === "c")             return "colheitadeira";
    if (t.includes("pulveriz") || t === "p")             return "pulverizador";
    if (t.includes("plantad"))                           return "plantadeira";
    if (t.includes("caminhao") || t.includes("caminhão") || t === "ca") return "caminhao";
    if (t.includes("carro") || t.includes("moto") || t.includes("jeep") || t.includes("camionete") || t === "v") return "carro";
    return "outro";
  }

  for (const m of maqSrc) {
    const nomeLower = m.DESCRICAO?.toLowerCase();
    if (nomeLower && maqNomesEx.has(nomeLower)) {
      const ex = (maqExist ?? []).find(x => x.nome?.toLowerCase() === nomeLower);
      if (ex) maqIdMap[m.ID] = ex.id;
      maqSkip++;
      continue;
    }

    // Inferir tipo pelo nome quando TP_VEICULO não define com clareza
    function inferTipo(nome = "", tp = "") {
      const n = nome.toLowerCase();
      if (n.includes("colheit")) return "colheitadeira";
      if (n.includes("pulveriz") || n.includes("uniporte") || n.includes("autoprop")) return "pulverizador";
      if (n.includes("plant")) return "plantadeira";
      if (n.includes("trator")) return "trator";
      if (n.includes("caminhão") || n.includes("caminhao")) return "caminhao";
      if (n.includes("moto") || n.includes("camionete") || n.includes("quadric") || n.includes("f100") || n.includes("f-100") || n.includes("f1000") || n.includes("fiat") || n.includes("hilux") || n.includes("ranger") || n.includes("s10")) return "carro";
      return mapTipoMaquina(tp);
    }

    const fazId = propFazMap[m.CD_PROPRIEDADE] ?? FAZ_J7_ID;
    const row = {
      fazenda_id:      fazId,
      nome:            m.DESCRICAO,
      tipo:            inferTipo(m.DESCRICAO ?? "", m.TP_VEICULO ?? ""),
      marca:           m.FABRICANTE || null,
      modelo:          m.MODELO || null,
      ano:             m.ANO_MODELO || null,
      chassi:          m.CHASSI || null,
      horimetro_atual: m.HORIMETRO ?? 0,
      ativa:           true,
    };
    const { data, error } = await sb.from("maquinas").insert(row).select("id").single();
    if (error) { logErr("maquina_" + m.DESCRICAO?.slice(0, 30), error.message); continue; }
    maqIdMap[m.ID] = data.id;
  }
  logOk("maquinas", maqSrc.length);
  console.log(`    ↳ novas: ${maqSrc.length - maqSkip}, já existiam: ${maqSkip}`);

  // ═══════════════════════════════════════════════════════
  // 11. INSUMOS
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 11. Insumos ═══");

  // Filtra apenas ativos
  const insAtivos = insSrc.filter(i => i.ST_ATIVO === "S");
  console.log(`  Total: ${insSrc.length} | Ativos: ${insAtivos.length}`);

  const insIdMap = {}; // CODIGO Agro1 → id Arato

  // Verifica duplicatas por nome
  const { data: insExist } = await sb.from("insumos").select("id, nome").eq("fazenda_id", FAZ_J7_ID);
  const insNomesEx = new Set((insExist ?? []).map(i => i.nome?.toLowerCase()));
  const insMapEx   = Object.fromEntries((insExist ?? []).map(i => [i.nome?.toLowerCase(), i.id]));
  let insSkip = 0;

  const insRows = [];
  for (const ins of insAtivos) {
    const nome = ins.DESCRICAO;
    if (!nome) continue;

    if (insNomesEx.has(nome.toLowerCase())) {
      insIdMap[ins.CODIGO] = insMapEx[nome.toLowerCase()];
      insSkip++;
      continue;
    }

    const cat = inferirCategoria(nome);
    const un  = mapUnidade(ins.UNIDADE ?? "");
    insRows.push({
      _CODIGO:        ins.CODIGO,
      fazenda_id:     FAZ_J7_ID,
      tipo:           "insumo",
      nome,
      categoria:      cat,
      unidade:        un,
      fabricante:     ins.FABRICANTE || null,
      estoque:        0,
      estoque_minimo: 0,
      valor_unitario: 0,
    });
    insNomesEx.add(nome.toLowerCase());
  }

  // Insert em batch, coletando IDs
  for (const row of insRows) {
    const codigo = row._CODIGO;
    delete row._CODIGO;
    const { data, error } = await sb.from("insumos").insert(row).select("id").single();
    if (error) { logErr("insumo_" + row.nome?.slice(0, 30), error.message); continue; }
    insIdMap[codigo] = data.id;
  }
  logOk("insumos", insAtivos.length);
  console.log(`    ↳ novos: ${insRows.length}, já existiam: ${insSkip}`);

  // ═══════════════════════════════════════════════════════
  // 12. CONTRATOS DE PRODUTO
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 12. Contratos de Produto ═══");

  // Pré-indexa itens por contrato para buscar produto/quantidade
  const conItByContrato = {};
  for (const ci of conItSrc) {
    if (!conItByContrato[ci.ID_CONTRATO]) conItByContrato[ci.ID_CONTRATO] = [];
    conItByContrato[ci.ID_CONTRATO].push(ci);
  }

  const conIdMap = {}; // ID Agro1 → id Arato

  // Dedup: verifica contratos existentes por numero + fazenda_id
  const { data: conExist } = await sb.from("contratos")
    .select("id, numero, fazenda_id")
    .in("fazenda_id", [FAZ_J7_ID, FAZ_GUASCA_ID]);
  const conExistMap = Object.fromEntries((conExist ?? []).map(c => [`${c.fazenda_id}_${c.numero}`, c.id]));

  for (const c of conSrc) {
    const fazId   = propFazMap[c.CD_PROPRIEDADE] ?? FAZ_J7_ID;
    const pessId  = pessoaIdMap[c.CD_CLIENTE] ?? null;
    const cicloId = cicloIdMap[c.CD_EMPREEND] ?? null;
    const anoId   = getSafraId(fazId, c.CD_SAFRA);

    // Dedup por numero + fazenda_id
    const conKey = `${fazId}_${c.NUMERO || String(c.ID)}`;
    if (conExistMap[conKey]) { conIdMap[c.ID] = conExistMap[conKey]; continue; }

    // Pega primeiro item para produto/quantidade
    const itens = conItByContrato[c.ID] ?? [];
    const primeiroItem = itens[0];
    const produto = primeiroItem?.PRODUTO || "GRÃOS";
    const unIt    = (primeiroItem?.UNIDADE ?? "SC").toUpperCase();
    const qtdBruta = primeiroItem?.QUANTIDADE ?? 0;
    // Converter para sacas (60kg)
    const quantidade_sc = unIt === "KG" ? Math.round(qtdBruta / 60 * 10) / 10
                        : unIt === "T"  ? Math.round(qtdBruta * 1000 / 60 * 10) / 10
                        : qtdBruta; // já em sc
    const vlUnit = primeiroItem?.VL_UNITARIO ?? 0;
    const preco  = unIt === "KG" ? Math.round(vlUnit * 60 * 100) / 100 : vlUnit;

    const row = {
      fazenda_id:        fazId,
      numero:            c.NUMERO || String(c.ID),
      data_contrato:     c.DATA ?? new Date().toISOString().slice(0, 10),
      data_entrega:      c.DATA ?? new Date().toISOString().slice(0, 10),
      safra:             SAFRA_AGRO1[c.CD_SAFRA] ?? "2025/2026",
      ano_safra_id:      anoId,
      ciclo_id:          cicloId,
      tipo:              c.TIPO_ES === "S" ? "venda" : "compra",
      confirmado:        c.CONFIRMADO ?? false,
      comprador:         c.CLIENTE_NOME || "Cliente",
      pessoa_id:         pessId,
      produto,
      modalidade:        c.MOEDA !== "BRL" ? "fixo" : "fixo",  // ambos = fixo
      moeda:             c.MOEDA === "USD" ? "USD" : "BRL",
      preco:             preco ?? 0,
      quantidade_sc:     quantidade_sc ?? 0,
      entregue_sc:       0,
      status:            "aberto",
      observacao:        c.OBSERVACAO || null,
    };
    const { data, error } = await sb.from("contratos").insert(row).select("id").single();
    if (error) { logErr("contrato_" + c.NUMERO, error.message); continue; }
    conIdMap[c.ID] = data.id;
    console.log(`  ✅ Contrato ${c.NUMERO} — ${c.CLIENTE_NOME?.slice(0, 30) ?? "?"}`);
  }
  logOk("contratos", conSrc.length);

  // Itens de contratos → contrato_itens
  const conItRows = [];
  for (const ci of conItSrc) {
    const conId = conIdMap[ci.ID_CONTRATO];
    if (!conId) continue;
    const unIt = (ci.UNIDADE ?? "SC").toUpperCase();
    const qtdSc = unIt === "KG" ? Math.round(ci.QUANTIDADE / 60 * 10) / 10
                : unIt === "T"  ? Math.round(ci.QUANTIDADE * 1000 / 60 * 10) / 10
                : ci.QUANTIDADE ?? 0;
    const vlSc = unIt === "KG" ? Math.round((ci.VL_UNITARIO ?? 0) * 60 * 100) / 100
               : ci.VL_UNITARIO ?? 0;
    conItRows.push({
      contrato_id:    conId,
      produto:        ci.PRODUTO || "Produto",
      unidade:        "sc",
      quantidade:     qtdSc,
      valor_unitario: vlSc,
      valor_total:    Math.round(qtdSc * vlSc * 100) / 100,
    });
  }
  if (conItRows.length) {
    const { error } = await sb.from("contrato_itens").insert(conItRows);
    if (error) logErr("contrato_itens", error.message);
    else logOk("contrato_itens", conItRows.length);
  }

  // ═══════════════════════════════════════════════════════
  // 13. PEDIDOS DE COMPRA
  // ═══════════════════════════════════════════════════════
  console.log("\n═══ 13. Pedidos de Compra ═══");

  const pedIdMap = {}; // ID Agro1 → id Arato
  let pedSkip = 0;

  // Dedup: verifica pedidos existentes por nr_pedido + fazenda_id
  const { data: pedExist } = await sb.from("pedidos_compra")
    .select("id, nr_pedido, fazenda_id")
    .in("fazenda_id", [FAZ_J7_ID, FAZ_GUASCA_ID]);
  const pedExistMap = Object.fromEntries((pedExist ?? []).map(p => [`${p.fazenda_id}_${p.nr_pedido}`, p.id]));

  // Dedup: verifica itens de pedidos existentes
  const { count: pedItCount } = await sb.from("pedidos_compra_itens")
    .select("id", { count: "exact", head: true })
    .in("fazenda_id", [FAZ_J7_ID, FAZ_GUASCA_ID]);
  const pedItJaMigrados = (pedItCount ?? 0) >= pedItSrc.length - 50;

  for (const p of pedSrc) {
    if (p.CANCELADO) { pedSkip++; continue; }

    const fazId  = propFazMap[p.CD_PROPRIEDADE] ?? FAZ_J7_ID;
    const fornId = pessoaIdMap[p.CD_FORNECEDOR] ?? null;
    const anoId  = getSafraId(fazId, p.CD_SAFRA);

    const row = {
      fazenda_id:              fazId,
      nr_pedido:               p.NRO_PEDIDO || String(p.ID),
      data_registro:           p.DATA_REGISTRO ?? new Date().toISOString().slice(0, 10),
      data_entrega_total:      p.DATA_ENTREGA ?? null,
      fornecedor_id:           fornId,
      status:                  p.CONFIRMADO ? "aprovado" : "rascunho",
      cotacao_moeda:           p.MOEDA === "USD" ? "USD" : "BRL",
      observacao:              p.OBSERVACOES || null,
      total_financeiro:        p.VALOR_TOTAL ?? 0,
      total_produtos_servicos: p.VALOR_TOTAL ?? 0,
      ano_safra_id:            anoId,
    };
    // Dedup por nr_pedido + fazenda_id
    const pedKey = `${fazId}_${p.NRO_PEDIDO || String(p.ID)}`;
    if (pedExistMap[pedKey]) { pedIdMap[p.ID] = pedExistMap[pedKey]; pedSkip++; continue; }

    const { data, error } = await sb.from("pedidos_compra").insert(row).select("id").single();
    if (error) { logErr("pedido_" + p.NRO_PEDIDO, error.message); continue; }
    pedIdMap[p.ID] = data.id;
  }
  logOk("pedidos_compra", Object.keys(pedIdMap).length);
  console.log(`    ↳ ${pedSkip} já existiam ou cancelados`);

  // Itens de pedidos
  const pedItRows = [];
  for (const i of pedItSrc) {
    const pedId    = pedIdMap[i.ID_PED_COMPRA];
    if (!pedId) continue;
    const insumoId = insIdMap[i.CD_ITEM] ?? null;
    const fazId    = FAZ_J7_ID;
    pedItRows.push({
      pedido_id:      pedId,
      fazenda_id:     fazId,
      tipo_item:      "produto",
      insumo_id:      insumoId,
      nome_item:      i.PRODUTO || "Item",
      unidade:        mapUnidade(i.UNIDADE ?? ""),
      quantidade:     i.QUANTIDADE ?? 0,
      valor_unitario: i.VL_UNITARIO ?? 0,
    });
  }
  if (pedItRows.length && !pedItJaMigrados) {
    const n = await insertBatch("pedidos_compra_itens", pedItRows, 50);
    logOk("pedidos_compra_itens", n);
  } else if (pedItJaMigrados) {
    console.log(`  ℹ️  Itens de pedidos: ${pedItCount} já migrados, pulando`);
  }

  // ═══════════════════════════════════════════════════════
  // RESUMO FINAL
  // ═══════════════════════════════════════════════════════
  console.log("\n" + "═".repeat(60));
  console.log("📊 IMPORTAÇÃO CONCLUÍDA — HÁBIO MARCIANO PEREIRA");
  console.log("═".repeat(60));
  Object.entries(ok).forEach(([k, v]) => console.log(`  ✅ ${k}: ${v}`));

  if (erros.length) {
    console.log(`\n⚠️  ${erros.length} ERRO(S):`);
    erros.slice(0, 30).forEach(e => console.log(`  ❌ [${e.label}] ${e.msg}`));
  } else {
    console.log("\n✅ Zero erros!");
  }

  console.log("\n📋 Dados disponíveis no Arato para:");
  console.log("   • Fazenda J7 + Fazenda Estância Guasca");
  console.log("   • Safras 2024/2025 e 2025/2026");
  console.log("   • Todos os talhões, ciclos, pessoas e financeiro");
}

// ── INIT ─────────────────────────────────────────────────────────────────────
console.log("🚀 Importação Agro1 → Arato — Hábio Marciano Pereira");
console.log("   Conta:", "e5106c5f-cdf2-40c8-8f87-ee0d2d5b3feb");
console.log("   J7:  ", FAZ_J7_ID);
console.log("");

importar().catch(e => {
  console.error("❌ Erro fatal:", e.message);
  console.error(e.stack);
  process.exit(1);
});
