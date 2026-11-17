// Fotografia de baixa parcial para borderô ANTIGO (anterior à Seção 428), para que o estorno normal da tela funcione.
//
// Contexto (17/11/2026): a função bordero_acao_atomica só estorna baixa parcial que tem fotografia em
// pagamento_lote_baixas (criada desde a Seção 428). Borderô dividido antes disso fica travado com "Borderô antigo dividido
// em partes: é necessária conferência da família". Este script monta a fotografia que faltou a partir da auditoria
// (estado de cada título antes da baixa) e do estado atual (depois da baixa), conferindo tudo. Ele NÃO altera valores:
// só grava a fotografia; o estorno continua sendo feito pela tela, pela função atômica, que confere de novo cada título,
// o saldo e o borderô e recusa se algo divergir.
//
// Uso: node --env-file=.env.local scripts/bordero-legado-fotografia.mjs --lote=UUID            (só confere e mostra)
//      node --env-file=.env.local scripts/bordero-legado-fotografia.mjs --lote=UUID --aplicar  (grava a fotografia)
// Desfazer (antes de estornar): DELETE FROM pagamento_lote_baixas WHERE id = '<id impresso>';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const lote = args.find(a => a.startsWith('--lote='))?.slice(7);
const aplicar = args.includes('--aplicar');
if (!lote || !/^[a-f0-9-]{36}$/i.test(lote)) throw new Error('Informe --lote=UUID do borderô pago em parte.');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (cond, msg) => { if (!cond) throw new Error(`Conferência falhou: ${msg}. Nada foi gravado.`); };
const cent = v => Math.round(Number(v ?? 0) * 100);
const q = async p => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };

const b = await q(db.from('pagamento_lotes').select('*').eq('id', lote).single());
ok(b.tipo === 'pagar' && b.pagamento_parcial && b.status === 'pago', 'o borderô não é um pagamento parcial já pago');
ok((await q(db.from('pagamento_lote_baixas').select('id').or(`lote_id.eq.${lote},saldo_lote_id.eq.${lote}`))).length === 0, 'o borderô já tem fotografia');
const saldos = await q(db.from('pagamento_lotes').select('*').eq('lote_origem_id', b.lote_origem_id ?? lote).neq('id', lote));
ok(saldos.length === 1, `esperado 1 borderô de saldo na família, há ${saldos.length}`);
const s = saldos[0];
ok(s.status === 'pendente' && !s.valor_pago && !s.conciliado && !s.pagamento_parcial, 'o saldo já foi pago ou alterado; estorne o saldo antes');
ok((await q(db.from('empresa_lancamentos').select('id').in('lote_id', [lote, s.id]))).length === 0, 'família com títulos de Empresa (não previsto)');

const itens = await q(db.from('pagamento_lote_itens').select('*').eq('lote_id', lote).order('id'));
const itensSaldo = await q(db.from('pagamento_lote_itens').select('*').eq('lote_id', s.id).order('id'));
const titulos = await q(db.from('lancamentos').select('*').eq('lote_id', lote));
const partes = await q(db.from('lancamentos').select('*').eq('lote_id', s.id).order('id'));
ok(itens.length && itens.length === titulos.length, 'itens e títulos do borderô não fecham');
ok(itensSaldo.length === partes.length, 'itens e títulos do saldo não fecham');

