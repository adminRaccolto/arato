// Corrige o vencimento de títulos com ano digitado errado (0026 → 2026, 0206 → 2026). Valor, status e demais datas ficam como estão.
// Sem --aplicar só lista. Com --aplicar grava e salva o estado anterior em backup/ para desfazer.
// Uso: node --env-file=.env.local scripts/corrigir-datas-titulos.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TABELAS = [
  { tabela: "lancamentos", campos: ["data_vencimento"], conferir: ["data_lancamento", "data_baixa"] },
  { tabela: "empresa_lancamentos", campos: ["data_vencimento"], conferir: ["data_pagamento"] },
];

function corrigir(data) {
  const ano = Number(data.slice(0, 4));
  if (ano >= 2000) return data;
  if (ano < 100) return `${2000 + ano}${data.slice(4)}`;
  if (ano === 206) return `2026${data.slice(4)}`; // conferido: a baixa desse título é 10/07/2026
  return null;
}

const backup = [];
let corrigidos = 0, falhas = 0, semRegra = 0;
for (const { tabela, campos, conferir } of TABELAS) {
  const porId = new Map();
  for (const c of campos) {
    const { data, error } = await sb.from(tabela).select(`id, descricao, ${campos.join(", ")}`).lt(c, "2000-01-01").order("id").limit(1000);
    if (error) throw new Error(`${tabela}.${c}: ${error.message}`);
    for (const r of data ?? []) porId.set(r.id, r);
  }
  console.log(`\n${tabela}: ${porId.size} vencimento(s) com ano inválido`);
  // Outras datas erradas não têm regra segura (0015 pode ser 2025): só avisa, para corrigir à mão
  for (const c of conferir) {
    const { data } = await sb.from(tabela).select(`id, descricao, data_vencimento, ${c}`).lt(c, "2000-01-01").order("id").limit(100);
    for (const r of data ?? []) console.log(`  A CONFERIR À MÃO: ${String(r.descricao ?? "").slice(0, 45)} · ${c}=${r[c]} · vencimento ${r.data_vencimento} · ${r.id}`);
  }
  for (const r of porId.values()) {
    const novo = {};
    for (const c of campos) {
      if (!r[c] || Number(String(r[c]).slice(0, 4)) >= 2000) continue;
      const v = corrigir(String(r[c]).slice(0, 10));
      if (v) novo[c] = v; else { semRegra++; console.log(`  SEM REGRA ${r.id} ${c}=${r[c]}`); }
    }
    console.log(`  ${String(r.descricao ?? "").slice(0, 50).padEnd(50)} ${Object.entries(novo).map(([c, v]) => `${c}: ${r[c]} → ${v}`).join(" · ")}`);
    if (!aplicar || !Object.keys(novo).length) continue;
    backup.push({ tabela, id: r.id, antes: Object.fromEntries(Object.keys(novo).map(c => [c, r[c]])), depois: novo });
    const { error } = await sb.from(tabela).update(novo).eq("id", r.id);
    if (error) { falhas++; console.log(`  FALHOU ${r.id}: ${error.message}`); } else corrigidos++;
  }
}
if (aplicar && backup.length) {
  mkdirSync("backup", { recursive: true });
  const arq = `backup/corrigir_datas_titulos_${new Date().toISOString().slice(0, 19).replace(/\D/g, "")}.json`;
  writeFileSync(arq, JSON.stringify(backup, null, 2));
  console.log(`\nEstado anterior salvo em ${arq}`);
}
console.log(aplicar ? `\nCorrigidos: ${corrigidos} · falhas: ${falhas} · sem regra: ${semRegra}` : `\nNada foi gravado. Sem regra: ${semRegra}. Para aplicar: --aplicar`);
