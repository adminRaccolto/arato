import assert from 'node:assert/strict';
import test from 'node:test';
import forge from 'node-forge';
import type {SupabaseClient} from '@supabase/supabase-js';
import {validarCertificadoA1} from './certificado-a1.ts';
import {documentoDoCertificado,certificadoDoTitular} from './identidade-certificado.ts';
import {pfxParaPem,assinarXmlPorId} from './signer.ts';
import {carregarCertificadoEmitente} from './certificado-emitente.ts';
import {SignedXml} from 'xml-crypto';
import https from 'node:https';
import type {AddressInfo} from 'node:net';
import type {TLSSocket} from 'node:tls';
import {enviarCertificadoA1} from './enviar-certificado.ts';
const cpf='12345678901',outro='98765432100',cnpj='12345678000190';
const keys=forge.pki.rsa.generateKeyPair(1024),caKeys=forge.pki.rsa.generateKeyPair(1024);
const senha=' senha preservada ';
function certificado(doc=cpf,inicio='2020-01-01',fim='2099-01-01',ca=false) {
 const c=forge.pki.createCertificate();c.publicKey=(ca?caKeys:keys).publicKey;c.serialNumber='01';c.validity.notBefore=new Date(inicio);c.validity.notAfter=new Date(fim);
 c.setSubject([{name:'commonName',value:ca?'CA Teste':`Titular:${doc}`}]);c.setIssuer(c.subject.attributes);
 if(ca)c.setExtensions([{name:'basicConstraints',cA:true}]);
 c.sign((ca?caKeys:keys).privateKey,forge.md.sha256.create());return c;
}
function arquivo(cert=certificado(),password=senha,chain?:forge.pki.Certificate[]) {
 return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey,chain ?? [cert],password,{algorithm:'3des'})).getBytes(),'binary');
}
const valido=arquivo();
test('validade completa, titular e senha com espaços são conferidos',()=>{
 assert.equal(validarCertificadoA1(valido,senha,{documento:cpf}).documento,cpf);
 assert.throws(()=>validarCertificadoA1(valido,senha.trim(),{documento:cpf}),/abrir o certificado/);
 assert.throws(()=>validarCertificadoA1(valido,senha,{documento:outro}),/não corresponde/);
 assert.throws(()=>validarCertificadoA1(arquivo(certificado(cpf,'2020-01-01','2021-01-01')),senha),/vencido/);
 assert.throws(()=>validarCertificadoA1(arquivo(certificado(cpf,'2090-01-01','2099-01-01')),senha),/ainda não entrou/);
 assert.equal(certificadoDoTitular(cnpj,'12345678000271'),true);
 assert.equal(certificadoDoTitular(cpf,cnpj),false);
});
test('extrai CPF e CNPJ dos OIDs ICP-Brasil sem confundir o responsável de uma empresa',()=>{
 const montar=(oid:string,dado:string)=>forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC,0,true,[forge.asn1.create(forge.asn1.Class.UNIVERSAL,forge.asn1.Type.OID,false,forge.asn1.oidToDer(oid).getBytes()),forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC,0,true,[forge.asn1.create(forge.asn1.Class.UNIVERSAL,forge.asn1.Type.UTF8,false,dado)])]);
 const cert=certificado();cert.setSubject([{name:'commonName',value:'Titular sem documento no CN'}]);
 const san=forge.asn1.create(forge.asn1.Class.UNIVERSAL,forge.asn1.Type.SEQUENCE,true,[montar('2.16.76.1.3.1','01011990'+cpf)]);
 cert.setExtensions([{id:'2.5.29.17',value:forge.asn1.toDer(san).getBytes()}]);cert.sign(keys.privateKey,forge.md.sha256.create());
 assert.equal(documentoDoCertificado(forge.pki.certificateFromPem(forge.pki.certificateToPem(cert))),cpf);
 san.value=(san.value as forge.asn1.Asn1[]).concat([montar('2.16.76.1.3.3',cnpj)]);
 cert.setExtensions([{id:'2.5.29.17',value:forge.asn1.toDer(san).getBytes()}]);cert.sign(keys.privateKey,forge.md.sha256.create());
 assert.equal(documentoDoCertificado(forge.pki.certificateFromPem(forge.pki.certificateToPem(cert))),cnpj);
});
test('ordem dos bags não altera o titular e a assinatura XML verifica com sua chave',()=>{
 const leaf=certificado(),raiz=certificado(cnpj,'2020-01-01','2099-01-01',true);
 leaf.setIssuer(raiz.subject.attributes);leaf.sign(caKeys.privateKey,forge.md.sha256.create());
 const pem=pfxParaPem(arquivo(leaf,senha,[raiz,leaf]),senha);
 assert.equal(documentoDoCertificado(forge.pki.certificateFromPem(pem.cert)),cpf);
 assert.equal((pem.certChain!.match(/BEGIN CERTIFICATE/g) ?? []).length,2);
 for(const modelo of ['infNFe','infCte','infMDFe','infEvento']) {
  const xml=assinarXmlPorId(`<Documento><${modelo} Id="ID123"><valor>1</valor></${modelo}></Documento>`,pem,'ID123');
  const verificador=new SignedXml({publicCert:pem.cert});verificador.loadSignature(xml.match(/<Signature[\s\S]*?<\/Signature>/)![0]);
  assert.equal(verificador.checkSignature(xml),true);
 }
 assert.throws(()=>pfxParaPem(arquivo(leaf,senha,[raiz]),senha),/correspondentes/);
});
type Row={fazenda_id?:string;modulo?:string;config?:Record<string,string>;updated_at?:string;storage_path?:string;senha?:string;documento?:string;fingerprint?:string;ativo?:boolean;conta_id?:string;chave_titular?:string;created_at?:string;id?:string};
function banco(configs:Row[],ativos:Row[]=[],files:Record<string,Buffer>={'a/valido.pfx':valido},semTabela=false) {
 const downloads:string[]=[];
 const db={from(tabela:string){const filtros:((r:Row)=>boolean)[]=[];let single=false;let inicio=0,fim=Infinity;const q={select:()=>q,eq:(k:keyof Row,v:unknown)=>{filtros.push(r=>r[k]===v);return q;},in:(k:keyof Row,v:unknown[])=>{filtros.push(r=>v.includes(r[k]));return q;},or:()=>q,not:()=>q,range:(de:number,ate:number)=>{inicio=de;fim=ate+1;return q;},order:()=>q,single:()=>{single=true;return q;},then(resolve:(r:unknown)=>unknown,reject?:(e:unknown)=>unknown){const rows=tabela==='fazendas'?[{id:'a',conta_id:'cliente'},{id:'b',conta_id:'cliente'},{id:'x',conta_id:'outro'}]:tabela==='certificados_a1_versoes'?ativos:configs;const data=rows.filter(r=>filtros.every(f=>f(r))).slice(inicio,fim);return Promise.resolve({data:single?data[0]:data,error:semTabela&&tabela==='certificados_a1_versoes'?{code:'PGRST205'}:null}).then(resolve,reject);}};return q;},storage:{from:()=>({download:async(path:string)=>{downloads.push(path);return {data:files[path]?new Blob([new Uint8Array(files[path])]):null,error:files[path]?null:{message:'indisponível'}};}})}} as unknown as SupabaseClient;
 return {db,downloads};
}
const cfg=(path:string,pass=senha,fazenda='a',doc=cpf):Row=>({fazenda_id:fazenda,modulo:`fiscal_pf_${doc}`,config:{cert_a1_path:path,cert_a1_senha:pass}});
test('legado continua emitindo sem migração; nunca combina caminho e senha de cópias diferentes',async()=>{
 const {db}=banco([cfg('a/velho.pfx','incorreta'),cfg('a/valido.pfx',senha,'b')],[],undefined,true);
 assert.equal((await carregarCertificadoEmitente(db,'a',cpf)).origem,'legado');
 const incompleto=banco([{fazenda_id:'a',modulo:`fiscal_pf_${cpf}`,config:{cert_a1_path:'a/valido.pfx'}},{fazenda_id:'b',modulo:`fiscal_pf_${cpf}`,config:{cert_a1_senha:senha}}]);
 await assert.rejects(carregarCertificadoEmitente(incompleto.db,'a',cpf),/não encontrados/);assert.deepEqual(incompleto.downloads,[]);
});
test('versão ativa prevalece sobre cópias antigas e sobre o CT-e específico',async()=>{
 const finger=validarCertificadoA1(valido,senha).fingerprint;
 const {db,downloads}=banco([cfg('a/velho.pfx','errada')],[{conta_id:'cliente',documento:cpf,chave_titular:cpf,storage_path:'a/valido.pfx',senha,fingerprint:finger,ativo:true}]);
 assert.equal((await carregarCertificadoEmitente(db,'a',cpf)).origem,'ativo');assert.deepEqual(downloads,['a/valido.pfx']);
});
test('falha no arquivo ativo não reativa o substituído nem procura PFX de outro titular',async()=>{
 const {db,downloads}=banco([cfg('a/valido.pfx')],[{conta_id:'cliente',documento:cpf,chave_titular:cpf,storage_path:'a/ausente.pfx',senha,ativo:true}]);
 await assert.rejects(carregarCertificadoEmitente(db,'a',cpf),/baixar o arquivo/);assert.deepEqual(downloads,['a/ausente.pfx']);
});
test('não usa arquivo de outro cliente, nem PFX cujo conteúdo diverge do fingerprint ativo',async()=>{
 const outroCliente=banco([cfg('x/secreto.pfx')]);await assert.rejects(carregarCertificadoEmitente(outroCliente.db,'a',cpf),/deste cliente/);assert.deepEqual(outroCliente.downloads,[]);
 const trocado=banco([],[{conta_id:'cliente',documento:cpf,chave_titular:cpf,storage_path:'a/valido.pfx',senha,ativo:true,fingerprint:'0'.repeat(64)}]);
 await assert.rejects(carregarCertificadoEmitente(trocado.db,'a',cpf),/alterado fora/);
});