const itensAntes = [], itensDepois = [];
let somaAntes = 0;
for (const it of itens) {
  ok((it.origem_tabela ?? 'lancamentos') === 'lancamentos', 'item de outra origem');
  const t = titulos.find(x => x.id === it.lancamento_id);
  ok(t, `título do item ${it.id} não encontrado`);
  const ev = await q(db.from('audit_log').select('acao,created_at,dados_antes,dados_depois').eq('tabela', 'lancamentos').eq('registro_id', t.id).order('created_at').order('id'));
  const iBaixa = ev.findIndex(e => e.acao === 'UPDATE' && e.dados_antes?.lote_id === lote && e.dados_antes?.status !== t.status && !e.dados_antes?.pagamento_parcial);
  ok(iBaixa >= 0, `sem auditoria da baixa do título ${t.numero_documento ?? t.id}`);
  const antes = ev[iBaixa].dados_antes;
  ok(antes.id === t.id && !cent(antes.valor_pago) && !antes.conciliado && !antes.titulo_origem_id && (antes.moeda ?? 'BRL') === 'BRL', `estado anterior inesperado no título ${t.numero_documento}`);
  // Depois da baixa só pode ter mudado a conciliação (outras mudanças exigem conferência manual)
  for (const e of ev.slice(iBaixa + 1)) {
    const mudou = Object.keys(e.dados_depois ?? {}).filter(k => k !== 'updated_at' && JSON.stringify(e.dados_depois[k]) !== JSON.stringify(e.dados_antes?.[k]));
    ok(mudou.every(k => k === 'conciliado'), `título ${t.numero_documento} alterado depois da baixa (${mudou.join(', ')})`);
  }
  const parte = partes.find(p => p.titulo_origem_id === t.id);
  ok(cent(t.valor) + cent(parte?.valor) === cent(antes.valor), `partes do título ${t.numero_documento} não somam o valor original`);
  somaAntes += cent(antes.valor);
  itensAntes.push({ item: { ...it, valor_pago: Number(antes.valor), valor_juros: null, valor_multa: null, valor_desconto: null }, titulo: antes });
  itensDepois.push({ item: it, titulo: t });
}
ok(somaAntes === cent(b.valor_lote_origem) && somaAntes === cent(b.valor_total) + cent(s.valor_total), 'a soma dos títulos antes da baixa não fecha com o borderô original');
for (const p of partes) {
  const ev = await q(db.from('audit_log').select('acao').eq('tabela', 'lancamentos').eq('registro_id', p.id));
  ok(ev.length === 1 && ev[0].acao === 'INSERT' && p.status === 'em_aberto' && !cent(p.valor_pago), `parte do saldo ${p.numero_documento} foi alterada depois de criada`);
}

const loteAntes = { ...b, valor_total: Number(b.valor_lote_origem), pagamento_parcial: false, lote_origem_id: null, valor_lote_origem: null,
  status: 'pendente', valor_pago: null, valor_juros: 0, valor_multa: 0, valor_desconto: 0, data_pagamento: null, conta_bancaria: null, conciliado: false };
const linha = {
  id: randomUUID(), lote_id: lote, fazenda_id: b.fazenda_id, requisicao_id: randomUUID(),
  dados: { legado: true, reconstruida_em: new Date().toISOString(), fonte: 'audit_log + estado atual (scripts/bordero-legado-fotografia.mjs)' },
  lote_antes: loteAntes, lote_depois: b, itens_antes: itensAntes, itens_depois: itensDepois,
  extratos_antes: [], // antes da baixa nada estava conciliado (conferido acima): o estorno devolve o extrato à conferência
  saldo_lote_id: s.id,
  saldo_estado: { lote: s, itens: itensSaldo, titulos: partes.map(p => ({ origem: 'lancamentos', titulo: p })) },
};
const extratos = await q(db.from('extrato_transacoes').select('id,data,valor,descricao,conciliado').or(`lancamento_id.in.(${titulos.map(t => t.id).join(',')}),lancamento_ids.ov.{${titulos.map(t => t.id).join(',')}}`));

const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
console.log(`Borderô ${lote} — pago ${brl(cent(b.valor_total))} em ${b.data_pagamento}; saldo ${s.id} ${brl(cent(s.valor_total))} pendente.`);
console.log(`Ao estornar pela tela: ${itens.length} títulos voltam a em aberto com o valor original (total ${brl(somaAntes)}), as ${partes.length} partes do saldo e o borderô de saldo são removidos, o borderô volta a pendente com ${brl(somaAntes)}.`);
for (const x of itensAntes) console.log(`  ${x.titulo.numero_documento ?? x.titulo.id}: ${brl(cent(x.titulo.valor))}`);
console.log(`Extrato que volta para a conferência: ${extratos.map(e => `${e.data} ${brl(cent(e.valor))} ${e.descricao}`).join('; ') || 'nenhum'}`);

fs.mkdirSync('backup', { recursive: true });
const arquivo = `backup/bordero_legado_fotografia_${lote.slice(0, 8)}_${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`;
fs.writeFileSync(arquivo, JSON.stringify({ linha, extratos }, null, 1), { mode: 0o600, flag: 'wx' });
console.log(`Fotografia montada em ${arquivo}.`);
if (!aplicar) { console.log('Nada gravado (sem --aplicar).'); process.exit(0); }
await q(db.from('pagamento_lote_baixas').insert(linha));
console.log(`Fotografia gravada (id ${linha.id}). Agora o "Estornar" do borderô funciona pela tela.`);
