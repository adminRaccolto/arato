import test from 'node:test';
import assert from 'node:assert/strict';
import {funcoesReais,bancoSimulado} from '../../scripts/teste-funcoes.mjs';
import {resolverTributacaoNFe} from './tributacao-nfe.ts';
import {salvarCadastroFiscal} from './cadastros.ts';
import {endpoints} from '../nfe/endpoints.ts';
import {icmsDaEmissao} from './icms-emissao.ts';
import {buildNFe} from '../nfe/builder.ts';

const fazenda={id:'faz-a',conta_id:'conta-a'};
const op={id:'op-a',fazenda_id:'faz-a',ativa:true,cfop_interno:'5101',cfop_externo:'6101',icms_cst_interno:'000',icms_cst_externo:'000',icms_aliq:17,icms_base_reduzida_pct:50,pis_cst:'01',pis_aliq:1.65,cofins_cst:'01',cofins_aliq:7.6};
const entrada={destinatario:{cpf_cnpj:'11222333000181'},natureza:'VENDA',data_emissao:'2026-01-10',itens:[{codigo:'1',ncm:'12019000',cfop:'5101',descricao:'Teste',unidade:'KG',quantidade:1,valor_unitario:100,pICMS:7}]};
const base=more=>bancoSimulado({fazendas:[fazenda],ncm_tributacoes:[],operacoes_fiscais:[op],...more});
test('Tributação: escolha manual do ICMS prevalece na operação sem alterar os demais tributos',async()=>{
 const b=base();const manual=icmsDaEmissao({cfop:'5.101',cst_icms:'020',aliq_icms:'12',red_bc:'40'});
 const input={...entrada,operacao_fiscal_id:op.id,itens:entrada.itens.map(i=>({...i,...manual}))};
 const [i]=await resolverTributacaoNFe(b.db,'faz-a',input,{},'3');
 assert.equal(i.cst_icms,'20');assert.equal(i.pICMS,12);assert.equal(i.pRedBC,40);assert.equal(i.pis_cst,op.pis_cst);assert.equal(i.cofins_aliq,op.cofins_aliq);
 const {xml}=buildNFe({...input,destinatario:{...input.destinatario,ie:'123456789',municipio_ibge:'5108006',municipio_nome:'Tapurah',uf:'MT'},itens:[i],emitente:{cpf_cnpj:'52998224725',razao_social:'TESTE',ie:'123456789',crt:'3',logradouro:'ESTRADA',numero:'SN',bairro:'RURAL',municipio_ibge:'5108006',municipio_nome:'Tapurah',uf:'MT',cep:'78573000',ambiente:'homologacao',serie:'1',numero_nfe:1}});
 assert.match(xml,/<ICMS20>/);assert.match(xml,/<vBC>60.00<\/vBC>/);assert.match(xml,/<vICMS>7.20<\/vICMS>/);
});
test('Tributação: CST escolhido não é ignorado em emitente do Simples',async()=>{
 for(const crt of ['1','4'])await assert.rejects(resolverTributacaoNFe(base().db,'faz-a',{...entrada,itens:entrada.itens.map(i=>({...i,cst_icms:'40',cst_icms_manual:true}))},{},crt),/CSOSN/);
});
test('Tributação: operação escolhida governa CST, alíquota e base; PIS/COFINS seguem o cadastro',async()=>{
 const b=base();const [i]=await resolverTributacaoNFe(b.db,'faz-a',{...entrada,operacao_fiscal_id:op.id},{},'3');
 assert.equal(i.cst_icms,'000');assert.equal(i.pICMS,17);assert.equal(i.pRedBC,50);assert.equal(i.pis_cst,'01');assert.equal(i.cofins_aliq,7.6);assert.equal(i.regra_fiscal.operacao_id,op.id);
});
test('Tributação: erro de leitura e classificação ausente não viram CST 410',async()=>{
 const b=bancoSimulado({fazendas:[fazenda]}, {fail:call=>call.table==='ncm_tributacoes'?'Leitura fiscal recusada':null});
 await assert.rejects(resolverTributacaoNFe(b.db,'faz-a',entrada,{ibs_cbs_ativo:'sim'},'3'),/Leitura fiscal recusada/);
 await assert.rejects(resolverTributacaoNFe(base().db,'faz-a',entrada,{ibs_cbs_ativo:'sim'},'3'),/Cadastre a tributação/);
});
test('Tributação: vigência e conflito são considerados antes de construir o XML',async()=>{
 const b=base({operacoes_fiscais:[{...op,vigencia_fim:'2026-12-31'},{...op,id:'op-b',vigencia_inicio:'2027-01-01',icms_aliq:18}]});
 const a=await resolverTributacaoNFe(b.db,'faz-a',{...entrada,itens:entrada.itens.map(i=>({...i,pICMS:undefined}))},{},'3');assert.equal(a[0].pICMS,17);
 const c=base({operacoes_fiscais:[op,{...op,id:'conflito',icms_aliq:18}]});
 await assert.rejects(resolverTributacaoNFe(c.db,'faz-a',entrada,{},'3'),/divergentes/);
});
test('Tributação: NCM herda o CFOP de venda e classificação pode variar na operação',async()=>{
 const ncm={id:'ncm',fazenda_id:'faz-a',ncm:'12019000',icms_cst_interno:'000',icms_aliq:7,pis_cst:'08',ibs_cbs_cst:'200',ibs_cbs_cclasstrib:'200001'};
 const b=base({operacoes_fiscais:[],ncm_tributacoes:[ncm]});
 const [i]=await resolverTributacaoNFe(b.db,'faz-a',{...entrada,itens:entrada.itens.map(i=>({...i,pICMS:undefined}))},{},'3');assert.equal(i.pICMS,7);assert.equal(i.pis_cst,'08');
 const c=base({operacoes_fiscais:[{...op,ibs_cbs_imune:true,ibs_cbs_cst:'410',ibs_cbs_cclasstrib:'410001'}],ncm_tributacoes:[ncm]});
 const [j]=await resolverTributacaoNFe(c.db,'faz-a',{...entrada,operacao_fiscal_id:op.id},{ibs_cbs_ativo:'sim'},'3');assert.equal(j.ibsCbs.cst,'410');assert.equal(j.ibsCbs.cclasstrib,'410001');
});
test('Cadastro fiscal: mantém fazenda original e não confirma escrita recusada',async()=>{
 const b=base({ncm_tributacoes:[{id:'n',fazenda_id:'faz-outra-da-mesma-conta',ncm:'12019000',versao:1}]});
 await salvarCadastroFiscal(b.db,'ncm_tributacoes',{id:'n',versao:1,ncm:'12019000',icms_aliq:7},'faz-ativa');assert.equal(b.tables.ncm_tributacoes[0].fazenda_id,'faz-outra-da-mesma-conta');
 const c=bancoSimulado({ncm_tributacoes:[]},{fail:call=>call.operation==='insert'?'Gravação recusada':null});
 await assert.rejects(salvarCadastroFiscal(c.db,'ncm_tributacoes',{ncm:'12019000'},'faz-a'),e=>e.message==='Gravação recusada');
});
test('CT-e e MDF-e: ID de outra fazenda não alcança configuração ou certificado',async()=>{
 for(const [file,fn,tabela] of [['lib/cte/index.ts','emitirCTe','ctes'],['lib/mdfe/index.ts','emitirMDFe','mdfes']]){
  const b=bancoSimulado({[tabela]:[{id:'documento-b',fazenda_id:'faz-b',status:'rascunho'}]});
  let chamadas=0;const deps={sb:()=>b.db,resolverConfigCTe:()=>{chamadas++;throw Error('não deveria chegar');},resolverConfigMDFe:()=>{chamadas++;throw Error('não deveria chegar');}};
  const real=funcoesReais(file,[fn],deps)[fn];const r=fn==='emitirCTe'?await real('faz-a',{}, {cte_id:'documento-b'}):await real('faz-a','documento-b');
  assert.equal(r.cStat,'ACESSO');assert.equal(chamadas,0);
 }
});
test('OG: ID inexistente falha; limpar vínculo realmente envia null',async()=>{
 const b=bancoSimulado({operacoes_gerenciais:[{id:'og',conta_debito:'1.1'}]});
 const {atualizarOperacaoGerencial}=funcoesReais('lib/db.ts',['atualizarOperacaoGerencial'],{supabase:b.db,invalidateCache:()=>{}});
 await atualizarOperacaoGerencial('og',{conta_debito:undefined});assert.equal(b.tables.operacoes_gerenciais[0].conta_debito,null);
 await assert.rejects(atualizarOperacaoGerencial('ausente',{descricao:'Novo'}),/não encontrada|não foi|não atualizada/i);
});
test('Endpoints: SP, PR, MT, GO, RS e SVRS distinguem homologação e produção',()=>{
 for(const uf of ['SP','PR','MT','GO','RS','AC'])assert.notEqual(endpoints(uf,'producao').autorizacao,endpoints(uf,'homologacao').autorizacao);
 assert.equal(endpoints('SP','homologacao').autorizacao,'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx');
 assert.equal(endpoints('PR','producao').autorizacao,'https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4');
 assert.match(endpoints('AC','producao').autorizacao,/nfe.svrs.rs.gov.br/);
 assert.match(endpoints('MA','producao').autorizacao,/www.sefazvirtual.fazenda.gov.br/);
 assert.throws(()=>endpoints('XX','producao'),/UF/);
});
