/**
 * Etapa 2: Cria os fornecedores e vincula pessoa_id nos lançamentos importados
 * Uso: FAZENDA_ID=<uuid> npx tsx scripts/import-plantae-pessoas.ts
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const FAZENDA_ID = process.env.FAZENDA_ID ?? "";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let cur = "", inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; }
    else if (c === ";" && !inQ) { values.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  values.push(cur.trim());
  return values;
}

function tipoDoc(cnpj: string): "pf" | "pj" {
  return cnpj.replace(/\D/g, "").length <= 11 ? "pf" : "pj";
}

async function main() {
  if (!FAZENDA_ID) { console.error("❌ Defina FAZENDA_ID"); process.exit(1); }

  const raw = fs.readFileSync("/tmp/plantae_maturity.csv", "utf-8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const hdrs  = parseCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());

  // Coletar credores únicos
  const credores = new Map<string, { nome: string; cpf_cnpj: string }>();
  for (let i = 1; i < lines.length; i++) {
    if (!/^\d+;/.test(lines[i])) continue;
    const vals = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    hdrs.forEach((h, idx) => { row[h] = (vals[idx] ?? "").replace(/^"|"$/g, "").trim(); });
    const nome = row["Credor/Fornecedor"] ?? "";
    const cpf  = (row["CPF/CNPJ"] ?? "").replace(/\s/g, "");
    if (nome && cpf && cpf.length >= 11) credores.set(cpf, { nome, cpf_cnpj: cpf });
  }
  console.log(`\n👥 ${credores.size} fornecedores únicos encontrados no CSV\n`);

  // ── Criar/buscar pessoas ─────────────────────────────────────────
  const pessoaMap: Record<string, string> = {}; // cpf → id
  let criados = 0, jaExistiam = 0, erros = 0;

  for (const [cpf, { nome }] of credores) {
    const { data: ex } = await sb.from("pessoas")
      .select("id").eq("fazenda_id", FAZENDA_ID).eq("cpf_cnpj", cpf).maybeSingle();

    if (ex) {
      pessoaMap[cpf] = ex.id;
      jaExistiam++;
    } else {
      const { data: nova, error } = await sb.from("pessoas").insert({
        fazenda_id: FAZENDA_ID,
        nome:       nome.substring(0, 120),
        tipo:       tipoDoc(cpf),
        cpf_cnpj:   cpf,
        cliente:    false,
        fornecedor: true,
      }).select("id").single();

      if (nova) { pessoaMap[cpf] = nova.id; criados++; }
      else { console.warn(`  ⚠️  Erro "${nome}": ${error?.message}`); erros++; }
    }
  }

  console.log(`  ✅ Criados:     ${criados}`);
  console.log(`  ✅ Já existiam: ${jaExistiam}`);
  console.log(`  ❌ Erros:       ${erros}`);
  console.log(`  Total mapeados: ${Object.keys(pessoaMap).length}\n`);

  // ── Vincular pessoa_id nos lançamentos ───────────────────────────
  console.log("🔗 Vinculando fornecedores nos lançamentos...");

  // Buscar todos os lançamentos importados da Plantae sem pessoa_id
  const { data: lancs } = await sb.from("lancamentos")
    .select("id, observacao")
    .eq("fazenda_id", FAZENDA_ID)
    .is("pessoa_id", null)
    .like("observacao", "plantae_ref:%")
    .limit(10000);

  console.log(`  Lançamentos sem fornecedor: ${lancs?.length ?? 0}\n`);

  // Para cada lançamento, achar o CPF no CSV pelo plantae_ref
  // O ref é: plantae_ref:ID_pPARCELA_CATSLUG
  // Precisamos buscar o CPF do credor pelo ID do título
  const idToCpf: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    if (!/^\d+;/.test(lines[i])) continue;
    const vals = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    hdrs.forEach((h, idx) => { row[h] = (vals[idx] ?? "").replace(/^"|"$/g, "").trim(); });
    const id  = row["ID"];
    const cpf = (row["CPF/CNPJ"] ?? "").replace(/\s/g, "");
    if (id && cpf) idToCpf[id] = cpf;
  }

  let atualizados = 0, semMatch = 0;
  for (const lanc of (lancs ?? [])) {
    const obs   = lanc.observacao ?? "";
    const match = obs.match(/^plantae_ref:(\d+)_/);
    if (!match) { semMatch++; continue; }

    const tituloId = match[1];
    const cpf      = idToCpf[tituloId];
    const pessId   = cpf ? pessoaMap[cpf] : null;

    if (!pessId) { semMatch++; continue; }

    await sb.from("lancamentos").update({ pessoa_id: pessId }).eq("id", lanc.id);
    atualizados++;
    if (atualizados % 200 === 0) process.stdout.write(`  ... ${atualizados} atualizados\r`);
  }

  console.log(`\n╔════════════════════════════════════╗`);
  console.log(`║   Resultado — Fornecedores         ║`);
  console.log(`╠════════════════════════════════════╣`);
  console.log(`║  Pessoas criadas:     ${String(criados).padStart(6)}         ║`);
  console.log(`║  Já existiam:         ${String(jaExistiam).padStart(6)}         ║`);
  console.log(`║  Lançamentos linkados:${String(atualizados).padStart(6)}         ║`);
  console.log(`║  Sem match:           ${String(semMatch).padStart(6)}         ║`);
  console.log(`╚════════════════════════════════════╝\n`);
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
