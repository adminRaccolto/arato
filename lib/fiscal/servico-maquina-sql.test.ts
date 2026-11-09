import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
test("NFS-e apropria no mesmo histórico das máquinas, sem duplicar ou manter custo estornado",async t=>{
 const db=new PGlite();try{
  await db.exec(`CREATE ROLE authenticated;
   CREATE TABLE fazendas(id uuid PRIMARY KEY,conta_id uuid);CREATE TABLE maquinas(id uuid PRIMARY KEY,fazenda_id uuid);
   CREATE TABLE centros_custo(id uuid PRIMARY KEY,fazenda_id uuid,nome text,parent_id uuid,manutencao_maquinas boolean DEFAULT false);
   CREATE TABLE empresa_lancamentos(id uuid PRIMARY KEY);
   CREATE TABLE nf_servicos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,centro_custo_id uuid,status text,
    numero_nf text DEFAULT '123',prestador_nome text DEFAULT 'Oficina',discriminacao text DEFAULT 'Serviço de revisão',
    data_prestacao date DEFAULT '2026-11-09',valor_servico numeric DEFAULT 1000,valor_liquido numeric DEFAULT 850);
   CREATE TABLE historico_manutencao(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,maquina_id uuid,data date,
    tipo text CHECK(tipo IN ('corretiva','preventiva','revisao','outro')),descricao text,custo numeric);
   INSERT INTO fazendas VALUES('${id(1)}','${id(10)}'),('${id(2)}','${id(20)}'),('${id(3)}','${id(10)}');
   INSERT INTO maquinas VALUES('${id(11)}','${id(1)}'),('${id(12)}','${id(2)}'),('${id(13)}','${id(3)}');
   INSERT INTO centros_custo(id,fazenda_id,nome,parent_id,manutencao_maquinas) VALUES
    ('${id(21)}','${id(1)}','Máquinas',NULL,false),('${id(22)}','${id(1)}','Serviços','${id(21)}',false),
    ('${id(23)}','${id(1)}','Administrativo',NULL,false),('${id(24)}','${id(1)}','Frota',NULL,true),
    ('${id(25)}','${id(2)}','Máquinas',NULL,true);
   INSERT INTO historico_manutencao(fazenda_id,maquina_id,data,tipo,descricao,custo) VALUES('${id(1)}','${id(11)}','2026-10-01','corretiva','Manutenção anterior',200);`);
  const source=readFileSync(new URL("../../supabase_migrations.sql",import.meta.url),"utf8");const inicio=source.indexOf("-- Seção 425 —");const prox=source.indexOf("-- Seção ",inicio+1);const section=source.slice(inicio,prox<0?undefined:prox);
  await db.exec(section);await db.exec(section);
  const criar=(status="pendente",maquina=11,cc=22)=>db.query("INSERT INTO nf_servicos(id,fazenda_id,centro_custo_id,maquina_id,status) VALUES($1,$2,$3,$4,$5)",[id(30),id(1),id(cc),maquina?id(maquina):null,status]);
  const custos=()=>db.query<{id:string;custo:string;maquina_id:string}>("SELECT * FROM historico_manutencao WHERE nf_servico_id=$1",[id(30)]);
  const cenario=async(nome:string,run:()=>Promise<void>)=>t.test(nome,async()=>{await db.exec("BEGIN");try{await run();}finally{await db.exec("ROLLBACK");}});
  await cenario("rascunho não apropria; processamento usa custo total e não só o líquido pago",async()=>{
   await criar();assert.equal((await custos()).rows.length,0);await db.exec(`UPDATE nf_servicos SET status='processada' WHERE id='${id(30)}'`);
   assert.equal((await custos()).rows[0].custo,"1000.00");
  });
  await cenario("atualizar a nota processada não duplica a manutenção",async()=>{
   await criar("processada");const original=(await custos()).rows[0].id;await db.exec(`UPDATE nf_servicos SET discriminacao='Serviço atualizado',valor_servico=1200 WHERE id='${id(30)}'`);
   const rows=(await custos()).rows;assert.equal(rows.length,1);assert.equal(rows[0].id,original);assert.equal(rows[0].custo,"1200.00");
  });
  await cenario("estornar e reprocessar remove o custo anterior e cria somente um",async()=>{
   await criar("processada");await db.exec(`UPDATE nf_servicos SET status='pendente' WHERE id='${id(30)}'`);assert.equal((await custos()).rows.length,0);
   await db.exec(`UPDATE nf_servicos SET status='processada' WHERE id='${id(30)}'`);assert.equal((await custos()).rows.length,1);
   assert.equal((await db.query("SELECT * FROM historico_manutencao WHERE nf_servico_id IS NULL")).rows.length,1);
  });
  await cenario("cancelamento ou exclusão da nota elimina só sua apropriação",async()=>{
   await criar("processada");await db.exec(`UPDATE nf_servicos SET status='cancelada' WHERE id='${id(30)}'`);assert.equal((await custos()).rows.length,0);
   await db.exec(`UPDATE nf_servicos SET status='processada' WHERE id='${id(30)}';DELETE FROM nf_servicos WHERE id='${id(30)}'`);assert.equal((await custos()).rows.length,0);
  });
  await cenario("máquina de outra fazenda do cliente é válida",async()=>{await criar("processada",13);assert.equal((await custos()).rows[0].maquina_id,id(13));});
  await cenario("máquina de outro cliente é recusada",async()=>{await assert.rejects(criar("processada",12),/não pertence ao cliente/);});
  await cenario("centro comum ou de outro cliente não aceita patrimônio",async()=>{
   await db.exec("SAVEPOINT centro");await assert.rejects(criar("processada",11,23),/centro de custos de máquinas/);await db.exec("ROLLBACK TO centro");await assert.rejects(criar("processada",11,25),/centro de custos de máquinas/);
  });
  await cenario("NFS-e sem patrimônio mantém o fluxo normal sem custo em máquina",async()=>{await criar("processada",0,23);assert.equal((await custos()).rows.length,0);});
  await cenario("a marcação de manutenção da NF de produtos também vale no serviço",async()=>{await criar("processada",11,24);assert.equal((await custos()).rows.length,1);});
  await cenario("troca de patrimônio não deixa custo na máquina anterior",async()=>{await criar("processada");await db.exec(`UPDATE nf_servicos SET maquina_id='${id(13)}' WHERE id='${id(30)}'`);assert.equal((await custos()).rows.length,1);assert.equal((await custos()).rows[0].maquina_id,id(13));});
  await cenario("estorno continua possível após transferência posterior da máquina",async()=>{await criar("processada");await db.exec(`UPDATE maquinas SET fazenda_id='${id(2)}' WHERE id='${id(11)}';UPDATE nf_servicos SET status='pendente' WHERE id='${id(30)}'`);assert.equal((await custos()).rows.length,0);});
  await cenario("usuário da nota pode processar sem permissão de inserir manualmente no histórico",async()=>{
   await db.exec(`GRANT SELECT ON fazendas,maquinas,centros_custo TO authenticated;GRANT SELECT,INSERT,UPDATE ON nf_servicos TO authenticated;
    GRANT SELECT ON historico_manutencao TO authenticated;ALTER TABLE historico_manutencao ENABLE ROW LEVEL SECURITY;
    CREATE POLICY leitura ON historico_manutencao FOR SELECT TO authenticated USING(fazenda_id='${id(1)}');SET LOCAL ROLE authenticated;`);
   await criar("processada");assert.equal((await custos()).rows.length,1);
   await assert.rejects(db.exec(`INSERT INTO historico_manutencao(fazenda_id,maquina_id,custo) VALUES('${id(1)}','${id(11)}',1)`),/permission denied/);
  });
 }finally{await db.close();}
});
