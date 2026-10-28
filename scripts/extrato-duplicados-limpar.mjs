// Remove linhas de extrato duplicadas por reimportação de OFX com FITID novo (Cresol e outros): mesma conta, data,
// valor, tipo e descrição. Em cada grupo fica 1 linha por transação real (a contagem do grupo no arquivo original não é
// conhecida, então só remove cópias criadas em importações DIFERENTES — created_at com mais de 1 hora de diferença).
// Mantém sempre a conciliada; cópia conciliada a títulos diferentes não é tocada (vai para o relatório).
// Uso: node --env-file=.env.local scripts/extrato-duplicados-limpar.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const norm = t => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const todas = [];
for (let i = 0; ; i += 1000) {
  const { data, error } = await sb.from("extrato_transacoes").select("*").order("id").range(i, i + 999);
  if (error) throw error;
  todas.push(...data);
  if (data.length < 1000) break;
}
const grupos = new Map();
for (const x of todas) {
  const k = [x.conta_bancaria_id, x.data, Math.round(Math.abs(Number(x.valor)) * 100), (x.tipo ?? "").toLowerCase(), norm(x.descricao)].join("|");
  (grupos.get(k) ?? grupos.set(k, []).get(k)).push(x);
}
const vinc = x => [...new Set([x.lancamento_id, ...(x.lancamento_ids ?? [])].filter(Boolean))].sort().join(",");
const apagar = [], conflitos = [];
for (const g of grupos.values()) {
  if (g.length < 2) continue;
  // separa por importação (lote = created_at arredondado à hora): o lote mais antigo é o original
  const porLote = new Map();
  for (const x of g) { const lote = x.created_at.slice(0, 13); (porLote.get(lote) ?? porLote.set(lote, []).get(lote)).push(x); }
  if (porLote.size < 2) continue; // repetição dentro do mesmo arquivo = transações reais iguais
  const lotes = [...porLote.keys()].sort();
  const original = porLote.get(lotes[0]);
  for (const lote of lotes.slice(1)) {
    for (const copia of porLote.get(lote)) {
      // par: uma linha do original ainda não usada
      const par = original.shift();
      if (!par) break; // a cópia excede o original: é transação nova, fica
      if (!copia.conciliado) { apagar.push({ ...copia, motivo: "cópia sem vínculo" }); continue; }
      if (!par.conciliado) { apagar.push({ ...par, motivo: "original sem vínculo; fica a cópia conciliada" }); continue; }
      if (vinc(copia) === vinc(par)) { apagar.push({ ...copia, motivo: "cópia com os mesmos títulos" }); continue; }
      conflitos.push([par, copia]);
    }
  }
}
const contas = {};
for (const a of apagar) contas[a.conta_nome] = (contas[a.conta_nome] ?? 0) + 1;
console.log(JSON.stringify({ linhas: todas.length, a_apagar: apagar.length, por_conta: contas, conflitos: conflitos.length }, null, 1));
for (const [o, c] of conflitos) console.log("CONFLITO", o.conta_nome, o.data, o.valor, norm(o.descricao).slice(0, 30), "| original:", vinc(o), "| cópia:", vinc(c));
if (!aplicar) { console.log("Simulação. Rode com --aplicar para remover (backup em backup/)."); process.exit(0); }
fs.mkdirSync("backup", { recursive: true });
const arq = `backup/extrato_duplicados_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify(apagar, null, 1));
for (let i = 0; i < apagar.length; i += 100) {
  const { error } = await sb.from("extrato_transacoes").delete().in("id", apagar.slice(i, i + 100).map(a => a.id));
  if (error) throw error;
}
console.log(`Removidas ${apagar.length} linhas. Backup: ${arq}`);
