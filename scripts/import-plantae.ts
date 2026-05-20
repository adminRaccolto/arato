/**
 * Importação Plantae → Arato
 * Uso: FAZENDA_ID=<uuid> npx tsx scripts/import-plantae.ts
 *
 * Pré-requisitos:
 *   1. Baixar CSVs da Plantae para /tmp/plantae_maturity.csv e /tmp/plantae_invoice.csv
 *      (já feito pelos curl anteriores)
 *   2. SUPABASE_SERVICE_ROLE_KEY no .env.local
 *   3. FAZENDA_ID = UUID da fazenda no Arato
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// ── Configuração ────────────────────────────────────────────────────
const FAZENDA_ID  = process.env.FAZENDA_ID ?? "";
const DRY_RUN     = process.env.DRY_RUN === "true";
const DATA_MINIMA = process.env.DATA_MINIMA ?? "2025-01-01"; // ignora parcelas anteriores a esta data

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ── Parsing CSV ─────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let cur = "";
  let inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ";" && !inQ) { values.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  values.push(cur.trim());
  return values;
}

function parseCSV(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const hdrs  = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!/^\d+;/.test(lines[i])) continue; // descarta lixo (msg WhatsApp etc)
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 4) continue;
    const row: Record<string, string> = {};
    hdrs.forEach((h, idx) => {
      row[h] = (vals[idx] ?? "").replace(/^"|"$/g, "").trim();
    });
    rows.push(row);
  }
  return rows;
}

// ── Helpers ─────────────────────────────────────────────────────────
function brNum(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
}

function brDate(s: string): string | null {
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function mapMoeda(s: string): "BRL" | "USD" {
  return /d[oó]lar/i.test(s) ? "USD" : "BRL";
}

const TODAY = new Date().toISOString().split("T")[0];

function mapStatus(saldo: number, venc: string | null): "em_aberto" | "vencido" | "baixado" {
  if (saldo === 0) return "baixado";
  if (venc && venc < TODAY) return "vencido";
  return "em_aberto";
}

function mapCategoria(cat: string): string {
  const c = (cat ?? "").toUpperCase();
  if (/MANUTENÇÃO DE MÁQ|MANUTENCAO DE MAQ/i.test(c)) return "Manutenção de Máquinas";
  if (/MANUTENÇÃO DE VEÍ|MANUTENCAO DE VEI/i.test(c)) return "Manutenção de Máquinas";
  if (/PESSOAL/i.test(c))                               return "Mão de Obra";
  if (/OPERACIONAL/i.test(c))                           return "Serviços Agrícolas";
  if (/COMBUSTÍVEL|COMBUSTIVEL/i.test(c))               return "Combustível — Compra para Estoque";
  if (/ENERGIA/i.test(c))                               return "Despesas Administrativas";
  if (/DESPESAS GERAIS|ADMINISTRATIV/i.test(c))         return "Despesas Administrativas";
  if (/TRIBUTOS SOBRE VENDAS/i.test(c))                 return "Impostos";
  if (/TRIBUTÁRI|TRIBUTARI/i.test(c))                   return "Impostos";
  if (/DESPESAS FINANCEIRAS/i.test(c))                  return "Juros e IOF";
  if (/ENDIVIDAMENTO/i.test(c))                         return "Pagamento de Financiamento";
  if (/RECEITAS FINANCEIRAS/i.test(c))                  return "Outros";
  if (/FRETE/i.test(c))                                 return "Fretes e Transportes";
  if (/SEMENTE/i.test(c))                               return "Insumos — Sementes";
  if (/FERTILIZANTE/i.test(c))                          return "Insumos — Fertilizantes";
  if (/INVESTIMENTO/i.test(c))                          return "Outros";
  if (/VENDA/i.test(c))                                 return "Outros";
  return "Outros";
}

// Tenta casar safra Plantae com anos_safra do Arato
function mapSafraSlug(safra: string): string | null {
  if (!safra) return null;
  const s = safra.toUpperCase().replace(/\s+/g, " ").trim();
  if (/SOJA.*25.26|25\/26.*SOJA/i.test(s)) return "25/26";
  if (/SOJA.*24.25|24\/25.*SOJA/i.test(s)) return "24/25";
  if (/SOJA.*23.24|23\/24.*SOJA/i.test(s)) return "23/24";
  if (/MILHO.*2026/i.test(s))              return "2026";
  if (/MILHO.*2025/i.test(s))              return "2025";
  if (/ALGODAO.*2026|ALGODÃO.*2026/i.test(s)) return "2026";
  if (/ALGODAO.*2025|ALGODÃO.*2025/i.test(s)) return "2025";
  if (/ALGODAO.*2024|ALGODÃO.*2024/i.test(s)) return "2024";
  if (/ALGODAO.*2023|ALGODÃO.*2023/i.test(s)) return "2023";
  return null;
}

function tipoDoc(cnpj: string): "pf" | "pj" {
  const d = cnpj.replace(/\D/g, "");
  return d.length <= 11 ? "pf" : "pj";
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Importação Plantae → Arato${DRY_RUN ? " [DRY RUN]" : ""}\n`);

  if (!FAZENDA_ID) {
    console.error("❌ FAZENDA_ID não definido.\n   Uso: FAZENDA_ID=<uuid> npx tsx scripts/import-plantae.ts");
    console.log("\nFazendas disponíveis:");
    const { data } = await sb.from("fazendas").select("id, nome").order("nome");
    (data ?? []).forEach(f => console.log(`  ${f.id}  ${f.nome}`));
    process.exit(1);
  }

  // Confirmar fazenda
  const { data: fazenda } = await sb.from("fazendas").select("nome").eq("id", FAZENDA_ID).single();
  if (!fazenda) { console.error("❌ Fazenda não encontrada"); process.exit(1); }
  console.log(`✅ Fazenda alvo: "${fazenda.nome}"\n`);

  // ── 1. Ler CSVs ─────────────────────────────────────────────────
  const matRows = parseCSV("/tmp/plantae_maturity.csv");
  const invRows = parseCSV("/tmp/plantae_invoice.csv");
  console.log(`📥 Maturity: ${matRows.length} parcelas válidas`);
  console.log(`📥 Invoice:  ${invRows.length} títulos válidos\n`);

  // Lookup emissão por ID do título
  const emissaoByID: Record<string, string> = {};
  for (const r of invRows) {
    const d = brDate(r["Emissão"] ?? "");
    if (r["ID"] && d && !emissaoByID[r["ID"]]) emissaoByID[r["ID"]] = d;
  }

  // ── 2. Buscar anos_safra existentes ─────────────────────────────
  const { data: anosSafra } = await sb.from("anos_safra")
    .select("id, descricao")
    .eq("fazenda_id", FAZENDA_ID);
  const safraMap: Record<string, string> = {}; // slug → id
  for (const a of (anosSafra ?? [])) {
    const slug = mapSafraSlug(a.descricao ?? "");
    if (slug) safraMap[slug] = a.id;
  }
  console.log(`📅 Safras mapeadas: ${Object.keys(safraMap).length} encontradas`);

  // ── 3. Upsert Pessoas (credores) ────────────────────────────────
  console.log("👥 Processando fornecedores...");
  const credores = new Map<string, { nome: string; cpf_cnpj: string }>();
  for (const r of matRows) {
    const nome = r["Credor/Fornecedor"] ?? "";
    const cpf  = (r["CPF/CNPJ"] ?? "").replace(/\s/g, "");
    if (nome && cpf && cpf.length >= 11) credores.set(cpf, { nome, cpf_cnpj: cpf });
  }

  const pessoaMap: Record<string, string> = {}; // cpf_cnpj → pessoa.id

  for (const [cpf, { nome }] of credores) {
    const { data: ex } = await sb.from("pessoas")
      .select("id").eq("fazenda_id", FAZENDA_ID).eq("cpf_cnpj", cpf).maybeSingle();
    if (ex) {
      pessoaMap[cpf] = ex.id;
    } else if (!DRY_RUN) {
      const { data: nova, error } = await sb.from("pessoas").insert({
        fazenda_id: FAZENDA_ID,
        nome:       nome.substring(0, 120),
        tipo:       tipoDoc(cpf),
        cpf_cnpj:   cpf,
        cliente:    false,
        fornecedor: true,
      }).select("id").single();
      if (nova) pessoaMap[cpf] = nova.id;
      else console.warn(`  ⚠️  Erro ao criar pessoa "${nome}": ${error?.message}`);
    } else {
      pessoaMap[cpf] = "DRY_RUN_ID";
    }
  }
  console.log(`  ✅ ${Object.keys(pessoaMap).length} fornecedores prontos\n`);

  // ── 4. Importar Lançamentos ─────────────────────────────────────
  console.log("💰 Importando lançamentos...");
  let importados = 0, ignorados = 0, erros = 0, duplicados = 0;

  // Chave de dedup: buscar refs já importados
  const { data: jaimportados } = await sb.from("lancamentos")
    .select("observacao")
    .eq("fazenda_id", FAZENDA_ID)
    .like("observacao", "plantae_ref:%");
  const refsExistentes = new Set((jaimportados ?? []).map(l => l.observacao?.split("\n")[0]));

  console.log(`📆 Filtro de data: >= ${DATA_MINIMA}\n`);

  for (const r of matRows) {
    const tipo = r["Tipo"]?.trim();
    if (tipo !== "Despesa" && tipo !== "Receita") { ignorados++; continue; }

    // Filtro de data mínima (vencimento)
    const vencTeste = brDate(r["Vencimento"] ?? "");
    if (vencTeste && vencTeste < DATA_MINIMA) { ignorados++; continue; }

    // Se SOMENTE_ABERTO=true, importar apenas parcelas com saldo > 0
    if (process.env.SOMENTE_ABERTO === "true") {
      const saldoTeste = brNum(r["Saldo da Parcela (R$)"] ?? r["Saldo da Parcela"] ?? "");
      if (saldoTeste <= 0) { ignorados++; continue; }
    }

    const id        = r["ID"];
    const parcNum   = r["Parcela Número"] || "1";
    const totParcelas = r["Número de Parcelas"] || "1";
    const catSlug   = (r["Categoria Contábil"] ?? "geral").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 20);
    const ref       = `plantae_ref:${id}_p${parcNum}_${catSlug}`;

    if (refsExistentes.has(ref)) { duplicados++; continue; }

    const valor = brNum(r["Total da Parcela (R$)"] ?? r["Total da Parcela"] ?? "");
    if (valor <= 0) { ignorados++; continue; }

    const saldo    = brNum(r["Saldo da Parcela (R$)"] ?? r["Saldo da Parcela"] ?? "");
    const venc     = brDate(r["Vencimento"] ?? "");
    const emissao  = emissaoByID[id] ?? venc ?? TODAY;
    const cpf      = (r["CPF/CNPJ"] ?? "").replace(/\s/g, "");
    const moeda    = mapMoeda(r["Moeda"] ?? "");
    const safraSlug = mapSafraSlug(r["Safra"] ?? "");
    const status   = mapStatus(saldo, venc);

    // Extrair nome razão social (produtor vinculado)
    const razaoSocial = r["Razão Social"] ?? "";

    // Observação com ref de dedup + info da razão social
    const obs = [
      ref,
      r["Observação"] ?? "",
      razaoSocial ? `Produtor: ${razaoSocial}` : "",
    ].filter(Boolean).join("\n");

    const lancamento: Record<string, unknown> = {
      fazenda_id:       FAZENDA_ID,
      tipo:             tipo === "Despesa" ? "pagar" : "receber",
      descricao:        (r["Descrição"] || r["Documento"] || `Plantae #${id}`).substring(0, 200),
      categoria:        mapCategoria(r["Categoria Contábil"] ?? ""),
      valor,
      moeda,
      data_lancamento:  emissao,
      data_vencimento:  venc ?? emissao,
      status,
      data_baixa:       status === "baixado" ? (venc ?? emissao) : null,
      valor_pago:       status === "baixado" ? valor : null,
      pessoa_id:        cpf ? (pessoaMap[cpf] ?? null) : null,
      observacao:       obs,
      auto:             true,
      ...(safraSlug && safraMap[safraSlug] ? { ano_safra_id: safraMap[safraSlug] } : {}),
    };

    if (DRY_RUN) {
      if (importados < 3) console.log("  SAMPLE:", JSON.stringify(lancamento, null, 2));
      importados++;
      continue;
    }

    const { error } = await sb.from("lancamentos").insert(lancamento);
    if (error) {
      if (importados < 5 || erros < 3) console.error(`  ❌ ID ${id}: ${error.message}`);
      erros++;
    } else {
      importados++;
      if (importados % 200 === 0) process.stdout.write(`  ... ${importados} importados\r`);
    }
  }

  console.log(`\n\n╔═══════════════════════════════╗`);
  console.log(`║   Resultado da Importação     ║`);
  console.log(`╠═══════════════════════════════╣`);
  console.log(`║  ✅ Importados:  ${String(importados).padStart(6)}         ║`);
  console.log(`║  ⏭️  Duplicados:  ${String(duplicados).padStart(6)}         ║`);
  console.log(`║  ⏩ Ignorados:   ${String(ignorados).padStart(6)}         ║`);
  console.log(`║  ❌ Erros:       ${String(erros).padStart(6)}         ║`);
  console.log(`╚═══════════════════════════════╝\n`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
