/**
 * Preview da migração Agro1 → Arato
 * Mostra o que SERIA importado sem tocar no Supabase.
 *
 * Uso: node scripts/migracao/02-preview-migracao.js
 * Pré-requisito: rodar 01-extrair-agro1.js antes
 */

const fs   = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "dados");

function load(nome) {
  const f = path.join(DIR, `${nome}.json`);
  if (!fs.existsSync(f)) { console.error(`❌ Arquivo não encontrado: ${f}`); process.exit(1); }
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

// Corrige encoding Firebird (win1252 → utf8)
function fix(s) {
  if (!s) return s;
  return s
    .replace(/�/g, "?")
    .replace(/S\?O/g, "SÃO")
    .replace(/\?AO/g, "ÃO")
    .replace(/\?O /g, "ÃO ")
    .replace(/JOS\?/g, "JOSÉ")
    .replace(/EST\?/g, "ESTÁ");
}

const fmt = (v, dec = 2) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtBrl = (v) => `R$ ${fmt(v)}`;
const sep = () => console.log("─".repeat(70));

// ─── Carrega tudo ──────────────────────────────────────────────────────────────
const pessoas    = load("pessoas");
const produtos   = load("produtos");
const cp         = load("contas_pagar_abertas");
const bancos     = load("contas_bancarias");
const contratos  = load("contratos_produto");
const contr_its  = load("contratos_produto_itens");
const pedidos    = load("pedidos_compra");
const ped_its    = load("pedidos_compra_itens");
const empreend   = load("empreendimentos");
const props      = load("propriedades");
const glebas     = load("glebas");
const safras     = load("safras");

// ─── Categorização de insumos ─────────────────────────────────────────────────
function inferirCategoria(nome = "") {
  const n = nome.toLowerCase();
  if (/sement|soja|milho|algod|gergelim|trigo|girassol|quartzo|ag\d{4}|NK|pioneer|brevant/i.test(nome)) return "semente";
  if (/ureia|uréia|superfosfato|kcl|potassio|npk|map|dap|fertiliz|adubo|sulfato|nitrato|boro|calcario|calcário|gesso|micronutri|mag[ân]|manganes/i.test(nome)) return "fertilizante";
  if (/herbicida|fungicida|inseticida|roundup|glifosato|priori|nativo|engeo|belt|karate|nematicida|acaricida|dessec|azoxistrobina|thiametox|piraclostrobina|imidaclo|cipermetr|deltametr|carbendazim|tiofanato|propiconazol|difenoconazol|tebuconazol|metalaxil|mancozebe|clorotalonil|abamectina|clorpir|lambda|bifentr/i.test(nome)) return "defensivo";
  if (/diesel|gasolina|etanol|arla|combust|lubrif|hidráulico|hidraulico|fluido|grax/i.test(nome)) return "combustivel";
  if (/inoculante|rizobio|bioestimulante/i.test(nome)) return "inoculante";
  return "outros";
}

function mapearUnidade(u = "") {
  const t = u.trim().toUpperCase();
  const m = {
    "KG": "kg", "QUILO": "kg", "QUILOGRAMA": "kg",
    "L": "L", "LITRO": "L", "LT": "L",
    "SC": "sc", "SACA": "sc", "SAC": "sc",
    "T": "t", "TON": "t", "TONELADA": "t",
    "G": "g", "GRAMA": "g",
    "UN": "un", "UNID": "un", "UNIDADE": "un",
    "HA": "ha", "HECTARE": "ha",
    "ML": "mL", "MG": "mg",
  };
  return m[t] ?? "un";
}

// ─── 1. PROPRIEDADES / FAZENDAS ───────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("🏡  1. PROPRIEDADES (Fazendas)");
sep();

props.forEach(p => {
  const nome = fix(p.DESCRICAO);
  const existente = nome.toLowerCase().includes("sapezal") ? " ⚠️  JÁ EXISTE NO ARATO — será ignorada" : " ✅ NOVA — será criada";
  console.log(`  ${nome} (${p.CIDADE}-${p.ESTADO}, ${p.AREA_TOTAL} ha)${existente}`);
});

// ─── 2. GLEBAS / TALHÕES ──────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("🌾  2. GLEBAS (Talhões)");
sep();

const propMap = Object.fromEntries(props.map(p => [p.CD_PROPRIEDADE, fix(p.DESCRICAO)]));
glebas.forEach(g => {
  const faz = propMap[g.CD_PROPRIEDADE] ?? `Prop ${g.CD_PROPRIEDADE}`;
  const skip = faz.toLowerCase().includes("sapezal") ? " ⚠️  vinculada à Sapezal — verificar se já existe" : " ✅ será criada";
  console.log(`  ${fix(g.DESCRICAO)} — ${faz} — ${g.AREA_TOTAL} ha${skip}`);
});

// ─── 3. EMPREENDIMENTOS / CICLOS ──────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("🌱  3. EMPREENDIMENTOS (Ciclos)");
sep();

const safraMap = Object.fromEntries(safras.map(s => [s.CODIGO, s.DESCRICAO]));
empreend.forEach(e => {
  const cultura = fix(e.DESCRICAO).split(" ")[0];
  const faz     = fix(e.PROPRIEDADE);
  console.log(`  [${safraMap[e.CD_SAFRA]}] ${fix(e.DESCRICAO)}`);
  console.log(`      ${e.AREA_TOTAL} ha | Prod: ${e.PRODUTIVIDADE} kg/ha | Início: ${e.DATA_INICIO?.slice(0,10)} → Fim: ${e.DATA_TERMINO?.slice(0,10)}`);
});

// ─── 4. PESSOAS / FORNECEDORES+CLIENTES ──────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("👥  4. PESSOAS (Fornecedores/Clientes)");
sep();
console.log(`  Total: ${pessoas.length} pessoas`);

const forn  = pessoas.filter(p => p.FORNECEDOR);
const clien = pessoas.filter(p => p.CLIENTE && !p.FORNECEDOR);
const ambos = pessoas.filter(p => p.FORNECEDOR && p.CLIENTE);
const pf    = pessoas.filter(p => p.TIPO === "pf");
const pj    = pessoas.filter(p => p.TIPO === "pj");

console.log(`  ↳ Fornecedores:           ${forn.length}`);
console.log(`  ↳ Clientes (não fornec.): ${clien.length}`);
console.log(`  ↳ Ambos:                  ${ambos.length}`);
console.log(`  ↳ Pessoa Física:          ${pf.length}`);
console.log(`  ↳ Pessoa Jurídica:        ${pj.length}`);
console.log("\n  Amostra de clientes compradores:");
clien.slice(0, 5).forEach(p => console.log(`    • ${p.NOME}`));

// ─── 5. PRODUTOS / INSUMOS ────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("🧪  5. PRODUTOS (Insumos)");
sep();
console.log(`  Total ativos no Agro1: ${produtos.length}`);

// Categoriza
const pCat = {};
produtos.forEach(p => {
  const cat = inferirCategoria(p.DESCRICAO);
  pCat[cat] = (pCat[cat] || 0) + 1;
});

Object.entries(pCat).sort((a,b)=>b[1]-a[1]).forEach(([cat, cnt]) => {
  console.log(`  ↳ ${cat.padEnd(15)} ${cnt} produtos`);
});

// Recomendação de filtro: só importar os que têm movimentação recente
console.log(`\n  ⚠️  3323 produtos é muito para migrar todos.`);
console.log(`  Recomendação: importar apenas os que aparecem nos pedidos/contratos`);

// Produtos referenciados nos pedidos
const prodRefsPed = new Set(ped_its.map(i => i.CD_ITEM).filter(Boolean));
const prodRefsContr = new Set(contr_its.map(i => i.CD_ITEM).filter(Boolean));
const prodRefs = new Set([...prodRefsPed, ...prodRefsContr]);
console.log(`\n  Produtos referenciados em pedidos/contratos: ${prodRefs.size}`);

const prodRefsAtivos = produtos.filter(p => prodRefs.has(p.CODIGO) || prodRefs.has(p.ID));
console.log(`  ↳ desses, ativos no catálogo: ${prodRefsAtivos.length}`);
console.log(`\n  Amostra:`);
prodRefsAtivos.slice(0,8).forEach(p => {
  const cat = inferirCategoria(p.DESCRICAO);
  const un  = mapearUnidade(p.UNIDADE);
  console.log(`    • [${cat}] ${p.DESCRICAO} (${un})`);
});

// ─── 6. CONTAS A PAGAR ────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("💸  6. CONTAS A PAGAR (abertas)");
sep();

const totalBrl = cp.reduce((s, p) => s + (p.VALOR_BRL || 0), 0);
const emUSD    = cp.filter(p => p.CD_MOEDA === 2);
const emSC     = cp.filter(p => p.CD_MOEDA === 5);  // SC_SOJA
const emArr    = cp.filter(p => p.CD_MOEDA === 9);  // ARROBA
const bancas   = cp.filter(p => /banco|caixa|sicred|sicoob|credisis/i.test(p.PESSOA_NOME || ""));
const fornecedoresCP = cp.filter(p => !/banco|caixa|sicred|sicoob|credisis/i.test(p.PESSOA_NOME || ""));

console.log(`  Total de parcelas:  ${cp.length}`);
console.log(`  Valor total (BRL):  ${fmtBrl(totalBrl)}`);
console.log(`  ↳ em BRL:           ${cp.filter(p=>p.CD_MOEDA===1).length} parcelas`);
console.log(`  ↳ em USD:           ${emUSD.length} parcelas — ${fmtBrl(emUSD.reduce((s,p)=>s+(p.VALOR_BRL||0),0))}`);
console.log(`  ↳ em SC Soja:       ${emSC.length} parcelas — ${fmt(emSC.reduce((s,p)=>s+p.VL_PARCELA,0))} sc`);
console.log(`  ↳ em Arroba:        ${emArr.length} parcelas — ${fmt(emArr.reduce((s,p)=>s+p.VL_PARCELA,0),0)} @`);
console.log(`\n  Financiamentos bancários: ${bancas.length} parcelas`);
console.log(`  CP com fornecedores:      ${fornecedoresCP.length} parcelas`);

// Top 10 por valor
const porPessoa = {};
cp.forEach(p => {
  const nom = p.PESSOA_NOME || "SEM NOME";
  if (!porPessoa[nom]) porPessoa[nom] = { total: 0, cnt: 0, moeda: p.MOEDA };
  porPessoa[nom].total += p.VALOR_BRL || 0;
  porPessoa[nom].cnt++;
});
const top10 = Object.entries(porPessoa).sort((a,b)=>b[1].total-a[1].total).slice(0,12);
console.log("\n  Top 12 credores:");
top10.forEach(([nom, v]) => {
  console.log(`    ${fmtBrl(v.total).padStart(18)}  (${String(v.cnt).padStart(3)} parcelas)  ${nom}`);
});

// Vencimentos próximos (30 dias)
const hoje = new Date();
const em30 = new Date(hoje.getTime() + 30 * 86400000);
const venc30 = cp.filter(p => p.DATA_VENCIMENTO && new Date(p.DATA_VENCIMENTO) <= em30);
console.log(`\n  ⏰ Vencendo em 30 dias: ${venc30.length} parcelas — ${fmtBrl(venc30.reduce((s,p)=>s+(p.VALOR_BRL||0),0))}`);

// ─── 7. CONTAS BANCÁRIAS ──────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("🏦  7. CONTAS BANCÁRIAS");
sep();
bancos.forEach(b => {
  console.log(`  • ${b.DESCRICAO} — Conta: ${b.NUM_CONTA} | Tipo: ${b.TIPO_CONTA === "C" ? "Corrente" : b.TIPO_CONTA}`);
});

// ─── 8. CONTRATOS DE PRODUTO ──────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("📋  8. CONTRATOS DE PRODUTO");
sep();

const safraNome = (cd) => safraMap[cd] ?? `Safra ${cd}`;
contratos.forEach(c => {
  const its = contr_its.filter(i => i.ID_CONTRATO === c.ID);
  console.log(`  Nº ${c.NUMERO} — ${c.CLIENTE_NOME}`);
  console.log(`    Safra: ${safraNome(c.CD_SAFRA)} | Data: ${c.DATA?.slice(0,10)} | Moeda: ${c.MOEDA} | Valor: ${fmtBrl(c.VALOR_TOTAL)}`);
  its.forEach(i => {
    const pNome = i.PRODUTO ? fix(i.PRODUTO) : "(produto não identificado)";
    console.log(`    ↳ ${pNome} — ${fmt(i.QUANTIDADE)} ${i.UNIDADE} × ${fmtBrl(i.VALOR_UNITARIO)} = ${fmtBrl(i.VALOR_TOTAL)}`);
  });
});

// ─── 9. PEDIDOS DE COMPRA ─────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("🛒  9. PEDIDOS DE COMPRA");
sep();

const pedSafra9  = pedidos.filter(p => p.CD_SAFRA === 9);
const pedSafra10 = pedidos.filter(p => p.CD_SAFRA === 10);
const pedOutros  = pedidos.filter(p => p.CD_SAFRA !== 9 && p.CD_SAFRA !== 10);

console.log(`  Total pedidos não cancelados: ${pedidos.length}`);
console.log(`  ↳ Safra 2025/2026 (9):  ${pedSafra9.length} pedidos`);
console.log(`  ↳ Safra 2026/2027 (10): ${pedSafra10.length} pedidos`);
console.log(`  ↳ Outras safras:        ${pedOutros.length} pedidos`);

console.log("\n  Pedidos safra 2025/2026 (amostra):");
pedSafra9.slice(0, 8).forEach(p => {
  const its = ped_its.filter(i => i.ID_PED_COMPRA === p.ID);
  console.log(`    Nº ${p.NRO_PEDIDO} — ${p.FORNECEDOR_NOME ?? "?"}`);
  console.log(`      Data: ${p.DATA_REGISTRO?.slice(0,10)} | Moeda: ${p.MOEDA} | Total: ${fmtBrl(p.VALOR_TOTAL_LIQUIDO)}`);
  its.slice(0,2).forEach(i => {
    const pNome = i.PRODUTO ? fix(i.PRODUTO) : "(não mapeado)";
    console.log(`      ↳ ${pNome} — ${fmt(i.QUANTIDADE)} ${mapearUnidade(i.UNIDADE)} × ${fmtBrl(i.VALOR_UNITARIO)}`);
  });
});

if (pedSafra10.length) {
  console.log("\n  Pedidos safra 2026/2027:");
  pedSafra10.forEach(p => {
    const its = ped_its.filter(i => i.ID_PED_COMPRA === p.ID);
    console.log(`    Nº ${p.NRO_PEDIDO} — ${p.FORNECEDOR_NOME ?? "?"}`);
    console.log(`      Total: ${fmtBrl(p.VALOR_TOTAL_LIQUIDO)}`);
    its.forEach(i => {
      const pNome = i.PRODUTO ? fix(i.PRODUTO) : "(não mapeado)";
      console.log(`      ↳ ${pNome} — ${fmt(i.QUANTIDADE)} ${mapearUnidade(i.UNIDADE)} × ${fmtBrl(i.VALOR_UNITARIO)}`);
    });
  });
}

// ─── RESUMO FINAL ─────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log("📊  RESUMO — O QUE SERÁ IMPORTADO");
sep();
console.log(`  Fazendas novas:         ${props.filter(p => !fix(p.DESCRICAO).toLowerCase().includes("sapezal")).length} (Fazenda Sapezal já existe → ignorada)`);
console.log(`  Talhões:                ${glebas.length} (verificar quais já existem na Sapezal)`);
console.log(`  Ciclos (empreend.):     ${empreend.length} (todos safra 2025/2026)`);
console.log(`  Fornecedores/Clientes:  ${pessoas.length} pessoas`);
console.log(`  Insumos (recomendado):  apenas os ~${ped_its.length + contr_its.length} referenciados em pedidos/contratos`);
console.log(`  Contas a Pagar:         ${cp.length} parcelas abertas — ${fmtBrl(totalBrl)} total`);
console.log(`    ↳ USD: ${emUSD.length} parcelas (converter pelo câmbio de referência)`);
console.log(`    ↳ SC Soja: ${emSC.length} parcelas (arrendamentos em soja)`);
console.log(`    ↳ Arroba: ${emArr.length} parcelas (arrendamentos em arroba/boi)`);
console.log(`  Contas bancárias:       ${bancos.length}`);
console.log(`  Contratos de venda:     ${contratos.length} (safra 2025/2026)`);
console.log(`  Pedidos de compra:      ${pedidos.length} (safra 2025/2026 + 2026/2027)`);
console.log(`  Barter/Dívidas:         0 (tabelas vazias no banco origem)`);

console.log("\n" + "═".repeat(70));
console.log("⚠️   PONTOS DE ATENÇÃO");
sep();
console.log(`  1. Fazenda Sapezal JÁ EXISTE no Arato — não duplicar`);
console.log(`     Talhões da Sapezal precisam ser verificados um a um`);
console.log(`  2. CP em USD (${emUSD.length} parcelas): câmbio de referência do Agro1 usado`);
console.log(`     Confirme se os valores estão corretos antes de importar`);
console.log(`  3. CP em SC Soja / Arroba: são arrendamentos em commodities`);
console.log(`     Arato não tem CP em SC — precisamos decidir como tratar`);
console.log(`     Opções: (a) converter para BRL pelo preço atual, (b) criar como observação`);
console.log(`  4. Contratos: todos são safra 2025/2026, nenhum em 2026/2027`);
console.log(`     Ciclos referenciados (CD_EMPREEND) estão NULL nos contratos`);
console.log(`  5. Produtos: 3323 cadastrados — recomendo importar apenas os ~${prodRefs.size} usados`);
console.log(`     Para depois: importar catálogo completo se necessário`);
console.log(`  6. Encoding: nomes com "ã/ç/é/ó" podem ter caracteres ruins (Firebird win1252)`);
console.log(`     Script corrigirá automaticamente os mais comuns`);
console.log("\n  ✅ Para prosseguir: node scripts/migracao/03-importar-arato.js");
