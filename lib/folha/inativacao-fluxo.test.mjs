import test from 'node:test';
import assert from 'node:assert/strict';
import {funcoesReais,bancoSimulado} from '../../scripts/teste-funcoes.mjs';
import {buscarPaginado} from '../buscar-paginado.ts';
import {falharSeErro} from '../db-util.ts';
import {preservarTituloDaFolha} from './inativacao.ts';

function rotina(extra={}){
 return funcoesReais('app/api/folha/salvar/route.ts',['refazerPrevisoesFolha','rotuloCompetencia','liquidoItem','vencimentoEncargoFolha'],{
  buscarPaginado,falharSeErro,preservarTituloDaFolha,hojeLocal:()=> '2026-11-13',vencimentoSalario:()=> '2026-12-05',
  MESES_ABREV:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
  apagarPrevisoesDaFolha:async()=>{},resolverOgPorClassificacao:async()=>null,
  inserirLancamentoFolha:async()=>{throw Error('Previsão não deveria ser criada');},...extra,
 }).refazerPrevisoesFolha;
}
const folha={id:'folha',fazenda_id:'faz',empresa_id:null,competencia:'2026-11',status:'rascunho',valor_bruto:1000,valor_liquido:900};

test('salvar/reabrir: limpeza precede leitura; sem linha ativa não recria título nem conserva total antigo',async()=>{
 const b=bancoSimulado({folha_pagamento:[folha],folha_funcionarios:[{id:'antiga',funcionario_id:'inativo'}],fazendas:[{id:'faz',conta_id:'conta'}]});
 b.db.rpc=async nome=>{
  if(nome==='folha_limpar_inativos'){
   assert.equal(b.calls.length,0);b.tables.folha_funcionarios=[];
   return {data:{titulos_preservados:[]},error:null};
  }
  return {data:null,error:null};
 };
 await rotina()(b.db,'folha');
 assert.equal(b.calls.some(c=>c.table==='lancamentos'&&c.operation==='insert'),false);
 assert.equal(b.tables.folha_pagamento[0].valor_bruto,0);assert.equal(b.tables.folha_pagamento[0].valor_liquido,0);
});

test('limpeza recusada interrompe o salvamento sem interpretar falha como ausência de inativos',async()=>{
 const b=bancoSimulado();b.db.rpc=async()=>({data:null,error:{code:'PGRST202',message:'Função ausente'}});
 await assert.rejects(rotina()(b.db,'folha'),/Seção 446/);assert.equal(b.calls.length,0);
});

test('reabertura conserva título salarial real e vínculo do funcionário inativo',async()=>{
 const titulo={id:'cp',natureza:'real',status:'em_aberto',valor:850};
 const it={id:'linha',folha_id:'folha',funcionario_id:'inativo',cp_lancamento_id:'cp',salario_bruto:1000,inss_trabalhador:100,irrf:0,adiantamento:0,outros_descontos:0,vale_transporte:0,vale_refeicao:0,outros_beneficios:0,fgts:0,inss_patronal:0};
 const b=bancoSimulado({folha_pagamento:[folha],folha_funcionarios:[it],lancamentos:[titulo],funcionarios:[{id:'inativo',ativo:false}],fazendas:[{id:'faz'}]});
 b.db.rpc=async()=>({data:{titulos_preservados:[{titulo_id:'cp'}]},error:null});
 await rotina()(b.db,'folha');assert.deepEqual(b.tables.lancamentos,[titulo]);assert.equal(b.tables.folha_funcionarios[0].cp_lancamento_id,'cp');
});

test('encargos manuais: sincronização mantém cálculos positivos sem criar FGTS ou INSS no CP',async()=>{
 const it={id:'linha',folha_id:'folha',funcionario_id:'func',cp_lancamento_id:'cp',salario_bruto:1000,inss_trabalhador:100,irrf:0,adiantamento:0,outros_descontos:0,vale_transporte:0,vale_refeicao:0,outros_beneficios:0,fgts:80,inss_patronal:200};
 const b=bancoSimulado({folha_pagamento:[{...folha,empresa_id:'empresa',gerar_encargos_cp:false}],folha_funcionarios:[it],lancamentos:[{id:'cp',natureza:'real',status:'em_aberto',valor:900}],funcionarios:[{id:'func'}],fazendas:[{id:'faz'}]});
 b.db.rpc=async()=>({data:{titulos_preservados:[]},error:null});
 await rotina()(b.db,'folha');
 assert.equal(b.tables.lancamentos.length,1);assert.equal(b.tables.folha_pagamento[0].fgts_total,80);assert.equal(b.tables.folha_pagamento[0].inss_patronal,200);
});
