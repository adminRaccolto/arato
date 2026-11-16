import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { parseNFeXml } from '../sieg.ts';

// Executa a rota real com banco e provedor em memória. Nenhuma chamada externa é permitida.
const emitente='11222333000181', destino='52998224725';
const chave=serie=>`512609${emitente}55${serie}0000000421000000010`;
const xml=(serie='001',cpf=destino)=>`<NFe><infNFe Id="NFe${chave(serie)}"><ide><nNF>42</nNF><serie>${Number(serie)}</serie><dhEmi>2026-09-28T08:00:00-04:00</dhEmi></ide><emit><CNPJ>${emitente}</CNPJ><xNome>Fornecedor Teste</xNome></emit><dest><CPF>${cpf}</CPF><xNome>Cliente Teste</xNome></dest><det nItem="1"><prod><cProd>1</cProd><xProd>Produto</xProd><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1</qCom><vUnCom>100</vUnCom><vProd>100</vProd></prod></det><total><ICMSTot><vNF>100</vNF></ICMSTot></total></infNFe></NFe>`;
let f;
class Query {
  constructor(table){this.table=table;this.filters=[];this.action='select';}
  select(){return this;} order(){return this;} or(){return this;}
  like(k,v){this.filters.push(x=>String(x[k]??'').endsWith(v.replace(/^%/,'')));return this;}
  eq(k,v){this.filters.push(x=>x[k]===v);return this;}
  in(k,vs){this.filters.push(x=>vs.includes(x[k]));return this;}
  limit(n){this.max=n;return this;}
  maybeSingle(){this.one=true;return this;} single(){this.one=true;return this;}
  update(value){this.action='update';this.value=value;return this;}
  insert(value){this.action='insert';this.value=value;return this;}
  upsert(value){this.action='upsert';this.value=value;return this;}
  then(resolve,reject){try{
    const table=f.tables[this.table]??=[];let rows=table.filter(x=>this.filters.every(fn=>fn(x)));
    if(f.fail===this.table+':'+this.action) return Promise.resolve({data:null,error:{message:'gravação recusada'}}).then(resolve,reject);
    if(this.action!=='select') f.writes.push({table:this.table,action:this.action});
    if(this.action==='update') rows.forEach(x=>Object.assign(x,this.value));
    if(this.action==='insert'){rows=(Array.isArray(this.value)?this.value:[this.value]).map(x=>({id:'registro-'+(++f.seq),...x}));table.push(...rows);}
    if(this.action==='upsert'){rows=[this.value];const old=table.find(x=>x.fazenda_id===this.value.fazenda_id&&x.modulo===this.value.modulo);if(old)Object.assign(old,this.value);else table.push(this.value);}
    if(this.max!==undefined) rows=rows.slice(0,this.max);
    return Promise.resolve({data:this.one?(rows[0]??null):rows,error:null}).then(resolve,reject);
  }catch(e){return Promise.reject(e).then(resolve,reject);}}
}
function fixture(){f={seq:0,writes:[],downloads:[],xmls:[xml()],fail:null,blocked:false,tables:{fazendas:[{id:'faz',conta_id:'conta',produtor_id:'prod',created_at:'2026-01-01'}],produtores:[{id:'prod',cpf_cnpj:destino,fazenda_id:'faz'}],empresas:[],configuracoes_modulo:[{fazenda_id:'faz',modulo:'sieg',config:{cnpjs_destino:[destino],ultima_sync_ts:'2026-11-01T00:00:00.000Z'}}],nf_entradas:[],nf_entrada_itens:[],nf_importadas_sieg:[]}};}
const mock={db:{from:t=>new Query(t),storage:{from:()=>({upload:async()=>({error:null})})}},parseNFeXml,
  download:async(_c,p)=>{f.downloads.push(p);if(f.downloadError)throw new Error(f.downloadError);return p.TipoXml===1?f.xmls:p.TipoXml===3?(f.nfs??[]):[];},
  guard:async()=>f.blocked?Response.json({erro:'Negado'},{status:403}):null};
