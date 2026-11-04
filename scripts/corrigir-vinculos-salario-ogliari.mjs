// Grupo Ogliari: corrige salários conciliados com a linha de outra pessoa (sugestão antiga comparava só valor e data)
// e o boleto da Líder Pneus ligado ao salário do José Eugênio. Só mexe nos itens listados abaixo.
// Sem --aplicar só lista. Com --aplicar grava e salva o estado anterior em backup/ para desfazer.
// Uso: node --env-file=.env.local scripts/corrigir-vinculos-salario-ogliari.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const HOJE = new Date().toISOString().slice(0, 10);

// Linha do extrato → título atual → título certo (null = a linha fica sem título, para conferir na tela)
const VINCULOS = [
  { linha: "3058eff1", atual: "01c4ba84", certo: "e27efd48" }, // Wanderley: Edson → Wanderley
  { linha: "59042146", atual: "59d0c0f5", certo: "5d12c458" }, // Joice: Ilsilene → Joice
  { linha: "a71fe3a1", atual: "5d12c458", certo: "59d0c0f5" }, // Ilsilene: Joice → Ilsilene
  { linha: "59573ca6", atual: "2bd4b0d5", certo: "a48ec084" }, // Adilson Porfiro: Patrick → Adilson
  { linha: "519c11d0", atual: null,       certo: "2bd4b0d5" }, // Patrick: linha aberta → Patrick
  { linha: "d02a6c56", atual: "0bba1bdf", certo: "d5291843" }, // Robilson: Ronaldo → Robilson
  { linha: "7d4d83a3", atual: null,       certo: "0bba1bdf" }, // Ronaldo: linha aberta → Ronaldo
  { linha: "77bd5efa", atual: "4240327c", certo: "115e9267" }, // Odair José: Adir → Odair José
  { linha: "7b7eb7eb", atual: "115e9267", certo: null },       // Argemiro: R$ 3.000 x título de R$ 2.746,59 — o usuário decide
  { linha: "ff960791", atual: "613be9e4", certo: "663200ad" }, // Boleto Líder Pneus: José Eugênio → NF 22764
];
// A baixa destes títulos só existia pela linha errada: não há pagamento no extrato, voltam a ficar em aberto
const REABRIR = ["01c4ba84" /* Edson Out/2026 */, "4240327c" /* Adir Out/2026 */];
// Fica só com a linha dele: a baixa passa para a data e a conta dessa linha
const REDATAR = [{ titulo: "613be9e4", linha: "7f8b63c8" }]; // José Eugênio

const { data: conta } = await sb.from("contas").select("id").eq("nome", "Grupo Ogliari").single();
const { data: faz } = await sb.from("fazendas").select("id").eq("conta_id", conta.id);
const fazIds = faz.map(f => f.id);

async function todos(tabela, campos, filtro) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(campos)).in("fazenda_id", fazIds).order("id").range(i, i + 999);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}
const linhas = await todos("extrato_transacoes", "*", q => q.gte("data", "2026-08-01").lte("data", "2026-11-30"));
const titulos = await todos("lancamentos", "id,descricao,valor,valor_pago,status,data_baixa,data_vencimento,conta_bancaria,conciliado", q => q.gte("data_vencimento", "2026-08-01").lte("data_vencimento", "2026-11-30"));
const unico = (lista, p, nome) => {
  const achados = lista.filter(x => x.id.startsWith(p));
  if (achados.length !== 1) throw new Error(`${nome} ${p}: ${achados.length} encontrado(s)`);
  return achados[0];
};
const L = p => unico(linhas, p, "linha");
const T = p => unico(titulos, p, "título");
const fmt = t => `${t.descricao} (${t.status}${t.data_baixa ? ` ${t.data_baixa}` : ""})`;

// Confere tudo antes de gravar qualquer coisa: se alguém já mexeu na tela, para
const problemas = [];
for (const v of VINCULOS) {
  const l = L(v.linha);
  if (v.atual ? !l.lancamento_id?.startsWith(v.atual) : l.lancamento_id) problemas.push(`linha ${v.linha} mudou: ${l.lancamento_desc ?? "sem título"}`);
  if (v.certo && Math.abs(Number(T(v.certo).valor) - Number(l.valor)) > 0.005) problemas.push(`valor diferente: linha ${v.linha} ${l.valor} x ${T(v.certo).descricao} ${T(v.certo).valor}`);
}
for (const p of REABRIR) if (T(p).status !== "baixado") problemas.push(`título ${p} não está baixado`);
if (problemas.length) { console.error("Nada foi gravado. Mudou algo desde a conferência:\n" + problemas.join("\n")); process.exit(1); }

