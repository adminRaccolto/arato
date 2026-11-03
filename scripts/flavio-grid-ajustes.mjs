// Flávio: ajusta o cronograma para ficar igual ao CP (decisão do dono, 03/11/2026). Os títulos não são alterados.
//   131.912.858: as parcelas andam um ano, a primeira é em 2027, e a parcela 1 deixa de constar como paga.
//   191418/7475/2023: juros da parcela 2 passam a ser os do título.
// Só altera se os títulos baterem com o cronograma resultante.
// Uso: node --env-file=.env.local scripts/flavio-grid-ajustes.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

const aplicar = process.argv.includes("--aplicar");
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const igual = (a, b) => Math.abs(Number(a) - Number(b)) < 0.011;
const umAno = d => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
async function contrato(numero) {
  const { data, error } = await s.from("contratos_financeiros").select("id, data_vencimento").eq("numero_contrato", numero);
  if (error) throw error;
  if (data.length !== 1) throw new Error(`Contrato ${numero}: encontrei ${data.length}. Nada foi alterado.`);
  const { data: parcelas } = await s.from("parcelas_pagamento").select("*").eq("contrato_id", data[0].id).order("num_parcela");
  const { data: titulos } = await s.from("lancamentos").select("descricao, valor, data_vencimento, status").eq("contrato_financeiro_id", data[0].id).eq("tipo", "pagar").neq("status", "cancelado");
  return { c: data[0], parcelas, titulos };
}
const doDia = (titulos, data, sufixo) => titulos.filter(t => t.data_vencimento === data && (t.descricao ?? "").endsWith(sufixo));

const bb = await contrato("131.912.858");
const jaAndou = bb.parcelas[0].data_vencimento >= "2027-01-01";
const novos = bb.parcelas.map(p => ({ ...p, novo: jaAndou ? p.data_vencimento : umAno(p.data_vencimento) }));
for (const p of novos) {
  const j = doDia(bb.titulos, p.novo, "— Juros"), a = doDia(bb.titulos, p.novo, "— Amortização");
  if (Number(p.juros) > 0 && !(j.length === 1 && igual(j[0].valor, p.juros))) throw new Error(`131.912.858 parcela ${p.num_parcela} (${p.novo}): juros não batem com o CP. Nada foi alterado.`);
  if (Number(p.amortizacao) > 0 && !(a.length === 1 && igual(a[0].valor, p.amortizacao))) throw new Error(`131.912.858 parcela ${p.num_parcela} (${p.novo}): amortização não bate com o CP. Nada foi alterado.`);
  console.log(`131.912.858 parcela ${p.num_parcela}: ${p.data_vencimento} -> ${p.novo} · ${p.status}${p.status === "pago" ? " -> em_aberto" : ""}`);
}
const ultima = novos[novos.length - 1].novo;

const cx = await contrato("191418/7475/2023");
const p2 = cx.parcelas.find(p => p.num_parcela === 2);
const jp2 = doDia(cx.titulos, p2.data_vencimento, "— Juros");
if (jp2.length !== 1) throw new Error(`191418 parcela 2: esperava 1 título de juros e encontrei ${jp2.length}. Nada foi alterado.`);
const novoValor = Math.round((Number(p2.amortizacao) + Number(jp2[0].valor) + Number(p2.despesas_acessorios ?? 0)) * 100) / 100;
console.log(`191418/7475/2023 parcela 2: juros ${p2.juros} -> ${jp2[0].valor} · parcela ${p2.valor_parcela} -> ${novoValor}`);

if (!aplicar) { console.log("\nNada foi alterado. Para aplicar, rode com --aplicar."); process.exit(0); }
const arquivo = `backup/flavio_grid_ajustes_${Date.now()}.json`;
writeFileSync(arquivo, JSON.stringify({ bb: { contrato: bb.c, parcelas: bb.parcelas }, cx: p2 }, null, 1));
if (!jaAndou) {
  for (const p of novos) {
    const { error } = await s.from("parcelas_pagamento").update({ data_vencimento: p.novo, ...(p.status === "pago" ? { status: "em_aberto", data_pagamento: null } : {}) }).eq("id", p.id);
    if (error) throw error;
  }
  const { error } = await s.from("contratos_financeiros").update({ data_vencimento: ultima }).eq("id", bb.c.id);
  if (error) throw error;
}
const { error } = await s.from("parcelas_pagamento").update({ juros: jp2[0].valor, valor_parcela: novoValor }).eq("id", p2.id);
if (error) throw error;
console.log(`\nFeito. Cópia para desfazer: ${arquivo}`);
