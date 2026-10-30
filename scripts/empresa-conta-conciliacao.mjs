// Títulos de EMPRESA (empresa_lancamentos) pagos pela Conciliação Bancária ficaram sem conta bancária: a conciliação só
// gravava a conta nos títulos do produtor (achado 30/10/2026, 281 títulos). Preenche a conta a partir da transação do
// extrato a que cada título está ligado (extrato_transacoes, conciliada) — só quando o título está sem conta e a
// transação indica UMA conta. Nunca troca conta já preenchida.
// --produtor: o mesmo para títulos do PRODUTOR (lancamentos baixados/parciais sem conta, conciliados antes da correção
// de 25/09/2026).
// Uso: node --env-file=.env.local scripts/empresa-conta-conciliacao.mjs [--produtor] [--aplicar]   (sem --aplicar = simulação)
//      node --env-file=.env.local scripts/empresa-conta-conciliacao.mjs --reverter backup/<arquivo>.json
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const aplicar = process.argv.includes("--aplicar");
const produtor = process.argv.includes("--produtor");
const TABELA = produtor ? "lancamentos" : "empresa_lancamentos";
const STATUS_PAGO = produtor ? ["baixado", "parcial"] : ["pago", "parcial"];
const iRev = process.argv.indexOf("--reverter");

if (iRev > 0) {
  const bk = JSON.parse(fs.readFileSync(process.argv[iRev + 1], "utf8"));
  let n = 0;
  for (const x of bk.itens) {
    const { error } = await sb.from(bk.tabela ?? "empresa_lancamentos").update({ conta_bancaria: null }).eq("id", x.id).eq("conta_bancaria", x.conta);
    if (error) throw error;
    n++;
  }
  console.log(`Revertido: ${n} título(s) voltaram a ficar sem conta.`);
  process.exit(0);
}

async function todos(montar) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await montar().order("id").range(i, i + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const alvo = await todos(() => sb.from(TABELA).select(`id, descricao, valor, ${produtor ? "data_baixa" : "data_pagamento"}, status`).in("status", STATUS_PAGO).is("conta_bancaria", null));
// Linhas de SALDO do extrato (Itaú "SALDO TOTAL DISPONÍVEL DIA") viraram títulos por engano — não são pagamento;
// ficam de fora (tratadas à parte)
const ehSaldo = a => /SALDO TOTAL DISPON/i.test(a.descricao ?? "");
const ignoradosSaldo = alvo.filter(ehSaldo).length;
for (let i = alvo.length - 1; i >= 0; i--) if (ehSaldo(alvo[i])) alvo.splice(i, 1);
const ids = new Set(alvo.map(a => a.id));
const contas = new Map();
for (const x of await todos(() => sb.from("extrato_transacoes").select("conta_bancaria_id, conta_nome, lancamento_id, lancamento_ids").eq("conciliado", true))) {
  for (const l of [x.lancamento_id, ...(x.lancamento_ids ?? [])].filter(Boolean)) {
    if (!ids.has(l) || !x.conta_bancaria_id) continue;
    const m = contas.get(l) ?? new Map();
    m.set(x.conta_bancaria_id, x.conta_nome);
    contas.set(l, m);
  }
}
const itens = [], ambiguos = [], semExtrato = [];
for (const a of alvo) {
  const m = contas.get(a.id);
  if (!m) semExtrato.push(a);
  else if (m.size > 1) ambiguos.push(a);
  else { const [conta, nome] = [...m.entries()][0]; itens.push({ id: a.id, conta, nome, descricao: a.descricao, valor: a.valor, data: a.data_pagamento ?? a.data_baixa }); }
}
const porConta = {};
for (const x of itens) porConta[x.nome] = (porConta[x.nome] ?? 0) + 1;
console.log(`Títulos ${produtor ? "do produtor" : "de empresa"} pagos sem conta: ${alvo.length}`);
if (ignoradosSaldo) console.log(`  ${ignoradosSaldo} linha(s) de saldo do extrato ignoradas (não são pagamento)`);
console.log(`  com conta encontrada no extrato: ${itens.length} · mais de uma conta (ficam como estão): ${ambiguos.length} · sem extrato ligado: ${semExtrato.length}`);
console.table(porConta);
for (const x of itens.slice(0, 10)) console.log(`  ${x.data} · ${x.valor} · ${String(x.descricao ?? "").slice(0, 50)} → ${x.nome}`);
if (!aplicar) { console.log("Simulação — nada foi gravado. Rode com --aplicar para preencher (cópia em backup/)."); process.exit(0); }

fs.mkdirSync("backup", { recursive: true });
const arq = `backup/${produtor ? "produtor" : "empresa"}_conta_conciliacao_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
fs.writeFileSync(arq, JSON.stringify({ tabela: TABELA, itens }, null, 1));
let feitos = 0;
for (const x of itens) {
  const { error } = await sb.from(TABELA).update({ conta_bancaria: x.conta }).eq("id", x.id).is("conta_bancaria", null);
  if (error) throw error;
  feitos++;
}
console.log(`Feito: ${feitos} título(s) receberam a conta. Cópia: ${arq} (para desfazer: --reverter ${arq})`);
