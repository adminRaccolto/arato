// Limpa os pares da conciliação da CRESOL - EDINEIA em que a linha de extrato duplicada (OFX reimportado com FITID novo)
// foi conciliada com um lançamento de Tesouraria diferente do da linha original. Decidido com o dono em 28/10/2026:
//  - "cópia": o lançamento foi criado junto com a linha repetida → apaga a linha, o lançamento e a entrada da
//    transferência na conta de destino (quando houver).
//  - "pré-existente": a linha repetida foi ligada a uma transferência que já existia antes dela → apaga só a linha e
//    deixa a transferência como não conciliada, para o dono conferir na conciliação.
// Fora daqui (dono decide): 16/09 R$ 100.000 (Dirceu × Santa Rita) e 24/09 R$ 8.547,50 (peças cartão Eliane × PIX Elaine).
// Uso: node --env-file=.env.local scripts/tesouraria-duplicados-limpar.mjs [--aplicar]
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// [linha de extrato repetida, lançamento ligado a ela, tipo]
const PARES = [
  ["007cc7f5", "d609c145", "copia"],        // 04/09 R$ 2.000 → Ogliari Transportes
  ["07190806", "4c51e9e3", "copia"],        // 10/09 R$ 20.000 → Santa Rita
  ["849f2f33", "480b5aa6", "copia"],        // 11/09 R$ 20.000 → Ogliari Agropecuária
  ["7a3e4cb8", "aa6430f0", "copia"],        // 09/09 R$ 2.000 → Santa Rita
  ["97477b96", "b75cc5ab", "copia"],        // 10/11 R$ 100 integralização capitalização
  ["e7a7996c", "83458da9", "copia"],        // 10/09 R$ 100 integralização capitalização
  ["58cb0bae", "ac019034", "copia"],        // 11/09 R$ 20.000 → Ogliari Transportes
  ["dd1eda72", "1627da53", "copia"],        // 10/10 R$ 100 integralização capitalização
  ["393c547d", "790af36a", "preexistente"], // 08/09 R$ 10.000 Muriana — transferência criada 14/10
  ["9c48ae58", "8a7844ce", "preexistente"], // 11/09 R$ 10.000 Muriana — transferência criada 15/10
  ["5f56abd7", "887b8e5f", "preexistente"], // 21/09 R$ 20.000 Ogliari Transportes — transferência criada 28/09
  ["93ac3670", "c2d8fea0", "preexistente"], // 08/09 R$ 20.000 Santa Rita — transferência criada 15/10
];

const todosExtrato = [], todosLanc = [];
for (let i = 0; ; i += 1000) {
  const { data, error } = await sb.from("extrato_transacoes").select("*").eq("conta_nome", "CRESOL - EDINEIA").order("id").range(i, i + 999);
  if (error) throw error; todosExtrato.push(...data); if (data.length < 1000) break;
}
for (let i = 0; ; i += 1000) {
  const { data, error } = await sb.from("lancamentos").select("*").eq("origem_lancamento", "tesouraria").gte("created_at", "2026-09-01").order("id").range(i, i + 999);
  if (error) throw error; todosLanc.push(...data); if (data.length < 1000) break;
}
const um = (lista, pref, oque) => {
  const r = lista.filter(x => x.id.startsWith(pref));
  if (r.length !== 1) throw new Error(`${oque} ${pref}: ${r.length} encontrados — abortado`);
  return r[0];
};
const vinc = x => [...new Set([x.lancamento_id, ...(x.lancamento_ids ?? [])].filter(Boolean))];

const plano = [];
for (const [pe, pl, tipo] of PARES) {
  const linha = um(todosExtrato, pe, "linha de extrato");
  const lanc = um(todosLanc, pl, "lançamento");
  if (!vinc(linha).includes(lanc.id)) throw new Error(`linha ${pe} não está ligada ao lançamento ${pl} — abortado`);
  // outras linhas de extrato ligadas ao mesmo lançamento (não pode haver, senão apagar o lançamento as quebraria)
  const outrasLinhas = todosExtrato.filter(x => x.id !== linha.id && vinc(x).includes(lanc.id));
  let contrapartida = null;
  if (tipo === "copia") {
    if (outrasLinhas.length) throw new Error(`lançamento ${pl} também está em outra linha de extrato — abortado`);
    const cand = todosLanc.filter(x => x.id !== lanc.id && x.tipo === "receber" && Number(x.valor) === Number(lanc.valor)
      && Math.abs(new Date(x.created_at) - new Date(lanc.created_at)) < 5000 && /^Transfer[eê]ncia ←/.test(x.descricao ?? ""));
    if (cand.length > 1) throw new Error(`lançamento ${pl}: ${cand.length} entradas candidatas na conta de destino — abortado`);
    contrapartida = cand[0] ?? null;
    if (contrapartida) {
      const { data: ex } = await sb.from("extrato_transacoes").select("id").or(`lancamento_id.eq.${contrapartida.id},lancamento_ids.cs.{${contrapartida.id}}`);
      if ((ex ?? []).length) throw new Error(`entrada ${contrapartida.id.slice(0, 8)} (destino de ${pl}) está conciliada no extrato da outra conta — abortado`);
    }
  }
  plano.push({ tipo, linha, lanc, contrapartida, outrasLinhas });
}

for (const p of plano) {
  const acao = p.tipo === "copia"
    ? `apaga linha + lançamento${p.contrapartida ? " + entrada no destino " + p.contrapartida.id.slice(0, 8) : ""}`
    : `apaga linha; transferência fica não conciliada${p.outrasLinhas.length ? " (continua em outra linha)" : ""}`;
  console.log(`${p.linha.data} R$ ${p.linha.valor} ${String(p.lanc.descricao).slice(0, 50)} → ${acao}`);
}
const nApagarLanc = plano.filter(p => p.tipo === "copia").reduce((s, p) => s + 1 + (p.contrapartida ? 1 : 0), 0);
console.log(`\nLinhas de extrato a apagar: ${plano.length} · lançamentos a apagar: ${nApagarLanc} · transferências que ficam sem conciliação: ${plano.filter(p => p.tipo !== "copia").length}`);
if (!aplicar) { console.log("Simulação. Rode com --aplicar para executar (backup em backup/)."); process.exit(0); }

fs.mkdirSync("backup", { recursive: true });
const arq = `backup/tesouraria_duplicados_${new Date().toISOString().slice(0, 10)}.json`;
fs.writeFileSync(arq, JSON.stringify(plano, null, 1));

// 1) linhas de extrato repetidas (soltam a ligação com os lançamentos)
const { error: e1 } = await sb.from("extrato_transacoes").delete().in("id", plano.map(p => p.linha.id));
if (e1) throw e1;
// 2) lançamentos copiados e as entradas na conta de destino
const apagarLanc = plano.filter(p => p.tipo === "copia").flatMap(p => [p.lanc.id, p.contrapartida?.id].filter(Boolean));
const { error: e2 } = await sb.from("lancamentos").delete().in("id", apagarLanc);
if (e2) throw e2;
// 3) transferências pré-existentes que ficaram sem nenhuma linha de extrato → não conciliadas
const soltar = plano.filter(p => p.tipo !== "copia" && !p.outrasLinhas.length).map(p => p.lanc.id);
if (soltar.length) {
  const { error: e3 } = await sb.from("lancamentos").update({ conciliado: false }).in("id", soltar);
  if (e3) throw e3;
}
console.log(`Feito. ${plano.length} linhas e ${apagarLanc.length} lançamentos apagados; ${soltar.length} transferências voltaram a não conciliadas. Backup: ${arq}`);
