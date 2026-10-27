// NFS-e importadas do SIEG com tomador_cnpj = CNPJ do prestador (parser não lia <toma> do Padrão Nacional; corrigido
// 27/10/2026). Recupera o tomador real, nesta ordem: tomador já vinculado na nota (tomador_id) → CPF/CNPJ buscado no
// SIEG, gravado na observação ("— Tomador: X") → único CPF/CNPJ monitorado no SIEG do cliente → vazio (nunca o do
// prestador). Só mexe em tomador_cnpj; notas lançadas à mão ficam de fora.
//
// Uso: node scripts/nfse-tomador-corrigir.mjs            (plano, só leitura — grava backup/nfse_tomador_plano_<data>.json)
//      node scripts/nfse-tomador-corrigir.mjs --aplicar  (grava; o plano serve de backup para desfazer)
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const dig = s => String(s ?? "").replace(/\D/g, "");

async function todas(tabela, colunas) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from(tabela).select(colunas).order("id").range(de, de + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

const notas = (await todas("nf_servicos", "id, fazenda_id, numero_nf, prestador_cnpj, tomador_cnpj, tomador_id, tomador_tipo, observacao, origem"))
  .filter(n => n.origem !== "manual" && dig(n.tomador_cnpj) && dig(n.tomador_cnpj) === dig(n.prestador_cnpj));

const fazendas = await todas("fazendas", "id, conta_id");
const contaDaFazenda = new Map(fazendas.map(f => [f.id, f.conta_id]));
const { data: cfgs } = await db.from("configuracoes_modulo").select("conta_id, config").eq("modulo", "sieg");
const monitorados = new Map();
for (const c of cfgs ?? []) {
  const lista = [...new Set((Array.isArray(c.config?.cnpjs_destino) ? c.config.cnpjs_destino : []).map(dig).filter(Boolean))];
  if (c.conta_id) monitorados.set(c.conta_id, lista);
}
const docDe = {};
for (const [tipo, tabela] of [["produtor", "produtores"], ["empresa", "empresas"], ["pessoa", "pessoas"]]) {
  const ids = [...new Set(notas.filter(n => n.tomador_id && n.tomador_tipo === tipo).map(n => n.tomador_id))];
  docDe[tipo] = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from(tabela).select("id, cpf_cnpj").in("id", ids.slice(i, i + 200));
    for (const r of data ?? []) docDe[tipo].set(r.id, dig(r.cpf_cnpj));
  }
}

const plano = notas.map(n => {
  const prest = dig(n.prestador_cnpj);
  const candidatos = [
    ["tomador vinculado", n.tomador_id ? docDe[n.tomador_tipo]?.get(n.tomador_id) : ""],
    ["observação", (n.observacao ?? "").match(/Tomador:\s*(\d{11,14})/)?.[1]],
    ["único monitorado no SIEG", (() => { const l = monitorados.get(contaDaFazenda.get(n.fazenda_id)) ?? []; return l.length === 1 ? l[0] : ""; })()],
  ];
  const [fonte, novo] = candidatos.find(([, d]) => d && d !== prest) ?? ["sem fonte (fica vazio)", null];
  return { id: n.id, numero_nf: n.numero_nf, fazenda_id: n.fazenda_id, antes: n.tomador_cnpj, depois: novo, fonte };
});

const resumo = {};
for (const p of plano) resumo[p.fonte] = (resumo[p.fonte] ?? 0) + 1;
console.log(`${plano.length} NFS-e com tomador = prestador`, resumo);
const arq = `backup/nfse_tomador_plano_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(new URL(`../${arq}`, import.meta.url), JSON.stringify(plano, null, 1));
console.log(`plano/backup: ${arq}`);

if (aplicar) {
  let ok = 0;
  for (const p of plano) {
    const { error } = await db.from("nf_servicos").update({ tomador_cnpj: p.depois }).eq("id", p.id).eq("tomador_cnpj", p.antes);
    if (error) console.error(p.id, error.message); else ok++;
  }
  console.log(`atualizadas: ${ok}`);
}
