import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const source = readFileSync(new URL("../../supabase_migrations.sql", import.meta.url), "utf8");
const ini = source.indexOf("-- Seção 428 —");
const fim = source.indexOf("\n-- Seção ", ini + 10);
const sql = source.slice(ini, fim < 0 ? undefined : fim);

test("borderô atômico conserva valores e restaura a situação anterior", async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE FUNCTION rls_minhas_fazendas() RETURNS SETOF uuid LANGUAGE sql AS $$ SELECT '${id(1)}'::uuid $$;
      CREATE FUNCTION rls_sou_raccotlo() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      CREATE TABLE fazendas(id uuid PRIMARY KEY,conta_id uuid);
      INSERT INTO fazendas VALUES('${id(1)}','${id(10)}'),('${id(2)}','${id(11)}');
      CREATE TABLE contas_bancarias(id uuid PRIMARY KEY,fazenda_id uuid,conta_id uuid,moeda text,ativa boolean);
      INSERT INTO contas_bancarias VALUES('${id(3)}','${id(1)}','${id(10)}','BRL',true),('${id(4)}','${id(2)}','${id(11)}','BRL',true);
      CREATE TABLE pagamento_lotes(id uuid PRIMARY KEY,fazenda_id uuid,tipo text,status text,valor_total numeric,valor_pago numeric,
        valor_juros numeric,valor_multa numeric,valor_desconto numeric,data_pagamento date,conta_bancaria uuid,data_vencimento date,
        numero_titulo text,descricao text,conciliado boolean DEFAULT false,pagamento_parcial boolean DEFAULT false,lote_origem_id uuid,valor_lote_origem numeric);
      CREATE TABLE pagamento_lote_itens(id uuid PRIMARY KEY,lote_id uuid REFERENCES pagamento_lotes(id) ON DELETE CASCADE,
        lancamento_id uuid,origem_tabela text,valor_pago numeric,valor_juros numeric,valor_multa numeric,valor_desconto numeric);
      CREATE TABLE lancamentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,lote_id uuid REFERENCES pagamento_lotes(id),
        tipo text DEFAULT 'pagar',status text,valor numeric,valor_pago numeric,valor_juros numeric,valor_multa numeric,valor_desconto numeric,
        moeda text DEFAULT 'BRL',cotacao_usd numeric,data_baixa date,data_pagamento date,conta_bancaria uuid,conciliado boolean DEFAULT false,
        pagamento_parcial boolean DEFAULT false,lote_saldo_id uuid,contrato_financeiro_id uuid,titulo_origem_id uuid,valor_titulo_origem numeric,
        data_vencimento date,vencimento_saldo date,created_at timestamptz DEFAULT now());
      CREATE TABLE empresa_lancamentos(LIKE lancamentos INCLUDING ALL);
      CREATE TABLE extrato_transacoes(id uuid PRIMARY KEY,conciliado boolean,lancamento_id uuid,lancamento_ids uuid[],lancamento_desc text,
        lancamento_valor numeric,origem_vinculo text,confianca text,regra_id uuid,updated_at timestamptz);
    `);
    // Usa o gatilho real em vigor: os novos parciais não podem dividir os títulos.
    const start = source.indexOf("CREATE OR REPLACE FUNCTION fn_dividir_titulo_parcial()", source.indexOf("-- Seção 379 —"));
    const end = source.indexOf("NOTIFY pgrst", start);
    await db.exec(source.slice(start, end));
    await db.exec(`CREATE TRIGGER trg_parcial BEFORE UPDATE ON lancamentos FOR EACH ROW EXECUTE FUNCTION fn_dividir_titulo_parcial();
      CREATE TRIGGER trg_parcial BEFORE UPDATE ON empresa_lancamentos FOR EACH ROW EXECUTE FUNCTION fn_dividir_titulo_parcial();`);
    await db.exec(sql); await db.exec(sql);
    const fixture = async () => db.exec(`
      INSERT INTO pagamento_lotes(id,fazenda_id,tipo,status,valor_total,data_vencimento) VALUES('${id(20)}','${id(1)}','pagar','pendente',300,'2026-11-15');
      INSERT INTO lancamentos(id,fazenda_id,lote_id,status,valor,data_vencimento) VALUES('${id(30)}','${id(1)}','${id(20)}','em_aberto',100,'2026-11-15');
      INSERT INTO empresa_lancamentos(id,fazenda_id,lote_id,status,valor,data_vencimento) VALUES('${id(31)}','${id(1)}','${id(20)}','pendente',200,'2026-11-15');
      INSERT INTO pagamento_lote_itens(id,lote_id,lancamento_id,origem_tabela,valor_pago) VALUES
        ('${id(40)}','${id(20)}','${id(30)}','lancamentos',100),('${id(41)}','${id(20)}','${id(31)}','empresa_lancamentos',200);
    `);
    const action = (acao: string, titulo: Record<string, unknown> = {}, conta = 3) => db.query(
      "SELECT bordero_acao_atomica($1,$2,'2026-11-10',$3,$4) r", [id(20), acao, id(conta), {requisicao_id:id(80), ...titulo}]);
    const values = async () => (await db.query<{valor:string;valor_pago:string|null;status:string}>(
      `SELECT valor,valor_pago,status FROM lancamentos WHERE id='${id(30)}' UNION ALL SELECT valor,valor_pago,status FROM empresa_lancamentos WHERE id='${id(31)}'`)).rows;
    const scenario = async (name: string, run: () => Promise<void>) => t.test(name, async () => {
      await fixture(); try { await run(); } finally {
        await db.exec("DELETE FROM extrato_transacoes; DELETE FROM pagamento_lote_itens; DELETE FROM lancamentos; DELETE FROM empresa_lancamentos; DELETE FROM pagamento_lotes;");
      }
    });
    await scenario("A100 + B200: quita 300 com 100/200, sem média", async () => {
      await action("confirmar", {valor_pago:300,principal_anterior:0});
      assert.deepEqual(await values(),[{valor:'100',valor_pago:'100.00',status:'baixado'},{valor:'200',valor_pago:'200.00',status:'pago'}]);
    });
    await scenario("pesos recebidos como média não substituem o saldo real de cada conta", async () => {
      await db.exec('UPDATE pagamento_lote_itens SET valor_pago=150');
      await action('confirmar',{valor_pago:300,principal_anterior:0});
      assert.deepEqual((await values()).map(x=>[x.valor,x.valor_pago]),[['100','100.00'],['200','200.00']]);
    });
    await scenario("parcial conserva as partes; estorno + cancelar recompõe exatamente 100/200", async () => {
      await action("confirmar", {valor_pago:150,principal_anterior:0,novo_vencimento_saldo:'2026-12-15'});
      assert.deepEqual((await values()).map(x=>[x.valor,x.valor_pago]),[['50.00','50.00'],['100.00','100.00']]);
      await action("estornar"); await action("cancelar");
      assert.deepEqual((await values()).map(x=>[x.valor,x.valor_pago]),[['100',null],['200',null]]);
      assert.equal((await db.query("SELECT * FROM pagamento_lotes")).rows.length,0);
    });
    await scenario("vários pagamentos e encargos estornam para o início do ciclo", async () => {
      await db.exec("UPDATE pagamento_lotes SET tipo='receber'; UPDATE lancamentos SET tipo='receber'; UPDATE empresa_lancamentos SET tipo='receber';");
      await action('confirmar',{valor_pago:150,valor_juros:3,valor_multa:6,valor_desconto:15});
      await action('confirmar',{requisicao_id:id(81),valor_pago:150,principal_anterior:150});
      assert.deepEqual((await values()).map(x=>x.valor_pago),['98.00','196.00']);
      await action('estornar');
      assert.deepEqual((await values()).map(x=>[x.valor,x.valor_pago]),[['100',null],['200',null]]);
      assert.equal((await db.query("SELECT estornado_em FROM pagamento_lote_baixas WHERE estornado_em IS NOT NULL")).rows.length,2);
    });
    await scenario("pagamento anterior ao agrupamento e sua data/banco são preservados", async () => {
      await db.exec(`UPDATE lancamentos SET valor=150,valor_pago=50,status='parcial',data_baixa='2026-10-01',conta_bancaria='${id(3)}' WHERE id='${id(30)}'`);
      await action('confirmar',{valor_pago:300}); await action('estornar');
      assert.deepEqual((await values())[0],{valor:'150',valor_pago:'50',status:'parcial'});
      const row=(await db.query("SELECT data_baixa::text,conta_bancaria FROM lancamentos")).rows[0];
      assert.deepEqual(row,{data_baixa:'2026-10-01',conta_bancaria:id(3)});
    });
    await scenario("reenvio não duplica; dados diferentes com o mesmo id são recusados", async () => {
      const payload={valor_pago:150,principal_anterior:0};
      await action('confirmar',payload); await action('confirmar',payload);
      assert.equal((await values())[0].valor_pago,'50.00');
      await assert.rejects(action('confirmar',{...payload,valor_pago:100}),/Identificação/);
      await assert.rejects(action('confirmar',{valor_pago:150,principal_anterior:0,requisicao_id:id(81)}),/outro pagamento/);
    });
    await scenario("falha no último título reverte todos os títulos e a baixa", async () => {
      await db.exec("CREATE FUNCTION falhar_titulo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha simulada'; END $$; CREATE TRIGGER z_falhar BEFORE UPDATE ON empresa_lancamentos FOR EACH ROW EXECUTE FUNCTION falhar_titulo();");
      try {await assert.rejects(action('confirmar',{valor_pago:300}),/Falha simulada/);}
      finally {await db.exec('DROP TRIGGER z_falhar ON empresa_lancamentos; DROP FUNCTION falhar_titulo();');}
      assert.deepEqual((await values()).map(x=>x.valor_pago),[null,null]);
      assert.equal((await db.query('SELECT * FROM pagamento_lote_baixas')).rows.length,0);
    });
    await scenario("estorno e desconciliação são atômicos", async () => {
      await action('confirmar',{valor_pago:300});
      await db.exec(`INSERT INTO extrato_transacoes(id,conciliado,lancamento_ids) VALUES('${id(60)}',true,ARRAY['${id(30)}','${id(31)}']::uuid[]); UPDATE pagamento_lotes SET conciliado=true; UPDATE lancamentos SET conciliado=true; UPDATE empresa_lancamentos SET conciliado=true;`);
      await action('estornar');
      assert.deepEqual((await db.query('SELECT conciliado,lancamento_ids FROM extrato_transacoes')).rows[0],{conciliado:false,lancamento_ids:null});
    });
    await scenario("valores alterados depois da baixa impedem estorno destrutivo", async () => {
      await action('confirmar',{valor_pago:300}); await db.exec('UPDATE lancamentos SET valor=101');
      await assert.rejects(action('estornar'),/alterado após/);
      assert.equal((await values())[0].valor_pago,'100.00');
    });
    await scenario("recusa conta de outro cliente, excesso, valores não finitos e cotação ausente", async () => {
      await assert.rejects(action('confirmar',{valor_pago:300},4),/mesmo cliente/);
      for(const valor_pago of [301,-1,0,'NaN','Infinity']) await assert.rejects(action('confirmar',{valor_pago}),/inválidos/);
      await db.exec("UPDATE lancamentos SET moeda='USD',cotacao_usd=NULL");
      await assert.rejects(action('confirmar',{valor_pago:300}),/cotação/);
    });
    await scenario("legado fragmentado não pode perder suas partes ao cancelar ou estornar", async () => {
      await db.exec('UPDATE pagamento_lotes SET pagamento_parcial=true');
      for(const acao of ['confirmar','estornar','cancelar']) await assert.rejects(action(acao,{valor_pago:300}),/antigo dividido/);
      assert.deepEqual((await values()).map(x=>x.valor),['100','200']);
    });
    await scenario("legado integral sem fotografia pode estornar mantendo os valores", async () => {
      await db.exec("UPDATE pagamento_lotes SET status='pago',valor_pago=300; UPDATE lancamentos SET status='baixado',valor_pago=100; UPDATE empresa_lancamentos SET status='pago',valor_pago=200;");
      await action('estornar'); await action('cancelar');
      assert.deepEqual((await values()).map(x=>[x.valor,x.valor_pago]),[['100',null],['200',null]]);
    });
    await scenario("saldo pago exige estornar a baixa seguinte antes de recompor a origem", async () => {
      await action('confirmar',{valor_pago:150});
      const saldo=(await db.query<{saldo_lote_id:string}>("SELECT saldo_lote_id FROM pagamento_lote_baixas")).rows[0].saldo_lote_id;
      await db.query("SELECT bordero_acao_atomica($1,'confirmar','2026-11-15',$2,$3)",[saldo,id(3),{requisicao_id:id(81),valor_pago:150,principal_anterior:0}]);
      await assert.rejects(action('estornar'),/saldo.*alterado ou pago/);
      await db.query("SELECT bordero_acao_atomica($1,'estornar')",[saldo]);
      await action('estornar'); await action('cancelar');
      assert.deepEqual((await values()).map(x=>[x.valor,x.valor_pago]),[['100',null],['200',null]]);
    });
    await scenario("centavo não pago pode mover um título inteiro e estornar sem perder vínculos", async () => {
      await action('confirmar',{valor_pago:.01});
      await action('estornar'); await action('cancelar');
      assert.deepEqual((await values()).map(x=>[x.valor,x.valor_pago]),[['100',null],['200',null]]);
      assert.equal((await db.query('SELECT id FROM lancamentos UNION ALL SELECT id FROM empresa_lancamentos')).rows.length,2);
    });
    await scenario("parcial com desconto recompõe bruto e encargos originais", async () => {
      await action('confirmar',{valor_pago:150,valor_desconto:30});
      assert.deepEqual((await values()).map(x=>[x.valor,x.valor_pago]),[['50.00','40.00'],['100.00','80.00']]);
      await action('estornar'); await action('cancelar');
      assert.deepEqual((await values()).map(x=>[x.valor,x.valor_pago]),[['100',null],['200',null]]);
    });
    await scenario("estorno preserva conciliação anterior e desfaz apenas a nova baixa", async () => {
      await db.exec(`UPDATE lancamentos SET valor=150,valor_pago=50,status='parcial',conciliado=true,data_baixa='2026-10-01',conta_bancaria='${id(3)}';
        INSERT INTO extrato_transacoes(id,conciliado,lancamento_id) VALUES('${id(60)}',true,'${id(30)}');`);
      await action('confirmar',{valor_pago:300});
      await db.exec(`INSERT INTO extrato_transacoes(id,conciliado,lancamento_ids) VALUES('${id(61)}',true,ARRAY['${id(30)}','${id(31)}']::uuid[]);`);
      await action('estornar');
      assert.deepEqual((await db.query<{conciliado:boolean}>('SELECT conciliado FROM extrato_transacoes ORDER BY id')).rows.map(x=>x.conciliado),[true,false]);
      assert.equal((await db.query<{conciliado:boolean}>('SELECT conciliado FROM lancamentos')).rows[0].conciliado,true);
    });
    await scenario("falha ao desconciliar reverte a recomposição e conserva todas as partes", async () => {
      await action('confirmar',{valor_pago:150});
      await db.exec(`INSERT INTO extrato_transacoes(id,conciliado,lancamento_ids) VALUES('${id(60)}',true,ARRAY['${id(30)}','${id(31)}']::uuid[]);
        CREATE FUNCTION falhar_extrato() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha extrato'; END $$;
        CREATE TRIGGER z_falhar BEFORE UPDATE ON extrato_transacoes FOR EACH ROW EXECUTE FUNCTION falhar_extrato();`);
      try {await assert.rejects(action('estornar'),/Falha extrato/);} finally {await db.exec('DROP TRIGGER z_falhar ON extrato_transacoes; DROP FUNCTION falhar_extrato();');}
      assert.equal((await db.query('SELECT * FROM pagamento_lotes')).rows.length,2);
      assert.equal((await values())[0].valor,'50.00');
      await action('estornar');assert.equal((await values())[0].valor,'100');
    });
    await scenario("criação incompleta sem títulos pode ser cancelada sem tocar em contas", async () => {
      await db.exec('DELETE FROM pagamento_lote_itens; UPDATE lancamentos SET lote_id=NULL; UPDATE empresa_lancamentos SET lote_id=NULL;');
      await action('cancelar');
      assert.equal((await db.query('SELECT * FROM pagamento_lotes')).rows.length,0);
      assert.deepEqual((await values()).map(x=>x.valor),['100','200']);
    });
    await scenario("função de escrita restrita ao servidor autenticado", async () => {
      await db.exec('SET ROLE authenticated');
      try {await assert.rejects(action('confirmar',{valor_pago:300}),/permission denied/);} finally {await db.exec('RESET ROLE');}
    });
  } finally {await db.close();}
});
