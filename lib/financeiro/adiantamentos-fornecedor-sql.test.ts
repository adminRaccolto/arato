import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

test("Seção 421: crédito pago, pedido opcional, compensação atômica e proteção do histórico", async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE fazendas(id uuid PRIMARY KEY,conta_id uuid);
      CREATE TABLE pessoas(id uuid PRIMARY KEY,cpf_cnpj text);
      CREATE TABLE pedidos_compra(id uuid PRIMARY KEY,fazenda_id uuid,fornecedor_id uuid,nr_pedido text);
      CREATE TABLE nf_entradas(id uuid PRIMARY KEY,pedido_compra_id uuid);
      CREATE TABLE lancamentos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT now(),
        numero bigint GENERATED ALWAYS AS IDENTITY, fazenda_id uuid,pessoa_id uuid,tipo text DEFAULT 'pagar',
        status text DEFAULT 'em_aberto',valor numeric,valor_pago numeric,moeda text DEFAULT 'BRL',cotacao_usd numeric,
        valor_multa numeric,valor_juros numeric,valor_desconto numeric,forma_pagamento text,origem_lancamento text,
        natureza text,pedido_compra_id uuid,nf_entrada_id uuid,titulo_origem_id uuid,lote_id uuid,
        contrato_financeiro_id uuid,fatura_cartao_id uuid,data_baixa date,conta_bancaria uuid,conciliado boolean,
        valor_titulo_origem numeric,pagamento_parcial boolean,vencimento_saldo date,observacao text,categoria text,descricao text,operacao_gerencial_id uuid, data_lancamento date,data_vencimento date,ano_safra_id uuid,auto boolean);
      CREATE TABLE adiantamentos_fornecedor(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,pessoa_id uuid,
        pedido_compra_id uuid,lancamento_id uuid,valor numeric,valor_aplicado numeric DEFAULT 0,moeda text DEFAULT 'BRL',
        status text DEFAULT 'em_aberto',data_emissao date DEFAULT current_date,descricao text,nr_documento text,
        data_previsao date,cotacao_usd numeric,conta_bancaria_id uuid,ano_safra_id uuid,observacao text);
      CREATE TABLE adiantamentos_aplicacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),adiantamento_id uuid,
        fazenda_id uuid,descricao text,valor_aplicado numeric CHECK(valor_aplicado>0),data_aplicacao date,
        lancamento_id uuid REFERENCES lancamentos(id),nf_entrada_id uuid);
      CREATE TABLE parcelas_pagamento(lancamento_id uuid,status text,data_pagamento date);
      INSERT INTO fazendas VALUES('${id(1)}','${id(10)}'),('${id(2)}','${id(20)}');
      INSERT INTO pessoas VALUES('${id(3)}','12345678000190'),('${id(4)}','98.765.432/0001-10'),('${id(5)}','12.345.678/0001-90');
      INSERT INTO pedidos_compra VALUES('${id(6)}','${id(1)}','${id(3)}','PC-6'),('${id(7)}','${id(1)}','${id(3)}','PC-7');
      INSERT INTO nf_entradas VALUES('${id(8)}','${id(6)}');
    `);
    const source = readFileSync(new URL("../../supabase_migrations.sql", import.meta.url), "utf8");
    const section = source.slice(source.indexOf("-- Seção 421 —"), source.indexOf("-- Seção 422 —"));
    // Inclui o gatilho real de divisão parcial para flagrar conflito com a compensação.
    const partial = source.slice(source.indexOf("CREATE OR REPLACE FUNCTION fn_dividir_titulo_parcial()"), source.indexOf('-- "0_" no nome:'));
    await db.exec(partial);
    await db.exec("CREATE TRIGGER trg_0_dividir_titulo_parcial BEFORE UPDATE ON lancamentos FOR EACH ROW EXECUTE FUNCTION fn_dividir_titulo_parcial();");
    await db.exec(section); await db.exec(section);
    const value = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows[0];
    const apply = (v: number, adi = 30, cp = 32, cot: number | null = null) => db.query<{ r: Record<string, unknown> }>(
      "SELECT aplicar_adiantamento_fornecedor_cp($1,$2,$3,'2026-11-06','Teste',$4) r", [id(adi), id(cp), v, cot]);
    const fixture = async (pedido: number | null = 6, paid: number | null = 30) => {
      await db.exec(`INSERT INTO lancamentos(id,fazenda_id,pessoa_id,valor,status,valor_pago) VALUES
        ('${id(31)}','${id(1)}','${id(3)}',30,'${paid === null ? "em_aberto" : "baixado"}',${paid ?? "NULL"}),
        ('${id(32)}','${id(1)}','${id(3)}',100,'em_aberto',NULL);
        UPDATE lancamentos SET nf_entrada_id='${id(8)}' WHERE id='${id(32)}';
        INSERT INTO adiantamentos_fornecedor(id,fazenda_id,pessoa_id,pedido_compra_id,lancamento_id,valor)
          VALUES('${id(30)}','${id(1)}','${id(3)}',${pedido ? `'${id(pedido)}'` : "NULL"},'${id(31)}',30);`);
    };
    const scenario = async (name: string, run: () => Promise<void>) => t.test(name, async () => {
      await db.exec("BEGIN"); try { await run(); } finally { await db.exec("ROLLBACK"); }
    });
    await scenario("criação sem pedido gera um único CP vinculado", async () => {
      const { rows } = await db.query<{ r: { lancamento_id: string } }>("SELECT criar_adiantamento_fornecedor($1,false,NULL) r", [{fazenda_id:id(1),pessoa_id:id(3),descricao:"Novo",data_emissao:"2026-11-06",valor:100,moeda:"BRL"}]);
      assert.ok(rows[0].r.lancamento_id);
      assert.equal((await value("SELECT count(*) n FROM lancamentos")).n, 1);
    });
    await scenario("criação já quitada retorna o crédito pago imediatamente", async () => {
      const { rows } = await db.query<{ r: { credito_disponivel: number } }>("SELECT criar_adiantamento_fornecedor($1,true,NULL) r", [{fazenda_id:id(1),pessoa_id:id(3),descricao:"Pago",data_emissao:"2026-11-06",valor:100,moeda:"BRL"}]);
      assert.equal(rows[0].r.credito_disponivel,100);
    });
    await scenario("cancelar programado cancela o CP junto", async () => { await fixture(6,null); await db.query("SELECT cancelar_adiantamento_fornecedor($1)",[id(30)]); assert.equal((await value(`SELECT status FROM lancamentos WHERE id='${id(31)}'`)).status,"cancelado"); });
    await scenario("cancelar pago exige regularização prévia", async () => { await fixture(); await assert.rejects(db.query("SELECT cancelar_adiantamento_fornecedor($1)",[id(30)]),/Adiantamento pago/); });
    await scenario("pode completar o pagamento do adiantamento após usar parte do crédito", async () => {
      await fixture(6,null);
      await db.exec(`UPDATE lancamentos SET status='parcial',valor_pago=15 WHERE id='${id(31)}'`);
      await apply(10);
      await db.exec(`UPDATE lancamentos SET status='baixado',valor_pago=15 WHERE titulo_origem_id='${id(31)}' AND id<>'${id(31)}' AND status='em_aberto'`);
      assert.equal((await value(`SELECT adiantamento_credito_pago('${id(30)}') v`)).v,"20.00");
    });
    await scenario("programado não pode quitar NF nem consumir saldo", async () => {
      await fixture(6, null);
      assert.equal((await value(`SELECT adiantamento_credito_pago('${id(30)}') v`)).v, "0");
      await assert.rejects(apply(20), /Crédito não disponível/);
    });
    await scenario("pedido opcional permite compensar fornecedor", async () => {
      await fixture(null);
      const r = (await apply(30)).rows[0].r;
      assert.equal(r.novo_saldo_cp, 70);
      assert.equal((await value(`SELECT valor FROM lancamentos WHERE id='${id(32)}'`)).valor, "70.00");
      assert.equal((await value("SELECT sum(valor) total FROM lancamentos WHERE id<>'"+id(31)+"'" )).total, "100.00");
      assert.equal((await value("SELECT count(*) n FROM lancamentos WHERE forma_pagamento='Compensação de adiantamento a fornecedor' AND conta_bancaria IS NULL")).n, 1);
      assert.equal((await value(`SELECT valor_aplicado FROM adiantamentos_fornecedor WHERE id='${id(30)}'`)).valor_aplicado, "30.00");
    });
    await scenario("não aceita pedido diferente", async () => { await fixture(7); await assert.rejects(apply(10), /Crédito não disponível/); });
    await scenario("não aceita outro fornecedor", async () => { await fixture(); await db.exec(`UPDATE lancamentos SET pessoa_id='${id(4)}' WHERE id='${id(32)}'`); await assert.rejects(apply(10), /Crédito não disponível/); });
    await scenario("cadastro duplicado com mesmo CNPJ pode usar crédito", async () => { await fixture(); await db.exec(`UPDATE lancamentos SET pessoa_id='${id(5)}' WHERE id='${id(32)}'`); assert.equal((await apply(10)).rows[0].r.novo_saldo_cp, 90); });
    await scenario("crédito não atravessa clientes", async () => { await fixture(null); await db.exec(`UPDATE lancamentos SET fazenda_id='${id(2)}' WHERE id='${id(32)}'`); await assert.rejects(apply(10), /Crédito não disponível/); });
    await scenario("não abate duas vezes o título projetado do pedido", async () => { await fixture(); await db.exec(`UPDATE lancamentos SET origem_lancamento='pedido_compra',nf_entrada_id=NULL,pedido_compra_id='${id(6)}' WHERE id='${id(32)}'`); await assert.rejects(apply(10), /Crédito não disponível/); });
    await scenario("pagamento parcial libera só o principal pago", async () => { await fixture(6, 15); assert.equal((await value(`SELECT adiantamento_credito_pago('${id(30)}') v`)).v, "15.00"); await assert.rejects(apply(16), /Valor superior/); });
    await scenario("erro ao registrar aplicação desfaz o abatimento do CP", async () => {
      await fixture(); await db.exec("ALTER TABLE adiantamentos_aplicacoes ADD CONSTRAINT rejeitar_teste CHECK(descricao <> 'Teste')");
      await db.exec("SAVEPOINT aplicacao"); await assert.rejects(apply(20)); await db.exec("ROLLBACK TO aplicacao");
      assert.equal((await value(`SELECT valor FROM lancamentos WHERE id='${id(32)}'`)).valor, "100");
      assert.equal((await value(`SELECT valor_aplicado FROM adiantamentos_fornecedor WHERE id='${id(30)}'`)).valor_aplicado, "0");
      assert.equal((await value("SELECT count(*) n FROM adiantamentos_aplicacoes")).n, 0);
    });
    await scenario("compensação total não movimenta banco", async () => { await fixture(); await db.exec(`UPDATE lancamentos SET valor=30 WHERE id='${id(32)}'`); const r = (await apply(30)).rows[0].r; assert.equal(r.novo_status_cp, "baixado"); assert.equal(r.novo_saldo_cp, 0); });
    await scenario("USD usa moeda e cotação corretas", async () => { await fixture(); await db.exec(`DELETE FROM adiantamentos_fornecedor WHERE id='${id(30)}'; UPDATE lancamentos SET moeda='USD',cotacao_usd=5,valor_pago=150 WHERE id='${id(31)}'; UPDATE lancamentos SET moeda='USD',cotacao_usd=5 WHERE id='${id(32)}'; INSERT INTO adiantamentos_fornecedor(id,fazenda_id,pessoa_id,lancamento_id,valor,moeda) VALUES('${id(30)}','${id(1)}','${id(3)}','${id(31)}',30,'USD')`); const r=(await apply(100,30,32,5)).rows[0].r; assert.equal(r.novo_valor_cp,80); assert.equal(r.novo_saldo_cp,400); assert.equal(r.novo_saldo_adiantamento,10); });
    await scenario("segunda aplicação não reutiliza o mesmo crédito", async () => { await fixture(); await apply(30); await assert.rejects(apply(1), /Crédito não disponível/); });
    await scenario("pagamento que financiou crédito usado fica protegido", async () => { await fixture(); await apply(20); await assert.rejects(db.exec(`UPDATE lancamentos SET status='em_aberto',valor_pago=NULL WHERE id='${id(31)}'`), /Adiantamento utilizado/); });
    await scenario("vínculo não pode mudar depois de usar o crédito", async () => { await fixture(); await apply(20); await assert.rejects(db.exec(`UPDATE adiantamentos_fornecedor SET pedido_compra_id=NULL WHERE id='${id(30)}'`), /Adiantamento já utilizado/); });
    await scenario("RLS impede consultar o crédito de outro cliente", async () => {
      await fixture(null);
      await db.exec(`INSERT INTO adiantamentos_fornecedor(id,fazenda_id,valor) VALUES('${id(80)}','${id(2)}',999);
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
        ALTER TABLE adiantamentos_fornecedor ENABLE ROW LEVEL SECURITY;
        CREATE POLICY credito_proprio ON adiantamentos_fornecedor FOR SELECT TO authenticated USING(fazenda_id='${id(1)}');
        SET LOCAL ROLE authenticated;`);
      assert.equal((await db.query("SELECT listar_creditos_fornecedor() v")).rows.length,1);
      assert.equal((await db.query("SELECT listar_creditos_fornecedor($1) v",[id(2)])).rows.length,0);
      assert.equal((await value(`SELECT adiantamento_credito_pago('${id(80)}') v`)).v,null);
    });
    await scenario("usuário autenticado não pode chamar RPC administrativa", async () => { await db.exec("SET LOCAL ROLE authenticated"); await assert.rejects(apply(10), /permission denied/); });
  } finally { await db.close(); }
});
