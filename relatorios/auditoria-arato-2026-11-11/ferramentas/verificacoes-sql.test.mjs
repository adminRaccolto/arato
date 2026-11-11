// Banco PostgreSQL isolado em memória. Não carrega env, não acessa rede.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
const source=fs.readFileSync('supabase_migrations.sql','utf8');
test('Gatilho real de divisão parcial não barra baixa negativa nem corrige atualização perdida',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE lancamentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),tipo text,moeda text,status text,valor numeric,valor_pago numeric,valor_juros numeric,valor_multa numeric,valor_desconto numeric,lote_id uuid,contrato_financeiro_id uuid,data_vencimento date,pagamento_parcial boolean,titulo_origem_id uuid,valor_titulo_origem numeric,vencimento_saldo date);`);
  const partial=source.slice(source.indexOf('CREATE OR REPLACE FUNCTION fn_dividir_titulo_parcial()'),source.indexOf('-- "0_" no nome:'));
  await db.exec(partial);await db.exec('CREATE TRIGGER trg_0_dividir_titulo_parcial BEFORE UPDATE ON lancamentos FOR EACH ROW EXECUTE FUNCTION fn_dividir_titulo_parcial();');
  await db.exec(`INSERT INTO lancamentos(tipo,moeda,status,valor,valor_pago) VALUES('pagar','BRL','em_aberto',100,0); UPDATE lancamentos SET valor_pago=-10,status='parcial';`);
  assert.equal((await db.query('SELECT valor_pago FROM lancamentos')).rows[0].valor_pago,'-10');
  await db.exec(`TRUNCATE lancamentos;INSERT INTO lancamentos(tipo,moeda,status,valor,valor_pago) VALUES('pagar','BRL','parcial',1000,100);`);
  const a=Number((await db.query('SELECT valor_pago FROM lancamentos')).rows[0].valor_pago);
  const b=Number((await db.query('SELECT valor_pago FROM lancamentos')).rows[0].valor_pago);
  await db.query('UPDATE lancamentos SET valor_pago=$1,status=$2',[a+100,'parcial']);await db.query('UPDATE lancamentos SET valor_pago=$1,status=$2',[b+100,'parcial']);
  assert.equal((await db.query('SELECT valor_pago FROM lancamentos')).rows[0].valor_pago,'200');
 }finally{await db.close();}
});
test('Schema real de consumos aceita repetição para a mesma previsão e lançamento',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE previsoes_gasto(id uuid PRIMARY KEY);CREATE TABLE lancamentos(id uuid PRIMARY KEY);CREATE TABLE empresa_lancamentos(id uuid PRIMARY KEY);`);
  const start=source.indexOf('CREATE TABLE IF NOT EXISTS previsoes_gasto_consumos (');const end=source.indexOf('-- Tolerância:',start);await db.exec(source.slice(start,end));
  await db.exec(`INSERT INTO previsoes_gasto VALUES('00000000-0000-0000-0000-000000000001'); INSERT INTO lancamentos VALUES('00000000-0000-0000-0000-000000000002'); INSERT INTO previsoes_gasto_consumos(previsao_id,lancamento_id,valor) VALUES('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',100),('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',100);`);
  assert.equal((await db.query('SELECT count(*) n FROM previsoes_gasto_consumos')).rows[0].n,2);
 }finally{await db.close();}
});
