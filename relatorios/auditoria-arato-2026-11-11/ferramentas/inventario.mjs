// Inventário estático de candidatos para revisão, não um detector definitivo de defeitos.
// Não acessa rede, não lê .env e não altera fontes ou dados do aplicativo.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const output=path.join(root,'relatorios/auditoria-arato-2026-11-11/dados');
fs.mkdirSync(output,{recursive:true});
const files=execFileSync('rg',['--files','app','lib','components'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const application=files.filter(p=>/\.(ts|tsx)$/.test(p)&&!p.includes('.test.'));
const queries=[],routes=[],functions=[],signals=[];
function owner(node){
 for(let p=node.parent;p;p=p.parent){
  if(ts.isFunctionDeclaration(p)&&p.name)return p.name.text;
  if((ts.isArrowFunction(p)||ts.isFunctionExpression(p))&&ts.isVariableDeclaration(p.parent))return p.parent.name.getText();
 }
 return '(módulo)';
}
function chain(call){
 const steps=[];
 let p=call;
 while(ts.isCallExpression(p)&&ts.isPropertyAccessExpression(p.expression)){
  const prop=p.expression;
  steps.unshift({method:prop.name.text,args:p.arguments.map(a=>ts.isStringLiteralLike(a)?a.text:null)});
  p=prop.expression;
 }
 return steps;
}
for(const file of application){
 const text=fs.readFileSync(path.join(root,file),'utf8');
 const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const line=n=>tree.getLineAndCharacterOfPosition(n.getStart(tree)).line+1;
 const fileQueries=[];
 function visit(node){
  if(ts.isFunctionDeclaration(node)&&node.name){functions.push({file,line:line(node),name:node.name.text,async:node.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)??false});}
  if(ts.isCallExpression(node)&&!(ts.isPropertyAccessExpression(node.parent)&&node.parent.expression===node)){
   const steps=chain(node);const from=steps.find(s=>s.method==='from');
   if(from){
    const methods=steps.map(s=>s.method);const write=methods.find(m=>['insert','update','upsert','delete'].includes(m));
    let parent=node.parent;if(ts.isAwaitExpression(parent))parent=parent.parent;
    const binding=ts.isVariableDeclaration(parent)?parent.name:undefined;
    const checked=!!binding&&ts.isObjectBindingPattern(binding)&&binding.elements.some(e=>(e.propertyName??e.name).getText()==='error');
    const standalone=ts.isExpressionStatement(parent);
    const bounded=methods.some(m=>['range','limit','single','maybeSingle'].includes(m))||steps.some(s=>['eq','in'].includes(s.method)&&s.args[0]==='id');
    const row={file,line:line(node),owner:owner(node),table:from.args[0]??'(dinâmica)',operation:write??'read',methods,
      result:standalone?'ignorado':checked?'erro_desestruturado':binding?'resultado_sem_error_desestruturado':'retornado_ou_composto',
      candidatePagination:!write&&methods.includes('select')&&!bounded};
    queries.push(row);fileQueries.push(row);
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(tree);
 if(/^app\/api\/.+\/route\.ts$/.test(file)){
  const methods=[...text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)].map(m=>m[1]);
  const importedAuth=[...text.matchAll(/import[^;]*(?:auth|seguranca|permiss|acesso)[^;]*;/gi)].length;
  routes.push({file,methods,lines:text.split('\n').length,importedAuth,
    authSignals:/getUser|getSessionUser|getRequestUser|exigirAcesso|exigirLogin|exigirRaccoltoAdmin|validateFazendaAccess|requireRaccotlo|CRON_SECRET|signature|validarWebhook|webhookWhatsappAutorizado|ASAAS_WEBHOOK_TOKEN|tokenEsperado|acessoDoUsuario|Authorization/i.test(text),
    serviceRole:text.includes('SUPABASE_SERVICE_ROLE_KEY'),writes:fileQueries.filter(q=>q.operation!=='read').length,
    rpc:text.includes('.rpc('),maxDuration:text.match(/maxDuration\s*=\s*(\d+)/)?.[1]??null});
 }
 const checks={
  fetchWithoutAbort:/\bfetch\(/.test(text)&&!/AbortController|AbortSignal|signal\s*:/.test(text),
  swallowedEmpty:/catch\s*(?:\([^)]*\))?\s*\{\s*(?:return\s*\[\]|return\s*null|return\s*\{\})/.test(text),
  disabledTls:/rejectUnauthorized\s*:\s*false/.test(text),
  calendarViaUtc:/toISOString\(\)\.slice\(0,\s*10\)/.test(text),
  modulePermission:/podeAcessar|podeExecutar|permissoes|semPermissao|podeUsar/.test(text),
 };
 for(const [kind,present]of Object.entries(checks))if(present)signals.push({file,kind});
}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const testFiles=files.filter(f=>/\.test\.(ts|tsx)$/.test(f));
const configured=(pkg.scripts.test.match(/[\w/.-]+\.test\.(?:ts|tsx|mjs)/g)??[]);
const summary={gerado_em:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  applicationFiles:application.length,routes:routes.length,pages:files.filter(f=>/\/page\.tsx$/.test(f)).length,
  testsDiscovered:testFiles.length,testsConfigured:configured.length,testsOutsideCommand:testFiles.filter(f=>!configured.includes(f)),
  queries:queries.length,writes:queries.filter(q=>q.operation!=='read').length,
  ignoredWriteResults:queries.filter(q=>q.operation!=='read'&&q.result==='ignorado').length,
  unboundedReadCandidates:queries.filter(q=>q.candidatePagination).length,
  routesWithoutAuthSignal:routes.filter(r=>!r.authSignals).map(r=>r.file),
  signals:Object.fromEntries([...new Set(signals.map(s=>s.kind))].map(k=>[k,signals.filter(s=>s.kind===k).length])),
  note:'Os sinais são candidatos estáticos: precisam de revisão/reprodução; a ausência de sinal não prova ausência de proteção.'};
for(const [name,data]of Object.entries({resumo:summary,rotas:routes,consultas:queries,funcoes:functions,sinais:signals})){
 fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(data,null,2)+'\n');
}
console.log(JSON.stringify(summary,null,2));
