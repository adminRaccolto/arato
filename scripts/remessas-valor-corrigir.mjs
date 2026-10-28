// Corrige o valor unitário de remessas registradas por XML externo em 28/10/2026 antes da correção da leitura do número
// (o "." decimal do XML era lido como milhar: 96.8193 virou 968193). Quantidades estão certas; só valores.
// CONFIRA o valor unitário na DANFE de cada remessa antes de aplicar e ajuste a tabela abaixo se preciso.
// Uso: node --env-file=.env.local scripts/remessas-valor-corrigir.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// nº da remessa → valor unitário correto (R$), na ordem dos itens da remessa
const CORRETO = {
  "2863": [96.8193],   // VERTIMEC — gravado 968193
  "3032": [28.26],     // METHOS 960 TM — gravado 2826
  "2881": [242.24],    // LANEX 800 WG — gravado 24224
};

const { data, error } = await sb.from("nf_remessas_logisticas").select("id, nf_remessa_numero, itens_json, valor_total, valor_retornado, status")
  .eq("emissao", "externa").in("nf_remessa_numero", Object.keys(CORRETO));
if (error) throw error;
const plano = [];
for (const r of data) {
  const its = Array.isArray(r.itens_json) ? r.itens_json : [];
  const vus = CORRETO[r.nf_remessa_numero];
  if (its.length !== vus.length) { console.log(`Remessa ${r.nf_remessa_numero}: ${its.length} itens, tabela tem ${vus.length} — pulada`); continue; }
  const novos = its.map((i, k) => ({ ...i, valor_unitario: vus[k], valor_total: Math.round(Number(i.quantidade) * vus[k] * 100) / 100 }));
  const total = Math.round(novos.reduce((t, i) => t + i.valor_total, 0) * 100) / 100;
  const retornada = Number(r.valor_retornado ?? 0) >= total - 0.01;
  plano.push({ id: r.id, numero: r.nf_remessa_numero, antes: { itens_json: r.itens_json, valor_total: r.valor_total, status: r.status }, depois: { itens_json: novos, valor_total: total, ...(retornada ? { status: "retornada" } : {}) } });
  console.log(`Remessa ${r.nf_remessa_numero}: total ${Number(r.valor_total).toLocaleString("pt-BR")} → ${total.toLocaleString("pt-BR")} · já voltou ${Number(r.valor_retornado ?? 0).toLocaleString("pt-BR")}${retornada ? " → passa a Retornada" : ` · falta ${(total - Number(r.valor_retornado ?? 0)).toLocaleString("pt-BR")}`}`);
}
if (!aplicar) { console.log("Simulação. Confira os valores na DANFE e rode com --aplicar (backup em backup/)."); process.exit(0); }
fs.mkdirSync("backup", { recursive: true });
const arq = `backup/remessas_valor_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify(plano, null, 1));
for (const p of plano) { const { error: e } = await sb.from("nf_remessas_logisticas").update(p.depois).eq("id", p.id); if (e) throw e; }
console.log(`Corrigido. Backup: ${arq}`);
