// Correções verificáveis de outubro/2026 e vínculos de premiações do Grupo Ogliari.
// Primeiro: node --env-file=.env.local scripts/folha-ogliari-reconciliar.mjs --snapshot /caminho/snapshot.json
// Aplicar somente o plano já inspecionado: node --env-file=.env.local scripts/folha-ogliari-reconciliar.mjs --aplicar backup/arquivo.json
// O plano guarda os registros originais e o diário; nunca altera o caixa de títulos pagos.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { criarResolvedorEmpregador } from '../lib/folha/empregador.ts';
import { liquidoGravado } from '../lib/folha/controle.ts';
const arg = k => process.argv[process.argv.indexOf(k) + 1];
const r2 = v => Math.round(v * 100) / 100;
const sum = (ls, campo) => r2(ls.reduce((s,l) => s + Number(typeof campo === 'function' ? campo(l) : l[campo] ?? 0), 0));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const protegido = t => !t || ['baixado','pago','parcial'].includes(t.status) || Number(t.valor_pago ?? 0) > 0 || !!t.lote_id || !!t.conciliado;
const iguais = (a,b) => isDeepStrictEqual(a,b);
const financeiro = t => Object.fromEntries(['valor','valor_pago','status','data_baixa','data_pagamento','conta_bancaria','conta_bancaria_id','lote_id','conciliado'].map(k=>[k,t[k]??null]));
const uuid = () => crypto.randomUUID();
const arquivo = process.argv.includes('--aplicar') ? arg('--aplicar') : null;
if (!arquivo && !process.argv.includes('--snapshot')) throw new Error('Informe --snapshot ou --aplicar.');
let plano;
if (!arquivo) {
 const d = JSON.parse(fs.readFileSync(arg('--snapshot'),'utf8'));
 if(d.conta.nome !== 'Grupo Ogliari' || d.fazendas.some(f=>f.conta_id!==d.conta.id))throw Error('Escopo inválido.');
 const resolver = criarResolvedorEmpregador(d.empresas,d.produtores,d.funcionarios);
 const nomes = new Map([...d.empresas.map(e=>[e.id,e.nome]),...d.produtores.map(p=>[p.id,p.nome])]);
 const ts = d.titulos.lancamentos;
 const ops=[], pendencias=[];
 const update = (tabela,antes,depois,motivo) => { const patch=Object.fromEntries(Object.entries(depois).filter(([k,v])=>!iguais(antes[k],v)));if(Object.keys(patch).length)ops.push({tipo:'update',tabela,id:antes.id,antes,depois:patch,motivo}); };
 const inserir=(tabela,row,motivo)=>ops.push({tipo:'insert',tabela,id:row.id,depois:row,motivo});
 const cpFinanceiro = ts.filter(t=>protegido(t)).map(t=>({id:t.id,campos:financeiro(t)}));
 const folhas = d.folhas.filter(f=>f.competencia==='2026-10');
 const original = folhas.find(f=>d.linhas.filter(l=>l.folha_id===f.id).length===49);
 if(!original) throw Error('A folha original de 49 linhas já mudou. Gere nova auditoria antes de preparar outro plano.');
 const linhas = d.linhas.filter(l=>folhas.some(f=>f.id===l.folha_id));
 const grupos = new Map();
 for(const l of linhas){
  const f=folhas.find(f=>f.id===l.folha_id);
  // A atribuição usa o vínculo GRAVADO NA LINHA, nunca o cadastro atual.
  const e=resolver(l.empresa_id||l.produtor_id?l:{});
  const chave=e.chave||'sem-vinculo';
  if(!grupos.has(chave))grupos.set(chave,{chave,e,linhas:[],destino:null});
  grupos.get(chave).linhas.push({...l,folhaOrigem:f});
 }
 for(const g of grupos.values()){
  const candidatas=folhas.filter(f=>resolver(f).chave===g.e.chave);
  if(candidatas.length>1)throw Error('Mais de uma folha de destino para o mesmo documento.');
  g.destino=candidatas[0]??{id:uuid(),fazenda_id:original.fazenda_id,empresa_id:g.e.empresa_id,produtor_id:g.e.produtor_id,competencia:'2026-10',status:'fechado',data_vencimento:original.data_vencimento,ano_safra_id:original.ano_safra_id,obs:'Reconciliação histórica: linhas redistribuídas de outubro/2026; valores salariais preservados.'};
  if(!g.e.chave){g.destino.obs += ' Empregador não identificado nos vínculos históricos; não atribuir automaticamente ao cadastro atual.';pendencias.push({tipo:'empregador_indefinido',nomes:g.linhas.map(l=>l.nome_funcionario)});}
  const porPessoa=new Map();
  for(const l of g.linhas){const k=l.funcionario_id||l.id;if(!porPessoa.has(k))porPessoa.set(k,[]);porPessoa.get(k).push(l);}
  g.manter=[];
  for(const ls of porPessoa.values()){
   const principal=ls.find(l=>l.folha_id===g.destino.id)??ls[0];
   g.manter.push(principal);
   for(const l of ls.filter(l=>l.id!==principal.id)){
    const campos=['salario_bruto','complemento_salarial','inss_trabalhador','irrf','adiantamento','outros_descontos','vale_transporte','vale_refeicao','outros_beneficios','inss_patronal','fgts'];
    const t=ts.find(t=>t.id===l.cp_lancamento_id), correto=ts.find(t=>t.id===principal.cp_lancamento_id);
    if(!campos.every(c=>Number(l[c]??0)===Number(principal[c]??0))||protegido(t)||!correto||Math.abs(Number(t.valor)-liquidoGravado(l))>.005||ts.some(x=>x.titulo_origem_id===t.id))throw Error('Duplicidade sem evidência suficiente ou com pagamento: '+l.nome_funcionario);
    if(d.linhas.filter(x=>x.cp_lancamento_id===t.id).length!==1)throw Error('Título compartilhado.');
    update('lancamentos',t,{status:'cancelado',observacao:`${t.observacao||''}\nCancelado por duplicidade confirmada de outubro/2026; título mantido ${correto.id}.`.trim()},'Cancelar somente salário duplicado não pago');
    const {folhaOrigem,...antes}=l; void folhaOrigem;
    ops.push({tipo:'delete',tabela:'folha_funcionarios',id:l.id,antes,motivo:'Remover linha idêntica da folha do empregador incorreto; original preservado no plano'});
   }
  }
  const totais={valor_bruto:sum(g.manter,'salario_bruto'),valor_liquido:sum(g.manter,liquidoGravado),fgts_total:sum(g.manter,'fgts'),inss_patronal:sum(g.manter,'inss_patronal')};
  const nova=!folhas.some(f=>f.id===g.destino.id);
  if(nova)inserir('folha_pagamento',{...g.destino,...totais},'Criar cabeçalho histórico para as linhas já existentes');
  for(const l of g.manter){
   if(l.folha_id!==g.destino.id){const {folhaOrigem,...antes}=l; void folhaOrigem;update('folha_funcionarios',antes,{folha_id:g.destino.id},'Mover linha para o empregador gravado nela, mantendo os valores e o CP');}
   if(g.e.chave){const t=ts.find(t=>t.id===l.cp_lancamento_id);if(t&&t.funcionario_id===l.funcionario_id)update('lancamentos',t,{empresa_id:g.e.empresa_id,produtor_id:g.e.produtor_id},'Corrigir somente identificação do empregador; caixa preservado');}
  }
  const encIds={};
  for(const[campo,total,nome]of [['cp_fgts_id',totais.fgts_total,'FGTS'],['cp_inss_patronal_id',totais.inss_patronal,'INSS Patronal']]){
   const existente=ts.find(t=>t.id===g.destino[campo]);
   const modelo=ts.find(t=>t.id===original[campo]);
   if(existente&&protegido(existente)&&Math.abs(Number(existente.valor)-total)>.005)throw Error('Encargo pago ou protegido; não ajustar automaticamente.');
   if(existente){update('lancamentos',existente,{valor:total,...(total===0?{status:'cancelado'}:{})},'Redistribuir encargo não pago, sem recalcular alíquotas');encIds[campo]=existente.id;}
   else if(total>0){if(!modelo||protegido(modelo))throw Error('Encargo original não disponível para redistribuição.');const cp={id:uuid(),fazenda_id:g.destino.fazenda_id,empresa_id:g.e.empresa_id,produtor_id:g.e.produtor_id,tipo:'pagar',moeda:'BRL',descricao:`${nome} Out/2026 — ${nomes.get(g.e.empresa_id||g.e.produtor_id)||'Empregador a identificar'}`,categoria:'Pessoal / Encargos',valor:total,natureza:'real',status:'em_aberto',origem_lancamento:'folha',data_vencimento:modelo.data_vencimento,data_lancamento:modelo.data_lancamento,operacao_gerencial_id:modelo.operacao_gerencial_id,ano_safra_id:modelo.ano_safra_id,pessoa_id:modelo.pessoa_id,observacao:`Redistribuição histórica do título ${modelo.id}; sem alteração das alíquotas gravadas nas linhas.`};inserir('lancamentos',cp,'Redistribuir encargo existente para o empregador correto');encIds[campo]=cp.id;}
  }
  update('folha_pagamento',nova?{...g.destino,...totais}:g.destino,{...totais,...encIds},'Recompor totais a partir das linhas mantidas');
 }
 // Premiações históricas: vínculo somente com candidato único pela pessoa, valor e vencimento exato.
 const usados=new Set([...d.premios,...d.premiosCadastro].map(p=>p.lancamento_id).filter(Boolean));
 for(const p of d.premiosCadastro.filter(p=>p.mes_referencia>='2026-08'&&p.mes_referencia<='2026-10'&&!p.lancamento_id)){
  const pessoa=d.funcionarios.find(f=>f.id===p.funcionario_id);
  const cand=ts.filter(t=>t.status!=='cancelado'&&t.tipo==='pagar'&&!t.titulo_origem_id&&!usados.has(t.id)&&norm(t.descricao).startsWith('PREMIACAO')&&(t.funcionario_id===p.funcionario_id||norm(t.descricao).includes(norm(pessoa?.nome)))&&Number(t.valor)===Number(p.valor)&&t.data_vencimento===p.data_pagamento);
  if(cand.length!==1){pendencias.push({tipo:'premiacao_sem_vinculo_inequivoco',id:p.id,competencia:p.mes_referencia,nome:pessoa?.nome,valor:p.valor,candidatos:cand.length});continue;}
  usados.add(cand[0].id);update('funcionario_premiacoes',p,{lancamento_id:cand[0].id,lancado_financeiro:true},'Religar premiação ao CP existente; não criar nem pagar outro título');
 }
 plano={versao:1,cliente:d.conta,criado_em:new Date().toISOString(),snapshot:d,protegidos:cpFinanceiro,operacoes:ops,pendencias,aplicadas:[]};
 fs.mkdirSync('backup',{recursive:true});const arq=`backup/ogliari_reconciliacao_${Date.now()}.json`;fs.writeFileSync(arq,JSON.stringify(plano,null,2),{mode:0o600});console.log(JSON.stringify({plano:arq,operacoes:ops.length,resumo:ops.reduce((r,o)=>(r[o.motivo]=(r[o.motivo]||0)+1,r),{}),pendencias},null,2));
} else {
 plano=JSON.parse(fs.readFileSync(arquivo,'utf8'));
 if(plano.cliente.nome!=='Grupo Ogliari'||plano.aplicadas.length)throw Error('Plano inválido ou já iniciado. Não reaplicar; confira o diário.');
 const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 // Confere todo o conjunto antes da primeira escrita, inclusive registros pagos protegidos.
 const existentes=new Map();
 const criadas=new Set(plano.operacoes.filter(o=>o.tipo==='insert').map(o=>o.tabela+'|'+o.id));
 for(const op of plano.operacoes){if(op.tipo==='insert'||criadas.has(op.tabela+'|'+op.id))continue;const k=op.tabela+'|'+op.id;if(existentes.has(k))continue;const{data,error}=await sb.from(op.tabela).select('*').eq('id',op.id).single();if(error)throw Error(error.message);if(!iguais(data,op.antes))throw Error('Registro mudou desde o plano: '+k);existentes.set(k,data);}
 for(const op of plano.operacoes.filter(o=>o.tipo==='insert')){const{data,error}=await sb.from(op.tabela).select('id').eq('id',op.id).maybeSingle();if(error||data)throw Error('ID de inserção indisponível: '+op.id);}
 const fazIds=plano.snapshot.fazendas.map(f=>f.id);
 const{data:faz,error:ef}=await sb.from('fazendas').select('id').eq('conta_id',plano.cliente.id);if(ef||fazIds.some(id=>!faz.some(f=>f.id===id)))throw Error('Escopo do cliente mudou.');
 for(let i=0;i<plano.operacoes.length;i++){
  const op=plano.operacoes[i];let q;
  if(op.tipo==='insert')q=sb.from(op.tabela).insert(op.depois);
  else {q=op.tipo==='update'?sb.from(op.tabela).update(op.depois):sb.from(op.tabela).delete();q=q.eq('id',op.id);const atual=existentes.get(op.tabela+'|'+op.id)||op.antes;for(const[k,v]of Object.entries(atual)){if(v&&typeof v==='object')continue;q=v==null?q.is(k,null):q.eq(k,v);}}
  const{data,error}=await q.select('id');
  if(error||data?.length!==1){plano.erro={operacao:i,mensagem:error?.message||'Registro mudou durante a aplicação.'};fs.writeFileSync(arquivo,JSON.stringify(plano,null,2),{mode:0o600});throw Error(JSON.stringify(plano.erro));}
  plano.aplicadas.push({operacao:i,quando:new Date().toISOString()});fs.writeFileSync(arquivo,JSON.stringify(plano,null,2),{mode:0o600});
  existentes.set(op.tabela+'|'+op.id,{...(existentes.get(op.tabela+'|'+op.id)||{}),...op.depois});
 }
 // Atesta que valor, status, conta, data e conciliação de TODOS os títulos pagos ficaram intactos.
 for(let i=0;i<plano.protegidos.length;i+=100){const ids=plano.protegidos.slice(i,i+100).map(t=>t.id);const{data,error}=await sb.from('lancamentos').select('*').in('fazenda_id',fazIds).in('id',ids);if(error)throw error;for(const t of data){const antigo=plano.protegidos.find(p=>p.id===t.id);if(!iguais(financeiro(t),antigo.campos))throw Error('Verificação de caixa falhou: '+t.id);}if(data.length!==ids.length)throw Error('Título protegido ausente.');}
 const afetadas=[...new Set(plano.operacoes.filter(o=>o.tabela==='folha_pagamento').map(o=>o.id))];
 for(const folhaId of afetadas){const{error}=await sb.from('folha_historico').insert({folha_id:folhaId,usuario_nome:'Reconciliação solicitada pelo usuário',acao:'reconciliar_historico',alteracoes:{backup:arquivo,duplicidades_removidas:2,criterio:'Vínculos gravados nas linhas; pagamentos preservados; pendências sem evidência não alteradas.'}});if(error)throw error;}
 plano.concluido_em=new Date().toISOString();fs.writeFileSync(arquivo,JSON.stringify(plano,null,2),{mode:0o600});console.log(JSON.stringify({aplicadas:plano.aplicadas.length,titulos_pagos_preservados:plano.protegidos.length,backup:arquivo,pendencias:plano.pendencias.length}));
}