const planoLinhas = VINCULOS.map(v => {
  const l = L(v.linha), t = v.certo ? T(v.certo) : null;
  console.log(`${l.data}  ${String(l.valor).padStart(6)}  ${l.descricao.slice(24, 58).padEnd(34)} ${l.lancamento_desc ?? "(sem título)"} → ${t?.descricao ?? "(sem título, conferir na tela)"}`);
  return { id: l.id, novo: t
    ? { conciliado: true, lancamento_id: t.id, lancamento_ids: [t.id], lancamento_desc: t.descricao, lancamento_valor: Number(t.valor), origem_vinculo: "manual", confianca: null }
    : { conciliado: false, lancamento_id: null, lancamento_ids: null, lancamento_desc: null, lancamento_valor: null, origem_vinculo: null, confianca: null } };
});
console.log("");
const planoTitulos = [];
for (const v of VINCULOS.filter(x => x.certo)) {
  const l = L(v.linha), t = T(v.certo);
  const novo = t.status === "baixado" ? { conciliado: true } : { status: "baixado", data_baixa: l.data, valor_pago: Number(t.valor), conta_bancaria: l.conta_bancaria_id, conciliado: true };
  if (novo.status) console.log(`BAIXA    ${fmt(t)} → ${l.data}`);
  planoTitulos.push({ id: t.id, novo, parcela: novo.status ? { status: "pago", data_pagamento: l.data } : null });
}
for (const p of REABRIR) {
  const t = T(p), status = t.data_vencimento < HOJE ? "vencido" : "em_aberto";
  console.log(`REABRE   ${fmt(t)} → ${status}`);
  planoTitulos.push({ id: t.id, novo: { status, data_baixa: null, valor_pago: null, conta_bancaria: null, conciliado: false }, parcela: { status: "pendente", data_pagamento: null } });
}
for (const r of REDATAR) {
  const t = T(r.titulo), l = L(r.linha);
  console.log(`REDATA   ${fmt(t)} → ${l.data}, conta da linha do PIX`);
  planoTitulos.push({ id: t.id, novo: { data_baixa: l.data, conta_bancaria: l.conta_bancaria_id }, parcela: null });
}
// Argemiro: a linha sai do título do Odair; o título dele continua em aberto
const argemiro = VINCULOS.find(v => v.certo === null);
console.log(`\nArgemiro: linha de R$ ${L(argemiro.linha).valor} fica sem título para conferir (título em aberto de R$ 2.746,59).`);

if (!aplicar) { console.log("\nNada gravado. Para gravar, repita com --aplicar."); process.exit(0); }

mkdirSync("backup", { recursive: true });
const arq = `backup/corrigir_vinculos_salario_ogliari_${Date.now()}.json`;
writeFileSync(arq, JSON.stringify({
  linhas: planoLinhas.map(p => linhas.find(l => l.id === p.id)),
  titulos: [...new Set(planoTitulos.map(p => p.id))].map(id => titulos.find(t => t.id === id)),
}, null, 1));
console.log(`\nEstado anterior salvo em ${arq}`);

let falhas = 0;
const ok = (r, o) => { if (r.error) { falhas++; console.error(`FALHOU ${o}: ${r.error.message}`); } };
for (const p of planoLinhas) ok(await sb.from("extrato_transacoes").update(p.novo).eq("id", p.id), `linha ${p.id}`);
for (const p of planoTitulos) {
  ok(await sb.from("lancamentos").update(p.novo).eq("id", p.id), `título ${p.id}`);
  if (p.parcela) ok(await sb.from("parcelas_pagamento").update(p.parcela).eq("lancamento_id", p.id), `parcela ${p.id}`);
}
console.log(falhas ? `\nTerminou com ${falhas} falha(s). Use o backup para conferir.` : `\nPronto: ${planoLinhas.length} linhas e ${planoTitulos.length} gravações de título.`);
process.exit(falhas ? 1 : 0);