globalThis[Symbol.for('arato.sieg.rota.teste')]=mock;
registerHooks({resolve(spec,ctx,next){
  const m='globalThis[Symbol.for("arato.sieg.rota.teste")]';let source;
  if(spec==='next/server')source='export const NextResponse={json:(v,i)=>Response.json(v,i)};';
  if(spec.endsWith('/lib/supabase-servidor'))source=`export const createClient=()=>${m}.db;`;
  if(spec.endsWith('/lib/api-auth'))source=`export const ehChamadaInterna=()=>false;export const exigirAcessoFazenda=(...a)=>${m}.guard(...a);`;
  if(spec.endsWith('/lib/sieg'))source=`export const parseNFeXml=${m}.parseNFeXml;export const baixarXmlsSieg=${m}.download,baixarXmlsSiegChunked=${m}.download;export const baixarEventosCancelamentoSieg=async()=>[],parseEventoCancelamentoXml=()=>null,parseCTeXml=()=>null,parseEventoCancelamentoCteXml=()=>null,credenciaisEnv=()=>({}),credenciaisValidas=()=>true;`;
  return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(spec,ctx);
}});
const {POST}=await import('../../app/api/integracoes/sieg-sync/route.ts');
const request=async extra=>{const res=await POST(new Request('https://app.example/api/integracoes/sieg-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fazenda_id:'faz',numero_nf:'42',cnpj_emitente:emitente,data_inicio:'2026-09-28',data_fim:'2026-09-28',force_reimport:true,...extra})}));return {status:res.status,body:await res.json()};};
test('recuperação histórica grava pendente e repetir preserva itens e não cria financeiro',async()=>{fixture();const r=await request();assert.equal(r.body.importados_nfe,1);assert.equal(r.body.notas.length,1);assert.equal(f.tables.nf_entradas[0].status,'pendente');assert.equal(f.downloads[0].DataEmissaoInicio,'2026-09-28T00:00:00.000Z');assert.equal(f.downloads[0].DataUploadInicio,undefined);Object.assign(f.tables.nf_entrada_itens[0],{insumo_id:'associacao-do-usuario'});await request();assert.equal(f.tables.nf_entradas.length,1);assert.equal(f.tables.nf_entrada_itens.length,1);assert.equal(f.tables.nf_entrada_itens[0].insumo_id,'associacao-do-usuario');assert.ok(f.writes.every(w=>['nf_entradas','nf_entrada_itens','configuracoes_modulo'].includes(w.table)));assert.equal(f.tables.configuracoes_modulo[0].config.ultima_sync_ts,'2026-11-01T00:00:00.000Z');});
test('credencial recusada interrompe a busca antes de gravar',async()=>{fixture();f.downloadError='SIEG HTTP 401: API Key inválida';const r=await request();assert.equal(r.status,502);assert.match(r.body.erro,/credenciais/);assert.equal(f.writes.length,0);assert.equal(f.downloads.length,1);});
test('nota de outro destinatário é descartada mesmo se o provedor devolvê-la',async()=>{fixture();f.xmls=[xml('001','11144477735')];const r=await request();assert.equal(r.body.situacao,'nao_encontrada');assert.equal(f.tables.nf_entradas.length,0);});
test('séries ambíguas exigem identificação antes de qualquer gravação',async()=>{fixture();f.xmls=[xml('001'),xml('002')];const r=await request();assert.equal(r.status,409);assert.equal(f.writes.length,0);});
test('falha nos itens ou no cabeçalho não incrementa importados',async()=>{fixture();f.fail='nf_entrada_itens:insert';let r=await request();assert.equal(r.body.importados_nfe,0);assert.equal(r.body.sucesso,false);assert.equal(r.body.situacao,'falha');f.fail=null;await request();f.fail='nf_entradas:update';r=await request();assert.equal(r.body.importados_nfe,0);assert.match(r.body.erros.join(),/recusada/);});
test('reimportar processada preserva status e vínculos de pagamento',async()=>{fixture();await request();Object.assign(f.tables.nf_entradas[0],{status:'processada',lancamento_id:'cp-existente'});await request();assert.equal(f.tables.nf_entradas[0].status,'processada');assert.equal(f.tables.nf_entradas[0].lancamento_id,'cp-existente');});
test('acesso negado não consulta SIEG nem altera registros',async()=>{fixture();f.blocked=true;const r=await request();assert.equal(r.status,403);assert.equal(f.downloads.length,0);assert.equal(f.writes.length,0);});

test('robô mantém busca por upload e aceita nota antiga recebida depois',async()=>{fixture();const r=await request({numero_nf:undefined,cnpj_emitente:undefined,data_inicio:undefined,data_fim:undefined});assert.equal(r.body.importados_nfe,1);assert.equal(f.downloads[0].DataUploadInicio,'2026-11-01T00:00:00.000Z');assert.equal(f.downloads[0].DataEmissaoInicio,undefined);});
test('integração anterior não é duplicada pela recuperação forçada',async()=>{fixture();f.tables.nf_importadas_sieg=[{id:'legado',fazenda_id:'faz',chave_acesso:chave('001')}];const r=await request();assert.equal(r.body.situacao,'falha');assert.equal(f.tables.nf_entradas.length,0);assert.match(r.body.erros.join(),/integração anterior/);});

const {POST:POST_NFS}=await import('../../app/api/integracoes/sieg-sync-nfse/route.ts');
const xmlNfs=`<Nfse><Numero>42</Numero><CodigoVerificacao>TESTE42</CodigoVerificacao><DataEmissao>2026-09-28</DataEmissao><PrestadorServico><Cnpj>${emitente}</Cnpj><RazaoSocial>Prestador Teste</RazaoSocial></PrestadorServico><TomadorServico><Cpf>${destino}</Cpf></TomadorServico><Servico><Valores><ValorServicos>100</ValorServicos><ValorLiquidoNfse>100</ValorLiquidoNfse></Valores></Servico></Nfse>`;
const requestNfs=async()=>{const res=await POST_NFS(new Request('https://app.example/api/integracoes/sieg-sync-nfse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fazenda_id:'faz',data_inicio:'2026-09-28',data_fim:'2026-09-28',force_reimport:true})}));return{status:res.status,body:await res.json()};};
test('NFS-e manual consulta emissão e só conta atualização confirmada',async()=>{fixture();f.nfs=[xmlNfs];let r=await requestNfs();assert.equal(r.body.importadas,1);assert.equal(f.downloads[0].DataEmissaoInicio,'2026-09-28');assert.equal(f.downloads[0].DataUploadInicio,undefined);assert.equal(f.tables.nf_servicos[0].status,'pendente');f.fail='nf_servicos:update';r=await requestNfs();assert.equal(r.body.importadas,0);assert.equal(r.body.sucesso,false);});
test('NFS-e não faz as cinco tentativas quando a credencial foi recusada',async()=>{fixture();f.downloadError='SIEG HTTP 401: API Key inválida';const r=await requestNfs();assert.ok(r.status>=400);assert.match(r.body.erro,/credenciais/);assert.equal(f.downloads.length,1);assert.equal(f.writes.length,0);});
test('falha ao salvar acompanhamento não informa avanço da marca',async()=>{fixture();f.fail='configuracoes_modulo:upsert';const r=await request({numero_nf:undefined,cnpj_emitente:undefined,data_inicio:undefined,data_fim:undefined});assert.equal(r.body.sucesso,false);assert.equal(r.body.marca_avancou,false);assert.match(r.body.erros.join(),/acompanhamento/);});
