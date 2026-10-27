// Títulos a pagar "parcial" anteriores à Seção 375 (um título só acumulando o valor pago) → divididos no novo modelo:
// uma parte BAIXADA por pagamento + um título EM ABERTO com o saldo, todos ligados por titulo_origem_id.
//
// Compatível com o que já foi conciliado: cada linha do extrato ligada só a este título vira uma parte com o valor da
// linha, e a linha passa a apontar para essa parte (extrato_transacoes e o JSON do extrato). Os demais pagamentos vêm do
// histórico de alterações (cada aumento do valor pago = um pagamento, com a data e a conta da época); o que o histórico
// não explicar vira uma parte só. O próprio título vira a primeira parte paga (mantém NF, número e vínculos).
// Fora: moeda diferente de real, título em borderô, parcela de contrato financeiro, a receber.
//
// Uso: node scripts/parciais-dividir.mjs            (plano, só leitura)
//      node scripts/parciais-dividir.mjs --aplicar  (grava; backup em backup/parciais_dividir_<data>.json)
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter(l => l.includes("="))
  .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const r2 = v => Math.round(Number(v) * 100) / 100;

{ const { error } = await db.from("lancamentos").select("titulo_origem_id").limit(1); if (error) { console.error("Rode antes a Seção 375."); process.exit(1); } }