function storageFake(falha?:'migracao'|'envio'|'leitura'|'ativacao') {
 const enviados:string[]=[];let ativacoes=0;
 const db={from:()=>({select:()=>({limit:async()=>({error:falha==='migracao'?{code:'PGRST205'}:null})})}),
 storage:{createBucket:async()=>({error:null}),from:()=>({upload:async(path:string,_buffer:Buffer,options:{upsert:boolean})=>{assert.equal(options.upsert,false);enviados.push(path);return {error:falha==='envio'?{}:null};},download:async()=>({data:falha==='leitura'?null:new Blob([new Uint8Array(valido)]),error:falha==='leitura'?{}:null})})},
 rpc:async()=>{ativacoes++;return {data:{versao_id:'versao'},error:falha==='ativacao'?{code:'P0001',message:'Falha da transação; anterior preservado'}:null};}} as unknown as SupabaseClient;
 return {db,enviados,ativacoes:()=>ativacoes};
}
const dadosEnvio={buffer:valido,nomeArquivo:'meu-certificado.pfx',senha,fazendaId:'a',doc:cpf,produtorId:'p',produtorNome:'Titular'};
test('envio preserva o contrato das telas e usa caminho exclusivo sem sobrescrever o arquivo atual',async()=>{
 const b=storageFake();const r=await enviarCertificadoA1(b.db,dadosEnvio);
 assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.equal(r.body.arquivo_nome,'meu-certificado.pfx');
 assert.equal(r.body.cpf_cnpj,cpf);assert.match(b.enviados[0],/^a\/versoes\/[0-9a-f-]+\.pfx$/);assert.equal(b.ativacoes(),1);
 assert.equal('senha' in r.body,false);
});
test('senha/titular incorretos, migração ausente, falha de storage e de banco nunca retornam sucesso',async()=>{
 for(const falha of ['migracao','envio','leitura','ativacao'] as const) {
  const b=storageFake(falha);const r=await enviarCertificadoA1(b.db,dadosEnvio);
  assert.notEqual(r.status,200);assert.notEqual(r.body.ok,true);
  assert.equal(b.ativacoes(),falha==='ativacao'?1:0);
  if(falha==='migracao') assert.equal(b.enviados.length,0);
 }
 for(const extra of [{senha:'incorreta'},{doc:outro}]) {
  const b=storageFake();const r=await enviarCertificadoA1(b.db,{...dadosEnvio,...extra});assert.equal(r.status,400);assert.equal(b.enviados.length,0);assert.equal(b.ativacoes(),0);
 }
});

