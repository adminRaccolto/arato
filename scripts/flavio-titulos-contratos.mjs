// Flávio: remove títulos repetidos dos contratos financeiros, deixando em cada vencimento um título de amortização e um de
// juros iguais ao cronograma. Título conciliado ou em borderô nunca sai. Vencimento sem título exato não é alterado, só listado.
// Refinanciados, C10532360-4, 131.912.858 e 099900319916 ficam de fora: precisam de decisão.
// Uso: node --env-file=.env.local scripts/flavio-titulos-contratos.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const FORA = new Set(["C10532360-4", "131.912.858", "099900319916"]);
const aplicar = process.argv.includes("--aplicar");
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
const brl = n => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const igual = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;
const ehAmort = t => /— Amortização$/.test(t.descricao ?? "");
const ehJuros = t => /— Juros$/.test(t.descricao ?? "");
const preso = t => !!t.conciliado || !!t.lote_id;
// Prefere o conciliado, depois o baixado com conta, depois o mais antigo
const melhor = l => [...l].sort((a, b) => Number(preso(b)) - Number(preso(a)) || Number(!!b.conta_bancaria) - Number(!!a.conta_bancaria) || a.created_at.localeCompare(b.created_at))[0];

const { data: contas } = await s.from("contas").select("id").ilike("nome", "Flávio%");
if (contas?.length !== 1) throw new Error("Conta do Flávio não encontrada.");
const { data: fazendas } = await s.from("fazendas").select("id").eq("conta_id", contas[0].id);
const contratos = (await todos(() => s.from("contratos_financeiros").select("id, numero_contrato, status").in("fazenda_id", fazendas.map(f => f.id)).order("id")));

const remover = [], pendencias = [];
let totalRem = 0;
for (const c of contratos) {
  if (FORA.has(c.numero_contrato) || c.status === "refinanciado") continue;
  const parcelas = await todos(() => s.from("parcelas_pagamento").select("id, num_parcela, data_vencimento, amortizacao, juros, status").eq("contrato_id", c.id).order("id"));
  const titulos = await todos(() => s.from("lancamentos").select("id, descricao, valor, status, data_vencimento, conta_bancaria, conciliado, lote_id, created_at").eq("contrato_financeiro_id", c.id).eq("tipo", "pagar").neq("status", "cancelado").order("id"));
  const sai = [];
  for (const p of parcelas) {
    const doDia = titulos.filter(t => t.data_vencimento === p.data_vencimento);
    if (doDia.length <= (Number(p.amortizacao) > 0 ? 1 : 0) + (Number(p.juros) > 0 ? 1 : 0)) {
      const faltando = (Number(p.amortizacao) > 0 && !doDia.some(t => ehAmort(t) && igual(t.valor, p.amortizacao))) || (Number(p.juros) > 0 && !doDia.some(t => ehJuros(t) && igual(t.valor, p.juros)));
      if (faltando) pendencias.push(`${c.numero_contrato} parcela ${p.num_parcela} (${p.data_vencimento}): título diferente do grid`);
      continue;
    }
    const a = doDia.filter(t => ehAmort(t) && igual(t.valor, p.amortizacao));
    const j = doDia.filter(t => ehJuros(t) && igual(t.valor, p.juros));
    if ((Number(p.amortizacao) > 0 && !a.length) || (Number(p.juros) > 0 && !j.length)) {
      pendencias.push(`${c.numero_contrato} parcela ${p.num_parcela} (${p.data_vencimento}): sem título igual ao grid, nada removido`);
      continue;
    }
    const ficam = new Set([a.length ? melhor(a).id : null, j.length ? melhor(j).id : null]);
    for (const t of doDia) {
      if (ficam.has(t.id)) continue;
      if (preso(t)) { pendencias.push(`${c.numero_contrato} parcela ${p.num_parcela}: título conciliado ou em borderô a mais, ${brl(Number(t.valor))}`); continue; }
      sai.push(t);
    }
  }
  const datas = new Set(parcelas.map(p => p.data_vencimento));
  const semParcela = titulos.filter(t => !datas.has(t.data_vencimento));
  if (semParcela.length) pendencias.push(`${c.numero_contrato}: ${semParcela.length} título(s) em data fora do grid, somando ${brl(semParcela.reduce((x, t) => x + Number(t.valor), 0))}`);
  if (sai.length) {
    const v = sai.reduce((x, t) => x + Number(t.valor), 0);
    totalRem += v;
    console.log(`${c.numero_contrato}: remover ${sai.length} título(s), ${brl(v)}`);
    remover.push(...sai);
  }
}
console.log(`\nTotal: ${remover.length} título(s), ${brl(totalRem)}. Baixados: ${remover.filter(t => t.status === "baixado").length}`);
console.log(`\nNão alterados (${pendencias.length}):\n  ${pendencias.join("\n  ")}`);
if (!aplicar) { console.log("\nNada foi alterado. Para aplicar, rode com --aplicar."); process.exit(0); }

const ids = remover.map(t => t.id);
const copia = [];
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await s.from("lancamentos").select("*").in("id", ids.slice(i, i + 200));
  if (error) throw error;
  copia.push(...data);
}
const arquivo = `backup/flavio_titulos_contratos_${Date.now()}.json`;
writeFileSync(arquivo, JSON.stringify(copia, null, 1));
for (let i = 0; i < ids.length; i += 200) {
  const { error } = await s.from("lancamentos").delete().in("id", ids.slice(i, i + 200));
  if (error) throw error;
}
console.log(`\n${ids.length} título(s) removidos. Cópia para restaurar: ${arquivo}`);
