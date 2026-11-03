// Títulos duplicados de dois contratos do Cleber Henrique Rodrigues, aprovados pelo dono em 03/11/2026:
// - Banco DLL 749539: título de R$ 60.000 em 22/09/2026 sem conta (criado ao mudar a data da parcela já paga). Apaga e passa
//   o vencimento do título real, conciliado, de 15/09 para 22/09/2026.
// - Sicredi C00522561-9: cada parcela tem uma cópia um ano antes do cronograma, baixada sem conta. Apaga as 12 cópias.
// Só apaga título baixado sem conta, conciliação nem borderô. Confere as quantidades antes; se não baterem, não grava nada.
// Uso: node --env-file=.env.local scripts/contratos-titulos-duplicados-cleber.mjs [--aplicar]   (sem --aplicar = simulação)
//      node --env-file=.env.local scripts/contratos-titulos-duplicados-cleber.mjs --reverter backup/<arquivo>.json
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const aplicar = process.argv.includes("--aplicar");
const iRev = process.argv.indexOf("--reverter");

if (iRev > -1) {
  const copia = JSON.parse(fs.readFileSync(process.argv[iRev + 1], "utf8"));
  const { error } = await sb.from("lancamentos").upsert(copia.apagados);
  if (error) { console.error(error.message); process.exit(1); }
  for (const u of copia.alterados) {
    const { error: e } = await sb.from("lancamentos").update({ data_vencimento: u.data_vencimento }).eq("id", u.id);
    if (e) { console.error(e.message); process.exit(1); }
  }
  console.log(`Revertido: ${copia.apagados.length} título(s) restaurado(s), ${copia.alterados.length} vencimento(s) de volta.`);
  process.exit(0);
}

const semPagamento = t => t.status === "baixado" && !t.conta_bancaria && !t.conciliado && !t.lote_id;
const titulosDe = async num => {
  const { data: cs, error } = await sb.from("contratos_financeiros").select("id").eq("numero_contrato", num);
  if (error || cs?.length !== 1) throw new Error(`Contrato ${num}: esperado 1, achei ${cs?.length ?? 0}`);
  const [{ data: parcelas }, { data: titulos }] = await Promise.all([
    sb.from("parcelas_pagamento").select("num_parcela, data_vencimento").eq("contrato_id", cs[0].id),
    sb.from("lancamentos").select("*").eq("contrato_financeiro_id", cs[0].id).eq("tipo", "pagar").neq("status", "cancelado"),
  ]);
  return { parcelas, titulos };
};

// DLL
const dll = await titulosDe("749539");
const dllApagar = dll.titulos.filter(t => t.data_vencimento === "2026-09-22" && Number(t.valor) === 60000 && semPagamento(t));
const dllReal = dll.titulos.filter(t => t.data_vencimento === "2026-09-15" && Number(t.valor) === 60000 && t.conciliado);
if (dllApagar.length !== 1 || dllReal.length !== 1) { console.error(`DLL fora do esperado: ${dllApagar.length} a apagar, ${dllReal.length} real.`); process.exit(1); }

// Sicredi
const sic = await titulosDe("C00522561-9");
const umAnoAntes = d => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`;
const sicApagar = sic.titulos.filter(t => {
  const n = Number(/— Parcela (\d+)/.exec(t.descricao ?? "")?.[1]);
  const p = sic.parcelas.find(x => x.num_parcela === n);
  return p && t.data_vencimento === umAnoAntes(p.data_vencimento) && semPagamento(t);
});
if (sicApagar.length !== 12) { console.error(`Sicredi fora do esperado: ${sicApagar.length} cópias (esperado 12).`); process.exit(1); }

const soma = l => l.reduce((s, t) => s + Number(t.valor), 0).toFixed(2);
const apagados = [...dllApagar, ...sicApagar];
console.log(`DLL: apagar 1 título de R$ ${soma(dllApagar)} e mover o real de 15/09 para 22/09/2026.`);
console.log(`Sicredi: apagar ${sicApagar.length} cópias, R$ ${soma(sicApagar)}.`);
for (const t of apagados) console.log(`  ${t.data_vencimento}  ${Number(t.valor).toFixed(2).padStart(12)}  ${t.descricao}`);
if (!aplicar) { console.log("Simulação — nada foi gravado. Rode com --aplicar (cópia completa em backup/)."); process.exit(0); }

const arq = `backup/contratos_titulos_cleber_${Date.now()}.json`;
fs.writeFileSync(arq, JSON.stringify({ apagados, alterados: [{ id: dllReal[0].id, data_vencimento: dllReal[0].data_vencimento }] }, null, 1));
const { error: eDel } = await sb.from("lancamentos").delete().in("id", apagados.map(t => t.id));
if (eDel) { console.error(eDel.message); process.exit(1); }
const { error: eUp } = await sb.from("lancamentos").update({ data_vencimento: "2026-09-22" }).eq("id", dllReal[0].id);
if (eUp) { console.error(eUp.message); process.exit(1); }
console.log(`Feito. Cópia: ${arq} (para desfazer: --reverter ${arq})`);
