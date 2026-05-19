/**
 * Migração: cria contratos_financeiros para Habio (Fazenda J7)
 * Cruza lançamentos CP já importados com os dados fonte (ORIGEM=DIVID)
 * para identificar quais CP são parcelas de contratos financeiros.
 *
 * SEM DUPLICAÇÃO: não cria novos CP — apenas cria contratos_financeiros
 * e parcelas_pagamento linkadas aos lancamento_id já existentes.
 *
 * Uso: node scripts/migracao/05-importar-contratos-habio.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env.local") });
const { createClient } = require("@supabase/supabase-js");
const fs   = require("fs");
const path = require("path");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FAZ_J7_ID  = "79672ba8-e324-4195-885d-2ea70004a6ee";
const DIR_HABIO  = path.join(__dirname, "dados_habio");
const load       = (n) => JSON.parse(fs.readFileSync(path.join(DIR_HABIO, `${n}.json`), "utf8"));

function inferirTipo(credor) {
  const upper = (credor || "").toUpperCase();
  if (upper.includes("CAIXA") || upper.includes("BANCO DO BRASIL") || upper.includes("BNDES")) return "custeio";
  if (upper.includes("JOHN DEERE") || upper.includes("CNH") || upper.includes("AGCO")) return "investimento";
  if (upper.includes("SICOOB") || upper.includes("SICREDI") || upper.includes("CREDISIS")) return "outros";
  return "outros";
}

async function main() {
  console.log("\n📦 Carregando dados fonte do Habio (CPCR)...");
  const cpcr = load("cpcr_em_aberto");
  const divid = cpcr.filter(r => r.ORIGEM === "DIVID");
  console.log(`  Total CP/CR fonte: ${cpcr.length} | DIVID: ${divid.length}`);

  // Índice por NR_DOCUMENTO para busca rápida
  const dividPorDoc = {};
  for (const r of divid) {
    const doc = String(r.NR_DOCUMENTO || "").trim();
    if (!dividPorDoc[doc]) dividPorDoc[doc] = [];
    dividPorDoc[doc].push(r);
  }
  console.log(`  Documentos DIVID únicos no fonte: ${Object.keys(dividPorDoc).length}`);

  // Busca TODOS os CP da fazenda J7
  console.log("\n🔍 Buscando lançamentos CP da Fazenda J7...");
  const { data: lances, error: le } = await sb
    .from("lancamentos")
    .select("id, numero_documento, pessoa_id, descricao, valor, data_vencimento, moeda")
    .eq("fazenda_id", FAZ_J7_ID)
    .eq("tipo", "pagar");

  if (le) { console.error("❌ Erro:", le.message); process.exit(1); }
  console.log(`  Lançamentos CP no banco: ${lances.length}`);

  // Cruza: lançamentos cujo numero_documento está nos docs DIVID do fonte
  const lancDivid = lances.filter(l => dividPorDoc[String(l.numero_documento || "").trim()]);
  console.log(`  Lançamentos identificados como DIVID: ${lancDivid.length}`);

  // Agrupa por numero_documento + pessoa_id → cada grupo = 1 contrato
  const grupos = {};
  for (const l of lancDivid) {
    const doc   = String(l.numero_documento || "").trim();
    const chave = `${doc}|${l.pessoa_id || ""}`;
    if (!grupos[chave]) {
      grupos[chave] = {
        numero_documento: doc,
        pessoa_id:        l.pessoa_id,
        moeda:            l.moeda || "BRL",
        lancamentos:      [],
      };
    }
    grupos[chave].lancamentos.push(l);
  }

  const gruposList = Object.values(grupos);
  console.log(`  Contratos únicos inferidos: ${gruposList.length}`);

  // Nomes das pessoas
  const pessoaIds = [...new Set(gruposList.map(g => g.pessoa_id).filter(Boolean))];
  const { data: pessoas } = await sb.from("pessoas").select("id, nome").in("id", pessoaIds);
  const pessoaNomeMap = {};
  (pessoas || []).forEach(p => { pessoaNomeMap[p.id] = p.nome; });

  // Contratos já criados (idempotência)
  const { data: jaExistem } = await sb
    .from("contratos_financeiros")
    .select("numero_contrato")
    .eq("fazenda_id", FAZ_J7_ID);
  const numerosExistentes = new Set((jaExistem || []).map(c => c.numero_contrato).filter(Boolean));
  console.log(`  Contratos já criados no módulo: ${numerosExistentes.size}`);

  let criados = 0, pulados = 0, erros = 0, parcCriadas = 0;

  for (const grupo of gruposList) {
    const nrContrato = grupo.numero_documento || null;

    if (nrContrato && numerosExistentes.has(nrContrato)) {
      console.log(`  ⏭  Pulando (já existe): ${nrContrato}`);
      pulados++;
      continue;
    }

    const credorNome = pessoaNomeMap[grupo.pessoa_id] || "Desconhecido";
    const tipo       = inferirTipo(credorNome);
    const totalValor = grupo.lancamentos.reduce((s, l) => s + Number(l.valor || 0), 0);
    const datas      = grupo.lancamentos.map(l => l.data_vencimento).filter(Boolean).sort();
    const dataContr  = datas[0] || new Date().toISOString().slice(0, 10);
    const descricao  = grupo.lancamentos[0]?.descricao?.replace(/ — Doc.*/, "") || credorNome;

    const { data: contrato, error: ce } = await sb
      .from("contratos_financeiros")
      .insert({
        fazenda_id:      FAZ_J7_ID,
        numero_contrato: nrContrato,
        descricao:       descricao.trim(),
        credor:          credorNome,
        pessoa_id:       grupo.pessoa_id || null,
        tipo,
        moeda:           grupo.moeda,
        valor_total:     totalValor,
        data_contrato:   dataContr,
        status:          "ativo",
        observacao:      `Migrado Agro1 — ${grupo.lancamentos.length} parcela(s) vinculadas ao CP existente`,
      })
      .select("id")
      .single();

    if (ce) {
      console.error(`  ❌ Contrato ${nrContrato}:`, ce.message);
      erros++;
      continue;
    }

    criados++;
    console.log(`  ✅ ${nrContrato} | ${credorNome.substring(0,40)} | ${grupo.lancamentos.length} parcelas | R$${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);

    // Cria parcelas_pagamento linkadas ao lancamento existente (sem criar novo CP)
    const parcRows = grupo.lancamentos
      .sort((a, b) => (a.data_vencimento || "").localeCompare(b.data_vencimento || ""))
      .map((l, idx) => ({
        contrato_id:         contrato.id,
        fazenda_id:          FAZ_J7_ID,
        num_parcela:         idx + 1,
        data_vencimento:     l.data_vencimento,
        amortizacao:         Number(l.valor || 0),
        juros:               0,
        despesas_acessorios: 0,
        valor_parcela:       Number(l.valor || 0),
        saldo_devedor:       0,
        status:              "em_aberto",
        lancamento_id:       l.id,
      }));

    const { error: pe } = await sb.from("parcelas_pagamento").insert(parcRows);
    if (pe) console.error(`    ⚠️  Parcelas ${nrContrato}:`, pe.message);
    else parcCriadas += parcRows.length;
  }

  console.log("\n════════════════════════════════════════");
  console.log("  RESUMO — Contratos Financeiros Habio");
  console.log("────────────────────────────────────────");
  console.log(`  Contratos criados:         ${criados}`);
  console.log(`  Pulados (já existiam):     ${pulados}`);
  console.log(`  Erros:                     ${erros}`);
  console.log(`  Parcelas linkadas ao CP:   ${parcCriadas}`);
  console.log(`\n  ✅ Sem duplicação — os CP já importados foram preservados`);
  console.log(`  🔗 Cada parcela_pagamento aponta para o lancamento_id original`);
}

main().catch(console.error);
