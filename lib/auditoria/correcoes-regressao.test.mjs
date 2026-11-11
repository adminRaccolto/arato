import test from 'node:test';
import assert from 'node:assert/strict';
import {funcoesReais,valorReal,bancoSimulado,NextResponse,request} from '../../scripts/teste-funcoes.mjs';
import {fetchFinanceiro} from '../financeiro/requisicao.ts';
import {falharSeErro} from '../db-util.ts';
import {validarReferenciasCliente} from '../api-referencias.ts';
import {contarXmlsSieg} from '../sieg.ts';
import {fetchComTimeout} from '../http.ts';
const depsBase=db=>({admin:()=>db,createClient:()=>db,NextResponse,falharSeErro,hojeLocal:()=> '2026-11-11',exigirAcessoRegistro:async()=>null});

test('pedido: falha na transação não confirma geração do CP',async()=>{
 const db={rpc:async()=>({data:null,error:{message:'Pedido de outro cliente'}})};
 const {POST}=funcoesReais('app/api/compras/gerar-cp/route.ts',['POST'],depsBase(db));
 const res=await POST(request({pedido_id:'p',fazenda_id:'f',valor_total:100}));
 assert.equal(res.status,400); assert.equal((await res.json()).ok,false);
});
test('NF: zero registros afetados resulta em conflito',async()=>{
 const b=bancoSimulado({nf_entradas:[{id:'n',fazenda_id:'original'}]});
 const {POST}=funcoesReais('app/api/compras/nf-update/route.ts',['POST'],depsBase(b.db));
 const res=await POST(request({id:'n',fazenda_id:'outra',observacao:'Texto'}));
 assert.equal(res.status,409);assert.equal((await res.json()).ok,false);
 assert.equal(b.tables.nf_entradas[0].observacao,undefined);
});
test('edição: limpar relação e observação envia null ao banco',async()=>{
 const b=bancoSimulado({lancamentos:[{id:'cp',centro_custo_id:'antigo',observacao:'Texto'}]});
 const {atualizarLancamento}=funcoesReais('lib/db.ts',['atualizarLancamento'],{supabase:b.db});
 await atualizarLancamento('cp',{centro_custo_id:undefined,observacao:undefined},true);
 assert.equal(b.tables.lancamentos[0].centro_custo_id,null);assert.equal(b.tables.lancamentos[0].observacao,null);
 await assert.rejects(atualizarLancamento('inexistente',{valor:10}),/não foi atualizado/);
});
test('falhas obrigatórias, inclusive schema ausente, interrompem gravações',async()=>{
 await assert.rejects(falharSeErro(Promise.resolve({error:{code:'42703',message:'Coluna ausente'}}),'Gravar título'),/Gravar título: Coluna ausente/);
});
test('eSocial: orientação não fabrica protocolo nem marca evento transmitido',async()=>{
 const b=bancoSimulado({esocial_eventos:[{id:'e',status:'pendente'}]});let mensagem='';
 const {transmitir}=funcoesReais('app/fiscal/esocial/page.tsx',['transmitir'],{supabase:b.db,alert:v=>mensagem=v});
 await transmitir({id:'e'});assert.match(mensagem,/nenhum evento foi enviado/);
 assert.equal(b.tables.esocial_eventos[0].status,'pendente');assert.equal(b.calls.length,0);
});
test('borderôs: resposta de contexto antigo não substitui o cliente atual',async()=>{
 let unlock;const espera=new Promise(r=>unlock=r);let state=[];const b=bancoSimulado({});
 const deps={useCallback:f=>f,supabase:b.db,cargaBorderosSeq:{current:0},listarBorderosPendentes:async ids=>ids[0]==='A'?await espera:[{id:'B',itens:[]}],listarBorderosPagos:async()=>[],setBorderosPendentes:v=>state=v,setBorderosPagos:()=>{},setInfoBordero:()=>{},setErro:e=>{throw Error(e);}};
 const anterior=valorReal('app/financeiro/pagar/page.tsx','carregarBorderos',{...deps,fazendaIds:['A'],fazendaId:'A'});
 const atual=valorReal('app/financeiro/pagar/page.tsx','carregarBorderos',{...deps,fazendaIds:['B'],fazendaId:'B'});
 const loading=anterior();await atual();unlock([{id:'A',itens:[]}]);await loading;assert.equal(state[0].id,'B');
});
test('listagens financeiras paginam além de mil registros',async()=>{
 const rows=Array.from({length:1001},(_,n)=>({id:String(n),fazenda_id:'f',tipo:'pagar',status:'pago'}));
 const b=bancoSimulado({pagamento_lotes:rows,contratos:rows});
 const f=funcoesReais('lib/db.ts',['listarBorderosPagos','listarPagamentoLotes','listarContratos'],{supabase:b.db});
 assert.equal((await f.listarBorderosPagos(['f'],'pagar')).length,1001);
 assert.equal((await f.listarPagamentoLotes('f','pagar')).length,1001);
 assert.equal((await f.listarContratos('f')).length,1001);
});
test('relações: aceita o mesmo cliente e recusa cadastro de outro cliente',async()=>{
 const b=bancoSimulado({fazendas:[{id:'f1',conta_id:'c1'},{id:'f2',conta_id:'c2'},{id:'f3',conta_id:'c1'}],pessoas:[{id:'p2',fazenda_id:'f2'},{id:'p3',fazenda_id:'f3'}],operacoes_gerenciais:[{id:'og',fazenda_id:null,conta_id:null}]});
 await validarReferenciasCliente(b.db,'f1',[{tabela:'pessoas',id:'p3'},{tabela:'operacoes_gerenciais',id:'og',global:true}]);
 await assert.rejects(validarReferenciasCliente(b.db,'f1',[{tabela:'pessoas',id:'p2'}]),/outro cliente/);
});
test('reenvio após perda de conexão conserva a identificação da operação',async()=>{
 const original=globalThis.fetch;const keys=[];let n=0;
 globalThis.fetch=async(_url,init)=>{keys.push(init.headers.get('x-arato-requisicao'));if(++n===1)throw Error('Conexão perdida');return Response.json({ok:true});};
 try{
  const req={method:'POST',body:JSON.stringify({valor:100})};
  await assert.rejects(fetchFinanceiro('/somente-laboratorio',req),/Conexão perdida/);
  await fetchFinanceiro('/somente-laboratorio',req);await fetchFinanceiro('/somente-laboratorio',req);
  assert.equal(keys[0],keys[1]);assert.notEqual(keys[1],keys[2]);
 }finally{globalThis.fetch=original;}
});
test('SIEG: renova JWT após 401 e não mascara indisponibilidade como zero notas',async()=>{
 const original=globalThis.fetch;let tokens=0,consultas=0;const auth=[];
 globalThis.fetch=async(url,init)=>{
  if(String(url).endsWith('create-jwt'))return Response.json({token:'laboratorio-'+(++tokens)});
  auth.push(new Headers(init.headers).get('Authorization'));
  if(++consultas===1)return new Response('Token expirado',{status:401});
  if(consultas===3)return new Response('Indisponível',{status:503});
  return Response.json({Total:10});
 };
 try{
  const c={apiKey:'laboratorio',secretKey:'laboratorio',clienteId:'regressao'};
  assert.equal(await contarXmlsSieg(c,{}),10);assert.equal(tokens,2);assert.notEqual(auth[0],auth[1]);
  await assert.rejects(contarXmlsSieg(c,{}),/HTTP 503/);
 }finally{globalThis.fetch=original;}
});
test('prazo de rede interrompe conexão sem resposta',async()=>{
 const original=globalThis.fetch;const timer=setTimeout(()=>{},200);
 globalThis.fetch=async(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));
 try{await assert.rejects(fetchComTimeout('http://somente-laboratorio.invalid',{},15),e=>e.name==='TimeoutError');}
 finally{clearTimeout(timer);globalThis.fetch=original;}
});
const folhaDeps=db=>({...depsBase(db),alvosFolha:()=>({fazendas:[],folhas:[],adiantamentos:[],premiacoes:[],funcionarios:[],empresas:[],produtores:[]}),acessoDoUsuario:async()=>({}),fazendasDoAcesso:async()=>true,getSessionUser:async()=>({id:'user'}),getRequestUser:async()=>({id:'user'}),exigirAcessoRegistros:async()=>null,exigirAcessoFazendas:async()=>null,semPermissaoReprocessar:async()=>null,rotuloCompetencia:()=> 'Nov/2026',liquidoItem:()=>100,descontoNoSalario:()=>0,resolverOgPorClassificacao:async()=> 'og',vencimentoSalario:()=> '2026-12-05',consumirPrevisaoDoTitulo:async()=>{},obsOutrosDescontos:()=>null,titulosParaReprocessamento:(_ids,ts)=>new Map(ts.map(t=>[t.id,t])),FolhaFechadaError:class extends Error{}});
test('simulação de reprocessamento da folha não grava vínculos ou valores',async()=>{
 const b=bancoSimulado({folha_pagamento:[{id:'f',status:'fechado',fazenda_id:'fazenda',competencia:'2026-11'}],folha_funcionarios:[],lancamentos:[{id:'fgts',descricao:'FGTS Nov/2026',fazenda_id:'fazenda',status:'em_aberto',valor:10}]});
 const {POST}=funcoesReais('app/api/folha/salvar/route.ts',['POST'],folhaDeps(b.db));
 const req=request({operacao:'reprocessar_folha',id:'f',simular:true,rows:[{funcionario_id:'func',nome_funcionario:'Ana',fgts:10}]});req.headers.set('authorization','Bearer laboratorio');
 const res=await POST(req);const resultado=await res.json();assert.equal(resultado.ok,true,JSON.stringify(resultado));
 assert.equal(b.calls.filter(c=>c.operation!=='read').length,0);assert.equal(b.tables.folha_pagamento[0].cp_fgts_id,undefined);
});

