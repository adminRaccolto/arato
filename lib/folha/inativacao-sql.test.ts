import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const source=readFileSync(new URL("../../supabase_migrations.sql",import.meta.url),"utf8");
const inicio=source.indexOf("-- Seção 446 —");
const fim=source.indexOf("\n-- Seção ",inicio+10);
const sql=source.slice(inicio,fim<0?undefined:fim);
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const salario=(folha:number,segundo=false)=>id(1000+folha*10+(segundo?1:0));
const linha=(folha:number,segundo=false)=>id(folha*10+(segundo?1:0));

test("inativação: SQL real preserva obrigações e elimina previsões dos rascunhos",async t=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
   CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '${id(99)}'::uuid$$;
   CREATE TABLE fazendas(id uuid PRIMARY KEY,conta_id uuid);
   CREATE TABLE funcionarios(id uuid PRIMARY KEY,fazenda_id uuid,nome text,ativo boolean,data_demissao date);
   CREATE TABLE folha_pagamento(id uuid PRIMARY KEY,fazenda_id uuid,empresa_id uuid,competencia text,status text,previsoes_sync_em timestamptz,
    valor_bruto numeric,valor_liquido numeric,fgts_total numeric,inss_patronal numeric,cp_fgts_id uuid,cp_inss_patronal_id uuid);
   CREATE TABLE folha_funcionarios(id uuid PRIMARY KEY,folha_id uuid,funcionario_id uuid,nome_funcionario text,
    salario_bruto numeric,inss_trabalhador numeric,irrf numeric DEFAULT 0,adiantamento numeric DEFAULT 0,outros_descontos numeric DEFAULT 0,
    vale_transporte numeric DEFAULT 0,vale_refeicao numeric DEFAULT 0,outros_beneficios numeric DEFAULT 0,complemento_salarial numeric DEFAULT 0,
    fgts numeric,inss_patronal numeric,cp_lancamento_id uuid);
   CREATE TABLE lancamentos(id uuid PRIMARY KEY,fazenda_id uuid,funcionario_id uuid,titulo_origem_id uuid,tipo text,natureza text,moeda text,
    valor numeric,valor_pago numeric,status text,data_baixa date,conciliado boolean DEFAULT false,lote_id uuid,contrato_financeiro_id uuid,fatura_cartao_id uuid,
    previsao_gasto_id uuid,observacao text);
   CREATE TABLE previsoes_gasto(id uuid PRIMARY KEY,lancamento_previsao_id uuid,valor numeric CHECK(valor>0),saldo numeric,status text,updated_at timestamptz);
   CREATE TABLE previsoes_gasto_consumos(id uuid,previsao_id uuid);
   CREATE TABLE pagamento_lote_itens(lancamento_id uuid,origem_tabela text);
   CREATE TABLE extrato_transacoes(lancamento_id uuid,lancamento_ids uuid[],conciliado boolean);
   CREATE TABLE folha_historico(id uuid DEFAULT gen_random_uuid(),folha_id uuid,usuario_id uuid,usuario_nome text,acao text,alteracoes jsonb);
  `);
  const start=source.indexOf("CREATE OR REPLACE FUNCTION public.folha_liquido_financeiro(");
  await db.exec(source.slice(start,source.indexOf("$$;",start)+3));
  await db.exec(sql);
  async function seed(){
   await db.exec(`TRUNCATE folha_historico,extrato_transacoes,pagamento_lote_itens,previsoes_gasto_consumos,previsoes_gasto,lancamentos,folha_funcionarios,folha_pagamento,funcionarios,fazendas;
    INSERT INTO fazendas VALUES('${id(1)}','${id(10)}'),('${id(2)}','${id(11)}'),('${id(3)}','${id(10)}');
    INSERT INTO funcionarios VALUES('${id(20)}','${id(1)}','Ana',true,NULL),('${id(21)}','${id(1)}','Bia',true,NULL),('${id(22)}','${id(2)}','Outra conta',true,NULL);`);
   for(const [n,comp,status] of [[50,'2026-11','rascunho'],[51,'2026-12','rascunho'],[52,'2026-10','rascunho'],[53,'2026-10','fechado'],[54,'2026-09','pago']] as const){
    await db.query('INSERT INTO folha_pagamento(id,fazenda_id,empresa_id,competencia,status,valor_bruto,valor_liquido,fgts_total,inss_patronal,cp_fgts_id,cp_inss_patronal_id)VALUES($1,$2,$3,$4,$5,3000,2700,240,600,$6,$7)',[id(n),id(1),id(40),comp,status,id(2000+n),id(3000+n)]);
    for(const segundo of [false,true]){
     const v=segundo?2000:1000;
     await db.query('INSERT INTO lancamentos(id,fazenda_id,funcionario_id,tipo,natureza,moeda,valor,status)VALUES($1,$2,$3,\'pagar\',$4,\'BRL\',$5,\'em_aberto\')',[salario(n,segundo),id(1),id(segundo?21:20),status==='rascunho'?'previsao':'real',v*0.9]);
     await db.query('INSERT INTO folha_funcionarios(id,folha_id,funcionario_id,nome_funcionario,salario_bruto,inss_trabalhador,fgts,inss_patronal,cp_lancamento_id)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[linha(n,segundo),id(n),id(segundo?21:20),segundo?'Bia':'Ana',v,v*0.1,v*0.08,v*0.2,salario(n,segundo)]);
    }
    for(const [num,valor] of [[2000+n,240],[3000+n,600]])
     await db.query('INSERT INTO lancamentos(id,fazenda_id,tipo,natureza,moeda,valor,status)VALUES($1,$2,\'pagar\',$3,\'BRL\',$4,\'em_aberto\')',[id(num),id(1),status==='rascunho'?'previsao':'real',valor]);
   }
   await db.exec(`INSERT INTO previsoes_gasto SELECT id,id,valor,valor,'aberta',now() FROM lancamentos WHERE natureza='previsao';
    UPDATE lancamentos SET previsao_gasto_id=id WHERE natureza='previsao';`);
  }
  const get=async(n:string)=>(await db.query<Record<string,any>>('SELECT * FROM lancamentos WHERE id=$1',[n])).rows[0];
  const inativar=()=>db.query('UPDATE funcionarios SET ativo=false WHERE id=$1',[id(20)]);
  async function scenario(nome:string,fn:()=>Promise<void>){await t.test(nome,async()=>{await seed();await fn();});}
  await scenario('sem data de demissão: cancela mês atual, futuro e rascunho antigo, mantendo fechadas e outro funcionário',async()=>{
   const outra=await get(salario(50,true)),fechada=await get(salario(53));
   await inativar();
   for(const n of [50,51,52]){
    assert.equal((await get(salario(n))).status,'cancelado');
    assert.equal((await db.query('SELECT count(*) n FROM folha_funcionarios WHERE id=$1',[linha(n)])).rows[0].n,0);
    const h=(await db.query<Record<string,any>>('SELECT * FROM folha_pagamento WHERE id=$1',[id(n)])).rows[0];
    assert.equal(Number(h.valor_bruto),2000);assert.equal(Number(h.valor_liquido),1800);
    assert.equal(Number((await get(id(2000+n))).valor),160);assert.equal(Number((await get(id(3000+n))).valor),400);
    const prev=(await db.query<Record<string,any>>('SELECT * FROM previsoes_gasto WHERE id=$1',[salario(n)])).rows[0];
    assert.equal(prev.status,'cancelada');assert.equal(Number(prev.saldo),0);
   }
   assert.deepEqual(await get(salario(50,true)),outra);assert.deepEqual(await get(salario(53)),fechada);
   assert.equal((await db.query('SELECT count(*) n FROM folha_historico WHERE usuario_id=$1',[id(99)])).rows[0].n,3);
   await inativar();assert.equal((await db.query('SELECT count(*) n FROM folha_historico')).rows[0].n,3);
  });
  for(const [nome,patch] of [['real',"natureza='real'"],['pago',"status='baixado',valor_pago=900"],['parcial',"status='parcial',valor_pago=200"],['conciliado','conciliado=true'],['borderô',`lote_id='${id(90)}'`],['contrato',`contrato_financeiro_id='${id(90)}'`],['cartão',`fatura_cartao_id='${id(90)}'`]] as const)
   await scenario(`título ${nome} preserva valor e vínculo`,async()=>{
    await db.exec(`UPDATE lancamentos SET ${patch} WHERE id='${salario(50)}'`);const antes=await get(salario(50));
    await inativar();assert.deepEqual(await get(salario(50)),antes);
    assert.equal((await db.query('SELECT cp_lancamento_id FROM folha_funcionarios WHERE id=$1',[linha(50)])).rows[0].cp_lancamento_id,salario(50));
   });
  await scenario('parte paga, extrato e composição de borderô protegem mesmo com a raiz em aberto',async()=>{
   await db.exec(`INSERT INTO lancamentos(id,fazenda_id,titulo_origem_id,natureza,tipo,valor,status)VALUES('${id(90)}','${id(1)}','${salario(50)}','real','pagar',200,'baixado');
    INSERT INTO extrato_transacoes VALUES(NULL,ARRAY['${salario(51)}'::uuid],true);
    INSERT INTO pagamento_lote_itens VALUES('${salario(52)}','lancamentos');`);
   await inativar();for(const n of [50,51,52])assert.equal((await get(salario(n))).status,'em_aberto');
  });
  await scenario('previsão consumida não é cancelada por estimativa',async()=>{
   await db.exec(`INSERT INTO previsoes_gasto_consumos VALUES('${id(90)}','${salario(50)}')`);
   await inativar();assert.equal((await get(salario(50))).status,'em_aberto');
  });
  await scenario('sem outros funcionários: cancela encargos previstos e zera o cabeçalho',async()=>{
   await db.query('UPDATE funcionarios SET ativo=false WHERE id=$1',[id(21)]);await inativar();
   assert.equal((await get(id(2050))).status,'cancelado');assert.equal((await get(id(3050))).status,'cancelado');
   assert.equal(Number((await db.query<Record<string,any>>('SELECT valor_liquido FROM folha_pagamento WHERE id=$1',[id(50)])).rows[0].valor_liquido),0);
  });
  await scenario('encargo já real/pago fica intacto mesmo retirando previsão do salário',async()=>{
   await db.exec(`UPDATE lancamentos SET natureza='real',status='baixado',valor_pago=240 WHERE id='${id(2050)}'`);const antes=await get(id(2050));
   await inativar();assert.deepEqual(await get(id(2050)),antes);assert.equal((await get(salario(50))).status,'cancelado');
  });
  await scenario('tela antiga não consegue reincluir inativo, mas rescisão real posterior é permitida',async()=>{
   await inativar();
   const insercao=await db.query('INSERT INTO folha_funcionarios(id,folha_id,funcionario_id,nome_funcionario)VALUES($1,$2,$3,$4),($5,$2,$6,$7) RETURNING funcionario_id',[id(90),id(50),id(20),'Ana',id(92),id(21),'Bia']);
   assert.equal(insercao.rows.length,1);assert.equal(insercao.rows[0].funcionario_id,id(21));
   await db.query('UPDATE funcionarios SET data_demissao=$1,ativo=false WHERE id=$2',['2026-11-20',id(20)]);
   await db.exec(`INSERT INTO lancamentos(id,fazenda_id,funcionario_id,tipo,natureza,moeda,valor,status)VALUES('${id(91)}','${id(1)}','${id(20)}','pagar','real','BRL',5000,'em_aberto')`);
   assert.equal(Number((await get(id(91))).valor),5000);
  });
  await scenario('falha no encargo reverte a inativação, os salários e as linhas',async()=>{
   await db.exec(`CREATE FUNCTION falhar_encargo() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF OLD.id='${id(2050)}' THEN RAISE EXCEPTION 'Falha de encargo';END IF;RETURN NEW;END$$;
    CREATE TRIGGER falha BEFORE UPDATE ON lancamentos FOR EACH ROW EXECUTE FUNCTION falhar_encargo();`);
   await assert.rejects(inativar(),/Falha de encargo/);
   assert.equal((await db.query('SELECT ativo FROM funcionarios WHERE id=$1',[id(20)])).rows[0].ativo,true);
   assert.equal((await get(salario(50))).status,'em_aberto');
   assert.equal((await db.query('SELECT count(*) n FROM folha_funcionarios WHERE id=$1',[linha(50)])).rows[0].n,1);
   await db.exec('DROP TRIGGER falha ON lancamentos');
  });
  await scenario('sincronização em andamento impede corrida e não deixa inativação incompleta',async()=>{
   await db.exec(`UPDATE folha_pagamento SET previsoes_sync_em=clock_timestamp() WHERE id='${id(51)}'`);
   await assert.rejects(inativar(),/sendo atualizada/);
   assert.equal((await get(salario(50))).status,'em_aberto');
   assert.equal((await db.query('SELECT count(*) n FROM folha_historico')).rows[0].n,0);
  });
  await scenario('migração regulariza inativo já existente e reaplicação é idempotente',async()=>{
   await db.exec(`ALTER TABLE funcionarios DISABLE TRIGGER trg_funcionario_inativo_previsoes;UPDATE funcionarios SET ativo=false WHERE id='${id(20)}';ALTER TABLE funcionarios ENABLE TRIGGER trg_funcionario_inativo_previsoes;`);
   await db.exec(sql);await db.exec(sql);assert.equal((await get(salario(50))).status,'cancelado');
   assert.equal((await db.query('SELECT count(*) n FROM folha_historico')).rows[0].n,3);
  });
  await scenario('linha de outro cliente bloqueia sem alterar dados',async()=>{
   await db.query('UPDATE folha_funcionarios SET funcionario_id=$1 WHERE id=$2',[id(22),linha(50)]);
   await assert.rejects(db.query('UPDATE funcionarios SET ativo=false WHERE id=$1',[id(22)]),/clientes diferentes/);
   assert.equal((await get(salario(50))).status,'em_aberto');
  });
  await scenario('funcionário de outra fazenda do mesmo cliente é tratado na folha do empregador',async()=>{
   await db.query('UPDATE funcionarios SET fazenda_id=$1 WHERE id=$2',[id(3),id(20)]);
   await inativar();assert.equal((await get(salario(50))).status,'cancelado');
  });
  await scenario('função privilegiada não pode ser executada diretamente por usuário autenticado',async()=>{
   await db.exec('SET ROLE authenticated');
   try{await assert.rejects(db.query('SELECT folha_limpar_inativos(NULL,$1)',[id(20)]),/permission denied/);}
   finally{await db.exec('RESET ROLE');}
  });
  await db.exec('CREATE TABLE financeiro_operacoes(requisicao_id uuid,tabela text,registro_id uuid,acao text,dados jsonb,antes jsonb,depois jsonb,retorno jsonb,created_at timestamptz)');
  // Só a Seção 447 (até a próxima seção): as seções seguintes do arquivo usam tabelas que este banco de teste não tem
  const i447=source.indexOf('-- Seção 447 —');const f447=source.indexOf("\n-- Seção ",i447+10);
  await db.exec(source.slice(i447,f447<0?undefined:f447));
  await scenario('encargos opcionais: desmarcar cancela previsões e conserva salários e cálculos',async()=>{
   await db.query('UPDATE folha_pagamento SET gerar_encargos_cp=false WHERE id=$1',[id(50)]);
   assert.equal((await get(id(2050))).status,'cancelado');assert.equal((await get(id(3050))).status,'cancelado');
   assert.equal((await get(salario(50))).status,'em_aberto');
   const f=(await db.query<Record<string,any>>('SELECT * FROM folha_pagamento WHERE id=$1',[id(50)])).rows[0];
   assert.equal(f.cp_fgts_id,null);assert.equal(f.cp_inss_patronal_id,null);assert.equal(Number(f.fgts_total),240);
   assert.equal(Number(f.valor_liquido),2700);
   const p=(await db.query<Record<string,any>>('SELECT status,saldo FROM previsoes_gasto WHERE id=$1',[id(2050)])).rows[0];
   assert.equal(p.status,'cancelada');assert.equal(Number(p.saldo),0);
  });
  await scenario('encargo pago impede desmarcação sem modificar valor ou opção',async()=>{
   await db.exec(`UPDATE lancamentos SET natureza='real',status='baixado',valor_pago=240 WHERE id='${id(2050)}'`);
   await assert.rejects(db.query('UPDATE folha_pagamento SET gerar_encargos_cp=false WHERE id=$1',[id(50)]),/Regularize/);
   assert.equal((await get(id(2050))).status,'baixado');
   assert.equal((await db.query('SELECT gerar_encargos_cp FROM folha_pagamento WHERE id=$1',[id(50)])).rows[0].gerar_encargos_cp,true);
  });
  await scenario('opção fica protegida na folha fechada e pode ser reativada no rascunho',async()=>{
   await assert.rejects(db.query('UPDATE folha_pagamento SET gerar_encargos_cp=false WHERE id=$1',[id(53)]),/Reabra/);
   await db.query('UPDATE folha_pagamento SET gerar_encargos_cp=false WHERE id=$1',[id(50)]);
   await db.query('UPDATE folha_pagamento SET gerar_encargos_cp=true WHERE id=$1',[id(50)]);
   assert.equal((await db.query('SELECT gerar_encargos_cp FROM folha_pagamento WHERE id=$1',[id(50)])).rows[0].gerar_encargos_cp,true);
  });
 }finally{await db.close();}
});
