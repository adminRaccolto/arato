import { dadosNotaRecuperada } from "./nota-recuperada";
import { contextoEventoNFe,interpretarConsultaEvento } from "./evento-consulta";
import test from "node:test";
import assert from "node:assert/strict";
import { htmlLCDPR,selecionarMovimentos,motivosMovimento,numeroContaLCDPR,textoLCDPR,validarParticipantes } from "../lcdpr/modelo";
import { gerarArquivoLCDPR } from "../lcdpr/arquivo";
import { buildNFe,type NFeInput } from "../nfe/builder";
import { contribuicao } from "../nfe/tributos";
import { totaisDoXmlNFe } from "../nfe/totais";
import { prepararContabilAuxiliar,csvContabilAuxiliar } from "./contabil-auxiliar";
import { identificarRequisicaoFiscal,registrarRespostaFiscal,confirmarEmissaoPersistida } from "./requisicao";
import { lerPaginas } from "../paginar";

const cpfA="52998224725",cpfB="11144477735",cnpj="11222333000181";
const imovel={id:"f",produtor_id:"a",cpf_cnpj_fiscal:cpfA,participacao_lcdpr:60,tipo_exploracao:4,lcdpr_participantes:[{cpf:cpfB,nome:"B",tipo:3,participacao:40}]};
const produtores=[{id:"a",cpf:cpfA,nome:"A"},{id:"b",cpf:cpfB,nome:"B"}];
const movimento={id:"m",data:"2026-01-10",fazendaId:"f",produtorId:"a",receita:100,despesa:0};
test("LCDPR: titular exclusivo, exploração compartilhada e exercício",()=>{
  assert.deepEqual(selecionarMovimentos([movimento],cpfB,produtores,[imovel],2026),[]);
  assert.equal(selecionarMovimentos([movimento],cpfA,produtores,[imovel],2026)[0].receita,100);
  const bruto={...movimento,compartilhada:true};
  assert.equal(selecionarMovimentos([bruto],cpfA,produtores,[imovel],2026)[0].receita,60);
  assert.equal(selecionarMovimentos([bruto],cpfB,produtores,[imovel],2026)[0].receita,40);
  assert.equal(selecionarMovimentos([movimento],cpfA,produtores,[imovel],2025).length,0);
});
test("LCDPR: descrição não exclui evento; previsão, parcial legado e falta de data são explícitos",()=>{
  const l={id:"x",status:"baixado",produtor_id:"a",fazenda_id:"f",data_baixa:"2026-01-01",valor_pago:10,categoria:"Pagamento pessoal"};
  assert.deepEqual(motivosMovimento(l,new Set(),new Map(),new Set()),[]);
  const motivos=motivosMovimento({...l,data_baixa:null,natureza:"previsao",status:"parcial"},new Set(),new Map(),new Set());
  assert.deepEqual(motivos,["previsao","data_ausente","parcial_legado"]);
});
test("LCDPR: sanitização, conta sem duplicar DV e terceiros",()=>{
  assert.equal(textoLCDPR("A|B\nC\tD"),"A B C D");
  assert.equal(htmlLCDPR('<img onerror="alert(1)">'),"&lt;img onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(numeroContaLCDPR("12345-6","6"),"123456");
  assert.throws(()=>numeroContaLCDPR("12345","X"),/numérico/);
  assert.deepEqual(validarParticipantes(imovel),[]);
  assert.ok(validarParticipantes({...imovel,lcdpr_participantes:[]}).length);
});
const endereco={logradouro:"Rua teste",numero_end:"1",bairro:"Centro",estado:"MT",municipio_ibge:"5103403",cep:"78000000"};
const arquivo=()=>({cpf:cpfA,nome:"A",ano:2026,declarante:endereco,imoveis:[{...imovel,...endereco,nome:"Fazenda|Teste",itr:"12345678",caepf:"12345678901234"}],contas:[],produtores:produtores.map(p=>({...p,...endereco})),movimentos:[{...movimento,receita:60,numDoc:"1",tipoDoc:"1",tipoLanc:"1",cpfCnpj:cnpj,historico:"Venda|a\nprazo",contaBancariaRef:""}],contador:{nome:"Contador",cpf_cnpj:cpfB,crc:"MT123",email:"c@example.test",telefone:"65999999999"},codigoBanco:()=>"001"});
test("LCDPR: 0045, Q100, Q200 e saldo anual consistente sem campo extra por pipe",()=>{
  const txt=gerarArquivoLCDPR(arquivo());const linhas=txt.trim().split("\r\n");
  assert.ok(linhas.some(l=>l.startsWith("0045|001|3|"+cpfB)));
  assert.match(txt,/0040\|.*\|4\|06000\r\n/);
  assert.match(txt,/Q200\|012026\|6000\|0\|6000\|P/);
  const q=linhas.find(l=>l.startsWith("Q100"))!.split("|");assert.equal(q.length,13);assert.equal(q[6],"Venda a prazo");
  assert.equal(Number(linhas.at(-1)!.split("|").at(-1)),linhas.length);
});
test("LCDPR: imóvel ausente, conta desconhecida, CPF todos e data impossível impedem TXT",()=>{
  const p=arquivo();assert.throws(()=>gerarArquivoLCDPR({...p,cpf:"todos"}),/CPF válido/);
  assert.throws(()=>gerarArquivoLCDPR({...p,movimentos:[{...p.movimentos[0],fazendaId:"outro"}]}),/sem imóvel/);
  assert.throws(()=>gerarArquivoLCDPR({...p,movimentos:[{...p.movimentos[0],contaBancariaRef:"desconhecida"}]}),/Conta bancária/);
  assert.throws(()=>gerarArquivoLCDPR({...p,movimentos:[{...p.movimentos[0],data:"2026-02-30"}]}),/data efetiva/);
});
const nota=():NFeInput=>({emitente:{cpf_cnpj:cpfA,razao_social:"Laboratório",ie:"123456789",crt:"3",logradouro:"Rua",numero:"1",bairro:"Centro",municipio_ibge:"5103403",municipio_nome:"Cuiabá",uf:"MT",cep:"78000000",ambiente:"homologacao",serie:"923",numero_nfe:1},destinatario:{nome:"Teste",cpf_cnpj:cnpj,uf:"MT",ie:"12345",municipio_ibge:"5103403"},itens:[{codigo:"1",descricao:"Produto",ncm:"12019000",cfop:"5101",unidade:"KG",quantidade:1,valor_unitario:100,cst_icms:"00",pICMS:17,pis_cst:"01",pis_aliq:1.65,cofins_cst:"01",cofins_aliq:7.6}],natureza:"VENDA",data_emissao:"2026-10-20"});
test("NF-e: ICMS/PIS/COFINS configurados, data e totais refletem XML",()=>{
  const {xml}=buildNFe(nota());assert.match(xml,/<pICMS>17.00<\/pICMS>/);assert.match(xml,/<dhEmi>2026-10-20T/);
  assert.deepEqual(totaisDoXmlNFe(xml),{valor_total:100,icms_base:100,icms_valor:17,pis_valor:1.65,cofins_valor:7.6,ibs_valor:0,cbs_valor:0});
});
test("NF-e: arredonda cada item antes de somar",()=>{
  const n=nota();n.itens=Array.from({length:3},(_,i)=>({...n.itens[0],codigo:String(i),valor_unitario:0.03,pICMS:17}));
  const t=totaisDoXmlNFe(buildNFe(n).xml);assert.equal(t.valor_total,0.09);assert.equal(t.icms_valor,0.03);
});
test("NF-e: CSOSN correto para CRT 1 e bloqueio de enquadramento não suportado",()=>{
  const n=nota();n.emitente.crt="1";assert.throws(()=>buildNFe(n),/CSOSN/);
  n.itens[0].csosn="102";const {xml}=buildNFe(n);assert.match(xml,/<ICMSSN102>/);assert.doesNotMatch(xml,/<ICMS00>/);
  n.emitente.crt="3";n.itens[0].cst_icms="90";assert.throws(()=>buildNFe(n),/não suportado/);
});
test("NF-e: percentuais e valores inválidos não chegam à transmissão",()=>{
  for(const changes of [{quantidade:-1},{valor_unitario:-1},{valor_desconto:101},{pICMS:101}]){const n=nota();Object.assign(n.itens[0],changes);assert.throws(()=>buildNFe(n));}
  assert.match(contribuicao("PIS","08",0,100).xml,/<CST>08/);assert.throws(()=>contribuicao("PIS","03",1,100),/quantidade/);
});
test("Contabilidade: conserva origem e pendências, respeita evento de caixa",()=>{
  const e={id:"x",origem:"lancamentos",fazenda_id:"f",status:"baixado",tipo:"pagar",valor:10,data_lancamento:"2025-01-01",data_baixa:"2026-01-05",descricao:"=fórmula"};
  const linhas=prepararContabilAuxiliar([e,{...e,id:"prev",natureza:"previsao"},{...e,id:"cancel",status:"cancelado"},{...e,id:"outroAno",data_baixa:"2025-02-01"}],[],"2026");
  assert.equal(linhas.length,1);assert.match(linhas[0].pendencias.join(),/Operação gerencial/);assert.match(csvContabilAuxiliar(linhas),/'=fórmula/);assert.doesNotMatch(csvContabilAuxiliar(linhas),/I155/);
});
test("Paginação: página posterior recusada não devolve carga parcial como completa",async()=>{
  const dados=await lerPaginas(async(a)=>({data:a===0?[{id:1},{id:2}]:[{id:3}],error:null}),2);assert.equal(dados.length,3);
  await assert.rejects(lerPaginas(async(a)=>a===0?{data:[1,2],error:null}:{data:null,error:new Error("negado")},2),/negado/);
});
test("Requisição fiscal: falha de rede/pendência reutiliza ID; gravação confirmada encerra tentativa",async()=>{
  const init={method:"POST",body:JSON.stringify({nota_id:"laboratorio-unico",destinatario:"Teste"})};
  const a=await identificarRequisicaoFiscal("/api/fiscal/emitir-nfe",init);const b=await identificarRequisicaoFiscal("/api/fiscal/emitir-nfe",init);
  assert.equal(new Headers(a.init.headers).get("x-arato-requisicao"),new Headers(b.init.headers).get("x-arato-requisicao"));
  await registrarRespostaFiscal(Response.json({pendente:true,chave:"chave-lab",operacao_id:"op"},{status:202}),a.assinatura);
  confirmarEmissaoPersistida("chave-lab");const c=await identificarRequisicaoFiscal("/api/fiscal/emitir-nfe",init);
  assert.notEqual(new Headers(a.init.headers).get("x-arato-requisicao"),new Headers(c.init.headers).get("x-arato-requisicao"));
});

test("Eventos: consulta de autorização não comprova cancelamento; sequência de CC-e precisa corresponder",()=>{
 const k="1".repeat(44);
 assert.equal(interpretarConsultaEvento(`<retConsSitNFe><cStat>100</cStat><chNFe>${k}</chNFe></retConsSitNFe>`,k,"cancelar",1).sucesso,false);
 assert.equal(interpretarConsultaEvento(`<retConsSitNFe><cStat>101</cStat><chNFe>${k}</chNFe></retConsSitNFe>`,k,"cancelar",1).sucesso,true);
 assert.equal(interpretarConsultaEvento(`<retConsSitNFe><cStat>101</cStat><chNFe>${k}</chNFe></retConsSitNFe>`,"2".repeat(44),"cancelar",1).sucesso,false);
 const xml=`<procEventoNFe><evento><infEvento><chNFe>${k}</chNFe><tpEvento>110110</tpEvento><nSeqEvento>2</nSeqEvento></infEvento></evento><retEvento><infEvento><cStat>135</cStat><nProt>comprovado</nProt></infEvento></retEvento></procEventoNFe>`;
 assert.equal(interpretarConsultaEvento(xml,k,"carta_correcao",1).sucesso,false);
 assert.equal(interpretarConsultaEvento(xml,k,"carta_correcao",2).sucesso,true);
});

test("Eventos: a chave define UF e titular; ambiente original prevalece sobre configuração posterior",()=>{
 const chave=buildNFe(nota()).chave;
 assert.deepEqual(contextoEventoNFe(chave,cpfA,"homologacao","producao"),{cpfCnpjEmit:cpfA,uf:"MT",ambiente:"homologacao"});
 assert.throws(()=>contextoEventoNFe(chave,cpfB,"homologacao","producao"),/titular/);
 assert.throws(()=>contextoEventoNFe(chave,cpfA),/ambiente original/);
});

test("NF recuperada: item e endereço conservam o formato esperado pela edição",()=>{
 const n=nota();n.destinatario.logradouro="Rua do comprador";n.destinatario.numero="10";
 const r=dadosNotaRecuperada(n);
 assert.equal(r.itens[0].item,"Produto");assert.equal(r.itens[0].valor_total,100);assert.equal(r.cabecalho.dest_endereco,"Rua do comprador");assert.equal(r.cabecalho.dest_numero,"10");
});

test("LCDPR: banco do titular principal não vira conta do parceiro; cotitular cadastrado é respeitado",()=>{
 const p={...arquivo(),cpf:cpfB,nome:"B"};const c={id:"banco-a",nome:"Banco",banco:"Banco",codigo_bacen:"001",agencia:"1234",conta:"12345",conta_dv:"6",tipo_conta:"corrente",fazenda_id:"f"};
 p.movimentos=[{...p.movimentos[0],contaBancariaRef:c.id,receita:40}];
 const sem=gerarArquivoLCDPR({...p,contas:[c]});assert.doesNotMatch(sem,/0050\|/);assert.match(sem,/Q100\|10012026\|001\|999\|/);
 const conjunta=gerarArquivoLCDPR({...p,contas:[{...c,cotitulares:[{cpf:cpfB}]}]});assert.match(conjunta,/0050\|001\|/);assert.match(conjunta,/Q100\|10012026\|001\|001\|/);
});
