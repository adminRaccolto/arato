// Limpeza única das NFs de entrada duplicadas (mesma chave de acesso ou mesmo número+série+CNPJ) em TODOS os clientes —
// a mesma regra testada do botão "Limpar Duplicatas" (lib/fiscal/dedup-nf.ts, planejarLimpeza):
//  • NF processada nunca é apagada;
//  • só sai cópia PENDENTE sem vínculo (título do produtor ou da Empresa, pedido, estoque, remessa);
//  • em cada grupo fica a melhor cópia: processada > com vínculo > em fazenda existente do cliente > a mais antiga;
//  • só apaga cópia do próprio cliente ou de fazenda que não existe mais (órfã) — nunca de outro cliente.
// Cópia completa (NFs + itens) em backup/ antes; --reverter recria tudo.
// Uso: node --env-file=.env.local scripts/nf-duplicadas-limpar.mjs [--aplicar]       (sem --aplicar = simulação)
//      node --env-file=.env.local scripts/nf-duplicadas-limpar.mjs --reverter backup/<arquivo>.json
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import { planejarLimpeza } from "../lib/fiscal/dedup-nf.ts";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const aplicar = process.argv.includes("--aplicar");
const iRev = process.argv.indexOf("--reverter");
const dig = s => String(s ?? "").replace(/\D/g, "");

if (iRev > 0) {
  const bk = JSON.parse(fs.readFileSync(process.argv[iRev + 1], "utf8"));
  for (let i = 0; i < bk.nfs.length; i += 200) { const { error } = await sb.from("nf_entradas").insert(bk.nfs.slice(i, i + 200)); if (error) throw error; }
  for (let i = 0; i < bk.itens.length; i += 200) { const { error } = await sb.from("nf_entrada_itens").insert(bk.itens.slice(i, i + 200)); if (error) throw error; }
  console.log(`Revertido: ${bk.nfs.length} NF(s) e ${bk.itens.length} item(ns) recriados.`);
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

const COLS = "id, numero, serie, chave_acesso, emitente_cnpj, emitente_nome, fazenda_id, created_at, status, lancamento_id, emp_lancamento_id, pedido_compra_id";
const fazendas = await todos(() => sb.from("fazendas").select("id, conta_id"));
const contaDaFaz = new Map(fazendas.map(f => [f.id, f.conta_id]));
const { data: contas } = await sb.from("contas").select("id, nome");
const nomeConta = new Map((contas ?? []).map(c => [c.id, c.nome]));
const todas = await todos(() => sb.from("nf_entradas").select(COLS).neq("status", "cancelada"));

// Vínculos que impedem apagar a cópia
const ids = todas.map(n => n.id);
const comVinculo = new Set();
for (let i = 0; i < ids.length; i += 300) {
  const sl = ids.slice(i, i + 300);
  for (const tab of ["lancamentos", "empresa_lancamentos", "movimentacoes_estoque", "nf_remessas_logisticas"]) {
    const { data, error } = await sb.from(tab).select("nf_entrada_id").in("nf_entrada_id", sl);
    if (error) throw new Error(`${tab}: ${error.message}`);
    for (const r of data ?? []) comVinculo.add(r.nf_entrada_id);
  }
}

// Por cliente: as NFs das fazendas dele + as cópias de mesma chave em fazenda órfã
const porConta = new Map();
for (const n of todas) {
  const c = contaDaFaz.get(n.fazenda_id);
  if (c) (porConta.get(c) ?? porConta.set(c, []).get(c)).push(n);
}
const orfasPorChave = new Map();
for (const n of todas) if (!contaDaFaz.has(n.fazenda_id) && dig(n.chave_acesso).length === 44) (orfasPorChave.get(dig(n.chave_acesso)) ?? orfasPorChave.set(dig(n.chave_acesso), []).get(dig(n.chave_acesso))).push(n);

const remover = new Set();
const resumo = [];
for (const [conta, nfsConta] of porConta) {
  const fazConta = new Set(fazendas.filter(f => f.conta_id === conta).map(f => f.id));
  const extra = nfsConta.flatMap(n => orfasPorChave.get(dig(n.chave_acesso)) ?? []);
  const nfs = [...new Map([...nfsConta, ...extra].map(n => [n.id, n])).values()];
  const plano = planejarLimpeza(nfs, comVinculo, fazConta);
  const doCliente = plano.remover.filter(id => { const n = nfs.find(x => x.id === id); return n && (fazConta.has(n.fazenda_id) || !contaDaFaz.has(n.fazenda_id)); });
  doCliente.forEach(id => remover.add(id));
  if (plano.gruposDuplicados) resumo.push({ cliente: nomeConta.get(conta) ?? conta, grupos: plano.gruposDuplicados, apagar: doCliente.length, presas_por_vinculo: plano.mantidasPorVinculo });
}
console.table(resumo);
const lista = todas.filter(n => remover.has(n.id));
for (const n of lista.slice(0, 8)) console.log(`  apagar: NF ${n.numero} — ${n.emitente_nome ?? ""} · ${n.status} · ${contaDaFaz.has(n.fazenda_id) ? "fazenda do cliente" : "fazenda órfã"} · importada ${n.created_at.slice(0, 10)}`);
console.log(`Total de cópias a apagar: ${lista.length} (todas pendentes, sem vínculo). Processadas e cópias com vínculo ficam.`);
if (!aplicar) { console.log("Simulação — nada foi gravado. Rode com --aplicar (cópia completa em backup/)."); process.exit(0); }

const alvo = [...remover];
const itens = [];
for (let i = 0; i < alvo.length; i += 200) {
  const { data, error } = await sb.from("nf_entrada_itens").select("*").in("nf_entrada_id", alvo.slice(i, i + 200));
  if (error) throw error;
  itens.push(...data);
}
const { data: nfsFull } = { data: [] };
for (let i = 0; i < alvo.length; i += 200) {
  const { data, error } = await sb.from("nf_entradas").select("*").in("id", alvo.slice(i, i + 200));
  if (error) throw error;
  nfsFull.push(...data);
}
fs.mkdirSync("backup", { recursive: true });
const arq = `backup/nf_duplicadas_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`;
fs.writeFileSync(arq, JSON.stringify({ nfs: nfsFull, itens }, null, 1));
for (let i = 0; i < alvo.length; i += 100) {
  const sl = alvo.slice(i, i + 100);
  let r = await sb.from("nf_entrada_itens").delete().in("nf_entrada_id", sl); if (r.error) throw r.error;
  r = await sb.from("nf_entradas").delete().in("id", sl).eq("status", "pendente"); if (r.error) throw r.error;
}
console.log(`Feito: ${alvo.length} cópia(s) apagada(s) (${itens.length} itens). Cópia: ${arq} (para desfazer: --reverter ${arq})`);
