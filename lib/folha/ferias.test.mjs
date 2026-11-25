import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {calcularFerias,dataFerias,limiteAbonoFerias,validarConcessaoFerias} from './ferias.ts';
import {bancoSimulado,funcoesReais,valorReal} from '../../scripts/teste-funcoes.mjs';

const p={inicio:'2026-12-01',fim:'2026-12-20',dias:20,diasDireito:30,abono:true,diasAbono:10,
 solicitacaoAbono:'2026-10-01',valorFerias:2666.67,valorAbono:1333.33,dataPagamento:'2026-11-29'};
const fer={id:'fer',funcionario_id:'func',fazenda_id:'faz',periodo_inicio:'2025-11-01',periodo_fim:'2026-10-31',status:'disponivel',
 dias_direito:30,data_solicitacao_abono:null};
const func={id:'func',nome:'Funcionário',salario_base:2500,complemento_salarial:500,area_trabalho:'operacional',produtor_id:'prod'};
function laboratorio(registro=fer){
 const b=bancoSimulado({funcionario_ferias:[registro],lancamentos:[]});
 const fs=funcoesReais('lib/rh-financeiro.ts',['criarCP','concederFerias'],{supabase:b.db,validarConcessaoFerias,
  salarioReferencia:valorReal('lib/rh-financeiro.ts','salarioReferencia'),ogCodigo:valorReal('lib/rh-financeiro.ts','ogCodigo'),
  resolverOperacaoGerencialPorClassificacao:async()=> 'og',iso:()=> '2026-11-25',
  criarLancamento:async dados=>{const r={...dados,id:'cp'+b.tables.lancamentos.length};b.tables.lancamentos.push(r);return r;}});
 return {...b,...fs};
}
test('20 dias de descanso + venda de 10 dias preservam o terço sem duplicá-lo',()=>{
 assert.deepEqual(calcularFerias(3000,20,true,10),{ferias:2000,tercoFerias:666.67,valAbono:1000,tercoAbono:333.33,totalFerias:2666.67,totalAbono:1333.33,total:4000});
 const sem=calcularFerias(3000,30,false,10);assert.equal(sem.total,4000);assert.equal(sem.totalAbono,0);
 assert.equal(validarConcessaoFerias(p,3000),null);
});
test('limite de venda acompanha os dias de direito e não aceita frações ou excedentes',()=>{
 for(const [direito,max] of [[30,10],[24,8],[18,6],[12,4]]){
  assert.equal(limiteAbonoFerias(direito),max);
  const dias=direito-max,correto={...p,diasDireito:direito,dias,diasAbono:max,fim:dataFerias(p.inicio,dias-1)};
  assert.equal(validarConcessaoFerias(correto,3000),null);
  for(const diasAbono of [max+1,0,-1,1.5,NaN,Infinity])assert.match(validarConcessaoFerias({...correto,diasAbono},3000),/venda/);
 }
 assert.match(validarConcessaoFerias({...p,dias:30,fim:'2026-12-30'},3000),/ultrapassar/);
 assert.match(validarConcessaoFerias({...p,diasDireito:25},3000),/direito/);
});
test('datas e valores inválidos não são aceitos; solicitação pode ficar sem data',()=>{
 assert.equal(dataFerias('2028-02-28',2),'2028-03-01');assert.equal(dataFerias('2026-02-29',0),'');
 assert.equal(dataFerias('2026-12-01',-2),'2026-11-29');
 for(const patch of [{dias:0},{dias:1.5},{inicio:'2026-02-31'},{fim:'2026-12-31'},{dataPagamento:''},{valorFerias:0},{valorAbono:-1},{valorAbono:NaN},{solicitacaoAbono:'2026-02-31'}])assert.ok(validarConcessaoFerias({...p,...patch},3000));
 assert.equal(validarConcessaoFerias({...p,solicitacaoAbono:''},3000),null);
 assert.ok(validarConcessaoFerias(p,Infinity));
});
test('a concessão grava o abono e dois CPs distintos com os vínculos do funcionário',async()=>{
 const b=laboratorio();const r=await b.concederFerias(func,'faz-ativa-diferente',fer,p);
 assert.equal(b.tables.lancamentos.length,2);
 assert.deepEqual(b.tables.lancamentos.map(l=>l.valor),[2666.67,1333.33]);
 assert.ok(b.tables.lancamentos.every(l=>l.funcionario_id==='func'&&l.produtor_id==='prod'&&l.fazenda_id==='faz'&&l.status==='em_aberto'));
 assert.match(b.tables.lancamentos[1].descricao,/venda de 10 dias/);
 assert.equal(r.dias_gozados,20);assert.equal(r.dias_abono,10);assert.equal(r.dias_direito,30);
 assert.equal(r.data_solicitacao_abono,'2026-10-01');assert.deepEqual(r.lancamento_ids,['cp0','cp1']);
 assert.equal(r.valor_abono,1333.33);
 await assert.rejects(b.concederFerias(func,'faz',fer,p),/já possui/);assert.equal(b.tables.lancamentos.length,2);
});
test('sem venda gera somente férias; período antigo de 30 dias segue compatível',async()=>{
 const antigo={...fer};delete antigo.dias_direito;delete antigo.data_solicitacao_abono;
 const b=laboratorio(antigo);const r=await b.concederFerias(func,'faz',fer,{...p,dias:30,fim:'2026-12-30',abono:false,diasAbono:0,valorFerias:4000,valorAbono:0,solicitacaoAbono:''});
 assert.equal(b.tables.lancamentos.length,1);assert.equal(r.abono_pecuniario,false);assert.equal(r.dias_abono,0);
 assert.ok(!('dias_direito' in r));
});
test('erros de validação, funcionário e esquema interrompem antes de qualquer CP',async()=>{
 const b=laboratorio();await assert.rejects(b.concederFerias(func,'faz',fer,{...p,diasAbono:11}),/venda/);
 assert.equal(b.calls.length,0);assert.equal(b.tables.lancamentos.length,0);
 await assert.rejects(b.concederFerias({...func,id:'outro'},'faz',fer,p),/conferir/);assert.equal(b.tables.lancamentos.length,0);
 const antigo={...fer};delete antigo.dias_direito;delete antigo.data_solicitacao_abono;
 const a=laboratorio(antigo);await assert.rejects(a.concederFerias(func,'faz',fer,p),/Seção 465/);assert.equal(a.tables.lancamentos.length,0);
});
test('a Seção 465 pode ser repetida e preserva concessão e valor históricos',async()=>{
 const db=new PGlite();try{
  await db.exec("create table funcionario_ferias(id int primary key, valor_abono numeric, dias_abono int); insert into funcionario_ferias values(1,1333.33,10);");
  const src=readFileSync('supabase_migrations.sql','utf8').split('-- Seção 465 —')[1];assert.ok(src);
  const sql=src.slice(src.indexOf('BEGIN;'));await db.exec(sql);await db.exec(sql);
  const {rows}=await db.query('select * from funcionario_ferias');assert.equal(rows[0].dias_direito,30);assert.equal(Number(rows[0].valor_abono),1333.33);assert.equal(rows[0].dias_abono,10);
 }finally{await db.close();}
});
test('venda abre o período disponível e não cria outro quando todos já foram concedidos',async()=>{
 let aberto,avisos=0,gravacoes=0;
 const deps={editFunc:func,fazIdEff:'faz',ferias:[fer],abrirConcessaoFerias:(...args)=>{aberto=args;},alert:()=>{avisos++;},supabase:{from:()=>{gravacoes++;throw Error('Não deve criar período');}}};
 await valorReal('app/cadastros/page.tsx','lancarFeriasAvulsa',deps)(true);assert.equal(aberto[0].id,'fer');assert.equal(aberto[1],true);
 await valorReal('app/cadastros/page.tsx','lancarFeriasAvulsa',{...deps,ferias:[{...fer,status:'concedido'}]})(true);
 assert.equal(avisos,1);assert.equal(gravacoes,0);
});
