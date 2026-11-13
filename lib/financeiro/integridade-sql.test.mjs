import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Executa exatamente as seções que serão aplicadas; não mantém uma segunda cópia das migrações.
const migrations = readFileSync(new URL('../../supabase_migrations.sql', import.meta.url), 'utf8');
function secao(n) {
 const inicio = migrations.indexOf(`-- Seção ${n} —`);
 assert.ok(inicio >= 0, `Seção ${n} ausente`);
 const proxima = migrations.indexOf(`-- Seção ${n + 1} —`, inicio + 1);
 return migrations.slice(inicio, proxima < 0 ? undefined : proxima);
}
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
test("comandos financeiros: baixa, saldo, reenvio, falha e estorno no SQL real", async (t) => {
    const db = new PGlite();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE fazendas(id uuid PRIMARY KEY,conta_id uuid);
      CREATE TABLE contas_bancarias(id uuid PRIMARY KEY,fazenda_id uuid,conta_id uuid,ativa boolean DEFAULT true,moeda text DEFAULT 'BRL');
      CREATE TABLE lancamentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),fazenda_id uuid,
        tipo text DEFAULT 'pagar',status text DEFAULT 'em_aberto',natureza text DEFAULT 'real',valor numeric,valor_pago numeric,
        moeda text DEFAULT 'BRL',cotacao_usd numeric,valor_juros numeric,valor_multa numeric,valor_desconto numeric,
        data_baixa date,data_pagamento date,data_vencimento date,data_prorrogacao date,conta_bancaria uuid,conciliado boolean DEFAULT false,
        lote_id uuid,contrato_financeiro_id uuid,fatura_cartao_id uuid,titulo_origem_id uuid,valor_titulo_origem numeric,
        pagamento_parcial boolean DEFAULT false,vencimento_saldo date,observacao text,forma_pagamento text,
        pessoa_id uuid,produtor_id uuid,empresa_id uuid,ano_safra_id uuid,ciclo_id uuid,centro_custo_id uuid,operacao_gerencial_id uuid,
        categoria text,descricao text,auto boolean,data_lancamento date,origem_lancamento text,pedido_compra_id uuid,nf_entrada_id uuid,previsao_gasto_id uuid);
      CREATE TABLE empresa_lancamentos(LIKE lancamentos INCLUDING ALL);
      CREATE TABLE pagamento_lotes(id uuid PRIMARY KEY,status text);
      CREATE TABLE pagamento_lote_itens(lote_id uuid,lancamento_id uuid,origem_tabela text);
      CREATE TABLE adiantamentos_fornecedor(lancamento_id uuid,status text);
      CREATE TABLE pedidos_compra(id uuid PRIMARY KEY,fazenda_id uuid,fornecedor_id uuid,status text,lancamento_id uuid,total_financeiro numeric,nr_pedido text,operacao text);
      CREATE TABLE contas(id uuid PRIMARY KEY);
      CREATE TABLE produtores(id uuid PRIMARY KEY,fazenda_id uuid);
      CREATE TABLE pessoas(id uuid PRIMARY KEY,fazenda_id uuid,conta_id uuid);
      CREATE TABLE operacoes_gerenciais(id uuid PRIMARY KEY,fazenda_id uuid,conta_id uuid,classificacao text,descricao text);
      CREATE FUNCTION fn_ano_safra_da_data(uuid,date) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE TABLE parcelas_pagamento(lancamento_id uuid,status text CHECK(status IN ('em_aberto','pago','vencido')),data_pagamento date,contrato_id uuid,data_vencimento date);
      CREATE TABLE extrato_transacoes(id uuid PRIMARY KEY,conciliado boolean,lancamento_id uuid,lancamento_ids uuid[],lancamento_desc text,
        lancamento_valor numeric,origem_vinculo text,confianca text,regra_id uuid,updated_at timestamptz);
      INSERT INTO fazendas VALUES('${id(1)}','${id(10)}'),('${id(2)}','${id(20)}');
      INSERT INTO contas_bancarias(id,fazenda_id) VALUES('${id(3)}','${id(1)}'),('${id(4)}','${id(2)}');
      INSERT INTO contas VALUES('${id(10)}'),('${id(20)}');
      INSERT INTO operacoes_gerenciais VALUES('${id(11)}',NULL,NULL,'2.1','Despesa');`);
        await db.exec(secao(434));
        await db.exec(`CREATE TRIGGER trg_0_dividir_titulo_parcial BEFORE UPDATE ON lancamentos FOR EACH ROW EXECUTE FUNCTION fn_dividir_titulo_parcial();
      CREATE TRIGGER trg_0_dividir_titulo_parcial BEFORE UPDATE ON empresa_lancamentos FOR EACH ROW EXECUTE FUNCTION fn_dividir_titulo_parcial();`);
        const seed = async (table = "lancamentos") => {
            await db.exec("TRUNCATE lancamentos,empresa_lancamentos,financeiro_operacoes,parcelas_pagamento,pagamento_lote_itens,pagamento_lotes,extrato_transacoes,adiantamentos_fornecedor,pedidos_compra CASCADE");
            await db.query(`INSERT INTO ${table}(id,fazenda_id,valor,data_vencimento) VALUES($1,$2,100,'2026-12-05')`, [id(5), id(1)]);
        };
        const run = (value, key = 90, more = {}, table = "lancamentos", action = "baixar") => db.query("SELECT financeiro_comando_titulo($1,$2,$3,$4,$5) r", [table, id(5), action, { valor_pago_agora: value, data_baixa: "2026-11-11", conta_bancaria: id(3), ...more }, id(key)]);
        await t.test("quitação conserva o valor original e guarda a confirmação", async () => {
            await seed();
            assert.equal((await run(100)).rows[0].r.novo_status, "baixado");
            const r = (await db.query("SELECT valor,valor_pago FROM lancamentos")).rows[0];
            assert.equal(r.valor, "100");
            assert.equal(r.valor_pago, "100.00");
        });
        await t.test("repetir a requisição devolve a mesma baixa", async () => {
            await seed();
            await run(100);
            assert.equal((await run(100)).rows[0].r.repetido, true);
            assert.equal((await db.query("SELECT count(*) n FROM financeiro_operacoes")).rows[0].n, 1);
            await assert.rejects(run(90), /outros dados/);
        });
        await t.test("parcial com juros e desconto conserva o principal", async () => {
            await seed();
            await run(60, 90, { juros_valor: 15, desconto_valor: 5 });
            const rows = (await db.query("SELECT valor,valor_pago,status,valor_juros,valor_desconto FROM lancamentos ORDER BY status")).rows;
            assert.equal(rows.reduce((s, r) => s + Number(r.valor), 0), 100);
            const pago = rows.find(r => r.status === 'baixado');
            assert.equal(Number(pago.valor), 50);
            assert.equal(Number(pago.valor_pago), 60);
            assert.equal(Number(rows.find(r => r.status === 'em_aberto').valor), 50);
        });
        await t.test("duas baixas em parcial antigo acumulam sem perder atualização", async () => {
            await seed();
            await db.exec(`DELETE FROM lancamentos; INSERT INTO lancamentos(id,fazenda_id,valor,valor_pago,status) VALUES('${id(5)}','${id(1)}',1000,100,'parcial')`);
            await Promise.all([run(100, 90), run(100, 91)]);
            assert.equal(Number((await db.query("SELECT valor_pago FROM lancamentos")).rows[0].valor_pago), 300);
        });
        await t.test('barter: confirma entrega sem exigir conta bancária',async()=>{
          await seed();await db.exec("UPDATE lancamentos SET moeda='barter'");
          await run(100,90,{conta_bancaria:null});
          const row=(await db.query('SELECT status,conta_bancaria FROM lancamentos')).rows[0];
          assert.equal(row.status,'baixado');assert.equal(row.conta_bancaria,null);
        });
        await t.test('parcial antigo: preserva juros e desconto anteriores nos pagamentos seguintes',async()=>{
          await seed();await db.exec(`DELETE FROM lancamentos; INSERT INTO lancamentos(id,fazenda_id,valor,status,valor_pago,valor_juros,valor_desconto) VALUES('${id(5)}','${id(1)}',1000,'parcial',100,10,5)`);
          await run(100,90,{juros_valor:0,multa_valor:0,desconto_valor:0});
          const row=(await db.query('SELECT * FROM lancamentos')).rows[0];
          assert.equal(Number(row.valor_pago),200);assert.equal(Number(row.valor_juros),10);assert.equal(Number(row.valor_desconto),5);
          assert.equal(Number(row.valor)-Number(row.valor_pago)+Number(row.valor_juros)-Number(row.valor_desconto),805);
        });
        await t.test('contrato: parcela legada sem backlink acompanha a baixa',async()=>{
          await seed();await db.exec(`UPDATE lancamentos SET contrato_financeiro_id='${id(77)}';INSERT INTO parcelas_pagamento(contrato_id,data_vencimento,status) VALUES('${id(77)}','2026-12-05','em_aberto')`);
          await run(100);assert.equal((await db.query('SELECT status FROM parcelas_pagamento')).rows[0].status,'pago');
        });
        await t.test("recusa negativo, excesso, previsão, conta de outro cliente e ação em borderô", async () => {
            await seed();
            await assert.rejects(run(-1), /não negativos/);
            await assert.rejects(run(101), /incompatível/);
            await assert.rejects(run(100, 90, { conta_bancaria: id(4) }), /outro cliente/);
            await db.exec("UPDATE lancamentos SET natureza='previsao'");
            await assert.rejects(run(100), /Efetive/);
            await db.exec(`UPDATE lancamentos SET natureza='real';INSERT INTO pagamento_lotes VALUES('${id(8)}','pendente'); INSERT INTO pagamento_lote_itens VALUES('${id(8)}','${id(5)}','lancamentos')`);
            await assert.rejects(run(100), /borderô/);
        });
        await t.test("falha ao sincronizar parcela reverte a baixa inteira", async () => {
            await seed();
            await db.exec(`INSERT INTO parcelas_pagamento(lancamento_id,status,data_pagamento) VALUES('${id(5)}','em_aberto',NULL);
        CREATE FUNCTION falha_parcela() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha simulada'; END $$;
        CREATE TRIGGER falha BEFORE UPDATE ON parcelas_pagamento FOR EACH ROW EXECUTE FUNCTION falha_parcela();`);
            await assert.rejects(run(100), /Falha simulada/);
            assert.equal((await db.query("SELECT status FROM lancamentos")).rows[0].status, 'em_aberto');
            assert.equal((await db.query("SELECT count(*) n FROM financeiro_operacoes")).rows[0].n, 0);
            await db.exec("DROP TRIGGER falha ON parcelas_pagamento");
        });
        for (const table of ['lancamentos', 'empresa_lancamentos'])
            await t.test(`estorno ${table} limpa encargos e conciliação sem mudar o principal`, async () => {
                await seed(table);
                await run(110, 90, { juros_valor: 10 }, table);
                await db.query(`INSERT INTO extrato_transacoes(id,conciliado,lancamento_id,lancamento_ids) VALUES($1,true,$2,ARRAY[$2::uuid])`, [id(6), id(5)]);
                await run(0, 91, {}, table, 'reabrir');
                const row = (await db.query(`SELECT * FROM ${table}`)).rows[0];
                assert.equal(Number(row.valor), 100);
                assert.equal(row.valor_juros, null);
                assert.equal(row.valor_pago, null);
                assert.equal(row.conta_bancaria, null);
                assert.equal((await db.query("SELECT conciliado FROM extrato_transacoes")).rows[0].conciliado, false);
            });
        await t.test("pedido: duas gerações usam o mesmo título e não aceitam fazenda divergente", async () => {
            await seed();
            await db.exec(`INSERT INTO pedidos_compra(id,fazenda_id,status,total_financeiro) VALUES('${id(12)}','${id(1)}','aprovado',200)`);
            const body = { fazenda_id: id(1), valor_total: 200, moeda: 'BRL', data_registro: '2026-11-11' };
            const results = await Promise.all([db.query("SELECT compras_gerar_financeiro_atomico($1,$2) r", [id(12), body]), db.query("SELECT compras_gerar_financeiro_atomico($1,$2) r", [id(12), body])]);
            assert.deepEqual(results[0].rows[0].r.lancamento_id, results[1].rows[0].r.lancamento_id);
            assert.equal((await db.query("SELECT count(*) n FROM lancamentos WHERE origem_lancamento='pedido_compra'")).rows[0].n, 1);
            await assert.rejects(db.query("SELECT compras_gerar_financeiro_atomico($1,$2)", [id(12), { ...body, fazenda_id: id(2) }]), /fazenda/);
        });
        await t.test("pedido: erro ao vincular reverte o novo CP", async () => {
            await seed();
            await db.exec(`INSERT INTO pedidos_compra(id,fazenda_id,status,total_financeiro) VALUES('${id(12)}','${id(1)}','aprovado',200);
        CREATE TRIGGER falha BEFORE UPDATE ON pedidos_compra FOR EACH ROW EXECUTE FUNCTION falha_parcela();`);
            await assert.rejects(db.query("SELECT compras_gerar_financeiro_atomico($1,$2)", [id(12), { fazenda_id: id(1), moeda: 'BRL', data_registro: '2026-11-11' }]), /Falha simulada/);
            assert.equal((await db.query("SELECT count(*) n FROM lancamentos WHERE origem_lancamento='pedido_compra'")).rows[0].n, 0);
            await db.exec("DROP TRIGGER falha ON pedidos_compra");
        });
        for (const table of ['previsoes_gasto', 'previsoes_gasto_consumos', 'previsoes_config']) {
            const definition = migrations.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
            assert.ok(definition, table);
            await db.exec(definition[0]);
        }
        await db.exec(secao(435));
        const createPrev = async (key = 95) => (await db.query("SELECT previsoes_comando_atomico(NULL,'criar',$1,NULL,$2) r", [
            { linhas: [{ fazenda_id: id(1), conta_id: id(10), operacao_gerencial_id: id(11), valor: 100, data_vencimento: '2026-12-05' }] }, id(key)
        ])).rows[0].r.linhas[0];
        const consume = (prev, title, more = {}) => db.query("SELECT previsoes_comando_atomico($1,'consumir',$2) r", [prev, { valor: 100, origem: 'cp_manual', lancamento_id: title, ...more }]);
        await t.test("previsão: criação e título juntos, reenvio sem duplicação", async () => {
            await seed();
            const a = await createPrev();
            const b = await createPrev();
            assert.equal(a.id, b.id);
            assert.equal((await db.query('SELECT count(*) n FROM previsoes_gasto')).rows[0].n, 1);
        });
        await t.test("previsão: erro no título desfaz a criação da previsão", async () => {
            await seed();
            await db.exec('CREATE TRIGGER falha BEFORE INSERT ON lancamentos FOR EACH ROW EXECUTE FUNCTION falha_parcela()');
            await assert.rejects(createPrev(), /Falha simulada/);
            assert.equal((await db.query('SELECT count(*) n FROM previsoes_gasto')).rows[0].n, 0);
            await db.exec('DROP TRIGGER falha ON lancamentos');
        });
        await t.test("previsão: falha depois do consumo restaura título, saldo e consumo", async () => {
            await seed();
            const p = await createPrev();
            await db.exec('CREATE TRIGGER falha BEFORE INSERT ON lancamentos FOR EACH ROW EXECUTE FUNCTION falha_parcela()');
            await assert.rejects(consume(p.id, p.lancamento_previsao_id, { valor: 80, origem: 'efetivar_cp', campos_titulo: { valor: 80, moeda: 'BRL' } }), /Falha simulada/);
            assert.equal((await db.query('SELECT count(*) n FROM previsoes_gasto_consumos')).rows[0].n, 0);
            assert.equal((await db.query('SELECT natureza FROM lancamentos WHERE id=$1', [p.lancamento_previsao_id])).rows[0].natureza, 'previsao');
            await db.exec('DROP TRIGGER falha ON lancamentos');
        });
        await t.test("previsão: consumo repetido é idempotente; outro documento não usa saldo encerrado", async () => {
            await seed();
            const p = await createPrev();
            await consume(p.id, id(5));
            assert.equal((await consume(p.id, id(5))).rows[0].r.repetido, true);
            assert.equal((await db.query('SELECT count(*) n FROM previsoes_gasto_consumos')).rows[0].n, 1);
            await db.query('INSERT INTO lancamentos(id,fazenda_id,valor) VALUES($1,$2,100)', [id(7), id(1)]);
            await assert.rejects(consume(p.id, id(7)), /consumida/);
        });
        await t.test("previsão: efetivação atualiza o título e consome o orçamento na mesma transação", async () => {
            await seed();
            const p = await createPrev();
            await consume(p.id, p.lancamento_previsao_id, { origem: 'efetivar_cp', campos_titulo: { valor: 100, observacao: 'Conferido', moeda: 'BRL' } });
            assert.equal((await db.query('SELECT natureza,observacao FROM lancamentos WHERE id=$1', [p.lancamento_previsao_id])).rows[0].natureza, 'real');
            assert.equal((await db.query('SELECT saldo FROM previsoes_gasto')).rows[0].saldo, '0.00');
        });
        await db.exec(`CREATE TABLE insumos(id uuid PRIMARY KEY,fazenda_id uuid,estoque numeric DEFAULT 0);
          CREATE TABLE bombas_combustivel(id uuid PRIMARY KEY,fazenda_id uuid,insumo_id uuid,consume_estoque boolean,estoque_atual_l numeric);
          CREATE TABLE abastecimentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,bomba_id uuid,maquina_id uuid,funcionario_id uuid,
            destino_livre text,quantidade_l numeric,valor_unitario numeric,valor_total numeric,data date,horimetro numeric,ano_safra_id uuid,ciclo_id uuid,observacao text,lancamento_id uuid);
          CREATE TABLE movimentacoes_estoque(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,insumo_id uuid,tipo text,motivo text,
            quantidade numeric,valor_unitario numeric,data date,auto boolean,observacao text);
          CREATE TABLE pendencias_fiscais(abastecimento_id uuid,lancamento_id uuid);`);
        const stockStart=migrations.indexOf('CREATE OR REPLACE FUNCTION fn_estoque_recalcular(');
        await db.exec(migrations.slice(stockStart,migrations.indexOf('CREATE OR REPLACE FUNCTION fn_insumos_saldo_inicial()',stockStart)));
        await db.exec(secao(436));
        const stockSeed=async()=>{await seed();await db.exec(`TRUNCATE bombas_combustivel,abastecimentos,movimentacoes_estoque,insumos CASCADE;
          INSERT INTO insumos VALUES('${id(21)}','${id(1)}',0);
          INSERT INTO movimentacoes_estoque(fazenda_id,insumo_id,tipo,motivo,quantidade,data) VALUES('${id(1)}','${id(21)}','entrada','compra',1000,'2026-11-01');
          INSERT INTO bombas_combustivel VALUES('${id(22)}','${id(1)}','${id(21)}',true,1000),('${id(23)}','${id(2)}',NULL,false,0);`);};
        const stock=(more={},key=100)=>db.query("SELECT abastecimento_comando_atomico($1,$2,$3) r",[id(1),{acao:'criar',bomba_id:id(22),quantidade_l:100,valor_unitario:5,data:'2026-11-11',destino_tipo:'livre',destino_livre:'Consumo',...more},id(key)]);
        await t.test('abastecimento: cria, edita e exclui conservando bomba e estoque',async()=>{
          await stockSeed();const a=(await stock()).rows[0].r.id;
          await stock({acao:'editar',abastecimento_id:a,quantidade_l:200,quantidade_anterior:100},101);
          assert.equal(Number((await db.query('SELECT estoque FROM insumos')).rows[0].estoque),800);
          assert.equal(Number((await db.query('SELECT quantidade FROM movimentacoes_estoque WHERE abastecimento_id=$1',[a])).rows[0].quantidade),200);
          assert.equal(Number((await db.query('SELECT estoque_atual_l FROM bombas_combustivel WHERE id=$1',[id(22)])).rows[0].estoque_atual_l),800);
          await stock({acao:'excluir',abastecimento_id:a},102);
          assert.equal(Number((await db.query('SELECT estoque FROM insumos')).rows[0].estoque),1000);
        });
        await t.test('abastecimento: repetição não duplica; bomba de outro cliente é recusada',async()=>{
          await stockSeed();const a=(await stock()).rows[0].r.id;assert.equal((await stock()).rows[0].r.id,a);
          assert.equal((await db.query('SELECT count(*) n FROM abastecimentos')).rows[0].n,1);
          await assert.rejects(stock({bomba_id:id(23)},101),/outro cliente/);
        });
        await t.test('abastecimento: erro na movimentação desfaz registro e baixa da bomba',async()=>{
          await stockSeed();await db.exec('CREATE TRIGGER falha BEFORE INSERT ON movimentacoes_estoque FOR EACH ROW EXECUTE FUNCTION falha_parcela()');
          await assert.rejects(stock(),/Falha simulada/);
          assert.equal((await db.query('SELECT count(*) n FROM abastecimentos')).rows[0].n,0);
          assert.equal(Number((await db.query('SELECT estoque_atual_l FROM bombas_combustivel WHERE id=$1',[id(22)])).rows[0].estoque_atual_l),1000);
          await db.exec('DROP TRIGGER falha ON movimentacoes_estoque');
        });
        await t.test('abastecimento: duas requisições não usam o mesmo saldo físico',async()=>{
          await stockSeed();const r=await Promise.allSettled([stock({quantidade_l:900},100),stock({quantidade_l:900},101)]);
          assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal((await db.query('SELECT count(*) n FROM abastecimentos')).rows[0].n,1);
        });
        await t.test('abastecimento: legado único é associado; legado ambíguo não é modificado',async()=>{
          await stockSeed();await db.exec(`INSERT INTO abastecimentos(id,fazenda_id,bomba_id,quantidade_l,valor_unitario,valor_total,data) VALUES('${id(24)}','${id(1)}','${id(22)}',100,5,500,'2026-11-11');
            UPDATE bombas_combustivel SET estoque_atual_l=900 WHERE id='${id(22)}';
            INSERT INTO movimentacoes_estoque(fazenda_id,insumo_id,tipo,motivo,quantidade,valor_unitario,data) VALUES('${id(1)}','${id(21)}','saida','abastecimento',100,5,'2026-11-11');`);
          await stock({acao:'editar',abastecimento_id:id(24),quantidade_l:200},100);
          assert.equal(Number((await db.query('SELECT estoque FROM insumos')).rows[0].estoque),800);
          await db.exec('UPDATE movimentacoes_estoque SET abastecimento_id=NULL WHERE tipo=\'saida\'');
          await db.exec(`INSERT INTO movimentacoes_estoque(fazenda_id,insumo_id,tipo,motivo,quantidade,valor_unitario,data) VALUES('${id(1)}','${id(21)}','saida','abastecimento',200,5,'2026-11-11')`);
          await assert.rejects(stock({acao:'editar',abastecimento_id:id(24),quantidade_l:300},101),/única/);
          assert.equal(Number((await db.query('SELECT quantidade_l FROM abastecimentos')).rows[0].quantidade_l),200);
        });
        await db.exec(`CREATE TABLE depositos(id uuid PRIMARY KEY,fazenda_id uuid);
          CREATE TABLE audit_log(id uuid PRIMARY KEY,acao text,tabela text);
          ALTER TABLE movimentacoes_estoque ADD COLUMN deposito_id uuid,ADD COLUMN variedade text,ADD COLUMN lote_semente text;`);
        await db.exec(secao(439));
        const manual=(more={},key=110)=>db.query('SELECT estoque_movimento_manual($1,$2,$3) r',[id(1),{insumo_id:id(21),tipo:'ajuste',motivo:'ajuste_saldo',quantidade_nova:70,deposito_id:id(25),data:'2026-11-11',observacao:'Contagem física',...more},id(key)]);
        await t.test('estoque: ajuste usa apenas o local selecionado e repetição não duplica',async()=>{
          await stockSeed();await db.exec(`TRUNCATE depositos;INSERT INTO depositos VALUES('${id(25)}','${id(1)}'),('${id(26)}','${id(2)}');
           INSERT INTO movimentacoes_estoque(fazenda_id,insumo_id,tipo,quantidade,deposito_id) VALUES('${id(1)}','${id(21)}','entrada',50,'${id(25)}');`);
          await manual();await manual();
          assert.equal(Number((await db.query('SELECT estoque FROM insumos')).rows[0].estoque),1070);
          assert.equal(Number((await db.query("SELECT quantidade FROM movimentacoes_estoque WHERE tipo='ajuste'")).rows[0].quantidade),20);
          await assert.rejects(manual({deposito_id:id(26)},111),/depósito/);
        });
        await t.test('estoque: falha no movimento não muda o saldo nem confirma operação',async()=>{
          await stockSeed();await db.exec('CREATE TRIGGER falha BEFORE INSERT ON movimentacoes_estoque FOR EACH ROW EXECUTE FUNCTION falha_parcela()');
          await assert.rejects(manual({tipo:'saida',quantidade:10,deposito_id:null}),/Falha simulada/);
          assert.equal(Number((await db.query('SELECT estoque FROM insumos')).rows[0].estoque),1000);
          assert.equal((await db.query('SELECT count(*) n FROM financeiro_operacoes')).rows[0].n,0);
          await db.exec('DROP TRIGGER falha ON movimentacoes_estoque');
        });
        await db.exec(`ALTER TABLE contas ADD COLUMN status text;
          CREATE TABLE assinaturas(id uuid PRIMARY KEY,status text,updated_at timestamptz);
          CREATE TABLE pagamentos(id uuid PRIMARY KEY,asaas_payment_id text,conta_id uuid,assinatura_id uuid,status text,data_pagamento date);`);
        await db.exec(secao(437));
        const event=(idEvent='evento-1',eventName='PAYMENT_RECEIVED',status='pago')=>db.query('SELECT asaas_processar_evento($1,$2) r',[{id:idEvent,event:eventName,payment_id:'pay-1'},status]);
        const eventSeed=async()=>{await db.exec(`TRUNCATE pagamentos,assinaturas,asaas_eventos_processados;UPDATE contas SET status='inativo';
          INSERT INTO assinaturas VALUES('${id(31)}','inativa',NULL);INSERT INTO pagamentos VALUES('${id(30)}','pay-1','${id(10)}','${id(31)}','pendente',NULL);`);};
        await t.test('webhook: repetições não duplicam e evento atrasado não regride pagamento',async()=>{
          await eventSeed();await event();assert.equal((await event()).rows[0].r.repetido,true);
          await event('evento-2','PAYMENT_OVERDUE','vencido');assert.equal((await db.query('SELECT status FROM pagamentos')).rows[0].status,'pago');
          assert.equal((await db.query('SELECT status FROM contas WHERE id=$1',[id(10)])).rows[0].status,'ativo');
        });
        await t.test('webhook: falha na conta reverte pagamento e não confirma evento',async()=>{
          await eventSeed();await db.exec('CREATE TRIGGER falha BEFORE UPDATE ON contas FOR EACH ROW EXECUTE FUNCTION falha_parcela()');
          await assert.rejects(event(),/Falha simulada/);
          assert.equal((await db.query('SELECT status FROM pagamentos')).rows[0].status,'pendente');
          assert.equal((await db.query('SELECT count(*) n FROM asaas_eventos_processados')).rows[0].n,0);
          await db.exec('DROP TRIGGER falha ON contas');
        });
        await db.exec(`CREATE TABLE funcionarios(id uuid PRIMARY KEY,fazenda_id uuid,empresa_id uuid,produtor_id uuid);
          CREATE TABLE folha_pagamento(id uuid PRIMARY KEY,fazenda_id uuid,empresa_id uuid,produtor_id uuid,competencia text,status text,previsoes_sync_em timestamptz,
            data_vencimento date,cp_fgts_id uuid,cp_inss_patronal_id uuid,valor_liquido numeric);
          CREATE TABLE folha_funcionarios(id uuid PRIMARY KEY,folha_id uuid,funcionario_id uuid,produtor_id uuid,nome_funcionario text,
            salario_bruto numeric,inss_trabalhador numeric,irrf numeric,adiantamento numeric,outros_descontos numeric,desc_outros_descontos text,
            vale_transporte numeric,vale_refeicao numeric,outros_beneficios numeric,complemento_salarial numeric,fgts numeric,inss_patronal numeric,cp_lancamento_id uuid);
          CREATE TABLE adiantamentos_salario(id uuid PRIMARY KEY,funcionario_id uuid,status text,competencia_ref text,valor numeric,descontado_gratificacao_cp numeric);
          CREATE FUNCTION folha_og_por_classificacao(uuid,text) RETURNS uuid LANGUAGE sql AS $$ SELECT '${id(11)}'::uuid $$;
          ALTER TABLE lancamentos ADD COLUMN funcionario_id uuid;`);
        await db.exec(secao(438));
        const folhaSeed=async()=>{await seed();await db.exec(`TRUNCATE folha_pagamento,folha_funcionarios,funcionarios,adiantamentos_salario;
          INSERT INTO funcionarios VALUES('${id(41)}','${id(1)}',NULL,NULL),('${id(42)}','${id(1)}',NULL,NULL);
          INSERT INTO folha_pagamento(id,fazenda_id,competencia,status) VALUES('${id(40)}','${id(1)}','2026-11','rascunho');
          INSERT INTO folha_funcionarios(id,folha_id,funcionario_id,nome_funcionario,salario_bruto,inss_trabalhador,complemento_salarial,fgts,inss_patronal)
            VALUES('${id(43)}','${id(40)}','${id(41)}','Ana',1000,100,300,80,0),('${id(44)}','${id(40)}','${id(42)}','Bia',2000,200,0,160,0);`);};
        const close=()=>db.query('SELECT folha_fechar_atomica($1,$2) r',[id(40),id(49)]);
        await t.test('folha: fechamento inteiro, complemento e adiantamento sem duplicar no reenvio',async()=>{
          await folhaSeed();await db.exec(`INSERT INTO adiantamentos_salario VALUES('${id(45)}','${id(41)}','pendente','2026-11',200,0),('${id(46)}','${id(41)}','pendente','2026-11',100,100)`);
          await close();await close();
          const salary=(await db.query('SELECT valor FROM lancamentos WHERE funcionario_id=$1',[id(41)])).rows[0];assert.equal(Number(salary.valor),1000);
          assert.equal((await db.query('SELECT count(*) n FROM lancamentos WHERE origem_lancamento=\'folha\'')).rows[0].n,3);
          assert.equal((await db.query('SELECT status FROM folha_pagamento')).rows[0].status,'fechado');
        });
        await t.test('folha: falha no segundo funcionário desfaz o primeiro salário e vínculos',async()=>{
          await folhaSeed();await db.exec(`CREATE FUNCTION falha_segundo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.funcionario_id='${id(42)}' THEN RAISE EXCEPTION 'Falha segundo salário'; END IF;RETURN NEW;END $$;
            CREATE TRIGGER falha BEFORE INSERT ON lancamentos FOR EACH ROW EXECUTE FUNCTION falha_segundo();`);
          await assert.rejects(close(),/segundo salário/);
          assert.equal((await db.query('SELECT count(*) n FROM lancamentos WHERE origem_lancamento=\'folha\'')).rows[0].n,0);
          assert.equal((await db.query('SELECT status FROM folha_pagamento')).rows[0].status,'rascunho');
          assert.equal((await db.query('SELECT count(*) n FROM folha_funcionarios WHERE cp_lancamento_id IS NOT NULL')).rows[0].n,0);
          await db.exec('DROP TRIGGER falha ON lancamentos');
        });
        await db.exec(`CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
          CREATE TABLE folha_historico(folha_id uuid,usuario_id uuid,usuario_nome text,acao text,alteracoes jsonb);
          CREATE TABLE empresas(id uuid PRIMARY KEY,fazenda_id uuid);
          INSERT INTO empresas VALUES('${id(70)}','${id(1)}');`);
        await db.exec(secao(447));
        await t.test('folha sem encargos no CP fecha somente salários; cálculos e INSS do trabalhador permanecem',async()=>{
          await folhaSeed();
          await db.exec(`UPDATE folha_pagamento SET empresa_id='${id(70)}',gerar_encargos_cp=false;UPDATE folha_funcionarios SET inss_patronal=200;`);
          await close();await close();
          assert.equal((await db.query("SELECT count(*) n FROM lancamentos WHERE origem_lancamento='folha'")).rows[0].n,2);
          assert.equal((await db.query("SELECT sum(valor) v FROM lancamentos WHERE origem_lancamento='folha'")).rows[0].v,'3000.00');
          const f=(await db.query('SELECT * FROM folha_pagamento')).rows[0];assert.equal(f.status,'fechado');assert.equal(f.cp_fgts_id,null);assert.equal(f.cp_inss_patronal_id,null);
          assert.equal((await db.query('SELECT sum(fgts) v FROM folha_funcionarios')).rows[0].v,'240');
        });
        await t.test('folha com opção padrão continua gerando FGTS e INSS patronal',async()=>{
          await folhaSeed();await db.exec(`UPDATE folha_pagamento SET empresa_id='${id(70)}';UPDATE folha_funcionarios SET inss_patronal=200;`);
          await close();
          assert.equal((await db.query("SELECT count(*) n FROM lancamentos WHERE origem_lancamento='folha'")).rows[0].n,4);
        });
    }
    finally {
        await db.close();
    }
});
