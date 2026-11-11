import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const source = readFileSync(new URL("../../supabase_migrations.sql", import.meta.url), "utf8");
const start = source.indexOf("-- Seção 432 —");
const end = source.indexOf("\n-- Seção ", start + 10);
const sql = source.slice(start, end < 0 ? undefined : end);

test("adiantamento atômico e atualização individual de previsões", async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE fazendas(id uuid PRIMARY KEY,conta_id uuid);
      CREATE TABLE funcionarios(id uuid PRIMARY KEY,fazenda_id uuid,nome text,empresa_id uuid,produtor_id uuid);
      CREATE TABLE contas_bancarias(id uuid PRIMARY KEY,fazenda_id uuid,conta_id uuid,ativa boolean,moeda text);
      CREATE TABLE operacoes_gerenciais(id uuid PRIMARY KEY,fazenda_id uuid,conta_id uuid,classificacao text,inativo boolean,descricao text,tipo text);
      CREATE TABLE lancamentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,empresa_id uuid,produtor_id uuid,funcionario_id uuid,
        tipo text,natureza text,descricao text,valor numeric,moeda text,status text,categoria text,origem_lancamento text,
        operacao_gerencial_id uuid,data_vencimento date,data_lancamento date,data_baixa date,valor_pago numeric,
        conta_bancaria uuid,previsao_gasto_id uuid,ano_safra_id uuid,conciliado boolean DEFAULT false,lote_id uuid,
        contrato_financeiro_id uuid,fatura_cartao_id uuid,titulo_origem_id uuid);
      CREATE TABLE folha_pagamento(id uuid PRIMARY KEY,fazenda_id uuid,empresa_id uuid,competencia text,status text,
        previsoes_sync_em timestamptz,data_vencimento date,valor_liquido numeric DEFAULT 0,cp_fgts_id uuid,cp_inss_patronal_id uuid);
      CREATE TABLE folha_funcionarios(id uuid PRIMARY KEY,folha_id uuid,funcionario_id uuid,nome_funcionario text,
        salario_bruto numeric DEFAULT 2000,inss_trabalhador numeric DEFAULT 200,irrf numeric DEFAULT 0,adiantamento numeric DEFAULT 0,
        outros_descontos numeric DEFAULT 0,vale_transporte numeric DEFAULT 0,vale_refeicao numeric DEFAULT 0,outros_beneficios numeric DEFAULT 0,
        complemento_salarial numeric DEFAULT 100,produtor_id uuid,cp_lancamento_id uuid,gratificacao numeric DEFAULT 0,
        salario_liquido numeric GENERATED ALWAYS AS (salario_bruto-inss_trabalhador-irrf-adiantamento-outros_descontos+vale_transporte+vale_refeicao+outros_beneficios+complemento_salarial) STORED);
      CREATE TABLE previsoes_gasto(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),conta_id uuid,fazenda_id uuid,produtor_id uuid,empresa_id uuid,
        operacao_gerencial_id uuid,og_classificacao text,ano_safra_id uuid,descricao text,valor numeric CHECK(valor>0),saldo numeric,
        data_vencimento date,status text,origem text,folha_id uuid,lancamento_previsao_id uuid,updated_at timestamptz DEFAULT now());
      CREATE TABLE adiantamentos_salario(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,funcionario_id uuid,data date,
        valor numeric CHECK(valor>0),competencia_ref text,descricao text,lancamento_id uuid,status text,tipo text DEFAULT 'salario',
        descontado_gratificacao_cp numeric NOT NULL DEFAULT 0,created_at timestamptz DEFAULT now());
      CREATE TABLE funcionarios_premiacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,funcionario_id uuid,mes_referencia text,
        valor numeric,descricao text,data_pagamento date,lancamento_id uuid,lancado_financeiro boolean,created_at timestamptz DEFAULT now());
      CREATE TABLE funcionario_premiacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),funcionario_id uuid,mes_referencia text,valor numeric);
      CREATE FUNCTION fn_ano_safra_da_data(uuid,date) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE TABLE alterados(tabela text,id uuid,acao text);
      CREATE FUNCTION registrar_alterado() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO alterados VALUES(TG_TABLE_NAME,coalesce(NEW.id,OLD.id),TG_OP); RETURN coalesce(NEW,OLD); END $$;
      CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON lancamentos FOR EACH ROW EXECUTE FUNCTION registrar_alterado();
      CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON folha_funcionarios FOR EACH ROW EXECUTE FUNCTION registrar_alterado();
    `);
    // Gatilhos reais das gratificações: o adiantamento abatido do CP não pode ser descontado duas vezes.
    const gratStart = source.indexOf("BEGIN;", source.indexOf("-- Seção 415 —"));
    const gratEnd = source.indexOf("-- Seção 416 —", gratStart);
    await db.exec(source.slice(gratStart, gratEnd));
    await db.exec(sql); await db.exec(sql);
    await db.exec(`
      INSERT INTO fazendas VALUES('${id(1)}','${id(10)}'),('${id(2)}','${id(11)}'),('${id(3)}','${id(10)}');
      INSERT INTO funcionarios VALUES('${id(20)}','${id(1)}','Ana','${id(15)}',NULL),('${id(21)}','${id(1)}','Bruno','${id(15)}',NULL);
      INSERT INTO contas_bancarias VALUES('${id(30)}','${id(1)}','${id(10)}',true,'BRL'),('${id(31)}','${id(2)}','${id(11)}',true,'BRL'),('${id(32)}','${id(3)}','${id(10)}',true,'BRL');
      INSERT INTO operacoes_gerenciais VALUES('${id(40)}','${id(1)}','${id(10)}','2.01.01.10.001',false,'Salário','despesa'),
        ('${id(41)}','${id(1)}','${id(10)}','2.01.01.09.002',false,'Adiantamento','despesa');
      INSERT INTO folha_pagamento(id,fazenda_id,empresa_id,competencia,status,valor_liquido,cp_fgts_id,cp_inss_patronal_id)
        VALUES('${id(50)}','${id(1)}','${id(15)}','2026-11','rascunho',3800,'${id(74)}','${id(75)}'),
        ('${id(51)}','${id(1)}','${id(15)}','2026-12','rascunho',1900,NULL,NULL);
      INSERT INTO lancamentos(id,fazenda_id,funcionario_id,valor,natureza,status,tipo,moeda,data_vencimento,operacao_gerencial_id,previsao_gasto_id)
        VALUES('${id(70)}','${id(1)}','${id(20)}',1900,'previsao','em_aberto','pagar','BRL','2026-12-05','${id(40)}','${id(80)}'),
        ('${id(71)}','${id(1)}','${id(21)}',1900,'previsao','em_aberto','pagar','BRL','2026-12-05','${id(40)}',NULL),
        ('${id(72)}','${id(1)}','${id(20)}',1900,'previsao','em_aberto','pagar','BRL','2027-01-05','${id(40)}',NULL),
        ('${id(74)}','${id(1)}',NULL,320,'previsao','em_aberto','pagar','BRL','2026-12-20','${id(40)}',NULL),
        ('${id(75)}','${id(1)}',NULL,800,'previsao','em_aberto','pagar','BRL','2026-12-20','${id(40)}',NULL);
      INSERT INTO folha_funcionarios(id,folha_id,funcionario_id,nome_funcionario,cp_lancamento_id)
        VALUES('${id(60)}','${id(50)}','${id(20)}','Ana','${id(70)}'),('${id(61)}','${id(50)}','${id(21)}','Bruno','${id(71)}'),
        ('${id(62)}','${id(51)}','${id(20)}','Ana','${id(72)}');
      INSERT INTO previsoes_gasto(id,conta_id,fazenda_id,valor,saldo,status,origem,folha_id,lancamento_previsao_id)
        VALUES('${id(80)}','${id(10)}','${id(1)}',1900,1900,'aberta','folha','${id(50)}','${id(70)}');
      DELETE FROM alterados;
    `);
    const payload = (extra = {}) => ({fazenda_id:id(1),funcionario_id:id(20),data:"2026-11-11",valor:300,
      competencia_ref:"2026-11",conta_bancaria:id(30),...extra});
    const criar = (extra = {}, requisicao = 90) => db.query<{r: Record<string, unknown>}>(
      'SELECT folha_criar_adiantamento($1,$2,$3) r',[payload(extra),id(requisicao),id(100)]);
    const estado = async (titulo = 70) => (await db.query<{valor:number;status:string;id:string}>(
      'SELECT id,valor,status FROM lancamentos WHERE id=$1',[id(titulo)])).rows[0];
    const scenario = (name: string, fn: () => Promise<void>) => t.test(name, async () => {
      await db.exec('SAVEPOINT caso'); try { await fn(); } finally { await db.exec('ROLLBACK TO SAVEPOINT caso; RELEASE SAVEPOINT caso'); }
    });
    await db.exec('BEGIN');
    await scenario('CP nasce pago; mantém IDs e altera só o empregado/competência, sem encargos',async()=>{
      const r=(await criar()).rows[0].r;
      assert.equal(r.baixado,true);
      assert.equal(Number((await estado()).valor),1600);
      assert.equal(Number((await estado(71)).valor),1900);
      assert.equal(Number((await estado(72)).valor),1900);
      const cp=(await db.query<Record<string, unknown>>('SELECT * FROM lancamentos WHERE id=$1',[r.lancamento_id])).rows[0];
      assert.equal(cp.status,'baixado'); assert.equal(Number(cp.valor_pago),300); assert.equal(cp.conta_bancaria,id(30));
      assert.equal(cp.empresa_id,id(15)); assert.equal(cp.funcionario_id,id(20));
      const prev=(await db.query<Record<string, unknown>>('SELECT valor,saldo FROM previsoes_gasto WHERE id=$1',[id(80)])).rows[0];
      assert.equal(Number(prev.valor),1600); assert.equal(Number(prev.saldo),1600);
      const changed=(await db.query<Record<string, unknown>>("SELECT id FROM alterados WHERE id IN($1,$2,$3,$4)",[id(61),id(71),id(74),id(75)])).rows;
      assert.deepEqual(changed,[]);
      assert.equal(Number((await db.query<Record<string, unknown>>('SELECT valor_liquido FROM folha_pagamento WHERE id=$1',[id(50)])).rows[0].valor_liquido),3500);
    });
    await scenario('reenvio é idempotente; mudar os dados com a mesma chave é rejeitado',async()=>{
      const a=(await criar()).rows[0].r; const b=(await criar()).rows[0].r;
      assert.equal(a.lancamento_id,b.lancamento_id); assert.equal(b.repetido,true);
      assert.deepEqual(b.folhas_atualizadas,a.folhas_atualizadas);
      assert.deepEqual(b.linhas_atualizadas,a.linhas_atualizadas);
      assert.equal((await db.query<Record<string, unknown>>('SELECT count(*) n FROM adiantamentos_salario')).rows[0].n,1);
      await assert.rejects(criar({valor:301}),/outros dados/);
    });
    await scenario('sem competência preserva desconto nos rascunhos elegíveis, apenas da pessoa',async()=>{
      await criar({competencia_ref:null});
      assert.equal(Number((await estado()).valor),1600); assert.equal(Number((await estado(72)).valor),1600);
      assert.equal(Number((await estado(71)).valor),1900);
    });
    await scenario('uma competência sem rascunho não reprocessa os outros meses',async()=>{
      await criar({competencia_ref:'2026-10'});
      assert.equal(Number((await estado()).valor),1900);
      assert.equal((await db.query<Record<string, unknown>>("SELECT count(*) n FROM alterados WHERE tabela='folha_funcionarios'")).rows[0].n,0);
    });
    await scenario('64 folhas futuras e 1.088 linhas permanecem intactas no lançamento do mês',async()=>{
      await db.exec(`WITH novas AS (
        INSERT INTO folha_pagamento(id,fazenda_id,empresa_id,competencia,status)
        SELECT gen_random_uuid(),'${id(1)}','${id(15)}',to_char(date '2026-11-01'+n*interval '1 month','YYYY-MM'),'rascunho'
        FROM generate_series(1,64) n RETURNING id
      ) INSERT INTO folha_funcionarios(id,folha_id,funcionario_id,nome_funcionario)
        SELECT gen_random_uuid(),f.id,CASE WHEN n=1 THEN '${id(20)}'::uuid ELSE '${id(21)}'::uuid END,'Teste'
        FROM novas f CROSS JOIN generate_series(1,17) n;
        DELETE FROM alterados;`);
      await criar();
      const novos=(await db.query<Record<string, unknown>>("SELECT count(*) n FROM alterados WHERE tabela='lancamentos' AND acao='INSERT'")).rows[0];
      assert.equal(novos.n,1); // Somente o CP do próprio adiantamento.
      const intactas=await db.query<Record<string, unknown>>(`SELECT count(*) n FROM folha_funcionarios ff JOIN folha_pagamento f ON f.id=ff.folha_id
        WHERE f.id NOT IN($1,$2) AND ff.adiantamento=0 AND ff.cp_lancamento_id IS NULL`,[id(50),id(51)]);
      assert.equal(intactas.rows[0].n,1088);
    });
    for(const [name,patch] of [['pago',"status='baixado',valor_pago=1900"],['real',"natureza='real'"],
      ['conciliado','conciliado=true'],['borderô',`lote_id='${id(500)}'`],['parcial',"status='parcial'"],['cancelado',"status='cancelado'"]]) {
      await scenario(`previsão protegida (${name}) conserva valor e vínculo`,async()=>{
        await db.exec(`UPDATE lancamentos SET ${patch} WHERE id='${id(70)}'; DELETE FROM alterados;`);
        await criar(); assert.equal(Number((await estado()).valor),1900);
        assert.equal((await db.query<Record<string, unknown>>('SELECT cp_lancamento_id FROM folha_funcionarios WHERE id=$1',[id(60)])).rows[0].cp_lancamento_id,id(70));
      });
    }
    await scenario('folha fechada conserva a linha e o título',async()=>{
      await db.exec(`UPDATE folha_pagamento SET status='fechado' WHERE id='${id(50)}'`);
      await criar();assert.equal(Number((await estado()).valor),1900);
    });
    await scenario('trava da folha interrompe e reverte inclusive adiantamento e baixa',async()=>{
      await db.exec(`UPDATE folha_pagamento SET previsoes_sync_em=clock_timestamp() WHERE id='${id(50)}'`);
      await assert.rejects(criar(),/sendo atualizada/);
    });
    await scenario('conta de outro cliente bloqueia; outra fazenda do mesmo cliente funciona',async()=>{
      await assert.rejects(criar({conta_bancaria:id(31)}),/mesmo cliente/);
    });
    await scenario('conta compartilhada no cliente é aceita',async()=>{await criar({conta_bancaria:id(32)});});
    await scenario('fazenda incompatível com o funcionário é recusada',async()=>{await assert.rejects(criar({fazenda_id:id(2)}),/não pertence/);});
    await scenario('gratificação é compensada no CP separado e não descontada novamente do salário',async()=>{
      await db.exec(`INSERT INTO funcionarios_premiacoes(funcionario_id,mes_referencia,valor,descricao,lancado_financeiro)
        VALUES('${id(20)}','2026-11',1000,'Prêmio',true)`);
      const r=(await criar({tipo:'gratificacao',valor:300})).rows[0].r;
      assert.equal(Number((r.adiantamento as {descontado_gratificacao_cp:number}).descontado_gratificacao_cp),300);
      assert.equal(Number((await estado()).valor),1900);
      const p=(await db.query<Record<string, unknown>>('SELECT l.valor FROM funcionarios_premiacoes p JOIN lancamentos l ON l.id=p.lancamento_id')).rows[0];
      assert.equal(Number(p.valor),700);
    });
    await scenario('gratificação já paga impede adiantamento e nenhuma parte do pagamento persiste',async()=>{
      await db.exec(`INSERT INTO funcionarios_premiacoes(funcionario_id,mes_referencia,valor,descricao,lancado_financeiro)
        VALUES('${id(20)}','2026-11',1000,'Prêmio',true);
        UPDATE lancamentos SET status='baixado',valor_pago=valor WHERE id IN(SELECT lancamento_id FROM funcionarios_premiacoes)`);
      await assert.rejects(criar({tipo:'gratificacao'}),/já tem pagamento/);
    });
    await scenario('falha na previsão reverte o adiantamento, a baixa e a alteração do salário',async()=>{
      await db.exec(`CREATE FUNCTION falha_prev() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha de teste'; END $$;
        CREATE TRIGGER falhar BEFORE UPDATE ON previsoes_gasto FOR EACH ROW EXECUTE FUNCTION falha_prev();`);
      await db.exec('SAVEPOINT operacao');
      await assert.rejects(criar(),/falha de teste/);
      await db.exec('ROLLBACK TO SAVEPOINT operacao; RELEASE SAVEPOINT operacao');
      assert.equal((await db.query<Record<string, unknown>>('SELECT count(*) n FROM adiantamentos_salario')).rows[0].n,0);
      assert.equal((await db.query<Record<string, unknown>>("SELECT count(*) n FROM lancamentos WHERE status='baixado'")).rows[0].n,0);
      assert.equal(Number((await estado()).valor),1900);
    });
    await scenario('salário sem CP recebe somente a previsão da pessoa',async()=>{
      await db.exec(`UPDATE folha_funcionarios SET cp_lancamento_id=NULL WHERE id='${id(60)}'`);
      const r=(await criar()).rows[0].r;
      const linha=(r.linhas_atualizadas as {cp_lancamento_id:string}[])[0];
      assert.ok(linha.cp_lancamento_id);assert.notEqual(linha.cp_lancamento_id,id(70));
      assert.equal(Number((await db.query<Record<string, unknown>>('SELECT valor FROM lancamentos WHERE id=$1',[linha.cp_lancamento_id])).rows[0].valor),1600);
    });
    await scenario('saldo salarial zero encerra a previsão sem violar valor positivo e pode ser restaurado',async()=>{
      await criar({valor:1900});assert.equal((await estado()).status,'cancelado');
      await db.exec(`UPDATE adiantamentos_salario SET status='cancelado'; SELECT folha_sincronizar_adiantamento('${id(20)}',ARRAY['2026-11']);`);
      assert.equal(Number((await estado()).valor),1900);assert.equal((await estado()).status,'em_aberto');
    });
    await db.exec('ROLLBACK');
    await t.test('sem grants para authenticated/anon nas funções financeiras',async()=>{
      const r=await db.query<Record<string, unknown>>("SELECT has_function_privilege('authenticated','folha_criar_adiantamento(jsonb,uuid,uuid)','EXECUTE') a,has_function_privilege('anon','folha_sincronizar_adiantamento(uuid,text[])','EXECUTE') b");
      assert.deepEqual(r.rows[0],{a:false,b:false});
    });
  } finally {await db.close();}
});
