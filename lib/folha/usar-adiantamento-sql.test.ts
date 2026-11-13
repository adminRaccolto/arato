import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const source = readFileSync(new URL("../../supabase_migrations.sql", import.meta.url), "utf8");
const ini = source.indexOf("-- Seção 451 —");
const fim = source.indexOf("\n-- Seção ", ini + 10);
const sql = source.slice(ini, fim < 0 ? undefined : fim);
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const ADI = id(50), TA = id(60), TS = id(70), TS2 = id(71), TS_GRANDE = id(72), TS_OUTRO = id(73), OG_X = id(80), OG_ADI = id(81), USER = id(99);

test("Seção 451: adiantamento de funcionário usado como pagamento de outra conta do CP", async t => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE fazendas(id uuid PRIMARY KEY,conta_id uuid);
      INSERT INTO fazendas VALUES('${id(1)}','${id(10)}'),('${id(2)}','${id(10)}'),('${id(3)}','${id(11)}');
      CREATE TABLE funcionarios(id uuid PRIMARY KEY,nome text,fazenda_id uuid);
      INSERT INTO funcionarios VALUES('${id(20)}','JOAO','${id(1)}');
      CREATE TABLE operacoes_gerenciais(id uuid PRIMARY KEY,fazenda_id uuid,conta_id uuid,classificacao text,inativo boolean DEFAULT false);
      INSERT INTO operacoes_gerenciais VALUES('${OG_X}',NULL,NULL,'2.02.01',false),('${OG_ADI}',NULL,'${id(10)}','2.01.01.09.002',false);
      CREATE TABLE lancamentos(id uuid PRIMARY KEY,fazenda_id uuid,tipo text DEFAULT 'pagar',natureza text DEFAULT 'real',moeda text DEFAULT 'BRL',
        descricao text,valor numeric,valor_pago numeric,status text,data_vencimento date,data_baixa date,conta_bancaria uuid,
        operacao_gerencial_id uuid,observacao text,lote_id uuid,conciliado boolean DEFAULT false,fatura_cartao_id uuid,
        contrato_financeiro_id uuid,origem_lancamento text);
      CREATE TABLE parcelas_pagamento(lancamento_id uuid,status text CHECK(status IN ('em_aberto','pago','vencido')),data_pagamento date,data_vencimento date);
      CREATE TABLE adiantamentos_salario(id uuid PRIMARY KEY,fazenda_id uuid,funcionario_id uuid,data date,valor numeric,status text,
        tipo text DEFAULT 'salario',lancamento_id uuid,valor_aplicado_cp numeric NOT NULL DEFAULT 0);
      CREATE TABLE adiantamentos_aplicacoes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),adiantamento_id uuid,fazenda_id uuid NOT NULL,
        descricao text NOT NULL,valor_aplicado numeric NOT NULL CHECK(valor_aplicado>0),data_aplicacao date NOT NULL,
        nf_entrada_id uuid,nr_nf text,created_at timestamptz DEFAULT now(),lancamento_id uuid,adiantamento_salario_id uuid,og_anterior uuid);
    `);
    const og = source.indexOf("CREATE OR REPLACE FUNCTION public.folha_og_por_classificacao(");
    await db.exec(source.slice(og, source.indexOf("$$;", og) + 3));
    await db.exec(sql); await db.exec(sql);

    const seed = async (titAdi: "aberto" | "pago" = "aberto") => {
      await db.exec(`TRUNCATE lancamentos,parcelas_pagamento,adiantamentos_salario,adiantamentos_aplicacoes;
        INSERT INTO lancamentos(id,fazenda_id,descricao,valor,valor_pago,status,data_vencimento,data_baixa,conta_bancaria,operacao_gerencial_id,origem_lancamento) VALUES
          ('${TA}','${id(1)}','Adiantamento — JOAO',1000,${titAdi === "pago" ? 1000 : "NULL"},'${titAdi === "pago" ? "baixado" : "em_aberto"}','2099-01-10',
            ${titAdi === "pago" ? "'2026-11-01'" : "NULL"},${titAdi === "pago" ? `'${id(90)}'` : "NULL"},'${OG_ADI}','folha'),
          ('${TS}','${id(2)}','FARMACIA NF 10',600,NULL,'em_aberto','2099-01-20',NULL,NULL,'${OG_X}','nf_entrada'),
          ('${TS2}','${id(1)}','MERCADO NF 11',400,NULL,'em_aberto','2099-01-20',NULL,NULL,'${OG_X}','manual'),
          ('${TS_GRANDE}','${id(1)}','LOJA NF 12',1500,NULL,'em_aberto','2099-01-20',NULL,NULL,'${OG_X}','manual'),
          ('${TS_OUTRO}','${id(3)}','OUTRO CLIENTE',100,NULL,'em_aberto','2099-01-20',NULL,NULL,'${OG_X}','manual');
        INSERT INTO parcelas_pagamento VALUES('${TS}','em_aberto',NULL,'2099-01-20');
        INSERT INTO adiantamentos_salario VALUES('${ADI}','${id(1)}','${id(20)}','2026-11-05',1000,'pendente','salario','${TA}',0);`);
    };
    const usar = (conta: string, req: number) => db.query<{ r: Record<string, unknown> }>("SELECT folha_usar_adiantamento('usar',$1,$2,$3) r",
      [{ adiantamento_id: ADI, lancamento_id: conta, data: "2026-11-13" }, id(req), USER]);
    const desfazer = (aplicacao: unknown) => db.query("SELECT folha_usar_adiantamento('desfazer',$1,NULL,$2) r", [{ adiantamento_id: ADI, aplicacao_id: aplicacao }, USER]);
    const tit = async (x: string) => (await db.query<{ valor: string; valor_pago: string | null; status: string; operacao_gerencial_id: string; conta_bancaria: string | null }>(
      "SELECT valor::float8::text valor,valor_pago::float8::text valor_pago,status,operacao_gerencial_id,conta_bancaria FROM lancamentos WHERE id=$1", [x])).rows[0];
    const aplicado = async () => Number((await db.query<{ v: string }>(`SELECT valor_aplicado_cp v FROM adiantamentos_salario WHERE id='${ADI}'`)).rows[0].v);

    await t.test("adiantamento em aberto: abate o título dele e a conta continua em aberto para o banco", async () => {
      await seed();
      const r = (await usar(TS, 100)).rows[0].r;
      assert.equal(r.modo, "abate_adiantamento");
      assert.deepEqual(await tit(TA), { valor: "400", valor_pago: null, status: "em_aberto", operacao_gerencial_id: OG_ADI, conta_bancaria: null });
      const conta = await tit(TS);
      assert.equal(conta.status, "em_aberto"); assert.equal(conta.valor_pago, null); assert.equal(conta.operacao_gerencial_id, OG_ADI);
      assert.equal(await aplicado(), 600);
      // reenvio da mesma operação não aplica de novo
      assert.equal((await usar(TS, 100)).rows[0].r.repetido, true);
      assert.equal(await aplicado(), 600);
      // o resto do adiantamento paga outra conta: o título dele zera e é cancelado
      const r2 = (await usar(TS2, 101)).rows[0].r;
      assert.equal((await tit(TA)).status, "cancelado");
      assert.equal(await aplicado(), 1000);
      // desfazer o segundo uso volta o saldo do título do adiantamento e a OG da conta
      await desfazer(r2.aplicacao_id);
      assert.deepEqual(await tit(TA), { valor: "400", valor_pago: null, status: "em_aberto", operacao_gerencial_id: OG_ADI, conta_bancaria: null });
      assert.equal((await tit(TS2)).operacao_gerencial_id, OG_X);
      assert.equal(await aplicado(), 600);
      // desfazer de novo não repete
      assert.equal((await desfazer(r2.aplicacao_id)).rows.length, 1);
      assert.equal(await aplicado(), 600);
      await desfazer(r.aplicacao_id);
      assert.equal((await tit(TA)).valor, "1000");
      assert.equal((await tit(TS)).operacao_gerencial_id, OG_X);
    });

    await t.test("conta maior que o saldo, de outro cliente, ou o próprio adiantamento são recusadas sem gravar", async () => {
      await seed();
      await assert.rejects(usar(TS_GRANDE, 110), /maior que o saldo/);
      await assert.rejects(usar(TS_OUTRO, 111), /outro cliente/);
      await assert.rejects(usar(TA, 112), /não seja um adiantamento/);
      assert.equal(await aplicado(), 0);
      assert.equal((await tit(TA)).valor, "1000");
    });

    await t.test("título do adiantamento em borderô bloqueia o uso", async () => {
      await seed();
      await db.exec(`UPDATE lancamentos SET lote_id='${id(95)}' WHERE id='${TA}'`);
      await assert.rejects(usar(TS, 120), /borderô/);
    });

    await t.test("conta paga depois do uso impede desfazer", async () => {
      await seed();
      const r = (await usar(TS, 130)).rows[0].r;
      await db.exec(`UPDATE lancamentos SET status='baixado',valor_pago=600,data_baixa='2026-11-20',conta_bancaria='${id(90)}' WHERE id='${TS}'`);
      await assert.rejects(desfazer(r.aplicacao_id), /alterada ou paga/);
      assert.equal(await aplicado(), 600);
    });

    await t.test("adiantamento antigo já pago: quita a conta sem banco e desfaz voltando a conta", async () => {
      await seed("pago");
      const r = (await usar(TS, 140)).rows[0].r;
      assert.equal(r.modo, "quita_conta");
      assert.deepEqual(await tit(TS), { valor: "600", valor_pago: "600", status: "baixado", operacao_gerencial_id: OG_ADI, conta_bancaria: null });
      assert.equal((await db.query<{ status: string }>(`SELECT status FROM parcelas_pagamento WHERE lancamento_id='${TS}'`)).rows[0].status, "pago");
      assert.equal((await tit(TA)).valor, "1000");
      await desfazer(r.aplicacao_id);
      assert.deepEqual(await tit(TS), { valor: "600", valor_pago: null, status: "em_aberto", operacao_gerencial_id: OG_X, conta_bancaria: null });
      assert.equal((await db.query<{ status: string }>(`SELECT status FROM parcelas_pagamento WHERE lancamento_id='${TS}'`)).rows[0].status, "em_aberto");
      assert.equal(await aplicado(), 0);
    });

    await t.test("função restrita ao servidor", async () => {
      const r = await db.query<{ ok: boolean }>("SELECT has_function_privilege('authenticated','public.folha_usar_adiantamento(text,jsonb,uuid,uuid)','EXECUTE') ok");
      assert.equal(r.rows[0].ok, false);
    });
  } finally {
    await db.close();
  }
});
