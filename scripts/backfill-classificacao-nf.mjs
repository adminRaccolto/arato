import fs from "fs";
import { createClient } from "@supabase/supabase-js";
// Copia da NF de entrada para o título (CP de produtor e de empresa) a operação gerencial, centro de custo, ano safra
// e ciclo — SÓ onde o título está sem o campo.
// Uso: node scripts/backfill-classificacao-nf.mjs         (simula só a operação gerencial)
//      node scripts/backfill-classificacao-nf.mjs exec    (grava só a operação gerencial, com cópia em backup/)
//      acrescente "tudo" para incluir centro de custo, ano safra e ciclo
const EXEC = process.argv.includes("exec");
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => l.includes("=") && !l.startsWith("#")).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
// Por padrão só a OPERAÇÃO GERENCIAL. Centro de custo, ano safra e ciclo mexem no custo por ciclo/DRE do passado: só com o argumento "tudo".
const TUDO = process.argv.includes("tudo");
const CAMPOS = TUDO ? ["operacao_gerencial_id", "centro_custo_id", "ano_safra_id", "ciclo_id"] : ["operacao_gerencial_id"];
async function todas(tabela, campos, filtro) { const out = []; for (let i = 0; ; i += 1000) { let q = sb.from(tabela).select(campos).range(i, i + 999); q = filtro(q); const { data, error } = await q; if (error) throw new Error(`${tabela}: ${error.message}`); out.push(...data); if (data.length < 1000) break; } return out; }
const plano = [];
for (const tabela of ["lancamentos", "empresa_lancamentos"]) {
  const titulos = await todas(tabela, `id, nf_entrada_id, ${CAMPOS.join(", ")}`, q => q.not("nf_entrada_id", "is", null).or(CAMPOS.map(c => `${c}.is.null`).join(",")));
  const ids = [...new Set(titulos.map(t => t.nf_entrada_id))]; const nfs = new Map();
  for (let i = 0; i < ids.length; i += 200) { const { data } = await sb.from("nf_entradas").select(`id, ${CAMPOS.join(", ")}`).in("id", ids.slice(i, i + 200)); for (const n of data ?? []) nfs.set(n.id, n); }
  for (const t of titulos) { const nf = nfs.get(t.nf_entrada_id); if (!nf) continue; const patch = {}; for (const c of CAMPOS) if (!t[c] && nf[c]) patch[c] = nf[c]; if (Object.keys(patch).length) plano.push({ tabela, id: t.id, patch }); }
}
const resumo = {}; for (const p of plano) { resumo[p.tabela] = resumo[p.tabela] || { titulos: 0, ...Object.fromEntries(CAMPOS.map(c => [c, 0])) }; resumo[p.tabela].titulos++; for (const c of Object.keys(p.patch)) resumo[p.tabela][c]++; }
console.log(resumo);
if (!EXEC) process.exit(0);
fs.mkdirSync(new URL("../backup", import.meta.url).pathname, { recursive: true });
fs.writeFileSync(new URL("../backup/backfill_classificacao_nf_20261019.json", import.meta.url).pathname, JSON.stringify(plano.map(p => ({ tabela: p.tabela, id: p.id, antes: Object.fromEntries(Object.keys(p.patch).map(k => [k, null])), depois: p.patch })), null, 1));
let ok = 0; for (const p of plano) { let q = sb.from(p.tabela).update(p.patch).eq("id", p.id); for (const c of Object.keys(p.patch)) q = q.is(c, null); const { error } = await q; if (error) console.log("ERRO", p.id, error.message); else ok++; }
console.log("atualizados:", ok);
