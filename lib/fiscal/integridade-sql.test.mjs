import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
const sql=fs.readFileSync(new URL('../../supabase_migrations.sql',import.meta.url),'utf8');
const section=n=>{const a=sql.indexOf('-- Seção '+n+' —');assert.ok(a>=0);const b=sql.indexOf('-- Seção '+(n+1)+' —',a+1);return sql.slice(a,b<0?undefined:b);};
const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
async function banco(){const db=new PGlite();await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE TABLE fazendas(id uuid PRIMARY KEY,conta_id uuid,cpf_cnpj_fiscal text);
 CREATE FUNCTION rls_minhas_fazendas() RETURNS SETOF uuid LANGUAGE sql AS $$SELECT id FROM fazendas$$;
 CREATE FUNCTION rls_sou_raccotlo() RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
 CREATE TABLE operacoes_gerenciais(id uuid PRIMARY KEY,fazenda_id uuid,conta_id uuid);
 CREATE TABLE centros_custo(id uuid PRIMARY KEY,fazenda_id uuid);
 CREATE TABLE produtores(id uuid PRIMARY KEY,fazenda_id uuid,cpf_cnpj text);
 CREATE TABLE nf_entradas(id uuid PRIMARY KEY,fazenda_id uuid,status text,operacao_gerencial_id uuid,centro_custo_id uuid);
 CREATE TABLE lancamentos(id uuid PRIMARY KEY,nf_entrada_id uuid,operacao_gerencial_id uuid,centro_custo_id uuid);
 CREATE TABLE empresa_lancamentos(LIKE lancamentos INCLUDING ALL);
 CREATE TABLE configuracoes_modulo(fazenda_id uuid,conta_id uuid,modulo text,config jsonb,updated_at timestamptz DEFAULT now(),UNIQUE(fazenda_id,modulo));
 CREATE TABLE financeiro_operacoes(requisicao_id uuid PRIMARY KEY,tabela text,registro_id uuid,acao text,dados jsonb,antes jsonb,depois jsonb,retorno jsonb,created_at timestamptz);
 CREATE TABLE notas_fiscais(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fazenda_id uuid,numero text,serie text,status text,dados_nf_json jsonb,chave_acesso text,xml_url text);
 CREATE TABLE ncm_tributacoes(id uuid PRIMARY KEY,fazenda_id uuid,ncm text,UNIQUE(fazenda_id,ncm));CREATE TABLE operacoes_fiscais(id uuid PRIMARY KEY);
 CREATE TABLE ctes(id uuid PRIMARY KEY,fazenda_id uuid,status text,numero_cte text,serie text,emitente_cnpj text);
 CREATE TABLE mdfes(id uuid PRIMARY KEY,fazenda_id uuid,status text,numero_mdfe text,serie text,emitente_cnpj text);
 INSERT INTO fazendas VALUES('${id(1)}','${id(10)}','12345678901'),('${id(2)}','${id(20)}','98765432100'),('${id(3)}','${id(10)}','12345678901');
 INSERT INTO operacoes_gerenciais VALUES('${id(4)}',NULL,'${id(10)}'),('${id(5)}',NULL,'${id(20)}');
 INSERT INTO centros_custo VALUES('${id(6)}','${id(1)}');
 INSERT INTO produtores VALUES('${id(7)}','${id(1)}','12345678901'),('${id(8)}','${id(2)}','98765432100');
 `);
 const a=sql.indexOf('CREATE OR REPLACE FUNCTION public.financeiro_validar_referencias(');const b=sql.indexOf('$$;',a)+3;await db.exec(sql.slice(a,b));
 for(const n of [440,441,442,443,444])await db.exec(section(n));return db;}

test('fiscal: SQL real — titularidade, rollback, configuração e sequência',async t=>{
 const db=await banco();try{
 await t.test('reclassificação recusa OG de outro cliente e não modifica a nota',async()=>{
  await db.exec(`INSERT INTO nf_entradas VALUES('${id(30)}','${id(1)}','processada',NULL,NULL);INSERT INTO lancamentos VALUES('${id(31)}','${id(30)}',NULL,NULL);`);
  await assert.rejects(db.query('SELECT fiscal_reclassificar_nf($1,$2,$3,$4)',[id(30),id(1),id(5),id(6)]),/outro cliente/);
  assert.equal((await db.query('SELECT operacao_gerencial_id FROM nf_entradas')).rows[0].operacao_gerencial_id,null);
 });
 await t.test('falha no CP reverte também a NF',async()=>{
  await db.exec(`CREATE FUNCTION recusar() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'CP recusou';END$$;CREATE TRIGGER falha BEFORE UPDATE ON lancamentos FOR EACH ROW EXECUTE FUNCTION recusar();`);
  await assert.rejects(db.query('SELECT fiscal_reclassificar_nf($1,$2,$3,$4)',[id(30),id(1),id(4),id(6)]),/CP recusou/);
  assert.equal((await db.query('SELECT operacao_gerencial_id FROM nf_entradas')).rows[0].operacao_gerencial_id,null);
  await db.exec('DROP TRIGGER falha ON lancamentos');
  await db.query('SELECT fiscal_reclassificar_nf($1,$2,$3,$4)',[id(30),id(1),id(4),id(6)]);
  assert.equal((await db.query('SELECT operacao_gerencial_id FROM lancamentos')).rows[0].operacao_gerencial_id,id(4));
 });
 const modulo='fiscal_pf_12345678901';const cfg={serie_nfe:'923',numero_inicial:'10',ambiente:'homologacao',cert_a1_path:'protegido',cert_a1_senha:'laboratorio'};
 await t.test('tela anterior não regride contador nem certificado',async()=>{
  await db.query('INSERT INTO configuracoes_modulo(fazenda_id,modulo,config)VALUES($1,$2,$3)',[id(1),modulo,cfg]);
  const base=[{fazenda_id:id(1),conta_id:null,config:cfg}];
  await db.exec(`UPDATE configuracoes_modulo SET config=config||'{"numero_inicial":"11","cert_a1_path":"novo"}'`);
  await db.query('SELECT fiscal_salvar_config($1,$2,$3,$4)',[id(1),modulo,{...cfg,ambiente:'producao'},base]);
  const out=(await db.query('SELECT config FROM configuracoes_modulo')).rows[0].config;assert.equal(out.numero_inicial,'11');assert.equal(out.cert_a1_path,'novo');assert.equal(out.ambiente,'producao');
  const hist=(await db.query("SELECT antes::text||depois::text v FROM fiscal_alteracoes WHERE tabela='configuracoes_modulo'")).rows.map(r=>r.v).join('');assert.doesNotMatch(hist,/laboratorio|protegido|cert_a1_senha|cert_a1_path/);
  await assert.rejects(db.query('SELECT fiscal_salvar_config($1,$2,$3,$4)',[id(1),modulo,cfg,base]),/alterados/);
 });
 const reserva=(req,registro=null,modelo=55,more={})=>db.query('SELECT fiscal_reservar_emissao($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) r',[id(req),id(1),modelo,'12345678901',923,'homologacao',{pedido:'lab',...more},modulo,10,registro]);
 await t.test('duas reservas recebem números distintos e reenvio mantém a primeira',async()=>{
  const [a,b]=await Promise.all([reserva(40),reserva(41)]);assert.notEqual(a.rows[0].r.numero,b.rows[0].r.numero);
  const again=(await reserva(40)).rows[0].r;assert.equal(again.executar,false);assert.equal(again.numero,a.rows[0].r.numero);
  await assert.rejects(reserva(40,null,55,{pedido:'mudou'}),/outros dados/);
 });
 await t.test('reserva com registro de outro cliente falha antes de criar operação',async()=>{
  await db.query('INSERT INTO ctes(id,fazenda_id,status)VALUES($1,$2,$3)',[id(50),id(2),'rascunho']);
  await assert.rejects(reserva(51,id(50),57),/fazenda autorizada/);
  assert.equal((await db.query('SELECT count(*) n FROM fiscal_operacoes WHERE id=$1',[id(51)])).rows[0].n,0);
 });
 await t.test('XML é durável antes do envio e envio não pode ser preparado duas vezes',async()=>{
  const op=(await db.query('SELECT numero FROM fiscal_operacoes WHERE id=$1',[id(40)])).rows[0];
  const k='512611'+ '12345678901'.padStart(14,'0')+'55'+'923'+String(op.numero).padStart(9,'0')+'1'+'00000001';
  let peso=2,soma=0;for(let i=42;i>=0;i--){soma+=Number(k[i])*peso;peso=peso===9?2:peso+1;}const d=11-soma%11;const chave=k+String(d>=10?0:d);
  const xml='<NFe Id="NFe'+chave+'"><tpAmb>2</tpAmb></NFe>';
  await assert.rejects(db.query('SELECT fiscal_preparar_envio($1,$2,$3)',[id(40),xml,'1'.repeat(44)]),/não corresponde/);
  await db.query('SELECT fiscal_preparar_envio($1,$2,$3,$4)',[id(40),xml,chave,[{regra:'laboratorio'}]]);
  assert.equal((await db.query('SELECT estado,xml_assinado FROM fiscal_operacoes WHERE id=$1',[id(40)])).rows[0].xml_assinado,xml);
  await assert.rejects(db.query('SELECT fiscal_preparar_envio($1,$2,$3)',[id(40),xml,chave]),/já enviada/);
  await db.query('SELECT fiscal_registrar_retorno($1,$2,$3,$4,$5)',[id(40),'autorizada',{cStat:'100'},{sucesso:true,protocolo:'lab'},'<nfeProc/>']);
  await assert.rejects(db.query('SELECT fiscal_registrar_retorno($1,$2,$3,$4)',[id(40),'rejeitada',{},{}]),/não admite/);
 });
 await t.test('NF por chave é idempotente e não aceita autorização sem protocolo',async()=>{
  const entrada={fazenda_id:id(1),numero:'50',serie:'1',status:'autorizada',chave_acesso:'2'.repeat(44)};
  await assert.rejects(db.query('SELECT fiscal_gravar_nota($1)',[entrada]),/protocolo/);
  const dados={...entrada,dados_nf_json:{protocolo_autorizacao:'comprovado'}};
  const a=(await db.query('SELECT fiscal_gravar_nota($1) r',[dados])).rows[0].r;
  const b=(await db.query('SELECT fiscal_gravar_nota($1) r',[{...dados,numero:'99'}])).rows[0].r;
  assert.equal(a.id,b.id);assert.equal(b.numero,'50');
 });
 await t.test('retomadas concorrentes usam concessão exclusiva e liberável',async()=>{
  await db.exec(`UPDATE fiscal_operacoes SET updated_at=clock_timestamp()-interval '20 seconds' WHERE id='${id(40)}'`);
  await db.query('SELECT fiscal_obter_recuperacao($1,$2)',[id(40),id(70)]);
  await assert.rejects(db.query('SELECT fiscal_obter_recuperacao($1,$2)',[id(40),id(71)]),/processamento/);
  await db.query('SELECT fiscal_liberar_recuperacao($1,$2)',[id(40),id(70)]);
  await db.query('SELECT fiscal_obter_recuperacao($1,$2)',[id(40),id(71)]);
 });
 await t.test('inclusão no LCDPR é persistida e repetição não duplica; outro cliente é recusado',async()=>{
  const linha={fazendaId:id(1),produtorId:id(7),data:'2026-01-05',historico:'Ajuste comprovado',tipoDoc:'6',receita:100,despesa:0,origem:'manual'};
  const run=(req,rows)=>db.query('SELECT lcdpr_incluir_movimentos($1,$2,$3,$4) r',[id(1),rows,id(req),id(99)]);
  await run(60,[linha]);await run(60,[linha]);assert.equal((await db.query('SELECT count(*) n FROM lcdpr_movimentos')).rows[0].n,1);
  await assert.rejects(run(61,[linha,{...linha,produtorId:id(8)}]),/outro cliente/);
  assert.equal((await db.query('SELECT count(*) n FROM lcdpr_movimentos')).rows[0].n,1);
 });
 await t.test('importação LCDPR: mesmo arquivo/linha não duplica com outra requisição',async()=>{
  const linha={fazendaId:id(1),produtorId:id(7),data:'2026-01-05',historico:'Documento importado',tipoDoc:'6',receita:200,despesa:0,origem:'importado',importacao_ref:'a'.repeat(64)+':2'};
  const run=req=>db.query('SELECT lcdpr_incluir_movimentos($1,$2,$3,$4) r',[id(1),[linha],id(req),id(99)]);
  assert.equal((await run(62)).rows[0].r.criados,1);
  const r=(await run(63)).rows[0].r;assert.equal(r.criados,0);assert.equal(r.reutilizados,1);
 });
 await t.test('versão do catálogo fiscal avança a cada gravação',async()=>{
  await db.query('INSERT INTO ncm_tributacoes(id)VALUES($1)',[id(100)]);
  await db.query('UPDATE ncm_tributacoes SET vigencia_inicio=$1 WHERE id=$2',['2026-01-01',id(100)]);
  assert.equal((await db.query('SELECT versao FROM ncm_tributacoes WHERE id=$1',[id(100)])).rows[0].versao,2);
 });
 await t.test('NCM conserva versões de períodos diferentes e recusa duplicar o mesmo período',async()=>{
  await db.query('INSERT INTO ncm_tributacoes(id,fazenda_id,ncm,vigencia_inicio,vigencia_fim)VALUES($1,$2,$3,$4,$5)',[id(101),id(1),'12019000','2026-01-01','2026-12-31']);
  await db.query('INSERT INTO ncm_tributacoes(id,fazenda_id,ncm,vigencia_inicio,vigencia_fim)VALUES($1,$2,$3,$4,$5)',[id(102),id(1),'12019000','2027-01-01',null]);
  await assert.rejects(db.query('INSERT INTO ncm_tributacoes(id,fazenda_id,ncm,vigencia_inicio,vigencia_fim)VALUES($1,$2,$3,$4,$5)',[id(103),id(1),'12019000','2027-01-01',null]),/unique/);
  assert.equal((await db.query('SELECT count(*) n FROM ncm_tributacoes WHERE ncm=$1',['12019000'])).rows[0].n,2);
 });
 await t.test('NSU: resposta atrasada não reduz cursor e ambientes não se confundem',async()=>{
  await db.query('SELECT fiscal_avancar_nsu($1,$2,$3,$4)',[id(1),'dist_cte_laboratorio','42','producao']);
  await db.query('SELECT fiscal_avancar_nsu($1,$2,$3,$4)',[id(1),'dist_cte_laboratorio','41','producao']);
  assert.equal((await db.query("SELECT config->>'ult_nsu' n FROM configuracoes_modulo WHERE modulo='dist_cte_laboratorio'")).rows[0].n,'000000000000042');
  await assert.rejects(db.query('SELECT fiscal_avancar_nsu($1,$2,$3,$4)',[id(1),'dist_cte_laboratorio','50','homologacao']),/outro ambiente/);
 });
 await t.test('LCDPR: alteração e exclusão exigem versão e guardam autoria',async()=>{
  const linha=(await db.query("SELECT * FROM lcdpr_movimentos WHERE origem='manual' LIMIT 1")).rows[0];
  await assert.rejects(db.query("SELECT lcdpr_alterar_movimento($1,'documento','1',NULL,$2,NULL)",[linha.id,id(99)]),/Movimento alterado/);
  const atualizado=(await db.query("SELECT lcdpr_alterar_movimento($1,'documento','1',NULL,$2,$3) r",[linha.id,id(99),linha.updated_at])).rows[0].r;
  await assert.rejects(db.query("SELECT lcdpr_alterar_movimento($1,'excluir',NULL,'',$2,$3)",[linha.id,id(99),atualizado.updated_at]),/motivo/);
  await db.query("SELECT lcdpr_alterar_movimento($1,'excluir',NULL,'Documento duplicado confirmado',$2,$3)",[linha.id,id(99),atualizado.updated_at]);
  assert.equal((await db.query('SELECT excluido FROM lcdpr_movimentos WHERE id=$1',[linha.id])).rows[0].excluido,true);
  const hist=(await db.query("SELECT usuario_id FROM fiscal_alteracoes WHERE tabela='lcdpr_movimentos' AND registro_id=$1",[linha.id])).rows;assert.equal(hist.length,2);assert.equal(hist[0].usuario_id,id(99));
 });
 await t.test('permissões: papel autenticado não executa comandos privilegiados diretamente',async()=>{
  await db.exec('SET ROLE authenticated');
  try{await assert.rejects(db.query('SELECT fiscal_reservar_emissao($1,$2,55,$3,923,$4,$5,$6,1,NULL)',[id(150),id(1),'12345678901','homologacao',{},'fiscal_pf_12345678901']),/permission denied/);}
  finally{await db.exec('RESET ROLE');}
 });
 await t.test('eventos: prova externa durável e falha local reverte somente os efeitos internos',async()=>{
  await db.exec(`
   ALTER TABLE nf_entradas ADD COLUMN compensacoes jsonb;ALTER TABLE nf_entradas ADD COLUMN nf_origem_id uuid;ALTER TABLE nf_entradas ADD COLUMN devolucao_situacao text;
   ALTER TABLE lancamentos ADD COLUMN valor numeric;ALTER TABLE lancamentos ADD COLUMN status text;ALTER TABLE lancamentos ADD COLUMN valor_pago numeric;ALTER TABLE lancamentos ADD COLUMN lote_id uuid;ALTER TABLE lancamentos ADD COLUMN conciliado boolean;
   CREATE TABLE nfe_cartas_correcao(id uuid DEFAULT gen_random_uuid(),nota_id uuid,fazenda_id uuid,chave_acesso text,sequencia integer,texto_correcao text,status text,cstat text,xmotivo text,protocolo_evento text,UNIQUE(chave_acesso,sequencia));
   CREATE TABLE contrato_faturamentos(id uuid PRIMARY KEY,nota_fiscal_id uuid,contrato_id uuid,cr_lancamento_id uuid,valor_abatido numeric);
   CREATE TABLE contratos(id uuid PRIMARY KEY,lancamento_cr_id uuid);
   CREATE TABLE nf_entrada_itens(id uuid PRIMARY KEY,nf_entrada_id uuid,origem_item_id uuid,tipo_apropiacao text,quantidade numeric);
   CREATE TABLE movimentacoes_estoque(id uuid PRIMARY KEY,nf_entrada_id uuid);
   CREATE TABLE transferencias_maquinas(id uuid PRIMARY KEY,fazenda_id uuid,status text,nf_saida_chave text,direcao text,nf_retorno_chave text,nf_retorno_numero text,nf_retorno_protocolo text,nf_retorno_data date);
  `);
  await db.exec(section(445));
  await db.query("INSERT INTO notas_fiscais(id,fazenda_id,numero,serie,status,chave_acesso,dados_nf_json)VALUES($1,$2,'90','1','autorizada',$3,'{}')",[id(80),id(1),'3'.repeat(44)]);
  await db.query("INSERT INTO lancamentos(id,valor,status)VALUES($1,100,'em_aberto'),($2,50,'em_aberto')",[id(81),id(82)]);
  await db.query('INSERT INTO contratos VALUES($1,$2)',[id(83),id(81)]);
  await db.query('INSERT INTO contrato_faturamentos VALUES($1,$2,$3,$4,50)',[id(84),id(80),id(83),id(82)]);
  const a=(await db.query("SELECT fiscal_reservar_evento($1,'cancelar',$2) r",[id(80),{justificativa:'Teste controlado sem rede'}])).rows[0].r;
  const b=(await db.query("SELECT fiscal_reservar_evento($1,'cancelar',$2) r",[id(80),{justificativa:'Teste controlado sem rede'}])).rows[0].r;
  assert.equal(a.id,b.id);assert.equal(b.executar,false);
  await db.exec("CREATE TRIGGER falha BEFORE UPDATE ON lancamentos FOR EACH ROW EXECUTE FUNCTION recusar()");
  const resposta={sucesso:true,cStat:'135',protocoloEvento:'teste-local'};
  const r=(await db.query('SELECT fiscal_concluir_evento($1,$2) r',[a.id,resposta])).rows[0].r;
  assert.equal(r.sincronizacao_pendente,true);
  assert.equal((await db.query('SELECT status FROM notas_fiscais WHERE id=$1',[id(80)])).rows[0].status,'cancelada');
  await assert.rejects(db.query("UPDATE notas_fiscais SET status='autorizada' WHERE id=$1",[id(80)]),/estado final/);
  assert.equal((await db.query('SELECT valor FROM lancamentos WHERE id=$1',[id(81)])).rows[0].valor,'100');
  assert.equal((await db.query('SELECT count(*) n FROM contrato_faturamentos')).rows[0].n,1);
  await db.exec('DROP TRIGGER falha ON lancamentos');
  const recuperado=(await db.query('SELECT fiscal_concluir_evento($1) r',[a.id])).rows[0].r;
  assert.equal(recuperado.ok,true);assert.equal(recuperado.sincronizacao_pendente,undefined);
  assert.equal((await db.query('SELECT valor FROM lancamentos WHERE id=$1',[id(81)])).rows[0].valor,'150.00');
  await db.query('SELECT fiscal_concluir_evento($1)',[a.id]);
  assert.equal((await db.query('SELECT valor FROM lancamentos WHERE id=$1',[id(81)])).rows[0].valor,'150.00');
 });
 }finally{await db.close();}
});
