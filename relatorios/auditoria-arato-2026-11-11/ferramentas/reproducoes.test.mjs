import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {funcoesReais,valorReal,bancoSimulado,NextResponse,request}from'./laboratorio.mjs';

const observacoes=[];
const registrar=(id,titulo,evidencia)=>observacoes.push({id,titulo,evidencia,ambiente:'laboratório isolado, funções extraídas do código real'});
process.on('exit',()=>fs.writeFileSync('relatorios/auditoria-arato-2026-11-11/dados/reproducoes.json',JSON.stringify(observacoes,null,2)+'\n'));
const error=async q=>{const r=await q;if(r.error)throw r.error;return r;};
const depsBase=db=>({createClient:()=>db,admin:()=>db,NextResponse,
 exigirAcessoRegistro:async()=>null,exigirAcessoRegistros:async()=>null,
 exigirAcessoFazenda:async()=>null,exigirAcessoFazendas:async()=>null,
 getSessionUser:async()=>({id:'user'}),getRequestUser:async()=>({id:'user'}),
 validateFazendaAccess:async()=>({ok:true}),hojeLocal:()=> '2026-11-11',
 desvincularExtrato:async()=>{},excedeLimiteBaixa:(t,p)=>p>Number(t.valor)+Number(t.valor_multa??0)+Number(t.valor_juros??0)-Number(t.valor_desconto??0)+.01,
 mensagemExcesso:()=> 'Acima do teto'});
const previsao=()=>({id:'prev',conta_id:'conta',fazenda_id:'fazenda',operacao_gerencial_id:'og',og_classificacao:'2.1',
 saldo:100,valor:100,status:'aberta',lancamento_previsao_id:'cp',data_vencimento:'2026-11-11'});
const depsPrev=db=>({hojeLocal:()=> '2026-11-11',resultadoConsumo:p=>({status:p.saldo===p.consumido?'cumprida':'pendente_decisao',diferenca:p.saldo-p.consumido,dentroTolerancia:false}),
 removerTituloPrevisao:async()=>{},sincronizarTituloPrevisao:async()=>{},...depsBase(db)});

