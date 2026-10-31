// Títulos de CR criados a partir de LINHAS DE SALDO do extrato (Itaú: "SALDO TOTAL DISPONÍVEL DIA", "SALDO ANTERIOR") — não
// são entrada de dinheiro e inflam o Contas a Receber/fluxo (achado 30/10/2026, cliente Cleber Henrique Rodrigues).
// Apaga os títulos (receber, descrição começando pelo padrão) e desfaz o vínculo das linhas do extrato ligadas a eles.
// Cópia completa em backup/ antes; --reverter recria os títulos e os vínculos.
// Uso: node --env-file=.env.local scripts/titulos-linha-saldo-remover.mjs --padrao "SALDO TOTAL DISPON" [--aplicar]
//      node --env-file=.env.local scripts/titulos-linha-saldo-remover.mjs --reverter backup/<arquivo>.json
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const aplicar = process.argv.includes("--aplicar");

if (arg("--reverter")) {
  const bk = JSON.parse(fs.readFileSync(arg("--reverter"), "utf8"));
  // "numero" do título é gerado pelo banco — não pode ser gravado
  const { error } = await sb.from("lancamentos").insert(bk.titulos.map(({ numero: _n, ...t }) => t));
  if (error) throw error;
  for (const e of bk.extrato) {
    const { error: e2 } = await sb.from("extrato_transacoes").update({ conciliado: e.conciliado, lancamento_id: e.lancamento_id, lancamento_ids: e.lancamento_ids, lancamento_desc: e.lancamento_desc, lancamento_valor: e.lancamento_valor }).eq("id", e.id);
    if (e2) throw e2;
  }
  console.log(`Revertido: ${bk.titulos.length} título(s) recriado(s), ${bk.extrato.length} linha(s) de extrato religada(s).`);
  process.exit(0);
}

const padrao = arg("--padrao");
if (!padrao) { console.error('Informe --padrao "SALDO TOTAL DISPON" (início da descrição).'); process.exit(1); }
const { data: titulos, error } = await sb.from("lancamentos").select("*").eq("tipo", "receber").ilike("descricao", `${padrao}%`);
if (error) throw error;
const bloqueados = titulos.filter(t => t.lote_id || t.contrato_financeiro_id || t.nf_entrada_id);
if (bloqueados.length) { console.error(`${bloqueados.length} título(s) ligados a borderô/contrato/NF — não é linha de saldo; revise antes.`); process.exit(1); }
const ids = new Set(titulos.map(t => t.id));
const extrato = [];
for (let i = 0; ; i += 1000) {
  const { data, error: eE } = await sb.from("extrato_transacoes").select("id, fitid, descricao, valor, conciliado, lancamento_id, lancamento_ids, lancamento_desc, lancamento_valor").ilike("descricao", "%saldo%").order("id").range(i, i + 999);
  if (eE) throw eE;
  extrato.push(...data.filter(e => ids.has(e.lancamento_id) || (e.lancamento_ids ?? []).some(x => ids.has(x))));
  if (data.length < 1000) break;
}
const total = titulos.reduce((s, t) => s + Number(t.valor), 0);
console.log(`Padrão "${padrao}": ${titulos.length} título(s) a receber, total R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · ${extrato.length} linha(s) de extrato a desligar`);
for (const t of titulos.slice(0, 8)) console.log(`  ${t.data_lancamento} · ${t.valor} · ${t.descricao} · ${t.origem_lancamento} · ${t.categoria}`);
if (!aplicar) { console.log("Simulação — nada foi gravado. Rode com --aplicar (cópia completa em backup/)."); process.exit(0); }

fs.mkdirSync("backup", { recursive: true });
const arq = `backup/titulos_linha_saldo_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
fs.writeFileSync(arq, JSON.stringify({ padrao, titulos, extrato }, null, 1));
for (const e of extrato) {
  const restantes = (e.lancamento_ids ?? []).filter(x => !ids.has(x));
  const principal = ids.has(e.lancamento_id) ? (restantes[0] ?? null) : e.lancamento_id;
  const { error: e2 } = await sb.from("extrato_transacoes").update({
    lancamento_id: principal, lancamento_ids: restantes.length ? restantes : null,
    conciliado: !!principal, ...(principal ? {} : { lancamento_desc: null, lancamento_valor: null }),
  }).eq("id", e.id);
  if (e2) throw e2;
}
const { error: eDel } = await sb.from("lancamentos").delete().in("id", [...ids]);
if (eDel) throw eDel;
console.log(`Feito: ${ids.size} título(s) apagado(s), ${extrato.length} linha(s) de extrato desligada(s). Cópia: ${arq} (para desfazer: --reverter ${arq})`);
