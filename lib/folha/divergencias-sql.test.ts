import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
test("Seção 422: histórico persistente, motivo obrigatório e isolamento de clientes",async()=>{
  const db=new PGlite();
  const f1="00000000-0000-0000-0000-000000000001",f2="00000000-0000-0000-0000-000000000002";
  try {
    await db.exec(`CREATE ROLE authenticated;CREATE TABLE fazendas(id uuid PRIMARY KEY);CREATE TABLE funcionarios(id uuid PRIMARY KEY);
      INSERT INTO fazendas VALUES('${f1}'),('${f2}');INSERT INTO funcionarios VALUES('${f1}'),('${f2}');
      CREATE FUNCTION rls_minhas_fazendas() RETURNS SETOF uuid LANGUAGE sql AS $$SELECT '${f1}'::uuid$$;
      CREATE FUNCTION rls_sou_raccotlo() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;`);
    const s=readFileSync(new URL("../../supabase_migrations.sql",import.meta.url),"utf8");const section=s.slice(s.indexOf("-- Seção 422 —"),s.indexOf("-- Seção 423 —"));await db.exec(section);await db.exec(section);
    const insert="INSERT INTO folha_divergencias_decisoes(fazenda_id,funcionario_id,funcionario_nome,competencia,assinatura,acao,motivo,usuario_id,usuario_nome) VALUES($1,$1,'Ana','2026-11','v1',$2,$3,$1,'Gestor')";
    await db.query(insert,[f1,"confirmar_fora","Licença no mês"]);await db.query(insert,[f1,"reabrir","Rever situação"]);await db.query(insert,[f2,"confirmar_fora","Outra empresa"]);
    await assert.rejects(db.query(insert,[f1,"confirmar_fora"," "]));
    assert.equal((await db.query<{ n: number }>("SELECT count(*) n FROM folha_divergencias_decisoes")).rows[0].n,3);
    await db.exec("GRANT SELECT,INSERT,UPDATE,DELETE ON folha_divergencias_decisoes TO authenticated;SET ROLE authenticated");
    assert.equal((await db.query("SELECT * FROM folha_divergencias_decisoes")).rows.length,2);
    await assert.rejects(db.query(insert,[f1,"confirmar_fora","Direto sem API"]));
  }finally{await db.close();}
});