test('AUD-01: título cancelado recebe status vencido pelo classificador dos relatórios',()=>{
 const {statusEfetivo}=funcoesReais('lib/financeiro/titulos.ts',['statusEfetivo'],{hojeLocal:()=> '2026-11-11'});
 assert.equal(statusEfetivo({status:'cancelado',natureza:'real',data_vencimento:'2026-01-01'}),'vencido');
 registrar('AUD-01','Status terminal alterado por vencimento',{entrada:'cancelado',saida:'vencido',esperado:'cancelado'});
});
test('AUD-02: CP efetivado continua reconhecido como previsão pela origem antiga',()=>{
 const source=fs.readFileSync('app/financeiro/pagar/page.tsx','utf8');
 const code=source.match(/const ehPrevisao = \(l:[^\n]+/)[0].replace(/: Pick<[^\n]+?>\)/,')');
 const eh=new Function(code+';return ehPrevisao;')();
 assert.equal(eh({natureza:'real',origem_lancamento:'previsao'}),true);
 registrar('AUD-02','Efetivação mantém aparência e restrições de previsão',{natureza:'real',origem:'previsao',classificadoComoPrevisao:true});
});
test('AUD-03: falha na atualização do pedido é devolvida como sucesso',async()=>{
 const b=bancoSimulado({pedidos_compra:[{id:'pedido',status:'aprovado',lancamento_id:'cp'}],lancamentos:[{id:'cp',valor:100}]},{fail:c=>c.table==='lancamentos'&&c.operation==='update'?'Falha de gravação':null});
 const {POST}=funcoesReais('app/api/compras/gerar-cp/route.ts',['POST'],depsBase(b.db));
 const res=await POST(request({pedido_id:'pedido',valor_total:200,moeda:'BRL',data_registro:'2026-11-11',fornecedor_nome:'Fornecedor'}));
 const body=await res.json();assert.equal(body.ok,true);assert.equal(b.tables.lancamentos[0].valor,100);
 registrar('AUD-03','API informa sucesso após erro de banco',{http:res.status,ok:body.ok,valorSolicitado:200,valorPersistido:100});
});
test('AUD-04: pedido acessível aceita fazenda de destino de outro cliente no novo financeiro',async()=>{
 const b=bancoSimulado({pedidos_compra:[{id:'pedido-do-cliente-A',fazenda_id:'fazenda-A',status:'aprovado'}],lancamentos:[]});
 const deps=depsBase(b.db);deps.exigirAcessoRegistro=async(_r,t,id)=>{assert.equal(t,'pedidos_compra');assert.equal(id,'pedido-do-cliente-A');return null;};
 const {POST}=funcoesReais('app/api/compras/gerar-cp/route.ts',['POST'],deps);
 const res=await POST(request({pedido_id:'pedido-do-cliente-A',fazenda_id:'fazenda-B',valor_total:200,moeda:'BRL',data_registro:'2026-11-11',fornecedor_nome:'Fornecedor'}));
 assert.equal((await res.json()).ok,true);assert.equal(b.tables.lancamentos[0].fazenda_id,'fazenda-B');
 registrar('AUD-04','Destino financeiro não é validado contra o cliente do pedido',{pedidoFazenda:'fazenda-A',financeiroFazenda:'fazenda-B',prova:'Caminho autorizado por pedido com destino arbitrário; nenhuma tentativa em produção.'});
});
test('AUD-05: falha no vínculo do novo CP deixa título solto e nova tentativa duplica',async()=>{
 const b=bancoSimulado({pedidos_compra:[{id:'pedido',status:'aprovado'}],lancamentos:[]},{fail:c=>c.table==='pedidos_compra'&&c.operation==='update'?'Vínculo recusado':null});
 const {POST}=funcoesReais('app/api/compras/gerar-cp/route.ts',['POST'],depsBase(b.db));
 const input={pedido_id:'pedido',fazenda_id:'fazenda',valor_total:200,moeda:'BRL',data_registro:'2026-11-11',fornecedor_nome:'Fornecedor'};
 assert.equal((await(await POST(request(input))).json()).ok,true);
 assert.equal((await(await POST(request(input))).json()).ok,true);
 assert.equal(b.tables.lancamentos.length,2);assert.equal(b.tables.pedidos_compra[0].lancamento_id,undefined);
 registrar('AUD-05','Gravação parcial seguida de duplicação',{titulosCriados:2,vinculoPedido:null,respostas:'duas confirmações de sucesso'});
});
test('AUD-06: atualizar NF com fazenda divergente confirma campos sem afetar nenhuma linha',async()=>{
 const b=bancoSimulado({nf_entradas:[{id:'nf',fazenda_id:'original',observacao:'Antes'}]});
 const {POST}=funcoesReais('app/api/compras/nf-update/route.ts',['POST'],depsBase(b.db));
 const res=await POST(request({id:'nf',fazenda_id:'outra',observacao:'Depois'}));const body=await res.json();
 assert.equal(body.ok,true);assert.equal(body.updated,1);assert.equal(b.tables.nf_entradas[0].observacao,'Antes');
 registrar('AUD-06','Sucesso com zero linhas afetadas',{camposAnunciados:body.updated,linhasRealmenteAlteradas:0});
});
test('AUD-07: movimento de estoque retorna sem erro quando a inserção falha',async()=>{
 const b=bancoSimulado({insumos:[{id:'item',nome:'Produto',estoque:100}],movimentacoes_estoque:[]},{fail:c=>c.operation!=='read'?'Permissão/validação recusada':null});
 const {criarMovimentacaoManual}=funcoesReais('lib/db.ts',['criarMovimentacaoManual'],{supabase:b.db});
 await criarMovimentacaoManual('fazenda','item','saida','Consumo',10,undefined,'2026-11-11');
 assert.equal(b.tables.movimentacoes_estoque.length,0);
 registrar('AUD-07','Perda silenciosa de lançamento de estoque',{funcaoConcluida:true,movimentosGravados:0});
});
test('AUD-08: folha mensal anuncia salários gerados após inserção recusada',async()=>{
 const b=bancoSimulado({funcionarios:[{id:'f',nome:'Ana',fazenda_id:'fazenda',ativo:true,salario_base:2000}],lancamentos:[],operacoes_gerenciais:[]},{fail:c=>c.table==='lancamentos'&&c.operation==='insert'?'Gravação recusada':null});
 const {processarFolhaMensal}=funcoesReais('lib/db.ts',['processarFolhaMensal'],{supabase:b.db,
 resolverContaIdDaFazenda:async()=> 'conta',resolverFazendaIdsDaConta:async()=>['fazenda'],ogOrFilter:()=>'',valorEmMaos:()=>1800,vencimentoSalario:()=> '2026-12-05'});
 const result=await processarFolhaMensal('fazenda','2026-11');assert.equal(result.gerados,1);assert.equal(b.tables.lancamentos.length,0);
 registrar('AUD-08','Contador de salários não confirma persistência',{anunciados:result.gerados,persistidos:0});
});
test('AUD-09: transmitir eSocial apenas altera registro local e fabrica protocolo',async()=>{
 const b=bancoSimulado({esocial_eventos:[{id:'evento',status:'pendente'}]});let externas=0;
 const {transmitir}=funcoesReais('app/fiscal/esocial/page.tsx',['transmitir'],{supabase:b.db,carregar:()=>{},fetch:()=>{externas++;throw Error('Rede bloqueada');}});
 await transmitir({id:'evento'});assert.equal(b.tables.esocial_eventos[0].status,'transmitido');assert.match(b.tables.esocial_eventos[0].protocolo,/^ES\d{8}$/);assert.equal(externas,0);
 registrar('AUD-09','Transmissão oficial não ocorre no comando da tela',{statusLocal:'transmitido',protocoloGeradoLocalmente:true,chamadasExternas:externas});
});
test('AUD-10: baixa de produtor aceita valor negativo',async()=>{
 const b=bancoSimulado({lancamentos:[{id:'cp',valor:100,moeda:'BRL',status:'em_aberto',valor_pago:0}],parcelas_pagamento:[]});
 const {POST}=funcoesReais('app/api/financeiro/baixar/route.ts',['POST'],depsBase(b.db));
 const res=await POST(request({acao:'baixar',lancamento_id:'cp',valor_pago_agora:-10,data_baixa:'2026-11-11',conta_bancaria:'banco'}));
 assert.equal((await res.json()).ok,true);assert.equal(b.tables.lancamentos[0].valor_pago,-10);
 registrar('AUD-10','Valor negativo alcança a gravação financeira',{http:res.status,valor_pago:-10,status:b.tables.lancamentos[0].status});
});
test('AUD-11: reabrir produtor conserva encargos que a rotina de empresa apaga',async()=>{
 const produtor=bancoSimulado({lancamentos:[{id:'cp',status:'baixado',valor:110,valor_pago:110,valor_juros:10,valor_desconto:2,data_vencimento:'2026-11-11'}]});
 const empresa=bancoSimulado({empresa_lancamentos:[{id:'cp',fazenda_id:'fazenda',status:'pago',valor:110,valor_pago:110,valor_juros:10,valor_desconto:2,data_vencimento:'2026-11-11'}]});
 const p=funcoesReais('app/api/financeiro/baixar/route.ts',['POST'],depsBase(produtor.db));
 const e=funcoesReais('app/api/empresa-lancamentos/baixar/route.ts',['POST'],depsBase(empresa.db));
 await p.POST(request({acao:'reabrir',lancamento_id:'cp'}));await e.POST(request({acao:'reabrir',lancamento_id:'cp'}));
 assert.equal(produtor.tables.lancamentos[0].valor_juros,10);assert.equal(empresa.tables.empresa_lancamentos[0].valor_juros,null);
 registrar('AUD-11','Estorno tem semânticas financeiras diferentes por origem',{jurosAposReabrirProdutor:10,jurosAposReabrirEmpresa:null});
});
test('AUD-12: duas baixas concorrentes confirmam mas perdem um dos valores',async()=>{
 let reads=0;let unlock;const barrier=new Promise(r=>unlock=r);
 const b=bancoSimulado({lancamentos:[{id:'cp',valor:1000,moeda:'BRL',status:'parcial',valor_pago:100}],parcelas_pagamento:[]},
 {afterRead:async(c)=>{if(c.table==='lancamentos'){reads++;if(reads===2)unlock();await barrier;}}});
 const {POST}=funcoesReais('app/api/financeiro/baixar/route.ts',['POST'],depsBase(b.db));
 const body={acao:'baixar',lancamento_id:'cp',valor_pago_agora:100,data_baixa:'2026-11-11',conta_bancaria:'banco'};
 const result=await Promise.all([POST(request(body)),POST(request(body))]);
 assert.deepEqual(await Promise.all(result.map(r=>r.json())).then(rs=>rs.map(r=>r.ok)),[true,true]);
 assert.equal(b.tables.lancamentos[0].valor_pago,200);
 registrar('AUD-12','Leitura seguida de escrita sem trava perde atualização concorrente',{pagoInicial:100,novosPagamentosConfirmados:[100,100],pagoFinal:200,esperado:300});
});
test('AUD-13: consumir previsão grava consumo antes do erro e nova tentativa grava outro',async()=>{
 const b=bancoSimulado({previsoes_gasto:[previsao()],previsoes_gasto_consumos:[],previsoes_config:[]},
 {fail:c=>c.table==='previsoes_gasto'&&c.operation==='update'?'Falha na conclusão':null});
 const {consumirPrevisao,toleranciaDaConta}=funcoesReais('lib/financeiro/previsoes-server.ts',['consumirPrevisao','toleranciaDaConta'],depsPrev(b.db));
 void toleranciaDaConta;
 for(let n=0;n<2;n++)await assert.rejects(consumirPrevisao(b.db,{previsao_id:'prev',valor:100,origem:'cp_manual',lancamento_id:'real'}));
 assert.equal(b.tables.previsoes_gasto_consumos.length,2);assert.equal(b.tables.previsoes_gasto[0].status,'aberta');
 registrar('AUD-13','Consumo de previsão não é atômico nem protegido contra reenvio',{consumosPersistidos:2,statusPrevisao:'aberta',operacoesReportadasComoFalha:2});
});
test('AUD-14: consumo simultâneo usa o mesmo saldo em duas solicitações',async()=>{
 let reads=0;let unlock;const barrier=new Promise(r=>unlock=r);
 const b=bancoSimulado({previsoes_gasto:[previsao()],previsoes_gasto_consumos:[],previsoes_config:[]},
 {afterRead:async c=>{if(c.table==='previsoes_gasto'){reads++;if(reads===2)unlock();await barrier;}}});
 const {consumirPrevisao}=funcoesReais('lib/financeiro/previsoes-server.ts',['consumirPrevisao','toleranciaDaConta'],depsPrev(b.db));
 await Promise.all([1,2].map(()=>consumirPrevisao(b.db,{previsao_id:'prev',valor:100,origem:'cp_manual',lancamento_id:'real'})));
 assert.equal(b.tables.previsoes_gasto_consumos.reduce((s,r)=>s+r.valor,0),200);
 assert.equal(b.tables.previsoes_gasto[0].saldo,0);
 registrar('AUD-14','Dois consumos recebem autorização sobre o mesmo saldo',{previsao:100,consumos:200,saldoFinal:0});
});
test('AUD-15: auditor de estoque ignora ajustes que o saldo oficial considera',()=>{
 const {regraEstoqueNegativo}=funcoesReais('lib/auditoria/saude/regras.ts',['regraEstoqueNegativo'],{num:n=>Number(n??0)});
 const movs=[{tipo:'entrada',quantidade:100},{tipo:'saida',quantidade:150},{tipo:'ajuste',quantidade:100}]
  .map(m=>({...m,insumo_id:'i',fazenda_id:'f',deposito_id:'d'}));
 const result=regraEstoqueNegativo({movs,contaDaFazenda:()=> 'conta'});
 assert.equal(result[0].detalhe.saldo,-50);
 registrar('AUD-15','Auditor e saldo oficial usam regras distintas',{saldoAuditor:-50,saldoComAjuste:50});
});
test('AUD-16: criação de previsão fica sem título se o segundo insert falhar',async()=>{
 const b=bancoSimulado({previsoes_gasto:[],lancamentos:[],operacoes_gerenciais:[{id:'og',classificacao:'2.1',descricao:'Despesa'}]},
 {fail:c=>c.table==='lancamentos'&&c.operation==='insert'?'CP recusado':null});
 const {criarPrevisoes}=funcoesReais('lib/financeiro/previsoes-server.ts',['criarPrevisoes','criarTituloPrevisao','inserirLancamento'],depsPrev(b.db));
 await assert.rejects(criarPrevisoes(b.db,[{fazenda_id:'f',conta_id:'c',operacao_gerencial_id:'og',valor:100,data_vencimento:'2026-11-11'}],'user'));
 assert.equal(b.tables.previsoes_gasto.length,1);assert.equal(b.tables.lancamentos.length,0);
 registrar('AUD-16','Previsão fica gravada sem representação no financeiro',{previsoes:1,titulos:0,resposta:'falha'});
});

