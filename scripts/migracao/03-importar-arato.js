/**
 * Importação Agro1 → Arato (Supabase)
 * Regras:
 *   - Contratos e Pedidos: somente safra 2026/2027
 *   - CP: excluir arrendamentos em SC/Arroba (moedas 5 e 9)
 *   - Talhões: criar todos (nenhum cadastrado)
 *   - Quantidades: manter em kg
 *
 * Uso: node scripts/migracao/03-importar-arato.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env.local") });
const { createClient } = require("@supabase/supabase-js");
const fs   = require("fs");
const path = require("path");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DIR = path.join(__dirname, "dados");
const load = (n) => JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), "utf8"));

// ── IDs fixos da conta CLEBER no Arato ─────────────────────────────────────
const CONTA_ID     = "87109388-a698-42d9-917e-adb1ed5d8768";
const OWNER_UID    = "430fc9d6-721e-4aed-ab25-7433a939ff10";
const FAZ_SAPEZAL  = "986dade6-6b18-4c1f-b2f7-b9df740c3571";

// Safras Agro1
const CD_SAFRA_2526 = 9;
const CD_SAFRA_2627 = 10;

// Encoding fix (Firebird win1252 → utf8)
const fix = (s) => {
  if (!s) return s;
  return String(s)
    .replace(/�/g, "?")
    .replace(/S\?O/g, "SÃO").replace(/\?AO/g, "ÃO").replace(/JOS\?/g, "JOSÉ")
    .replace(/\?A /g, "Ã ").replace(/\?es/g, "ões").replace(/\?o/g, "ão")
    .trim();
};

function mapUnidade(u = "") {
  const t = String(u).trim().toUpperCase();
  const m = {
    "KG":"kg","QUILO":"kg","QUILOGRAMA":"kg",
    "L":"L","LITRO":"L","LT":"L",
    "SC":"sc","SACA":"sc",
    "T":"t","TON":"t","TONELADA":"t",
    "G":"g","GRAMA":"g",
    "UN":"un","UNID":"un","UNIDADE":"un",
    "HA":"ha","HECTARE":"ha",
    "ML":"mL","MG":"mg",
  };
  return m[t] ?? "un";
}

function inferirCategoria(nome = "") {
  const n = nome.toLowerCase();
  // Sementes / grãos
  if (/sement|soja|milho|algod|gergelim|trigo|girassol|quartzo|safra|ag\d{4}|pioneer|brevant|\brnm\b|\bdon mario\b/i.test(nome)) return "semente";
  // Fertilizantes
  if (/ureia|uréia|superfosfato|kcl|potassio|npk|map|dap|fertiliz|adubo|sulfato|nitrato|boro|calcari|gesso|micronutri|super simples|ssfe|fosfato|cloreto de|00-00|\d{2}-\d{2}-\d{2}|cibra|yaravita|makron|kimberlit|nutrifoliares|aminoac|foliar/i.test(nome)) return "fertilizante";
  // Defensivos (herbicidas, fungicidas, inseticidas, adjuvantes, dessecantes)
  if (/herbicida|fungicida|inseticida|roundup|glifosato|glifosat|priori|nativo|engeo|belt|karate|nematicida|acaricida|dessec|azoxistrobina|thiametox|piraclostrobina|imidaclo|clorotalonil|mancozebe|tebuconazol|metalaxil|propiconazol|clorpir|lambda|abamect|adjuvante|espalhante|brazuka|glup|glu-up|gli-up|diquat|blowout|clomazona|gunter|cartago|cypress|mesotrione|egan|joya|proof|sandal|soberan|tenox|zaphir|reator|granary|arkeiro|aurora|fox supra|excalia|judoka|feroce|perito|cofenrin|mesic|nutry recobre|sintex|sintese|blackout|adver|200 sl|400 ec|480 sc|360 cs|700 wg|720 wg|250 cs|vedge|vessel|vessi|cofenr|addax|galil|poncho|cruiser|standak|/i.test(nome)) return "defensivo";
  // Combustíveis
  if (/diesel|gasolina|etanol|arla|combust|lubrif|hidráulic|hidraulic|fluido|grax/i.test(n)) return "combustivel";
  // Inoculantes
  if (/inoculante|rizobio|bioestimulante|nitragin|masterfix/i.test(n)) return "inoculante";
  // Serviços / mão de obra / equipamentos → material
  if (/mao de obra|mão de obra|servi[çc]o|trator|colheit|reform|escritorio|casa |arla/i.test(n)) return "material";
  // Fallback: material (evitar "outros" que o DB não aceita)
  return "material";
}

function iso(d) {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

let imported = {};
let erros = [];

function log(label, n, total) {
  imported[label] = n;
  const s = total ? `${n}/${total}` : n;
  console.log(`  ✅ ${label}: ${s}`);
}

function err(label, msg) {
  erros.push({ label, msg });
  console.error(`  ❌ ${label}: ${msg}`);
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
async function upsertManyBatched(table, rows, batchSize = 50) {
  let ok = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sb.from(table).upsert(batch, { onConflict: "id", ignoreDuplicates: false });
    if (error) throw new Error(`${table}: ${error.message}`);
    ok += batch.length;
  }
  return ok;
}

async function insertManyBatched(table, rows, batchSize = 50) {
  let ok = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await sb.from(table).insert(batch);
    if (error) throw new Error(`${table}: ${error.message}`);
    ok += batch.length;
  }
  return ok;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function importar() {
  const pessoas_src  = load("pessoas");
  const produtos_src = load("produtos");
  const cp_src       = load("contas_pagar_abertas");
  const bancos_src   = load("contas_bancarias");
  const contratos_src= load("contratos_produto");
  const cont_its_src = load("contratos_produto_itens");
  const pedidos_src  = load("pedidos_compra");
  const ped_its_src  = load("pedidos_compra_itens");
  const empreend_src = load("empreendimentos");
  const props_src    = load("propriedades");
  const glebas_src   = load("glebas");
  const safras_src   = load("safras");

  // ── Mapa de props Agro1 → fazenda_id Arato ─────────────────────────────
  // Sapezal já existe; Rio Bonito e São Carlos serão criadas abaixo
  const propFazMap = {};  // CD_PROPRIEDADE → fazenda_id Arato
  propFazMap[1] = FAZ_SAPEZAL; // Fazenda Sapezal

  // ── 1. FAZENDAS (novas) ─────────────────────────────────────────────────
  console.log("\n📌 1. Fazendas");
  const novasFaz = props_src.filter(p => p.CD_PROPRIEDADE !== 1); // excluir Sapezal

  for (const p of novasFaz) {
    const nome = fix(p.DESCRICAO);
    const row = {
      nome,
      conta_id:    CONTA_ID,
      owner_user_id: OWNER_UID,
      municipio:   fix(p.CIDADE) ?? "Canarana",
      estado:      p.ESTADO ?? "MT",
      area_total_ha: p.AREA_TOTAL ?? 0,
    };
    const { data, error } = await sb.from("fazendas").insert(row).select("id").single();
    if (error) { err("fazenda " + nome, error.message); continue; }
    propFazMap[p.CD_PROPRIEDADE] = data.id;
    console.log(`  ✅ Criada: ${nome} (${data.id})`);
  }

  // ── 2. ANOS SAFRA para as novas fazendas ────────────────────────────────
  console.log("\n📌 2. Anos Safra");
  const novaFazIds = Object.values(propFazMap).filter(id => id !== FAZ_SAPEZAL);
  const safraRows = [];

  for (const fazId of novaFazIds) {
    safraRows.push(
      { fazenda_id: fazId, descricao: "2025/2026", data_inicio: "2025-09-01", data_fim: "2026-08-31" },
      { fazenda_id: fazId, descricao: "2026/2027", data_inicio: "2026-09-01", data_fim: "2027-08-31" },
    );
  }

  // Sapezal 2025/2026 (pode não existir ainda)
  const { data: sapezal2526 } = await sb.from("anos_safra")
    .select("id").eq("fazenda_id", FAZ_SAPEZAL).eq("descricao", "2025/2026").maybeSingle();
  if (!sapezal2526) {
    safraRows.push({ fazenda_id: FAZ_SAPEZAL, descricao: "2025/2026", data_inicio: "2025-09-01", data_fim: "2026-08-31" });
  }

  const { data: sapezal2627 } = await sb.from("anos_safra")
    .select("id").eq("fazenda_id", FAZ_SAPEZAL).eq("descricao", "2026/2027").maybeSingle();
  const ano2627Sapezal = sapezal2627?.id ?? null;

  if (safraRows.length) {
    const { error } = await sb.from("anos_safra").insert(safraRows);
    if (error) err("anos_safra", error.message);
    else log("anos_safra inseridos", safraRows.length);
  } else {
    console.log("  ℹ️  Nenhum ano safra novo para criar");
  }

  // Busca os IDs recém-criados para uso posterior
  const { data: todosSafras } = await sb.from("anos_safra")
    .select("id, descricao, fazenda_id")
    .in("fazenda_id", Object.values(propFazMap));

  // Map: fazenda_id + descricao → id
  const safraIdMap = {};
  for (const s of (todosSafras ?? [])) safraIdMap[`${s.fazenda_id}_${s.descricao}`] = s.id;

  function getSafraId(fazId, descricao) {
    return safraIdMap[`${fazId}_${descricao}`] ?? null;
  }

  // ── 3. TALHÕES ──────────────────────────────────────────────────────────
  console.log("\n📌 3. Talhões");
  const talhaoIdMap = {}; // CD_GLEBA → id Arato

  for (const g of glebas_src) {
    const fazId = propFazMap[g.CD_PROPRIEDADE];
    if (!fazId) { err("talhao", `Propriedade ${g.CD_PROPRIEDADE} sem fazenda mapeada`); continue; }
    const row = {
      fazenda_id: fazId,
      nome:       fix(g.DESCRICAO),
      area_ha:    g.AREA_TOTAL ?? 0,
    };
    const { data, error } = await sb.from("talhoes").insert(row).select("id").single();
    if (error) { err("talhao " + g.DESCRICAO, error.message); continue; }
    talhaoIdMap[g.CD_GLEBA] = data.id;
    console.log(`  ✅ ${fix(g.DESCRICAO)} — ${row.fazenda_id === FAZ_SAPEZAL ? "Sapezal" : "nova fazenda"}`);
  }
  log("talhões", Object.keys(talhaoIdMap).length);

  // ── 4. CICLOS (Empreendimentos) ──────────────────────────────────────────
  console.log("\n📌 4. Ciclos (Empreendimentos)");
  const cicloIdMap = {}; // CD_EMPREEND → id Arato

  // Mapa de safra Agro1 → descricao
  const safraDescMap = Object.fromEntries(safras_src.map(s => [s.CODIGO, s.DESCRICAO]));

  // Cultura extractor
  function extrairCultura(descricao = "") {
    const d = descricao.toLowerCase();
    if (d.includes("soja"))     return "Soja";
    if (d.includes("milho"))    return "Milho";
    if (d.includes("algodão") || d.includes("algodao")) return "Algodão";
    if (d.includes("gergelim")) return "Gergelim";
    if (d.includes("trigo"))    return "Trigo";
    if (d.includes("sorgo"))    return "Sorgo";
    return fix(descricao).split(" ")[0];
  }

  for (const e of empreend_src) {
    const fazId = propFazMap[e.CD_PROPRIEDADE];
    if (!fazId) { err("ciclo", `Propriedade ${e.CD_PROPRIEDADE} sem fazenda`); continue; }

    const safraNome = safraDescMap[e.CD_SAFRA] ?? "2025/2026";
    const anoSafraId = getSafraId(fazId, safraNome);
    const cultura    = extrairCultura(e.DESCRICAO ?? "");
    const prodKgHa   = e.PRODUTIVIDADE ?? 0;
    const prodScHa   = prodKgHa > 0 ? Math.round(prodKgHa / 60 * 10) / 10 : null;

    const row = {
      fazenda_id:               fazId,
      ano_safra_id:             anoSafraId,
      descricao:                fix(e.DESCRICAO),
      cultura,
      data_inicio:              iso(e.DATA_INICIO) ?? "2025-09-01",
      data_fim:                 iso(e.DATA_TERMINO) ?? "2026-08-31",
      area_plantada_ha:         e.AREA_TOTAL || null,
      produtividade_esperada_sc_ha: prodScHa,
      preco_esperado_sc:        e.VL_MEDIO_VENDA_CONV || null,
    };
    const { data, error } = await sb.from("ciclos").insert(row).select("id").single();
    if (error) { err("ciclo " + e.DESCRICAO, error.message); continue; }
    cicloIdMap[e.CD_EMPREEND] = data.id;
    console.log(`  ✅ ${fix(e.DESCRICAO)}`);
  }
  log("ciclos", Object.keys(cicloIdMap).length);

  // ── 5. PESSOAS ───────────────────────────────────────────────────────────
  console.log("\n📌 5. Pessoas (Fornecedores/Clientes)");

  // Verifica duplicatas por cpf_cnpj
  const { data: pessExist } = await sb.from("pessoas")
    .select("id, cpf_cnpj").eq("fazenda_id", FAZ_SAPEZAL);
  const docsExist = new Set((pessExist ?? []).map(p => p.cpf_cnpj).filter(Boolean));

  const pessoaIdMap = {}; // CODIGO Agro1 → id Arato
  let pessSkip = 0;

  for (const p of pessoas_src) {
    const doc = (p.CNPJ || p.CPF || "").replace(/\D/g, "");
    if (doc && docsExist.has(doc)) {
      // já existe — busca o id
      const ex = (pessExist ?? []).find(x => x.cpf_cnpj === doc);
      if (ex) pessoaIdMap[p.CODIGO] = ex.id;
      pessSkip++;
      continue;
    }
    const row = {
      fazenda_id:    FAZ_SAPEZAL,
      nome:          fix(p.NOME),
      tipo:          p.TIPO ?? (p.CNPJ ? "pj" : "pf"),
      cliente:       !!p.CLIENTE,
      fornecedor:    !!p.FORNECEDOR,
      cpf_cnpj:      doc || null,
      email:         p.EMAIL || null,
      telefone:      p.FONE1 || null,
      logradouro:    fix(p.ENDERECO) || null,
      numero:        p.NUMERO || null,
      bairro:        fix(p.BAIRRO) || null,
      cep:           p.CEP || null,
      municipio:     fix(p.CIDADE) || null,
      estado:        p.ESTADO || null,
    };
    const { data, error } = await sb.from("pessoas").insert(row).select("id").single();
    if (error) { err("pessoa " + p.NOME, error.message); continue; }
    pessoaIdMap[p.CODIGO] = data.id;
    if (doc) docsExist.add(doc);
  }
  log("pessoas criadas", Object.keys(pessoaIdMap).length - pessSkip + pessSkip, pessoas_src.length);
  console.log(`    ↳ novas: ${Object.keys(pessoaIdMap).length - pessSkip}, já existiam: ${pessSkip}`);

  // ── 6. INSUMOS (somente os referenciados) ─────────────────────────────
  console.log("\n📌 6. Insumos");

  const prodIds2627 = new Set();
  pedidos_src.filter(p => p.CD_SAFRA === CD_SAFRA_2627).forEach(p => {
    ped_its_src.filter(i => i.ID_PED_COMPRA === p.ID).forEach(i => {
      if (i.ID_PED_COMPRA) prodIds2627.add(i.CD_ITEM);
    });
  });
  // também inclui todos pedidos/contratos para ter os insumos disponíveis
  const allProdIds = new Set([
    ...ped_its_src.map(i => i.CD_ITEM),
    ...cont_its_src.map(i => i.CD_ITEM),
  ].filter(Boolean));

  const produtosRef = produtos_src.filter(p => allProdIds.has(p.CODIGO) || allProdIds.has(p.ID));

  const insumoIdMap = {}; // CODIGO Agro1 → id Arato

  // Verifica se já existem insumos com mesmo nome
  const { data: insExist } = await sb.from("insumos").select("id, nome").eq("fazenda_id", FAZ_SAPEZAL);
  const nomesExist = new Set((insExist ?? []).map(i => i.nome.toLowerCase()));
  let insSkip = 0;

  for (const p of produtosRef) {
    const nome = fix(p.DESCRICAO);
    if (!nome) continue;
    if (nomesExist.has(nome.toLowerCase())) {
      const ex = (insExist ?? []).find(x => x.nome.toLowerCase() === nome.toLowerCase());
      if (ex) insumoIdMap[p.CODIGO] = ex.id;
      insSkip++;
      continue;
    }
    const cat = inferirCategoria(nome);
    const un  = mapUnidade(p.UNIDADE ?? "");
    const row = {
      fazenda_id:      FAZ_SAPEZAL,
      tipo:            "insumo",
      nome,
      categoria:       cat,
      unidade:         un,
      fabricante:      fix(p.FABRICANTE) || null,
      estoque:         0,
      estoque_minimo:  0,
      valor_unitario:  0,
    };
    const { data, error } = await sb.from("insumos").insert(row).select("id").single();
    if (error) { err("insumo " + nome, error.message); continue; }
    insumoIdMap[p.CODIGO] = data.id;
    nomesExist.add(nome.toLowerCase());
  }
  log("insumos criados", Object.keys(insumoIdMap).length, produtosRef.length);
  console.log(`    ↳ novos: ${Object.keys(insumoIdMap).length - insSkip}, já existiam: ${insSkip}`);

  // ── 7. CONTAS BANCÁRIAS ────────────────────────────────────────────────
  console.log("\n📌 7. Contas Bancárias");

  const contasBancMap = {}; // CD_LOC_PAGAMENTO → id Arato

  const { data: ctExist } = await sb.from("contas_bancarias")
    .select("id, nome").eq("fazenda_id", FAZ_SAPEZAL);
  const ctNomesExist = new Set((ctExist ?? []).map(c => c.nome.toLowerCase()));

  const bancoNomes = { 1:"Bradesco", 2:"Banco do Brasil", 3:"Sicredi", 4:"Sicoob", 5:"Caixa Econômica Federal", 6:"Credisis", 7:"Itaú" };

  for (const b of bancos_src) {
    const nome = fix(b.DESCRICAO);
    if (ctNomesExist.has(nome.toLowerCase())) {
      const ex = (ctExist ?? []).find(x => x.nome.toLowerCase() === nome.toLowerCase());
      if (ex) contasBancMap[b.CD_CONTA] = ex.id;
      continue;
    }
    const row = {
      fazenda_id: FAZ_SAPEZAL,
      nome,
      banco:      bancoNomes[b.CD_AGENCIA] ?? `Banco ${b.CD_AGENCIA}`,
      conta:      fix(b.NUM_CONTA),
      moeda:      "BRL",
      ativa:      true,
      tipo_conta: "corrente",
    };
    const { data, error } = await sb.from("contas_bancarias").insert(row).select("id").single();
    if (error) { err("conta_bancaria " + nome, error.message); continue; }
    contasBancMap[b.CD_CONTA] = data.id;
    ctNomesExist.add(nome.toLowerCase());
  }
  log("contas_bancarias", bancos_src.length);

  // ── 8. CONTAS A PAGAR ─────────────────────────────────────────────────
  console.log("\n📌 8. Contas a Pagar");

  // Exclui arrendamentos em SC_SOJA (5) e ARROBA (9)
  const cpFiltrado = cp_src.filter(p => p.CD_MOEDA !== 5 && p.CD_MOEDA !== 9);
  console.log(`  Total: ${cp_src.length} → após excluir SC/Arroba: ${cpFiltrado.length}`);

  const lancRows = [];

  for (const p of cpFiltrado) {
    const fazId = propFazMap[p.CD_PROPRIEDADE] ?? FAZ_SAPEZAL;
    const pessId = pessoaIdMap[p.CD_PESSOA] ?? null;
    const ctId   = contasBancMap[p.CD_LOCAL_PAGAMENTO] ?? null;
    const cicloId= cicloIdMap[p.CD_EMPREEND] ?? null;
    const ano2627id = getSafraId(fazId, "2026/2027");
    const anoId  = p.CD_SAFRA === CD_SAFRA_2627 ? ano2627id : getSafraId(fazId, "2025/2026");

    const moedaArato = p.CD_MOEDA === 2 ? "USD" : "BRL";
    const valor      = moedaArato === "USD" ? p.VL_PARCELA : (p.VALOR_BRL ?? p.VL_PARCELA ?? 0);

    const venc = iso(p.DATA_VENCIMENTO);
    const hoje = new Date();
    const vencDate = venc ? new Date(venc) : null;
    const status = vencDate && vencDate < hoje ? "vencido" : "em_aberto";

    const descricao = [
      fix(p.PESSOA_NOME) || "Fornecedor",
      p.NR_DOCUMENTO ? `Doc ${p.NR_DOCUMENTO}` : null,
      p.NR_PARCELA ? `Parc ${p.NR_PARCELA}` : null,
    ].filter(Boolean).join(" — ");

    const row = {
      fazenda_id:          fazId,
      tipo:                "pagar",
      moeda:               moedaArato,
      descricao,
      categoria:           "fornecedor",
      data_lancamento:     iso(p.DT_LANCTO) ?? iso(p.DT_EMISSAO) ?? new Date().toISOString().slice(0,10),
      data_vencimento:     venc ?? new Date().toISOString().slice(0,10),
      valor,
      cotacao_usd:         moedaArato === "USD" ? (p.VL_COTACAO || null) : null,
      status,
      auto:                false,
      pessoa_id:           pessId,
      conta_bancaria_id:   ctId,
      ciclo_id:            cicloId,
      ano_safra_id:        anoId,
      numero_documento:    p.NR_DOCUMENTO ? String(p.NR_DOCUMENTO).slice(0,50) : null,
      observacao:          p.OBSERVACAO || null,
      origem_lancamento:   "manual",
      natureza:            "real",
    };
    lancRows.push(row);
  }

  const okCp = await insertManyBatched("lancamentos", lancRows, 50);
  log("contas_pagar", okCp, cpFiltrado.length);

  // ── 9. PEDIDOS DE COMPRA (somente 2026/2027) ──────────────────────────
  console.log("\n📌 9. Pedidos de Compra (safra 2026/2027)");

  const pedidos2627 = pedidos_src.filter(p => p.CD_SAFRA === CD_SAFRA_2627);
  console.log(`  Pedidos encontrados: ${pedidos2627.length}`);

  for (const p of pedidos2627) {
    const fazId   = propFazMap[p.CD_PROPRIEDADE] ?? FAZ_SAPEZAL;
    const fornId  = pessoaIdMap[p.CD_FORNECEDOR] ?? null;
    const anoId   = getSafraId(fazId, "2026/2027");
    const moedaArato = p.CD_MOEDA === 2 ? "USD" : "BRL";

    const pedRow = {
      fazenda_id:       fazId,
      nr_pedido:        String(p.NRO_PEDIDO ?? ""),
      data_registro:    iso(p.DATA_REGISTRO) ?? new Date().toISOString().slice(0,10),
      data_entrega_total: iso(p.DATA_ENTREGA_TOTAL),
      fornecedor_id:    fornId,
      status:           p.ST_CONFIRMADO === "S" ? "aprovado" : "rascunho",
      cotacao_moeda:    moedaArato,
      observacao:       fix(p.OBSERVACOES) || null,
      total_financeiro: p.VALOR_TOTAL_LIQUIDO ?? 0,
      total_produtos_servicos: p.VALOR_TOTAL_LIQUIDO ?? 0,
      ano_safra_id:     anoId,
    };

    const { data: pedData, error: pedErr } = await sb.from("pedidos_compra").insert(pedRow).select("id").single();
    if (pedErr) { err("pedido " + p.NRO_PEDIDO, pedErr.message); continue; }

    console.log(`  ✅ Pedido ${p.NRO_PEDIDO} — ${p.FORNECEDOR_NOME ?? "?"}`);

    // Itens do pedido
    const itens = ped_its_src.filter(i => i.ID_PED_COMPRA === p.ID);
    const itemRows = [];
    for (const i of itens) {
      const insumoId = insumoIdMap[i.CD_ITEM] ?? null;
      const un = mapUnidade(i.UNIDADE ?? "");
      itemRows.push({
        pedido_id:      pedData.id,
        fazenda_id:     fazId,
        tipo_item:      "produto",
        insumo_id:      insumoId,
        nome_item:      fix(i.PRODUTO) || fix(i.CD_ITEM) || "Item",
        unidade:        un,
        quantidade:     i.QUANTIDADE ?? 0,
        valor_unitario: i.VALOR_UNITARIO ?? 0,
      });
    }
    if (itemRows.length) {
      const { error: itErr } = await sb.from("pedidos_compra_itens").insert(itemRows);
      if (itErr) err("itens_pedido " + p.NRO_PEDIDO, itErr.message);
      else console.log(`    ↳ ${itemRows.length} iten(s)`);
    }
  }
  log("pedidos 2026/2027", pedidos2627.length);

  // ── CONTRATOS PRODUTO 2026/2027 ────────────────────────────────────────
  const contratos2627 = contratos_src.filter(c => c.CD_SAFRA === CD_SAFRA_2627);
  if (contratos2627.length === 0) {
    console.log("\n📌 Contratos de Produto safra 2026/2027: 0 encontrados no Agro1 — ignorado");
  }

  // ── RESUMO ─────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("📊  IMPORTAÇÃO CONCLUÍDA");
  console.log("─".repeat(60));
  Object.entries(imported).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  if (erros.length) {
    console.log("\n⚠️  ERROS (" + erros.length + "):");
    erros.slice(0, 20).forEach(e => console.log(`  ❌ [${e.label}] ${e.msg}`));
  } else {
    console.log("\n✅ Zero erros!");
  }
}

// ── INIT ─────────────────────────────────────────────────────────────────────
console.log("🚀 Iniciando importação Agro1 → Arato...");
console.log("   Conta: CLEBER HERIQUE RODRIGUES");
console.log("   Sapezal ID:", FAZ_SAPEZAL);
console.log("");

importar().catch(e => {
  console.error("❌ Erro fatal:", e.message);
  process.exit(1);
});
