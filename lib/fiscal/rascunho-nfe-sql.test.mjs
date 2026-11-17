import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../../supabase_migrations.sql',import.meta.url),'utf8');
const inicio=sql.indexOf('-- Seção 458 —');
assert.ok(inicio>=0);
const fim=sql.indexOf("NOTIFY pgrst, 'reload schema';",inicio)+"NOTIFY pgrst, 'reload schema';".length;
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
async function banco(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE notas_fiscais(id uuid PRIMARY KEY,fazenda_id uuid NOT NULL,status text,tipo text,chave_acesso text,xml_url text,
 numero text,serie text,data_emissao date,valor_total numeric,dados_nf_json jsonb,created_at timestamptz DEFAULT now());
 CREATE TABLE fiscal_operacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registro_id uuid,modelo integer,estado text);
 ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
 CREATE POLICY cliente ON notas_fiscais TO authenticated USING(fazenda_id='${id(1)}') WITH CHECK(fazenda_id='${id(1)}');
 GRANT SELECT,INSERT,UPDATE,DELETE ON notas_fiscais TO authenticated;
 GRANT SELECT ON fiscal_operacoes TO authenticated;`);
 await db.exec(sql.slice(inicio,fim));
 return db;
}
const payload={fazenda_id:id(1),status:'autorizada',tipo:'entrada',numero:'000123',serie:'9',data_emissao:'2026-11-17',valor_total:300,
 dados_nf_json:{rascunho:true,venda_pendente:{corpo:{fazenda_id:id(1),itens:[{cst_icms:'020',cst_icms_manual:true}]},formulario:{data_emissao:'2026-11-17'},itens:[]}}};
const salvar=(db,n,p=payload)=>db.query('SELECT fiscal_rascunho_nfe($1,$2,$3) r',[id(n),'salvar',p]);
const excluir=(db,n)=>db.query('SELECT fiscal_rascunho_nfe($1,$2) r',[id(n),'excluir']);

test('SQL real: novo rascunho, repetição, edição e exclusão sem reservar ou efetivar',async()=>{
 const db=await banco();try{
  await db.exec('SET ROLE authenticated');
  const a=(await salvar(db,10)).rows[0].r;
  assert.equal(a.status,'em_digitacao');assert.equal(a.tipo,'saida');assert.equal(a.chave_acesso,null);
  assert.deepEqual(a.dados_nf_json,payload.dados_nf_json);
  const b=(await salvar(db,10,{...payload,valor_total:400})).rows[0].r;
  assert.equal(a.id,b.id);assert.equal(a.created_at,b.created_at);assert.equal(b.valor_total,400);
  assert.equal((await db.query('SELECT count(*) n FROM notas_fiscais')).rows[0].n,1);
  assert.equal((await db.query('SELECT count(*) n FROM fiscal_operacoes')).rows[0].n,0);
  assert.equal((await excluir(db,10)).rows[0].r.excluida,true);
  assert.equal((await db.query('SELECT count(*) n FROM notas_fiscais')).rows[0].n,0);
 }finally{await db.close();}
});

test('SQL real: estados ativos bloqueiam edição/exclusão sem modificar o rascunho',async t=>{
 const db=await banco();try{
  await salvar(db,11);
  for(const estado of ['reservada','enviada','pendente','autorizada','sincronizada']) await t.test(estado,async()=>{
   await db.exec('RESET ROLE;DELETE FROM fiscal_operacoes');
   await db.query('INSERT INTO fiscal_operacoes(registro_id,modelo,estado)VALUES($1,55,$2)',[id(11),estado]);
   await db.exec('SET ROLE authenticated');
   await assert.rejects(salvar(db,11,{...payload,valor_total:1}),/transmissão/);
   await assert.rejects(excluir(db,11),/transmissão/);
   assert.equal((await db.query('SELECT valor_total FROM notas_fiscais')).rows[0].valor_total,'300');
  });
 }finally{await db.close();}
});

test('SQL real: estados terminais e chave fiscal não podem ser reabertos como rascunho',async t=>{
 const db=await banco();try{
  for(const status of ['autorizada','cancelada','denegada']) await t.test(status,async()=>{
   await db.exec('RESET ROLE');await salvar(db,12);
   await db.query('UPDATE notas_fiscais SET status=$1 WHERE id=$2',[status,id(12)]);
   await db.exec('SET ROLE authenticated');
   await assert.rejects(salvar(db,12),/não está disponível/);
   await assert.rejects(excluir(db,12),/não está disponível/);
   await db.exec('RESET ROLE;DELETE FROM notas_fiscais');
  });
  await salvar(db,13);await db.query('UPDATE notas_fiscais SET chave_acesso=$1 WHERE id=$2',['5'.repeat(44),id(13)]);
  await assert.rejects(salvar(db,13),/já foi transmitida/);
  await db.query("UPDATE notas_fiscais SET status='rejeitada' WHERE id=$1",[id(13)]);
  const r=(await salvar(db,13)).rows[0].r;assert.equal(r.chave_acesso,null);assert.equal(r.status,'em_digitacao');
 }finally{await db.close();}
});

test('SQL real: respeita RLS e recusa campos que poderiam alterar identidade/chave/XML',async()=>{
 const db=await banco();try{
  await db.exec('SET ROLE authenticated');
  await assert.rejects(salvar(db,20,{...payload,fazenda_id:id(2)}),/row-level security/);
  await salvar(db,21);
  await assert.rejects(salvar(db,21,{...payload,fazenda_id:id(2)}),/row-level security/);
  for(const key of ['id','created_at','chave_acesso','xml_url','inexistente'])
   await assert.rejects(salvar(db,21,{...payload,[key]:null}),/Campo de rascunho inválido/);
  await db.exec('RESET ROLE');await salvar(db,22,{...payload,fazenda_id:id(2)});
  await db.exec('SET ROLE authenticated');
  await assert.rejects(excluir(db,22),/não disponível/);
  await assert.rejects(salvar(db,22),/duplicate key|row-level security/);
  await db.exec('RESET ROLE;SET ROLE anon');
  await assert.rejects(salvar(db,23),/permission denied/);
 }finally{await db.close();}
});
