import test from 'node:test';
import assert from 'node:assert/strict';
import {bancoSimulado,valorReal,funcoesReais,NextResponse,request} from '../../scripts/teste-funcoes.mjs';
import {carregarIdentidadesTitulos} from './identidades-titulos.ts';
import {falharSeErro} from '../db-util.ts';
import {filtrarNomeTitulo,tituloVinculado} from './cp-grid.ts';

const titulo={id:'t',origem_tabela:'lancamentos',fazenda_id:'f',tipo:'pagar',valor:300,status_normalizado:'em_aberto'};
const cadastros={fazendas:[{id:'f',conta_id:'c'},{id:'f2',conta_id:'c'},{id:'outra',conta_id:'outro'}],
 produtores:[{id:'prod',nome:'Produtor atual',fazenda_id:'f2',conta_id:'c'}],
 empresas:[{id:'emp',nome:'Empresa atual',fazenda_id:'f2',conta_id:'c'}],
 pessoas:[{id:'forn',nome:'Fornecedor atual',fazenda_id:'f2',conta_id:'c'}]};
async function conferir(tabelas,linhas=[titulo]){
 const b=bancoSimulado({...cadastros,...tabelas}),antes=structuredClone(b.tables);
 const out=await carregarIdentidadesTitulos(b.db,linhas);
 assert.ok(b.calls.every(c=>c.operation==='read'),'nenhuma gravação é permitida nesta leitura');
 // O simulador cria coleções vazias ao ler; compara os registros existentes.
 for(const [t,rows] of Object.entries(antes))assert.deepEqual(b.tables[t],rows);
 return {out,b};
}
test('vínculos e nomes atuais substituem o espelho antigo, preservando valores e situação',async()=>{
 const {out:[r]}=await conferir({lancamentos:[{id:'t',fazenda_id:'f',produtor_id:'prod',pessoa_id:'forn'}]},
  [{...titulo,produtor_id:'velho',produtor_nome:'Antigo',pessoa_nome:'Antigo'}]);
 assert.equal(r.produtor_nome,'Produtor atual');assert.equal(r.pessoa_nome,'Fornecedor atual');
 assert.equal(r.produtor_id,'prod');assert.equal(r.valor,300);assert.equal(r.status_normalizado,'em_aberto');
});
test('NF, NFS-e e consórcio fornecem os vínculos que não foram copiados para o título',async()=>{
 for(const origem of ['nf_entrada','nf_servico','consorcio']){
  const l={id:'t',fazenda_id:'f',origem_lancamento:origem};
  const tabelas={lancamentos:[l]};
  if(origem==='nf_entrada'){l.nf_entrada_id='nf';tabelas.nf_entradas=[{id:'nf',fazenda_id:'f2',produtor_id:'prod',pessoa_id:'forn'}];}
  if(origem==='nf_servico')tabelas.nf_servicos=[{id:'ns',fazenda_id:'f2',lancamento_id:'t',tomador_tipo:'produtor',tomador_id:'prod',prestador_id:'forn'}];
  if(origem==='consorcio'){l.consorcio_id='cons';tabelas.consorcios=[{id:'cons',fazenda_id:'f2',produtor_id:'prod',administradora_pessoa_id:'forn'}];}
  const {out:[r]}=await conferir(tabelas);assert.equal(r.produtor_nome,'Produtor atual',origem);assert.equal(r.pessoa_nome,'Fornecedor atual',origem);
 }
});
test('edição explícita no título prevalece sobre o produtor e fornecedor da origem',async()=>{
 const {out:[r]}=await conferir({lancamentos:[{id:'t',fazenda_id:'f',produtor_id:'prod',pessoa_id:'forn',nf_entrada_id:'nf'}],
  nf_entradas:[{id:'nf',fazenda_id:'f',produtor_id:'alternativo',pessoa_id:'alternativo'}]});
 assert.equal(r.produtor_id,'prod');assert.equal(r.pessoa_id,'forn');
});
test('contrato financeiro com credor em texto exibe o banco sem inventar pessoa_id',async()=>{
 const {out:[r]}=await conferir({lancamentos:[{id:'t',fazenda_id:'f',contrato_financeiro_id:'cf'}],
  contratos_financeiros:[{id:'cf',fazenda_id:'f2',produtor_id:'prod',credor:'Banco do contrato'}]});
 assert.equal(r.pessoa_nome,'Banco do contrato');assert.equal(r.pessoa_id,null);assert.equal(r.produtor_nome,'Produtor atual');
});
test('seguros antigos mostram a seguradora da apólice sem inventar um produtor ou cadastro',async()=>{
 const {out:[r]}=await conferir({lancamentos:[{id:'t',fazenda_id:'f',origem_lancamento:'seguro',numero_documento:'AP-10'}],
  apolices_seguro:[{id:'ap',fazenda_id:'f',numero_apolice:'AP-10',seguradora:'Seguradora da apólice'}]});
 assert.equal(r.pessoa_nome,'Seguradora da apólice');assert.equal(r.pessoa_id,null);assert.equal(r.produtor_id,null);
});
test('apólice com vínculo por parcela é preferida; apólices com número ambíguo não são atribuídas',async()=>{
 const tabelas={lancamentos:[{id:'t',fazenda_id:'f',origem_lancamento:'seguro',numero_documento:'AP-10'}],
  apolices_seguro:[{id:'ap',fazenda_id:'f',numero_apolice:'AP-10',produtor_id:'prod',seguradora_pessoa_id:'forn'},
   {id:'ap2',fazenda_id:'f',numero_apolice:'AP-10',seguradora:'Outra'}]};
 assert.equal((await conferir(tabelas)).out[0].produtor_nome,null);
 tabelas.pagamentos_premio_seguro=[{id:'parc',lancamento_id:'t',apolice_id:'ap'}];
 const {out:[r]}=await conferir(tabelas);assert.equal(r.produtor_nome,'Produtor atual');assert.equal(r.pessoa_nome,'Fornecedor atual');
});
test('cadastros e documentos de outro cliente não fornecem nomes nem vínculos herdados',async()=>{
 const {out:[r]}=await conferir({lancamentos:[{id:'t',fazenda_id:'f',nf_entrada_id:'nf'}],
  nf_entradas:[{id:'nf',fazenda_id:'outra',produtor_id:'prod',pessoa_id:'forn'}]});
 assert.equal(r.produtor_id,null);assert.equal(r.pessoa_nome,null);
 const {out:[direto]}=await conferir({lancamentos:[{id:'t',fazenda_id:'f',pessoa_id:'forn'}],pessoas:[{id:'forn',fazenda_id:'outra',nome:'Outro cliente'}]});
 assert.equal(direto.pessoa_nome,null);
});
test('mesmo UUID em PF e PJ, inclusive no borderô, mantém as identidades separadas',async()=>{
 const {out}=await conferir({lancamentos:[{id:'t',fazenda_id:'f',produtor_id:'prod'}],
  empresa_lancamentos:[{id:'t',fazenda_id:'f',empresa_id:'emp',pessoa_id:'forn'}]},[titulo,{...titulo,origem_tabela:'empresa_lancamentos'}]);
 assert.equal(out[0].produtor_nome,'Produtor atual');assert.equal(out[0].empresa_nome,null);
 assert.equal(out[1].empresa_nome,'Empresa atual');assert.equal(out[1].produtor_nome,null);
});
test('partes de pagamento e folha mantêm os vínculos sem depender de nomes em cache',async()=>{
 const {out:[r]}=await conferir({lancamentos:[{id:'t',fazenda_id:'f',titulo_origem_id:'pai'},
  {id:'pai',fazenda_id:'f',produtor_id:'prod',pessoa_id:'forn'}]});assert.equal(r.produtor_nome,'Produtor atual');assert.equal(r.pessoa_nome,'Fornecedor atual');
 const {out:[folha]}=await conferir({lancamentos:[{id:'t',fazenda_id:'f',origem_lancamento:'folha'}],
  folha_funcionarios:[{id:'lf',folha_id:'folha',cp_lancamento_id:'t',produtor_id:'prod',nome_funcionario:'Funcionário'}],
  folha_pagamento:[{id:'folha',fazenda_id:'f'}]});
 assert.equal(folha.produtor_nome,'Produtor atual');assert.equal(folha.pessoa_nome,'Funcionário');
});
test('nome calculado de taxa bancária é preservado; título sem origem não recebe dono da fazenda por suposição',async()=>{
 const {out:[r]}=await conferir({lancamentos:[{id:'t',fazenda_id:'f'}],fazendas:[{id:'f',conta_id:'c',produtor_id:'prod'}]},
  [{...titulo,pessoa_nome:'Banco da conta'}]);assert.equal(r.pessoa_nome,'Banco da conta');assert.equal(r.produtor_id,null);
});
test('falha de leitura é informada e não substitui dados por campos vazios silenciosamente',async()=>{
 const b=bancoSimulado({lancamentos:[{id:'t',fazenda_id:'f',produtor_id:'prod'}]}, {fail:c=>c.table==='produtores'?'Indisponível':null});
 await assert.rejects(carregarIdentidadesTitulos(b.db,[titulo]),/produtores.*Indisponível/);
});
test('1.001 títulos compartilham consultas em blocos, sem uma consulta por funcionário ou título',async()=>{
 const rows=Array.from({length:1001},(_,i)=>({...titulo,id:'t'+i}));
 const {out,b}=await conferir({lancamentos:rows.map(t=>({id:t.id,fazenda_id:'f',produtor_id:'prod',pessoa_id:'forn'}))},rows);
 assert.equal(out.length,1001);assert.equal(out[1000].produtor_nome,'Produtor atual');assert.ok(b.calls.length<=12,b.calls.length);
});
test('as duas telas aguardam a identificação antes de disponibilizar os títulos e seus filtros',async()=>{
 for(const tela of ['pagar','receber']){
  const arquivo=`app/financeiro/${tela}/page.tsx`,b=bancoSimulado({rel_lancamentos:[{...titulo,conta_id:'c',tipo:tela==='receber'?'receber':'pagar'}]});let resultado;
  const deps={supabase:b.db,contaId:'c',cargaSeq:{current:0},ultimaCarga:{current:0},setCarregando:()=>{},setErro:e=>{if(e)throw Error(e);},
   setErroDetalhes:()=>{},setCarregandoDetalhes:()=>{},setCotacoes:()=>{},setResultado:v=>{resultado=typeof v==='function'?v(resultado):v;},
   carregarVinculosCP:async(_d,t)=>t,carregarCotacoesUSD:async()=>new Map(),carregarIdentidadesTitulos:async(_d,t)=>t.map(r=>({...r,produtor_nome:'Atual'})),
   carregarNumerosNF:async(_d,t)=>t,carregarUsuariosTitulos:async(_d,t)=>t,carregarOrigemTitulos:async()=>new Map(),exibirNoCP:()=>true,
   useCallback:f=>f, fazendaId:'f',fazendaIds:['f'],fOrigem:new Set(),fStatus:new Set(),filtrosCol:{},fBusca:'',periodoManual:false,fAtalho:'',fDataDe:'',fDataAte:''};
  await valorReal(arquivo,'carregar',deps)();assert.equal(resultado[0].produtor_nome,'Atual',tela);
 }
});
test('busca do CR encontra o cliente recuperado na origem e exclui os demais',()=>{
 const deps={resultado:[{...titulo,pessoa_nome:'Nome recuperado'},{...titulo,id:'outro',pessoa_nome:'Outro cliente'}],
  vinculos:new Set(),filtrarNomeTitulo,tituloVinculado,movimentoEntreContas:()=>false,fBusca:'nome recuperado',fOrigem:new Set(),fStatus:new Set(),
  passaExtras:()=>true,ordenarPor:'vencimento',ordemAsc:true};
 const linhas=valorReal('app/financeiro/receber/page.tsx','linhas',deps);
 assert.deepEqual(linhas.map(t=>t.id),['t']);
});
test('geração e edição do plano do consórcio copiam o produtor para os CPs',async()=>{
 const b=bancoSimulado({consorcios:[{id:'cons',fazenda_id:'f',produtor_id:'prod',status:'a_contemplar'}]});
 const deps={admin:()=>b.db,NextResponse,falharSeErro};
 const {salvarGridConsorcio}=funcoesReais('app/api/financeiro/consorcios/route.ts',['salvarGridConsorcio'],deps);
 await salvarGridConsorcio({consorcio_id:'cons',fazenda_id:'f',parcelas:[{numero:1,data_vencimento:'2026-12-01',valor:100,pago:false}]});
 assert.equal(b.tables.lancamentos[0].produtor_id,'prod');
 const {PATCH}=funcoesReais('app/api/financeiro/consorcios/route.ts',['PATCH'],{...deps,salvarGridConsorcio});
 await PATCH(request({consorcio_id:'cons',fazenda_id:'f',administradora:'Adm',numero_cota:'10',valor_parcela_mensal:100,total_parcelas:1,parcelas_pagas:0,data_inicio:'2026-12-01',status:'a_contemplar'},'PATCH'));
 assert.equal(b.tables.lancamentos[0].produtor_id,'prod');
});
test('editar parcelas do consórcio preserva produtor explicitamente alterado no CP',async()=>{
 const b=bancoSimulado({consorcios:[{id:'cons',fazenda_id:'f',produtor_id:'prod'}],
  lancamentos:[{id:'cp',consorcio_id:'cons',numero_documento:'1',status:'em_aberto',produtor_id:'outro'}]});
 const {salvarGridConsorcio}=funcoesReais('app/api/financeiro/consorcios/route.ts',['salvarGridConsorcio'],{admin:()=>b.db,NextResponse,falharSeErro});
 await salvarGridConsorcio({consorcio_id:'cons',fazenda_id:'f',parcelas:[{numero:1,data_vencimento:'2026-12-01',valor:100,pago:false}]});
 assert.equal(b.tables.lancamentos[0].produtor_id,'outro');
});
