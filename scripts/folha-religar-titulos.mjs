// Religa as linhas de folha FECHADA que perderam o título do salário (sem título ou título apagado), quando existe um
// único título real solto do mesmo funcionário e competência. Os casos com mais de um título só são listados.
// Com --mais-antigo, os casos com mais de um título ligam ao criado primeiro; os demais títulos ficam como estão.
// Uso: node --env-file=.env.local scripts/folha-religar-titulos.mjs [--mais-antigo] [--aplicar]
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const aplicar = process.argv.includes("--aplicar");
const maisAntigo = process.argv.includes("--mais-antigo");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function todos(montar) {
  let r = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw error;
    r = r.concat(data);
    if (data.length < 1000) return r;
  }
}
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const folhas = (await todos(() => s.from("folha_pagamento").select("id, fazenda_id, competencia, status").order("id"))).filter(f => f.status !== "rascunho");
const folhaPor = new Map(folhas.map(f => [f.id, f]));
const linhas = await todos(() => s.from("folha_funcionarios").select("id, folha_id, funcionario_id, nome_funcionario, cp_lancamento_id").order("id"));
const ligados = new Set(linhas.map(l => l.cp_lancamento_id).filter(Boolean));
const titulos = await todos(() => s.from("lancamentos").select("id, fazenda_id, funcionario_id, descricao, status, natureza, valor, data_vencimento, created_at").ilike("descricao", "Sal_rio %").not("funcionario_id", "is", null).order("id"));
const idsTitulo = new Set(titulos.map(t => t.id));
const apontados = [...ligados].filter(id => !idsTitulo.has(id));
const existentes = new Set(idsTitulo);
for (let i = 0; i < apontados.length; i += 200) {
  const { data, error } = await s.from("lancamentos").select("id").in("id", apontados.slice(i, i + 200));
  if (error) throw error;
  for (const t of data ?? []) existentes.add(t.id);
}
const soltos = titulos.filter(t => !ligados.has(t.id) && t.status !== "cancelado" && t.natureza !== "previsao");

const religar = [], ambiguos = [], semTitulo = [];
for (const l of linhas) {
  const f = folhaPor.get(l.folha_id);
  if (!f || !l.funcionario_id || (l.cp_lancamento_id && existentes.has(l.cp_lancamento_id))) continue;
  const [ano, mes] = f.competencia.split("-");
  const rotulo = `${MESES[Number(mes) - 1]}/${ano}`;
  const c = soltos.filter(t => t.funcionario_id === l.funcionario_id && t.fazenda_id === f.fazenda_id && t.descricao.includes(rotulo));
  const nome = `${f.competencia} ${l.nome_funcionario}`;
  if (c.length === 1) religar.push({ linha: l.id, anterior: l.cp_lancamento_id, titulo: c[0].id, nome, valor: c[0].valor, status: c[0].status });
  else if (c.length > 1 && maisAntigo) {
    const t = [...c].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    religar.push({ linha: l.id, anterior: l.cp_lancamento_id, titulo: t.id, nome, valor: t.valor, status: t.status });
    console.log(`Fora da folha: ${nome}: ${c.filter(x => x.id !== t.id).map(x => `${x.status} R$ ${x.valor}, criado em ${x.created_at.slice(0, 10)}`).join(" | ")}`);
  } else if (c.length > 1) ambiguos.push(`${nome}: ${c.map(t => `${t.status} R$ ${t.valor} venc ${t.data_vencimento}`).join(" | ")}`);
  else semTitulo.push(nome);
}
console.log(`Religar (${religar.length}):`);
for (const r of religar) console.log(`  ${r.nome} -> ${r.status} R$ ${r.valor}`);
console.log(`\nMais de um título, não alterados (${ambiguos.length}):\n  ${ambiguos.join("\n  ")}`);
console.log(`\nSem título nenhum (${semTitulo.length}):\n  ${semTitulo.join("\n  ")}`);

if (!aplicar) { console.log("\nNada foi alterado. Para aplicar, rode com --aplicar."); process.exit(0); }
const arquivo = `backup/folha_religar_titulos_${Date.now()}.json`;
writeFileSync(arquivo, JSON.stringify(religar, null, 1));
for (const r of religar) {
  const { error } = await s.from("folha_funcionarios").update({ cp_lancamento_id: r.titulo }).eq("id", r.linha);
  if (error) throw error;
}
console.log(`\n${religar.length} linha(s) religada(s). Cópia para desfazer: ${arquivo}`);