const backup = { gerado_em: new Date().toISOString(), titulos: [] };
for (const tab of ["lancamentos", "empresa_lancamentos"]) {
  const campoData = tab === "lancamentos" ? "data_baixa" : "data_pagamento";
  const abertoStatus = tab === "lancamentos" ? "em_aberto" : "pendente";
  const pagoStatus = tab === "lancamentos" ? "baixado" : "pago";
  const { data: ts, error } = await db.from(tab).select("*").eq("status", "parcial").eq("tipo", "pagar");
  if (error) throw error;
  for (const t of ts) {
    const motivoFora = (t.moeda ?? "BRL") !== "BRL" ? "moeda" : t.lote_id ? "borderô" : t.contrato_financeiro_id ? "contrato financeiro" : "";
    if (motivoFora) { console.log(`— ${t.descricao}: fica como está (${motivoFora})`); continue; }
    const pago = r2(t.valor_pago ?? 0), desc = r2(t.valor_desconto ?? 0), saldo = r2(t.valor - pago - desc);

    // Linhas do extrato conciliadas só com este título
    const { data: ls } = await db.from("extrato_transacoes").select("id, fitid, data, valor, lancamento_id, lancamento_ids, conta_bancaria_id")
      .eq("conciliado", true).or(`lancamento_id.eq.${t.id},lancamento_ids.cs.{${t.id}}`);
    const multi = (ls ?? []).filter(l => (l.lancamento_ids?.length ? l.lancamento_ids : [l.lancamento_id]).length > 1);
    if (multi.length) { console.log(`— ${t.descricao}: tem linha do extrato ligada a vários títulos — dividir à mão`); continue; }
    const linhas = (ls ?? []).sort((a, b) => a.data.localeCompare(b.data));

    // Pagamentos pelo histórico (aumentos do valor pago)
    const { data: aud } = await db.from("audit_log").select("acao, created_at, dados_antes, dados_depois").eq("tabela", tab).eq("registro_id", t.id).order("created_at");
    const incs = [];
    for (const a of aud ?? []) {
      const antes = r2(a.dados_antes?.valor_pago ?? 0), depois = r2(a.dados_depois?.valor_pago ?? 0);
      if (depois - antes > 0.005) incs.push({ valor: r2(depois - antes), data: a.dados_depois?.[campoData] ?? a.created_at.slice(0, 10), conta: a.dados_depois?.conta_bancaria ?? null, usado: false });
    }

    const partes = [];
    for (const l of linhas) {
      const inc = incs.find(i => !i.usado && Math.abs(i.valor - Math.abs(l.valor)) <= 0.02);
      if (inc) inc.usado = true;
      partes.push({ valor: r2(Math.abs(l.valor)), data: l.data, conta: inc?.conta ?? t.conta_bancaria ?? null, linha: l });
    }
    for (const i of incs.filter(i => !i.usado)) partes.push({ valor: i.valor, data: i.data, conta: i.conta ?? t.conta_bancaria ?? null });
    let somaPartes = r2(partes.reduce((s, p) => s + p.valor, 0));
    if (somaPartes > pago + 0.02) {
      // histórico com pagamentos que depois foram desfeitos: fica só com as linhas conciliadas + o resto numa parte
      partes.splice(linhas.length);
      somaPartes = r2(partes.reduce((s, p) => s + p.valor, 0));
      if (somaPartes > pago + 0.02) { console.log(`— ${t.descricao}: linhas conciliadas somam mais que o pago — dividir à mão`); continue; }
    }
    if (pago - somaPartes > 0.01) partes.push({ valor: r2(pago - somaPartes), data: t[campoData] ?? t.data_vencimento, conta: t.conta_bancaria ?? null });
    partes.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    if (desc > 0) partes[0].desconto = desc;

    console.log(`\n${tab === "lancamentos" ? "PF" : "PJ"} ${t.descricao} — valor ${t.valor}, pago ${pago}${desc ? `, desconto ${desc}` : ""}, saldo ${saldo}`);
    partes.forEach((p, i) => console.log(`   parte ${i + 1}: pago ${p.valor}${p.desconto ? ` (+ desconto ${p.desconto})` : ""} em ${p.data}${p.linha ? " · conciliada com a linha de " + p.linha.data : ""}${i === 0 ? "  [o próprio título]" : ""}`));
    if (saldo > 0.005) console.log(`   saldo: ${saldo} em aberto, vence ${t.data_vencimento}`);
    backup.titulos.push({ tabela: tab, titulo: t, linhas, partes: partes.map(p => ({ ...p, linha: p.linha?.id ?? null })) });
    if (!aplicar) continue;

    const base = { ...t }; delete base.id; delete base.numero; delete base.created_at;
    const comum = { titulo_origem_id: t.id, valor_titulo_origem: t.valor };
    const idsPartes = [];
    for (let i = 0; i < partes.length; i++) {
      const p = partes[i];
      const dados = { ...comum, valor: r2(p.valor + (p.desconto ?? 0)), valor_pago: p.valor, valor_desconto: p.desconto ?? null, status: pagoStatus,
        pagamento_parcial: true, [campoData]: p.data, conta_bancaria: p.conta, conciliado: !!p.linha };
      if (i === 0) {
        const { error: e } = await db.from(tab).update(dados).eq("id", t.id);
        if (e) throw new Error(`${t.descricao}: ${e.message}`);
        idsPartes.push(t.id);
      } else {
        const { data: novo, error: e } = await db.from(tab).insert({ ...base, ...dados, valor_multa: null, valor_juros: null }).select("id").single();
        if (e) throw new Error(`${t.descricao}: ${e.message}`);
        idsPartes.push(novo.id);
      }
    }
    if (saldo > 0.005) {
      const { error: e } = await db.from(tab).insert({ ...base, ...comum, valor: saldo, valor_pago: null, valor_desconto: null, valor_multa: null, valor_juros: null,
        status: abertoStatus, [campoData]: null, conta_bancaria: null, conciliado: false, pagamento_parcial: false, lote_id: null,
        ...(tab === "lancamentos" ? { previsao_gasto_id: null, fatura_cartao_id: null, conta_bancaria_id: null } : {}) });
      if (e) throw new Error(`${t.descricao} (saldo): ${e.message}`);
    }
    // Linhas do extrato passam a apontar para a parte correspondente
    for (let i = 0; i < partes.length; i++) {
      const l = partes[i].linha; if (!l || idsPartes[i] === t.id) continue;
      await db.from("extrato_transacoes").update({ lancamento_id: tab === "lancamentos" ? idsPartes[i] : null, lancamento_ids: [idsPartes[i]] }).eq("id", l.id);
      const { data: exts } = await db.from("extratos_bancarios").select("id, linhas").eq("conta_id", l.conta_bancaria_id);
      for (const ex of exts ?? []) {
        let mudou = false;
        const novas = (ex.linhas ?? []).map(x => {
          if (x.id !== l.fitid || !((x.lancamento_ids ?? []).includes(t.id) || x.lancamento_id === t.id)) return x;
          mudou = true; return { ...x, lancamento_id: idsPartes[i], lancamento_ids: [idsPartes[i]] };
        });
        if (mudou) await db.from("extratos_bancarios").update({ linhas: novas }).eq("id", ex.id);
      }
    }
    console.log(`   ✓ dividido em ${partes.length} parte(s) paga(s)${saldo > 0.005 ? " + saldo" : ""}`);
  }
}
const arq = `backup/parciais_dividir_${new Date().toISOString().slice(0, 10)}${aplicar ? "" : "_plano"}.json`;
fs.writeFileSync(new URL(`../${arq}`, import.meta.url), JSON.stringify(backup, null, 1));
console.log(`\n${aplicar ? "Aplicado" : "Plano (nada gravado)"} — ${backup.titulos.length} título(s). Backup: ${arq}`);
