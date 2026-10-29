// Tira das remessas de armazém o retorno registrado em dobro (mesma chave/nº de NF duas vezes — achado 29/10/2026:
// remessa 1323 com a NF 15723 duas vezes). Mantém um registro por NF, refaz o "já voltou" e o status. O estoque não é
// mexido aqui: confira as movimentações "Retorno NF …" do armazém se o retorno também moveu estoque em dobro.
// Uso: node --env-file=.env.local scripts/remessas-retorno-duplicado.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const r2 = n => Math.round(n * 100) / 100;
let all = [], i = 0;
for (;;) { const { data, error } = await sb.from("nf_remessas_logisticas").select("*").not("retornos", "is", null).order("id").range(i, i + 999); if (error) throw error; all = all.concat(data); if (data.length < 1000) break; i += 1000; }
const plano = [];
for (const r of all) {
  const lista = Array.isArray(r.retornos) ? r.retornos : [];
  const vistos = new Set(); const unicos = [];
  for (const x of lista) { const k = x.chave || `n:${x.numero}`; if (vistos.has(k)) continue; vistos.add(k); unicos.push(x); }
  if (unicos.length === lista.length) continue;
  const its = Array.isArray(r.itens_json) ? r.itens_json : [];
  const remetido = its.reduce((t, x) => t + Number(x.valor_total ?? 0), 0) || Number(r.valor_total ?? 0);
  const retornado = r2(unicos.reduce((t, x) => t + Number(x.valor ?? 0), 0));
  const status = retornado >= remetido - 0.01 ? "retornada" : (r.status === "retornada" ? "emitida" : r.status);
  plano.push({ r, unicos, retornado, status });
  console.log(`Remessa ${r.nf_remessa_numero} (${r.destinatario_nome}): ${lista.length} → ${unicos.length} retorno(s) · já voltou ${r.valor_retornado} → ${retornado} · status ${r.status} → ${status}`);
}
console.log(`${plano.length} remessa(s) a corrigir.`);
if (!aplicar) { console.log("Simulação. Rode com --aplicar (backup em backup/)."); process.exit(0); }
fs.mkdirSync("backup", { recursive: true });
const arq = `backup/remessas_retorno_duplicado_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify(plano.map(p => p.r), null, 1));
for (const p of plano) {
  const { error } = await sb.from("nf_remessas_logisticas").update({ retornos: p.unicos, valor_retornado: p.retornado, status: p.status }).eq("id", p.r.id);
  if (error) throw error;
}
console.log(`Corrigido. Backup: ${arq}`);
