import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const source=readFileSync(new URL('../../supabase_migrations.sql',import.meta.url),'utf8');
const ini=source.indexOf('-- Seção 431 —'),fim=source.indexOf('\n-- Seção ',ini+10);
const sql=source.slice(ini,fim<0?undefined:fim);
test('ativação A1 é atômica, conserva parâmetros e isola titulares/clientes',async t=>{
 const db=new PGlite();
 try {
  await db.exec(`CREATE ROLE authenticated;CREATE ROLE anon;CREATE ROLE service_role;
    CREATE TABLE contas(id uuid PRIMARY KEY);CREATE TABLE fazendas(id uuid PRIMARY KEY,conta_id uuid REFERENCES contas(id));
    CREATE TABLE configuracoes_modulo(fazenda_id uuid,modulo text,config jsonb,updated_at timestamptz,UNIQUE(fazenda_id,modulo));
    INSERT INTO contas VALUES('${id(1)}'),('${id(2)}');INSERT INTO fazendas VALUES('${id(10)}','${id(1)}'),('${id(11)}','${id(1)}'),('${id(20)}','${id(2)}');`);
  await db.exec(sql);await db.exec(sql);
  const dados=(n:number,extra:Record<string,unknown>={})=>({fazenda_id:id(10),emitente:'12345678000271',documento:'12345678000190',storage_path:`${id(10)}/versoes/${id(n)}.pfx`,senha:`senha-${n}`,arquivo_nome:'certificado.pfx',fingerprint:String(n%10).repeat(64),serial:String(n),valido_de:'2020-01-01T00:00:00Z',valido_ate:'2099-01-01T00:00:00Z',produtor_id:'produtor',produtor_nome:'Titular',...extra});
  const ativar=(n:number,extra:Record<string,unknown>={})=>db.query('SELECT ativar_certificado_a1($1)',[dados(n,extra)]);
  const ativos=()=>db.query<{storage_path:string;senha:string}>('SELECT storage_path,senha FROM certificados_a1_versoes WHERE ativo');
  const scenario=async(nome:string,run:()=>Promise<void>)=>t.test(nome,async()=>{
    try{await run();}finally{await db.exec('DELETE FROM certificados_a1_versoes;DELETE FROM configuracoes_modulo;');}
  });
  await scenario('renova uma versão por raiz CNPJ sem alterar série, numeração e tributos',async()=>{
    await db.query("INSERT INTO configuracoes_modulo VALUES($1,'fiscal_emp_12345678000271',$2,now()),($3,'cte_emp_12345678000190',$4,now())",[id(10),{serie:'1',numero_inicial:'50',icms:'12',cert_a1_path:'antigo.pfx'},id(11),{serie:'2',numero_inicial:'80',cert_a1_senha:'velha'}]);
    await ativar(30);await ativar(31);
    assert.equal((await ativos()).rows.length,1);assert.match((await ativos()).rows[0].storage_path,/000031/);
    assert.equal((await db.query('SELECT id FROM certificados_a1_versoes')).rows.length,2);
    const configs=(await db.query<{config:Record<string,string>}>("SELECT config FROM configuracoes_modulo WHERE modulo LIKE 'fiscal_%' OR modulo LIKE 'cte_%' ORDER BY modulo")).rows.map(r=>r.config);
    assert.equal(configs[0].numero_inicial,'80');assert.equal(configs[1].numero_inicial,'50');assert.equal(configs[1].icms,'12');
    assert.ok(configs.every(c=>c.cert_a1_senha==='senha-31'));
  });
  await scenario('falha na sincronização não desativa o anterior nem deixa novo arquivo/senha nos parâmetros',async()=>{
    await ativar(30);
    await db.exec("CREATE FUNCTION falhar_cert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha simulada'; END $$;CREATE TRIGGER z_falhar BEFORE UPDATE ON configuracoes_modulo FOR EACH ROW EXECUTE FUNCTION falhar_cert();");
    try{await assert.rejects(ativar(31),/Falha simulada/);}finally{await db.exec('DROP TRIGGER z_falhar ON configuracoes_modulo;DROP FUNCTION falhar_cert();');}
    assert.equal((await ativos()).rows[0].senha,'senha-30');assert.equal((await db.query('SELECT id FROM certificados_a1_versoes')).rows.length,1);
  });
  await scenario('CPF/CNPJ incompatível, arquivo de outro cliente e validade expirada não alteram o ativo',async()=>{
    await ativar(30);
    for(const extra of [{emitente:'98765432000100'},{storage_path:`${id(20)}/versoes/novo.pfx`},{valido_ate:'2021-01-01'}]) await assert.rejects(ativar(31,extra));
    assert.equal((await ativos()).rows[0].senha,'senha-30');
  });
  await scenario('renovação não modifica outra conta nem outro titular',async()=>{
    await db.query("INSERT INTO configuracoes_modulo VALUES($1,'fiscal_emp_98765432000100',$2,now()),($3,'fiscal_emp_12345678000190',$2,now())",[id(10),{cert_a1_senha:'preservada'},id(20)]);
    await ativar(30);
    assert.equal((await db.query<{n:number}>("SELECT count(*)::int n FROM configuracoes_modulo WHERE config->>'cert_a1_senha'='preservada'")).rows[0].n,2);
  });
  await scenario('senha e versões não são legíveis pelo navegador; alteração somente por RPC do servidor',async()=>{
    await ativar(30);await db.exec('SET ROLE authenticated');
    try{await assert.rejects(db.query('SELECT senha FROM certificados_a1_versoes'),/permission denied/);await assert.rejects(ativar(31),/permission denied/);}finally{await db.exec('RESET ROLE');}
    await db.exec('SET ROLE service_role');
    try{assert.equal((await ativos()).rows.length,1);await assert.rejects(db.exec('UPDATE certificados_a1_versoes SET ativo=false'),/permission denied/);}finally{await db.exec('RESET ROLE');}
  });
 }finally{await db.close();}
});
