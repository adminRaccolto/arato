// Tira das remessas de armazém os retornos de NFs que já foram estornadas/excluídas (antes de 29/10/2026 o estorno da
// NF de retorno não desfazia o vínculo — ex.: NF 14647 continuava na remessa 3125). Para cada um: tira da lista de
// retornos, abate do "já voltou", volta a remessa a Aguardando retorno se for o caso e apaga a saída do depósito do
// armazém lançada por aquele retorno. Retorno emitido pelo Arato/registrado à mão (sem NF de entrada) não é tocado.
// Uso: node --env-file=.env.local scripts/remessas-retornos-estornados.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const r2 = n => Math.round(n * 100) / 100;
const remetido = r => { const its = Array.isArray(r.itens_json) ? r.itens_json : []; const s = its.reduce((t, i) => t + Number(i.valor_total ?? 0), 0); return s > 0 ? s : Number(r.valor_total ?? 0); };

const { data: rems, error } = await sb.from("nf_remessas_logisticas").select("*").not("retornos", "is", null);
if (error) throw error;
const plano = [];
for (const rem of rems) {
  const lista = Array.isArray(rem.retornos) ? rem.retornos : [];
  const chaves = lista.map(x => x.chave).filter(Boolean);
  if (!chaves.length) continue;
  const { data: nfs } = await sb.from("nf_entradas").select("id, numero, chave_acesso, status").in("chave_acesso", chaves);
  const estornados = lista.filter(x => x.chave && (nfs ?? []).some(n => n.chave_acesso === x.chave) && !(nfs ?? []).some(n => n.chave_acesso === x.chave && n.status === "processada"));
  if (!estornados.length) continue;
  const resto = lista.filter(x => !estornados.includes(x));
  const retornado = r2(Math.max(0, Number(rem.valor_retornado ?? 0) - estornados.reduce((t, x) => t + Number(x.valor ?? 0), 0)));
  const status = rem.status === "retornada" && retornado < remetido(rem) - 0.01 ? "emitida" : rem.status;
  const ultimo = resto[resto.length - 1];
  const motivos = estornados.map(x => `Retorno NF ${x.numero} ← ${rem.destinatario_nome}`.slice(0, 200));
  const { data: movs } = rem.deposito_terceiro_id ? await sb.from("movimentacoes_estoque").select("id, motivo, quantidade, insumo_id").eq("deposito_id", rem.deposito_terceiro_id).eq("tipo", "saida").in("motivo", motivos).is("nf_entrada_id", null) : { data: [] };
  plano.push({ rem, estornados, resto, retornado, status, ultimo, movs: movs ?? [] });
  console.log(`Remessa ${rem.nf_remessa_numero}: tira retorno(s) ${estornados.map(x => `NF ${x.numero} (R$ ${x.valor})`).join(", ")} · já voltou ${rem.valor_retornado} → ${retornado} · status ${rem.status} → ${status} · saídas do armazém a apagar: ${(movs ?? []).length}`);
}
console.log(`${plano.length} remessa(s) a corrigir.`);
if (!aplicar) { console.log("Simulação. Rode com --aplicar para corrigir (backup em backup/)."); process.exit(0); }
fs.mkdirSync("backup", { recursive: true });
const arq = `backup/remessas_retornos_estornados_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify(plano.map(p => ({ remessa: p.rem, movs: p.movs })), null, 1));
for (const p of plano) {
  const ehUltimo = p.estornados.some(x => x.chave === p.rem.nf_retorno_chave);
  const { error: e1 } = await sb.from("nf_remessas_logisticas").update({
    retornos: p.resto, valor_retornado: p.retornado, status: p.status,
    ...(ehUltimo ? { nf_retorno_chave: p.ultimo?.chave ?? null, nf_retorno_numero: p.ultimo?.numero ?? null, nf_retorno_data: p.ultimo?.data ?? null } : {}),
    observacao: [p.rem.observacao, `Retorno ${p.estornados.map(x => `NF ${x.numero}`).join(", ")} estornado`].filter(Boolean).join(" | "),
  }).eq("id", p.rem.id);
  if (e1) throw e1;
  if (p.movs.length) { const { error: e2 } = await sb.from("movimentacoes_estoque").delete().in("id", p.movs.map(m => m.id)); if (e2) throw e2; }
}
console.log(`Corrigido. Backup: ${arq}`);