test('mTLS local autentica o titular com a cadeia reordenada, sem acessar a SEFAZ',async()=>{
 const raizKey=forge.pki.rsa.generateKeyPair(2048),leafKey=forge.pki.rsa.generateKeyPair(2048);
 const criar=(nome:string,ca:boolean,servidor=false)=>{
  const c=forge.pki.createCertificate();c.publicKey=(ca?raizKey:leafKey).publicKey;c.serialNumber=ca?'01':servidor?'02':'03';
  c.validity.notBefore=new Date('2020-01-01');c.validity.notAfter=new Date('2099-01-01');
  c.setSubject([{name:'commonName',value:nome}]);c.setIssuer([{name:'commonName',value:'CA local'}]);
  c.setExtensions(ca?[{name:'basicConstraints',cA:true},{name:'keyUsage',keyCertSign:true,cRLSign:true}]:[{name:'basicConstraints',cA:false},{name:'extKeyUsage',serverAuth:servidor,clientAuth:!servidor},...(servidor?[{name:'subjectAltName',altNames:[{type:2,value:'localhost'}]}]:[])]);
  c.sign(raizKey.privateKey,forge.md.sha256.create());return c;
 };
 const raiz=criar('CA local',true),leaf=criar(`Titular:${cpf}`,false),servidor=criar('localhost',false,true);
 const p12=Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(leafKey.privateKey,[raiz,leaf],senha,{algorithm:'3des'})).getBytes(),'binary');
 const pem=validarCertificadoA1(p12,senha,{documento:cpf}).pem;
 const rootPem=forge.pki.certificateToPem(raiz);
 const server=https.createServer({key:forge.pki.privateKeyToPem(leafKey.privateKey),cert:forge.pki.certificateToPem(servidor),ca:rootPem,requestCert:true,rejectUnauthorized:true},(req,res)=>{res.end((req.socket as TLSSocket).authorized?'ok':'falha');});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const body=await new Promise<string>((resolve,reject)=>{
   const req=https.get({hostname:'127.0.0.1',port:(server.address() as AddressInfo).port,servername:'localhost',ca:rootPem,cert:pem.certChain,key:pem.key,rejectUnauthorized:true,agent:false},res=>{let data='';res.on('data',d=>data+=d);res.on('end',()=>resolve(data));});
   req.setTimeout(5000,()=>req.destroy(new Error('Timeout local')));req.on('error',reject);
  });
  assert.equal(body,'ok');
 }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('emitente vazio nunca seleciona o primeiro certificado da conta',async()=>{
 const b=banco([cfg('a/valido.pfx')]);await assert.rejects(carregarCertificadoEmitente(b.db,'a',''),/CPF\/CNPJ/);assert.deepEqual(b.downloads,[]);
});

test('busca legada pagina as configurações e encontra titular além das primeiras mil linhas',async()=>{
 const configs=Array.from({length:1001},()=>cfg('a/outro.pfx',senha,'a',outro));configs.push(cfg('a/valido.pfx'));
 const b=banco(configs,[],undefined,true);assert.equal((await carregarCertificadoEmitente(b.db,'a',cpf)).documento,cpf);assert.deepEqual(b.downloads,['a/valido.pfx']);
});
