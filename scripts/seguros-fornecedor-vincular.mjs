// Apólices antigas têm a seguradora só como texto, e os títulos do prêmio ficaram sem fornecedor no CP (achado 02/11/2026).
// Liga apólice e títulos ao cadastro de Pessoas do mesmo cliente SÓ quando o nome, sem palavras genéricas, bate com um
// único cadastro. O resto é listado para o usuário escolher na própria apólice. Muda só o vínculo; nunca valor ou baixa.
// Requer a Seção 404. Uso: node --env-file=.env.local scripts/seguros-fornecedor-vincular.mjs [--aplicar]   (sem --aplicar = simulação)
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const aplicar = process.argv.includes("--aplicar");
const GENERICAS = new Set(["SEGUROS", "SEGURO", "SEGURADORA", "SA", "S", "A", "COMPANHIA", "CIA", "DE", "DO", "DA", "LTDA", "CORRETORA"]);
const norm = v => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
  .replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(p => p && !GENERICAS.has(p)).join(" ");

const { data: apolices, error } = await sb.from("apolices_seguro").select("id, numero_apolice, seguradora, conta_id, seguradora_pessoa_id");
if (error) { console.error(error.message); process.exit(1); }
const certas = [], duvidas = [];
for (const a of apolices.filter(x => !x.seguradora_pessoa_id)) {
  const { data: fzs } = await sb.from("fazendas").select("id").eq("conta_id", a.conta_id);
  let pessoas = [];
  for (let de = 0; ; de += 1000) {
    const { data } = await sb.from("pessoas").select("id, nome").in("fazenda_id", fzs.map(f => f.id)).order("id").range(de, de + 999);
    pessoas = pessoas.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }
  const iguais = pessoas.filter(p => norm(p.nome) && norm(p.nome) === norm(a.seguradora));
  if (iguais.length === 1) certas.push({ ...a, pessoa: iguais[0] });
  else duvidas.push({ ...a, candidatos: iguais.length });
}
for (const c of certas) console.log(`OK     ${c.numero_apolice}: "${c.seguradora}" -> ${c.pessoa.nome}`);
for (const d of duvidas) console.log(`ESCOLHER NA APOLICE ${d.numero_apolice}: "${d.seguradora}"${d.candidatos ? ` (${d.candidatos} cadastros iguais)` : " (sem cadastro igual)"}`);
console.log(`Vinculáveis: ${certas.length} · para escolher na tela: ${duvidas.length}`);
if (!aplicar) { console.log("Simulação — nada foi gravado. Rode com --aplicar."); process.exit(0); }

const copia = [];
for (const c of certas) {
  const { data: prem } = await sb.from("pagamentos_premio_seguro").select("lancamento_id").eq("apolice_id", c.id);
  const ids = (prem ?? []).map(p => p.lancamento_id).filter(Boolean);
  const { error: e1 } = await sb.from("apolices_seguro").update({ seguradora_pessoa_id: c.pessoa.id }).eq("id", c.id);
  if (e1) { console.error(c.numero_apolice, e1.message); continue; }
  if (ids.length) {
    const { error: e2 } = await sb.from("lancamentos").update({ pessoa_id: c.pessoa.id }).in("id", ids).is("pessoa_id", null);
    if (e2) { console.error(c.numero_apolice, e2.message); continue; }
  }
  copia.push({ apolice_id: c.id, pessoa_id: c.pessoa.id, lancamentos: ids });
}
const arq = `backup/seguros_fornecedor_${Date.now()}.json`;
fs.writeFileSync(arq, JSON.stringify(copia, null, 1));
console.log(`Feito: ${copia.length} apólice(s). Cópia: ${arq}`);