test('AUD-17: campos apagados na edição são omitidos do JSON e preservam o valor anterior',()=>{
 const form={moeda:'BRL',pessoa_id:'',descricao:'Título',categoria:'Despesa',data_vencimento:'2026-11-11',serie:'',observacao:'',veiculo_sel:'',natureza:'real'};
 const campos=valorReal('app/financeiro/pagar/page.tsx','camposEdit',{novoForm:form,valorFinal:100,sacas:0,pessoas:[],cascadeNovo:{},numBR:()=>0});
 const serialized=JSON.parse(JSON.stringify(campos));const old={centro_custo_id:'cc-antigo',observacao:'Texto antigo'};Object.assign(old,serialized);
 assert.equal(old.centro_custo_id,'cc-antigo');assert.equal(old.observacao,'Texto antigo');
 registrar('AUD-17','Limpar campos no formulário não limpa o banco',{enviadoCentroCusto:Object.hasOwn(serialized,'centro_custo_id'),centroCustoAposSalvar:old.centro_custo_id});
});
test('AUD-18: deduplicação de opções remove o ID gravado e o seletor perde o rótulo',()=>{
 const list=[{id:'og-fazenda-A',classificacao:'2.1'},{id:'og-fazenda-B',classificacao:'2.1'}];
 const source=fs.readFileSync('app/financeiro/previsoes/page.tsx','utf8');const predicate=source.match(/lista\.filter\((o => \{[^\n]+?return true; \})\)/)[1];
 const filter=new Function('vistas','return '+predicate)(new Set());const options=list.filter(filter).map(o=>({value:o.id,label:o.classificacao}));
 const selectedLabel=valorReal('components/SelectBusca.tsx','selectedLabel',{options,value:'og-fazenda-B'});
 assert.equal(selectedLabel,undefined);registrar('AUD-18','Seleção persistida some visualmente após deduplicação',{idGravado:'og-fazenda-B',idsDisponiveis:options.map(o=>o.value),rotuloEncontrado:false});
});
test('AUD-19: resposta antiga de borderôs sobrescreve o cliente recém-selecionado',async()=>{
 let unlock;const oldWait=new Promise(r=>unlock=r);let state=[];const b=bancoSimulado({});
 const deps={useCallback:f=>f,supabase:b.db,listarBorderosPendentes:async ids=>ids[0]==='A'?await oldWait:[{id:'B',itens:[]}],listarBorderosPagos:async()=>[],setBorderosPendentes:v=>state=v,setBorderosPagos:()=>{},setInfoBordero:()=>{},setErro:e=>{throw Error(e);}};
 const old=valorReal('app/financeiro/pagar/page.tsx','carregarBorderos',{...deps,fazendaIds:['A'],fazendaId:'A'});
 const next=valorReal('app/financeiro/pagar/page.tsx','carregarBorderos',{...deps,fazendaIds:['B'],fazendaId:'B'});
 const loading=old();await next();assert.equal(state[0].id,'B');unlock([{id:'A',itens:[]}]);await loading;assert.equal(state[0].id,'A');
 registrar('AUD-19','Resposta fora de ordem troca o conteúdo do grid',{clienteAtual:'B',borderosFinais:'A'});
});
test('AUD-20: listagem sem paginação omite o borderô número 1001',async()=>{
 const rows=Array.from({length:1001},(_,n)=>({id:String(n),fazenda_id:'fazenda',tipo:'pagar',status:'pago'}));const b=bancoSimulado({pagamento_lotes:rows});
 const {listarBorderosPagos}=funcoesReais('lib/db.ts',['listarBorderosPagos'],{supabase:b.db});const result=await listarBorderosPagos(['fazenda'],'pagar');assert.equal(result.length,1000);
 registrar('AUD-20','Lista truncada quando excede limite do backend',{existentes:1001,retornados:result.length,condicao:'Backend configurado com teto de 1000 linhas; laboratório.'});
});
test('AUD-21: abastecimento em bomba de outro cliente usa só a autorização da fazenda enviada',async()=>{
 const b=bancoSimulado({bombas_combustivel:[{id:'bomba-B',fazenda_id:'fazenda-B',consume_estoque:false}],abastecimentos:[]});const deps={...depsBase(b.db),sb:()=>b.db};
 deps.validateFazendaAccess=async id=>{assert.equal(id,'fazenda-A');return {ok:true};};
 const {POST}=funcoesReais('app/api/campo/abastecimento-acao/route.ts',['POST','insumoDaBomba'],deps);
 const res=await POST(request({acao:'criar',fazenda_id:'fazenda-A',bomba_id:'bomba-B',quantidade_l:10,valor_unitario:5,data:'2026-11-11',destino_tipo:'livre'}));assert.equal((await res.json()).ok,true);assert.equal(b.tables.abastecimentos[0].fazenda_id,'fazenda-B');
 registrar('AUD-21','Autorização da fazenda não confere o dono da bomba',{fazendaAutorizada:'fazenda-A',fazendaGravada:'fazenda-B',producao:'Não executado.'});
});
test('AUD-22: edição do abastecimento muda litros mas deixa a movimentação antiga',async()=>{
 const b=bancoSimulado({bombas_combustivel:[{id:'b',fazenda_id:'f',consume_estoque:true,estoque_atual_l:900}],abastecimentos:[{id:'ab',bomba_id:'b',quantidade_l:100,valor_total:500}],movimentacoes_estoque:[{id:'m',tipo:'saida',quantidade:100,motivo:'abastecimento'}]});
 const {POST}=funcoesReais('app/api/campo/abastecimento-acao/route.ts',['POST','insumoDaBomba'],{...depsBase(b.db),sb:()=>b.db});
 const res=await POST(request({acao:'editar',abastecimento_id:'ab',fazenda_id:'f',bomba_id:'b',quantidade_l:200,valor_unitario:5,data:'2026-11-11',destino_tipo:'livre'}));assert.equal((await res.json()).ok,true);assert.equal(b.tables.abastecimentos[0].quantidade_l,200);assert.equal(b.tables.movimentacoes_estoque[0].quantidade,100);
 registrar('AUD-22','Litros da bomba e do estoque divergem após edição',{consumoAbastecimento:200,saidaEstoque:100,nota:'Caminho HTTP real; gatilhos adicionais do ambiente não são simulados.'});
});
const folhaDeps=db=>({...depsBase(db),alvosFolha:()=>({fazendas:[],folhas:[],adiantamentos:[],premiacoes:[],funcionarios:[],empresas:[],produtores:[]}),acessoDoUsuario:async()=>({}),fazendasDoAcesso:async()=>true,
 semPermissaoReprocessar:async()=>null,rotuloCompetencia:()=> 'Nov/2026',liquidoItem:()=>100,descontoNoSalario:()=>0,resolverOgPorClassificacao:async()=> 'og',vencimentoSalario:()=> '2026-12-05',consumirPrevisaoDoTitulo:async()=>{},obsOutrosDescontos:()=>null,
 titulosParaReprocessamento:(_ids,ts)=>new Map(ts.map(t=>[t.id,t])),FolhaFechadaError:class extends Error{}});
