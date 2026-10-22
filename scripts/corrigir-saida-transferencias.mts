// Saídas de transferência lançadas na fazenda de origem (dona do depósito) que não tinha o produto, enquanto o
// estoque estava em nome de outra fazenda da conta no mesmo depósito. Move cada saída para a fazenda dona.
// Só move quando há UMA única fazenda dona com saldo suficiente; o resto vai para a lista de casos a revisar.
// Uso: npx tsx scripts/corrigir-saida-transferencias.mts        → prévia (não grava)
//      npx tsx scripts/corrigir-saida-transferencias.mts exec   → grava (backup em backup/corrigir_saida_transferencias_<data>.json)
import fs from "fs";
for (const l of fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) { const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, ""); }
const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const exec = process.argv[2] === "exec";

const { data: fz } = await sb.from("fazendas").select("id, nome, conta_id");
const nome = (id: string) => fz!.find(f => f.id === id)?.nome ?? id;
const { data: tes } = await sb.from("transferencias_estoque").select("numero, status, fazenda_origem_id, deposito_origem_id, transferencias_estoque_itens(insumo_id)").eq("status", "emitida");
const pares = new Map<string, { insumo: string; deposito: string | null; conta: string }>();
for (const t of tes ?? []) for (const it of (t as any).transferencias_estoque_itens) {
  const conta = fz!.find(f => f.id === t.fazenda_origem_id)?.conta_id as string;
  pares.set(`${it.insumo_id}|${t.deposito_origem_id ?? ""}|${conta}`, { insumo: it.insumo_id, deposito: t.deposito_origem_id, conta });
}
const numerosEmitidas = new Set((tes ?? []).map(t => t.numero));
const mover: any[] = []; const revisar: string[] = [];
for (const { insumo, deposito, conta } of pares.values()) {
  const fazConta = fz!.filter(f => f.conta_id === conta).map(f => f.id);
  const movs: any[] = [];
  for (let de = 0; ; de += 1000) {
    let q = sb.from("movimentacoes_estoque").select("*").eq("insumo_id", insumo).in("fazenda_id", fazConta);
    q = deposito ? q.eq("deposito_id", deposito) : q.is("deposito_id", null);
    const { data } = await q.order("id").range(de, de + 999);
    movs.push(...(data ?? [])); if (!data || data.length < 1000) break;
  }
  const saldo: Record<string, number> = {};
  for (const m of movs) saldo[m.fazenda_id] = (saldo[m.fazenda_id] ?? 0) + (m.tipo === "entrada" ? 1 : m.tipo === "saida" ? -1 : 0) * Number(m.quantidade);
  const { data: ins } = await sb.from("insumos").select("nome, unidade").eq("id", insumo).single();
  const negativas = Object.keys(saldo).filter(f => saldo[f] < -0.0001);
  for (const F of negativas) {
    const saidas = movs.filter(m => m.fazenda_id === F && m.tipo === "saida" && m.auto
      && /^Transferência TRF-/.test(m.motivo ?? "") && numerosEmitidas.has(String(m.motivo).match(/TRF-\d+/)?.[0] ?? ""))
      .sort((a, b) => String(b.data).localeCompare(String(a.data)));
    for (const m of saidas) {
      if (saldo[F] >= -0.0001) break;
      const q = Number(m.quantidade);
      const positivas = Object.keys(saldo).filter(f => f !== F && saldo[f] >= q - 0.0001);
      if (positivas.length !== 1) {
        revisar.push(`${ins?.nome} | depósito ${deposito ?? "(nenhum)"} | ${m.motivo} ${q} ${ins?.unidade} em ${nome(F)} — ${positivas.length ? "mais de uma fazenda dona: " + positivas.map(nome).join(", ") : "nenhuma fazenda com saldo suficiente"}`);
        continue;
      }
      const P = positivas[0];
      mover.push({ id: m.id, de: F, para: P, antes: m, rotulo: `${ins?.nome} ${q} ${ins?.unidade} | ${m.motivo} | ${nome(F)} → ${nome(P)}` });
      saldo[F] += q; saldo[P] -= q;
    }
  }
}
console.log(mover.map(m => "MOVER  " + m.rotulo).join("\n"));
console.log(revisar.map(r => "REVISAR " + r).join("\n"));
console.log(`\n${mover.length} saída(s) a mover · ${revisar.length} para revisar à mão`);
if (exec && mover.length) {
  fs.mkdirSync(new URL("../backup/", import.meta.url), { recursive: true });
  const arq = new URL(`../backup/corrigir_saida_transferencias_${new Date().toISOString().slice(0, 10)}.json`, import.meta.url);
  fs.writeFileSync(arq, JSON.stringify(mover.map(m => m.antes), null, 2));
  let ok = 0;
  for (const m of mover) {
    const { error } = await sb.from("movimentacoes_estoque").update({ fazenda_id: m.para, observacao: `${m.antes.observacao ? m.antes.observacao + " · " : ""}Saída corrigida em 22/10/2026: do estoque de ${nome(m.de)} para o de ${nome(m.para)} (dona do produto no depósito)` }).eq("id", m.id).eq("fazenda_id", m.de);
    if (error) console.log("erro", m.id, error.message); else ok++;
  }
  console.log(`${ok} movimentação(ões) corrigidas. Backup: ${arq.pathname}`);
}
