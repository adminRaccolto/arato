// Bateria de perguntas da Olívia: pergunta, corrige e mostra a nota. Gasta créditos da API.
//   node --no-warnings --env-file=.env.local scripts/olivia-bateria.mjs [--modelo=claude-haiku-5-5] [--effort=low] [--ids=a,b] [--saida=arq.json]
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { SYSTEM_PROMPT } from "../lib/olivia/prompt.ts";
import { CONHECIMENTO_OLIVIA } from "../lib/conhecimento-olivia.ts";
import { NAV } from "../lib/navigation.ts";
import { montarMapaMenu, rotasInvalidas } from "../lib/olivia/mapa-menu.ts";

const arg = n => process.argv.find(a => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const modelo = arg("modelo") ?? "claude-haiku-4-5-20251001";
const effort = arg("effort");
const ids = arg("ids")?.split(",");
const bateria = JSON.parse(readFileSync(new URL("../lib/olivia/bateria.json", import.meta.url), "utf8")).filter(q => !ids || ids.includes(q.id));
const system = [{ type: "text", cache_control: { type: "ephemeral" },
  text: `${SYSTEM_PROMPT}\n\n---\n\n${CONHECIMENTO_OLIVIA}\n\n---\n\n## Mapa oficial do menu (vale sobre qualquer outro trecho)\n${montarMapaMenu(NAV)}` }];
const client = new Anthropic();
const limpar = s => s.replace(/[*`_]/g, "").replace(/\s*(→|->)\s*/g, " → ").replace(/[ \t]+/g, " ");
const uso = { input: 0, cacheEscrita: 0, cacheLeitura: 0, saida: 0 };

async function perguntar(q) {
  const r = await client.messages.create({ model: modelo, max_tokens: 8000, system, messages: [{ role: "user", content: q.p }], ...(effort ? { output_config: { effort } } : {}) });
  uso.input += r.usage.input_tokens; uso.cacheEscrita += r.usage.cache_creation_input_tokens ?? 0; uso.cacheLeitura += r.usage.cache_read_input_tokens ?? 0; uso.saida += r.usage.output_tokens;
  const texto = r.content.filter(b => b.type === "text").map(b => b.text).join("\n");
  const t = limpar(texto);
  const erros = [];
  if (q.rota?.length && !q.rota.some(c => t.includes(c))) erros.push(`rota: esperava ${q.rota[0]}`);
  for (const inv of rotasInvalidas(texto, NAV)) erros.push(`rota inexistente: ${inv}`);
  for (const d of q.deve ?? []) if (!new RegExp(d, "i").test(t)) erros.push(`faltou: ${d}`);
  for (const n of q.nao ?? []) if (new RegExp(n, "is").test(t)) erros.push(`não podia: ${n}`);
  return { id: q.id, p: q.p, ok: !erros.length, erros, texto, parada: r.stop_reason };
}
// A primeira grava o cache; as outras leem
const out = [await perguntar(bateria[0])];
for (let i = 1; i < bateria.length; i += 4) out.push(...await Promise.all(bateria.slice(i, i + 4).map(perguntar)));
const grupoDe = id => bateria.find(q => q.id === id).grupo;
const nota = g => { const v = out.filter(r => grupoDe(r.id) === g); return `${v.filter(r => r.ok).length}/${v.length} certas (rotas ${v.filter(r => !r.erros.some(e => e.startsWith("rota"))).length})`; };
console.log(`\n${modelo}${effort ? ` (effort ${effort})` : ""}: base ${nota("base")} | validação ${nota("validacao")}`);
console.log("tokens", JSON.stringify(uso));
for (const r of out.filter(x => !x.ok)) console.log(`  ✗ ${r.id}: ${r.erros.join("; ")}`);
if (arg("saida")) writeFileSync(arg("saida"), JSON.stringify(out, null, 1));