const reqFolha=body=>{const r=request(body);r.headers.set('authorization','Bearer token-somente-laboratorio');return r;};
test('AUD-23: simular reprocessamento da folha altera vínculo de encargo no banco',async()=>{
 const b=bancoSimulado({folha_pagamento:[{id:'f',status:'fechado',fazenda_id:'fazenda',competencia:'2026-11'}],folha_funcionarios:[],lancamentos:[{id:'fgts',descricao:'FGTS Nov/2026',fazenda_id:'fazenda',status:'em_aberto',valor:10}]});
 const {POST}=funcoesReais('app/api/folha/salvar/route.ts',['POST'],folhaDeps(b.db));
 const res=await POST(reqFolha({operacao:'reprocessar_folha',id:'f',simular:true,rows:[{funcionario_id:'func',nome_funcionario:'Ana',fgts:10}]}));const body=await res.json();assert.equal(body.ok,true);assert.equal(b.tables.folha_pagamento[0].cp_fgts_id,'fgts');
 registrar('AUD-23','Simulação de folha produz gravação',{simular:true,vinculoAntes:null,vinculoDepois:'fgts'});
});
test('AUD-24: falha no segundo salário deixa a folha parcialmente efetivada',async()=>{
 const b=bancoSimulado({folha_pagamento:[{id:'f',status:'rascunho',competencia:'2026-11'}],folha_funcionarios:[{id:'i1',folha_id:'f',nome_funcionario:'Ana',cp_lancamento_id:'c1'},{id:'i2',folha_id:'f',nome_funcionario:'Bia',cp_lancamento_id:'c2'}],lancamentos:[{id:'c1',natureza:'previsao',status:'em_aberto',valor:100},{id:'c2',natureza:'previsao',status:'em_aberto',valor:100}]},
 {fail:(c,calls)=>c.table==='lancamentos'&&c.operation==='update'&&calls.filter(x=>x.table==='lancamentos'&&x.operation==='update').length===2?'Falha no segundo título':null});
 const {POST}=funcoesReais('app/api/folha/salvar/route.ts',['POST'],folhaDeps(b.db));
 const res=await POST(reqFolha({operacao:'fechar_folha',id:'f',fazenda_id:'fazenda',competencia:'2026-11'}));assert.equal(res.status,500);assert.deepEqual(b.tables.lancamentos.map(l=>l.natureza),['real','previsao']);assert.equal(b.tables.folha_pagamento[0].status,'rascunho');
 registrar('AUD-24','Fechamento deixa salários em estados diferentes após falha',{http:500,naturezas:['real','previsao'],folha:'rascunho'});
});
const webhookDeps=db=>({...depsBase(db),sb:()=>db,process:{env:{NODE_ENV:'production',ASAAS_WEBHOOK_TOKEN:'apenas-laboratorio'}},statusAsaasParaLocal:s=>s==='RECEIVED'?'pago':'vencido'});
const webhookReq=body=>{const r=request(body);r.headers.set('asaas-access-token','apenas-laboratorio');return r;};
test('AUD-25: webhook confirma recebimento mesmo com gravações recusadas',async()=>{
 const b=bancoSimulado({pagamentos:[{id:'p',asaas_payment_id:'externo',conta_id:'c',status:'pendente'}],contas:[{id:'c',status:'inativo'}]},{fail:c=>c.operation==='update'?'Banco indisponível':null});
 const {POST}=funcoesReais('app/api/asaas/webhook/route.ts',['POST'],webhookDeps(b.db));
 const res=await POST(webhookReq({event:'PAYMENT_RECEIVED',payment:{id:'externo',status:'RECEIVED'}}));assert.equal((await res.json()).ok,true);assert.equal(b.tables.pagamentos[0].status,'pendente');
 registrar('AUD-25','Webhook reconhece evento sem persistir',{http:200,pagamento:'pendente',conta:'inativo'});
});
test('AUD-26: evento de atraso recebido depois do pagamento regride status e bloqueia conta',async()=>{
 const b=bancoSimulado({pagamentos:[{id:'p',asaas_payment_id:'externo',conta_id:'c',status:'pendente'}],contas:[{id:'c',status:'inativo'}]});
 const {POST}=funcoesReais('app/api/asaas/webhook/route.ts',['POST'],webhookDeps(b.db));
 await POST(webhookReq({event:'PAYMENT_RECEIVED',payment:{id:'externo',status:'RECEIVED'}}));assert.equal(b.tables.contas[0].status,'ativo');
 await POST(webhookReq({event:'PAYMENT_OVERDUE',payment:{id:'externo',status:'OVERDUE'}}));assert.equal(b.tables.contas[0].status,'inadimplente');
 registrar('AUD-26','Webhook não protege contra eventos fora de ordem',{sequenciaDeEntrega:['pagamento recebido','atraso anterior'],contaFinal:'inadimplente',nota:'Laboratório demonstra dependência da ordem de entrega; ocorrência real não comprovada.'});
});
test('AUD-27: filtro de coluna segue excluindo registros mesmo com a coluna oculta',()=>{
 const passa=valorReal('app/financeiro/pagar/page.tsx','passaColunas',{filtrosCol:{cc:'Plantio'},textoColuna:l=>l.centro_custo_nome,casaFiltroTexto:(t,f)=>t.includes(f)});
 assert.equal(passa({centro_custo_nome:'Administração'}),false);
 registrar('AUD-27','Filtro aplicado não depende da visibilidade da coluna',{coluna:'centro de custo',ocultarColunaNaoRemoveFiltro:true,efeito:'Registro continua fora do grid; a caixa de filtro deixa de ser exibida.'});
});
