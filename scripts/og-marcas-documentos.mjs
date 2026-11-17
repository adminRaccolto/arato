// Marcas de Operação Gerencial por documento de entrada (Seção 455): relatório de sugestão e aplicação revisada.
//
//   node --env-file=.env.local scripts/og-marcas-documentos.mjs
//       Só leitura. Gera relatorios/og-marcas-documentos-<data>.xlsx com, para cada OG (modelo padrão e de cada cliente):
//       marcas que valem hoje, uso real em NF/NFS/CT-e, sugestão e o que muda.
//   node --env-file=.env.local scripts/og-marcas-documentos.mjs --aplicar --conta=UUID   (um cliente)
//   node --env-file=.env.local scripts/og-marcas-documentos.mjs --aplicar --todas         (todos + modelo padrão)
//       Exige a Seção 455 executada. Grava só permite_nf_produtos/permite_nfs/permite_cte das OGs cuja sugestão difere do
//       que vale hoje; backup das marcas anteriores em backup/og_marcas_documentos_<data>.json (para desfazer).
//       permite_notas_fiscais (Pedido de Compra, classificador de NF) não é alterada.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { sugerirMarcas } from './lib/og-marcas-documentos.mjs';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const contaAlvo = args.find(a => a.startsWith('--conta='))?.slice(8);
const todas = args.includes('--todas');
for (const a of args) if (!['--aplicar', '--todas'].includes(a) && !/^--conta=[a-f0-9-]{36}$/i.test(a)) throw new Error(`Opção desconhecida: ${a}`);
if (aplicar && !contaAlvo === !todas) throw new Error('Para aplicar, indique --conta=UUID ou --todas (um dos dois).');

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function todasLinhas(t, sel, f = q => q) {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await f(db.from(t).select(sel)).order('id').range(i, i + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
// Mesma regra de lib/og-documentos.ts (marca NULL = regra anterior à Seção 455)
const efetivo = o => {
  const desp = o.tipo === 'despesa', nf = !!o.permite_notas_fiscais, cp = !!o.permite_cp_cr;
  return { nf_produtos: o.permite_nf_produtos ?? (nf || (desp && cp)), nfs: o.permite_nfs ?? (desp && (nf || cp)), cte: o.permite_cte ?? (desp && cp) };
};

const ogs = await todasLinhas('operacoes_gerenciais', '*');
const temColunas = ogs.some(o => 'permite_nfs' in o);
if (aplicar && !temColunas) throw new Error('A Seção 455 ainda não foi executada no banco (colunas permite_nf_produtos/permite_nfs/permite_cte). Nada foi gravado.');
const fazendas = await todasLinhas('fazendas', 'id,conta_id');
const contas = await todasLinhas('contas', 'id,nome');
const contaDaFaz = new Map(fazendas.map(f => [f.id, f.conta_id]));
const nomeConta = new Map(contas.map(c => [c.id, c.nome]));
const contaDaOg = o => o.conta_id ?? (o.fazenda_id ? contaDaFaz.get(o.fazenda_id) : null) ?? null;

// Uso real por OG usada (id) → depois somado por cliente + classificação (as cópias da mesma classificação se equivalem)
const usoPorId = new Map();
const somar = (id, doc) => { if (!id) return; const u = usoPorId.get(id) ?? { nf_produtos: 0, nfs: 0, cte: 0 }; u[doc]++; usoPorId.set(id, u); };
for (const r of await todasLinhas('nf_entradas', 'id,operacao_gerencial_id', q => q.not('operacao_gerencial_id', 'is', null))) somar(r.operacao_gerencial_id, 'nf_produtos');
for (const r of await todasLinhas('nf_entrada_itens', 'id,operacao_gerencial_id', q => q.not('operacao_gerencial_id', 'is', null))) somar(r.operacao_gerencial_id, 'nf_produtos');
for (const r of await todasLinhas('nf_servicos', 'id,operacao_gerencial_id', q => q.not('operacao_gerencial_id', 'is', null))) somar(r.operacao_gerencial_id, 'nfs');
for (const r of await todasLinhas('cte_entradas', 'id,operacao_gerencial_id', q => q.not('operacao_gerencial_id', 'is', null))) somar(r.operacao_gerencial_id, 'cte');
const ogPorId = new Map(ogs.map(o => [o.id, o]));
const usoPorChave = new Map();   // "<conta|global>|<classificação>"
for (const [id, u] of usoPorId) {
  const o = ogPorId.get(id); if (!o) continue;
  const k = `${contaDaOg(o) ?? 'global'}|${o.classificacao ?? o.id}`;
  const t = usoPorChave.get(k) ?? { nf_produtos: 0, nfs: 0, cte: 0 };
  for (const d of ['nf_produtos', 'nfs', 'cte']) t[d] += u[d];
  usoPorChave.set(k, t);
}

const ROT = { nf_produtos: 'NF', nfs: 'NFS', cte: 'CT-e' };
const linhas = ogs.map(o => {
  const conta = contaDaOg(o);
  const uso = usoPorChave.get(`${conta ?? 'global'}|${o.classificacao ?? o.id}`) ?? { nf_produtos: 0, nfs: 0, cte: 0 };
  const hoje = efetivo(o);
  const sug = sugerirMarcas(o, hoje, uso);
  const muda = [];
  for (const d of ['nf_produtos', 'nfs', 'cte']) if (hoje[d] !== sug[d]) muda.push(`${sug[d] ? 'entra na' : 'sai da'} ${ROT[d]}`);
  return { o, conta, uso, hoje, sug, muda };
});

const sn = b => (b ? 'Sim' : '');
const linhaPlanilha = l => ({
  'Cliente': l.conta ? (nomeConta.get(l.conta) ?? l.conta) : 'Modelo padrão',
  'Classificação': l.o.classificacao, 'Descrição': l.o.descricao, 'Tipo': l.o.tipo, 'Inativa': sn(l.o.inativo),
  'Marca antiga NF': sn(l.o.permite_notas_fiscais), 'Contas a Pagar/Receber': sn(l.o.permite_cp_cr),
  'Hoje NF': sn(l.hoje.nf_produtos), 'Hoje NFS': sn(l.hoje.nfs), 'Hoje CT-e': sn(l.hoje.cte),
  'Uso NF': l.uso.nf_produtos || '', 'Uso NFS': l.uso.nfs || '', 'Uso CT-e': l.uso.cte || '',
  'Sugestão NF': sn(l.sug.nf_produtos), 'Sugestão NFS': sn(l.sug.nfs), 'Sugestão CT-e': sn(l.sug.cte),
  'O que muda': l.muda.join('; '), 'Motivo': l.sug.motivo,
});
const ordena = (a, b) => String(a.o.classificacao ?? '').localeCompare(String(b.o.classificacao ?? ''), 'pt-BR', { numeric: true });

const resumo = new Map();
for (const l of linhas) {
  const k = l.conta ? (nomeConta.get(l.conta) ?? l.conta) : 'Modelo padrão';
  const r = resumo.get(k) ?? { 'Cliente': k, 'OGs': 0, 'Mudam': 0, 'Saem da NF': 0, 'Saem da NFS': 0, 'Saem do CT-e': 0, 'Entram na NF': 0, 'Entram na NFS': 0, 'Entram no CT-e': 0 };
  r['OGs']++; if (l.muda.length) r['Mudam']++;
  for (const m of l.muda) r[{ 'sai da NF': 'Saem da NF', 'sai da NFS': 'Saem da NFS', 'sai da CT-e': 'Saem do CT-e', 'entra na NF': 'Entram na NF', 'entra na NFS': 'Entram na NFS', 'entra na CT-e': 'Entram no CT-e' }[m]]++;
  resumo.set(k, r);
}

const stamp = new Date().toISOString().slice(0, 10);
if (!aplicar) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...resumo.values()].sort((a, b) => a.Cliente === 'Modelo padrão' ? -1 : b.Cliente === 'Modelo padrão' ? 1 : a.Cliente.localeCompare(b.Cliente))), 'Resumo');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.filter(l => !l.conta).sort(ordena).map(linhaPlanilha)), 'Modelo padrão');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.filter(l => l.conta).sort((a, b) => (nomeConta.get(a.conta) ?? '').localeCompare(nomeConta.get(b.conta) ?? '') || ordena(a, b)).map(linhaPlanilha)), 'Por cliente');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.filter(l => l.uso.nf_produtos || l.uso.nfs || l.uso.cte).sort(ordena).map(linhaPlanilha)), 'Usadas em notas');
  fs.mkdirSync('relatorios', { recursive: true });
  const arq = `relatorios/og-marcas-documentos-${stamp}.xlsx`;
  XLSX.writeFile(wb, arq);
  console.log(`Relatório: ${arq} (${linhas.length} OGs; ${linhas.filter(l => l.muda.length).length} com mudança sugerida). Nada gravado.`);
  console.log(`Colunas novas no banco: ${temColunas ? 'sim (Seção 455 executada)' : 'ainda não (Seção 455 pendente)'}`);
  process.exit(0);
}

const alvo = linhas.filter(l => l.muda.length && (todas || l.conta === contaAlvo));
fs.mkdirSync('backup', { recursive: true });
const bkp = `backup/og_marcas_documentos_${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`;
fs.writeFileSync(bkp, JSON.stringify(alvo.map(l => ({ id: l.o.id, classificacao: l.o.classificacao, permite_nf_produtos: l.o.permite_nf_produtos, permite_nfs: l.o.permite_nfs, permite_cte: l.o.permite_cte })), null, 1), { mode: 0o600, flag: 'wx' });
let n = 0;
for (const l of alvo) {
  const { error } = await db.from('operacoes_gerenciais').update({ permite_nf_produtos: l.sug.nf_produtos, permite_nfs: l.sug.nfs, permite_cte: l.sug.cte }).eq('id', l.o.id);
  if (error) throw new Error(`OG ${l.o.classificacao}: ${error.message} (já gravadas: ${n}; backup em ${bkp})`);
  n++;
}
console.log(`${n} OG(s) atualizadas. Backup das marcas anteriores: ${bkp}`);
