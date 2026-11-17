import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const source = readFileSync(new URL("../../supabase_migrations.sql", import.meta.url), "utf8");
const inicio = source.indexOf("-- Seção 456 —");
const fim = source.indexOf("\n-- Seção ", inicio + 10);
const sql = source.slice(inicio, fim < 0 ? undefined : fim);

test("número do borderô é gerado no banco e preserva os documentos existentes", async t => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE pagamento_lotes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tipo text,numero_titulo text);
      INSERT INTO pagamento_lotes(tipo,numero_titulo) VALUES('pagar','REF-ANTIGA'),('receber',NULL),('pagar','BD000099');
      GRANT SELECT,INSERT,UPDATE ON pagamento_lotes TO authenticated;`);
    const historico = (await db.query("SELECT * FROM pagamento_lotes ORDER BY id")).rows;
    await db.exec(sql);
    assert.deepEqual((await db.query("SELECT * FROM pagamento_lotes ORDER BY id")).rows, historico);

    await t.test("criação conjunta de CP e CR recebe controles distintos", async () => {
      const r = await db.query<{numero_titulo:string}>("INSERT INTO pagamento_lotes(tipo) VALUES('pagar'),('receber'),('pagar') RETURNING numero_titulo");
      assert.deepEqual(r.rows.map(x => x.numero_titulo), ["BD000100", "BD000101", "BD000102"]);
    });
    await t.test("referência manual continua disponível e espaços geram automático", async () => {
      const r = await db.query<{numero_titulo:string}>("INSERT INTO pagamento_lotes(tipo,numero_titulo) VALUES('pagar','BOLETO-123'),('pagar','   ') RETURNING numero_titulo");
      assert.equal(r.rows[0].numero_titulo, "BOLETO-123");
      assert.match(r.rows[1].numero_titulo, /^BD\d{6}$/);
    });
    await t.test("cópia para saldo parcial recebe outro controle", async () => {
      const r = await db.query<{numero_titulo:string}>("INSERT INTO pagamento_lotes(tipo,numero_titulo) SELECT tipo,numero_titulo FROM pagamento_lotes WHERE numero_titulo='BD000100' RETURNING numero_titulo");
      assert.notEqual(r.rows[0].numero_titulo, "BD000100");
      assert.match(r.rows[0].numero_titulo, /^BD\d{6}$/);
    });
    await t.test("pagamento ou estorno não apagam ou trocam controle automático", async () => {
      await db.exec("UPDATE pagamento_lotes SET numero_titulo=NULL WHERE numero_titulo='BD000100'");
      await db.exec("UPDATE pagamento_lotes SET numero_titulo='OUTRO' WHERE numero_titulo='BD000100'");
      assert.equal((await db.query("SELECT * FROM pagamento_lotes WHERE numero_titulo='BD000100'")).rows.length, 1);
    });
    await t.test("excluir e reaplicar a seção não reutiliza número", async () => {
      const anterior = (await db.query<{numero_titulo:string}>("INSERT INTO pagamento_lotes(tipo) VALUES('pagar') RETURNING numero_titulo")).rows[0].numero_titulo;
      await db.query("DELETE FROM pagamento_lotes WHERE numero_titulo=$1", [anterior]);
      await db.exec(sql);
      const novo = (await db.query<{numero_titulo:string}>("INSERT INTO pagamento_lotes(tipo) VALUES('pagar') RETURNING numero_titulo")).rows[0].numero_titulo;
      assert.equal(Number(novo.slice(2)), Number(anterior.slice(2)) + 1);
    });
    await t.test("usuário autenticado cria borderô sem acesso direto ao contador", async () => {
      await db.exec("SET ROLE authenticated");
      try {
        const r = await db.query<{numero_titulo:string}>("INSERT INTO pagamento_lotes(tipo) VALUES('receber') RETURNING numero_titulo");
        assert.match(r.rows[0].numero_titulo, /^BD\d{6}$/);
        await assert.rejects(db.query("SELECT nextval('pagamento_lotes_numero_seq')"), /permission denied/);
      } finally { await db.exec("RESET ROLE"); }
    });
    await t.test("contador não trunca o número ao ultrapassar seis dígitos", async () => {
      await db.exec("SELECT setval('pagamento_lotes_numero_seq',999999,true)");
      const r = await db.query<{numero_titulo:string}>("INSERT INTO pagamento_lotes(tipo) VALUES('pagar') RETURNING numero_titulo");
      assert.equal(r.rows[0].numero_titulo, "BD1000000");
    });
  } finally { await db.close(); }
});
