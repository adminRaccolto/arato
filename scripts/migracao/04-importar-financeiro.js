/**
 * Migração financeira Agro1 → Arato
 *   1. CR (Contas a Receber) → lancamentos tipo='receber'
 *   2. DIVIDA (contratos financeiros) → contratos_financeiros
 *   3. DIVIDA_PARCELAS → parcelas_pagamento
 *
 * Uso: node scripts/migracao/04-importar-financeiro.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env.local") });
const { createClient } = require("@supabase/supabase-js");
const fs   = require("fs");
const path = require("path");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DIR  = path.join(__dirname, "dados");
const load = (n) => JSON.parse(fs.readFileSync(path.join(DIR, `${n}.json`), "utf8"));

const CONTA_ID  = "87109388-a698-42d9-917e-adb1ed5d8768";
const FAZ_SAPEZAL = "986dade6-6b18-4c1f-b2f7-b9df740c3571";

// Encoding fix (Firebird win1252 → utf8)
const fix = (s) => {
  if (!s) return s;
  return String(s).replace(/�/g, "?").replace(/[^\x00-\x7F]/g, (c) => c).trim();
};

function iso(d) {
  if (!d) return null;
  return new Date(d).toISOString().slice(0, 10);
}

function normalDoc(s) {
  if (!s) return null;
  return String(s).replace(/\D/g, "").slice(-14) || null;
}

// Tipos de dívida Agro1 → tipo Arato
const TIPO_MAP = {
  "C": "custeio",       // Custeio
  "P": "outros",        // (usado para empréstimos/swap)
  "I": "investimento",  // Investimento
  "S": "securitizacao", // Securitização
  "E": "egf",           // EGF
};

// Periodicidade Agro1 → meses
const PERIOD_MAP = {
  "M": 1,   // mensal
  "B": 2,   // bimestral
  "T": 3,   // trimestral
  "S": 6,   // semestral
  "A": 12,  // anual
};

let erros = [];

async function main() {
  console.log("\n📦 Carregando dados extraídos...");
  const cr_src      = load("contas_receber");
  const dividas_src = load("dividas");
  const parc_src    = load("dividas_parcelas");

  // ── Busca fazendas da conta ─────────────────────────────────────────────
  const { data: fazendas } = await sb
    .from("fazendas")
    .select("id, nome")
    .eq("conta_id", CONTA_ID);

  const fazMap = {};
  fazendas.forEach(f => {
    fazMap[f.nome.toLowerCase()] = f.id;
  });
  console.log("  Fazendas encontradas:", fazendas.map(f => f.nome).join(", "));

  // Usa Sapezal como padrão (empreendimentos sem propriedade vinculada)
  const FAZ_DEFAULT = FAZ_SAPEZAL;

  // ── Busca anos safra ────────────────────────────────────────────────────
  const { data: anosSafra } = await sb
    .from("anos_safra")
    .select("id, descricao, fazenda_id")
    .in("fazenda_id", fazendas.map(f => f.id));

  // Mapeia CD_SAFRA → ano_safra_id por correspondência de ano
  // Safra 9 = 2025/2026, 10 = 2026/2027
  const safraAnoMap = { 9: null, 10: null };
  anosSafra.forEach(a => {
    if (a.descricao.includes("2025") || a.descricao.includes("2024")) safraAnoMap[9] = a.id;
    if (a.descricao.includes("2026")) safraAnoMap[10] = a.id;
  });
  console.log("  Anos safra mapeados:", JSON.stringify(safraAnoMap));

  // ── Busca pessoas ───────────────────────────────────────────────────────
  const { data: pessoas } = await sb
    .from("pessoas")
    .select("id, nome, cpf_cnpj")
    .in("fazenda_id", fazendas.map(f => f.id));

  const pessoaDocMap = {};
  const pessoaNomeMap = {};
  pessoas.forEach(p => {
    if (p.cpf_cnpj) pessoaDocMap[p.cpf_cnpj.replace(/\D/g, "")] = p.id;
    pessoaNomeMap[p.nome.toLowerCase().trim()] = p.id;
  });

  function resolvePessoa(cr) {
    const cpfRaw = cr.PESSOA_CPF ? String(cr.PESSOA_CPF).replace(/\D/g, "") : null;
    const cnpjRaw = cr.PESSOA_CNPJ ? String(cr.PESSOA_CNPJ).replace(/\D/g, "") : null;
    if (cpfRaw && pessoaDocMap[cpfRaw]) return pessoaDocMap[cpfRaw];
    if (cnpjRaw && pessoaDocMap[cnpjRaw]) return pessoaDocMap[cnpjRaw];
    const nomeKey = (cr.PESSOA_NOME || "").toLowerCase().trim();
    return pessoaNomeMap[nomeKey] || null;
  }

  // ── Busca contas bancárias ──────────────────────────────────────────────
  const { data: bancos } = await sb
    .from("contas_bancarias")
    .select("id, nome")
    .in("fazenda_id", fazendas.map(f => f.id));

  const bancoNomeMap = {};
  bancos.forEach(b => {
    bancoNomeMap[b.nome.toLowerCase().trim()] = b.id;
  });

  function resolveBanco(nome) {
    if (!nome) return null;
    return bancoNomeMap[nome.toLowerCase().trim()] || null;
  }

  // ════════════════════════════════════════════════════════════════════════
  // 1. CR → lancamentos tipo='receber'
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n🟢 [1/3] Importando CR (Contas a Receber)...");

  const crRows = cr_src.map((cr) => {
    const vencimento  = iso(cr.DATA_VENCIMENTO);
    const emissao     = iso(cr.DT_EMISSAO);
    const lancamento  = iso(cr.DT_LANCTO);
    const pessoaId    = resolvePessoa(cr);
    const contaBanId  = resolveBanco(cr.CONTA_BANCARIA);
    const anoSafraId  = safraAnoMap[cr.CD_SAFRA] || null;

    const descricao = fix(cr.OBS)
      || fix(cr.PESSOA_NOME)
      || `CR Agro1 #${cr.NR_SEQ_GEN}`;

    // Categoria baseada na origem
    const categoria = cr.ORIGEM === "NOTAS" ? "receita_graos"
      : cr.ORIGEM === "DIVID" ? "receita_financeira"
      : "outros";

    return {
      fazenda_id:      FAZ_DEFAULT,
      tipo:            "receber",
      moeda:           "BRL",
      categoria,
      descricao:       descricao.slice(0, 250),
      data_lancamento: lancamento || iso(new Date()),
      data_vencimento: vencimento,
      data_emissao:    emissao,
      valor:           Number(cr.VL_PARCELA) || 0,
      status:          "em_aberto",
      auto:            false,
      pessoa_id:       pessoaId,
      conta_bancaria_id: contaBanId,
      numero_documento:  cr.NR_DOCUMENTO ? String(cr.NR_DOCUMENTO) : null,
      ano_safra_id:    anoSafraId,
      origem_lancamento: "manual",
      observacao:      `Migrado Agro1 #${cr.NR_SEQ_GEN} | Origem: ${cr.ORIGEM || "?"}`,
    };
  });

  // Filtra registros sem vencimento
  const crValidos = crRows.filter(r => r.data_vencimento);
  console.log(`  Total CR: ${cr_src.length} → válidos: ${crValidos.length}`);

  let crOk = 0;
  for (let i = 0; i < crValidos.length; i += 50) {
    const batch = crValidos.slice(i, i + 50);
    const { error } = await sb.from("lancamentos").insert(batch);
    if (error) {
      console.error(`  ❌ Batch CR ${i}-${i+50}:`, error.message);
      erros.push({ step: "CR", batch: i, msg: error.message });
    } else {
      crOk += batch.length;
    }
  }
  console.log(`  ✅ CR importados: ${crOk}/${crValidos.length}`);

  // ════════════════════════════════════════════════════════════════════════
  // 2. DIVIDA → contratos_financeiros
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n🟢 [2/3] Importando contratos financeiros (DIVIDA)...");

  // Mapa CD_DIVIDA → contrato_id Arato (para associar parcelas)
  const dividaContratoMap = {};

  for (const div of dividas_src) {
    const credorId = div.CREDOR_CNPJ
      ? pessoaDocMap[String(div.CREDOR_CNPJ).replace(/\D/g, "")] || null
      : pessoaNomeMap[(div.CREDOR || "").toLowerCase().trim()] || null;

    const anoSafraId = safraAnoMap[div.CD_SAFRA] || null;
    const moeda = div.CD_MOEDA === 2 ? "USD" : "BRL";
    const periodoMeses = PERIOD_MAP[div.PERIODICIDADE] ?? 12;

    // Mapeamento do tipo
    const tipoRaw = (div.ST_TIPO_DIVIDA || "").toUpperCase();
    const tipo = TIPO_MAP[tipoRaw] || "outros";

    const row = {
      fazenda_id:         FAZ_DEFAULT,
      numero_contrato:    fix(div.NR_CONTRATO) || null,
      pessoa_id:          credorId,
      descricao:          fix(div.DESCRICAO) || `Contrato ${div.NR_CONTRATO || div.CD_DIVIDA}`,
      credor:             fix(div.CREDOR) || "?",
      tipo,
      moeda,
      valor_total:        Number(div.VALOR_FINANCIADO) || 0,
      cotacao_usd:        div.CD_MOEDA === 2 ? (Number(div.VL_COTACAO) || null) : null,
      data_contrato:      iso(div.DATA) || iso(new Date()),
      taxa_juros_am:      Number(div.TAXA_JURO_MES) || null,
      conta_pagamento_id: null,
      observacao:         `Migrado Agro1 CD_DIVIDA=${div.CD_DIVIDA}`,
      status:             "ativo",
    };

    const { data: criado, error } = await sb
      .from("contratos_financeiros")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error(`  ❌ DIVIDA ${div.CD_DIVIDA}:`, error.message);
      erros.push({ step: "divida", id: div.CD_DIVIDA, msg: error.message });
    } else {
      dividaContratoMap[div.CD_DIVIDA] = criado.id;
    }
  }

  const contrOk = Object.keys(dividaContratoMap).length;
  console.log(`  ✅ Contratos importados: ${contrOk}/${dividas_src.length}`);

  // ════════════════════════════════════════════════════════════════════════
  // 3. DIVIDA_PARCELAS → parcelas_pagamento
  // ════════════════════════════════════════════════════════════════════════
  console.log("\n🟢 [3/3] Importando parcelas dos contratos...");

  const parcRows = [];
  for (const p of parc_src) {
    const contratoId = dividaContratoMap[p.CD_DIVIDA];
    if (!contratoId) continue;

    parcRows.push({
      contrato_id:         contratoId,
      fazenda_id:          FAZ_DEFAULT,
      num_parcela:         Number(p.NUM_PARC),
      data_vencimento:     iso(p.DATA_VENCIMENTO),
      amortizacao:         Number(p.VALOR_AMORTIZACAO) || 0,
      juros:               Number(p.VALOR_JUROS_ENCARGOS) || 0,
      despesas_acessorios: Number(p.VALOR_ACESSORIOS) || 0,
      valor_parcela:       Number(p.VALOR_PARCELAS) || 0,
      saldo_devedor:       Number(p.SALDO_DEVEDOR) || 0,
      status:              "em_aberto",
    });
  }

  let parcOk = 0;
  for (let i = 0; i < parcRows.length; i += 50) {
    const batch = parcRows.slice(i, i + 50);
    const { error } = await sb.from("parcelas_pagamento").insert(batch);
    if (error) {
      console.error(`  ❌ Parcelas batch ${i}:`, error.message);
      erros.push({ step: "parcelas", batch: i, msg: error.message });
    } else {
      parcOk += batch.length;
    }
  }
  console.log(`  ✅ Parcelas importadas: ${parcOk}/${parcRows.length}`);

  // ── Resumo ──────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("  RESUMO DA MIGRAÇÃO FINANCEIRA");
  console.log("────────────────────────────────────────");
  console.log(`  CR (receber):          ${crOk}`);
  console.log(`  Contratos financeiros: ${contrOk}`);
  console.log(`  Parcelas:              ${parcOk}`);
  if (erros.length > 0) {
    console.log(`\n  ⚠️  ${erros.length} erro(s):`);
    erros.forEach(e => console.error("   •", JSON.stringify(e)));
  } else {
    console.log("\n  ✅ Sem erros!");
  }
}

main().catch(console.error);