test('operações sem acesso não alcançam a transação de serviço',async()=>{
 let gravacoes=0;const db={rpc:async()=>{gravacoes++;throw Error('Não deveria executar');}};
 for(const arquivo of ['app/api/compras/gerar-cp/route.ts','app/api/empresa-lancamentos/baixar/route.ts','app/api/campo/abastecimento-acao/route.ts','app/api/estoque/movimento/route.ts']){
  const negar=async()=>NextResponse.json({ok:false,error:'Sem acesso'},{status:403});
  const {POST}=funcoesReais(arquivo,['POST'],{...depsBase(db),exigirAcessoRegistro:negar,exigirAcessoFazenda:negar});
  const res=await POST(request({acao:'baixar',pedido_id:'p',lancamento_id:'cp',fazenda_id:'f',valor_total:100}));
  assert.equal(res.status,403,arquivo);
 }
 assert.equal(gravacoes,0);
});
test('webhook: falha de commit responde 503 para permitir nova entrega',async()=>{
 const {POST}=funcoesReais('app/api/asaas/webhook/route.ts',['POST'],{
  NextResponse,process:{env:{NODE_ENV:'production',ASAAS_WEBHOOK_TOKEN:'laboratorio'}},
  buscarPagamento:async()=>({status:'RECEIVED'}),statusAsaasParaLocal:()=> 'pago',ErroAsaas:class extends Error{},
  sb:()=>({rpc:async()=>({data:null,error:{message:'Banco indisponível'}})}),console:{error:()=>{}},
 });
 const req=request({id:'evento',event:'PAYMENT_RECEIVED',payment:{id:'pagamento',status:'RECEIVED'}});req.headers.set('asaas-access-token','laboratorio');
 const res=await POST(req);assert.equal(res.status,503);assert.equal((await res.json()).ok,false);
});
test('transportes fiscais mantêm certificado do cliente, CA e verificação TLS',async()=>{
 for(const modulo of ['nfe','cte','mdfe']){
  let options;const req={on(){return this;},write(){},end(){queueMicrotask(()=>callback());}};let callback;
  const https={request:(o,cb)=>{options=o;callback=()=>{const res={statusCode:200,on(ev,fn){if(ev==='data')fn('<retorno/>');if(ev==='end')fn();return this;},setEncoding(){}};cb(res);};return req;}};
  const {soapPost}=funcoesReais(`lib/${modulo}/transmitter.ts`,['soapPost'],{https,CA_FISCAL:['raiz-laboratorio'],SOAP_ACTION:'acao-laboratorio',console:{log:()=>{}}});
  assert.equal(await soapPost('https://autorizador.gov.br/ws','<pedido/>',{cert:'certificado',certChain:'cadeia-cliente',key:'chave'},'acao'),'<retorno/>');
  assert.equal(options.rejectUnauthorized,true);assert.deepEqual(options.ca,['raiz-laboratorio']);
  assert.equal(options.cert,'cadeia-cliente');assert.equal(options.key,'chave');assert.ok(options.signal instanceof AbortSignal);
 }
});
