// Executa funções REAIS extraídas das fontes com dependências simuladas.
// Nenhum cliente, token, chamada de rede ou banco real entra neste laboratório.
import fs from 'node:fs';
import ts from 'typescript';

export function funcoesReais(file,names,deps={}) {
 const source=fs.readFileSync(file,'utf8');
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const found=new Map();
 function visit(n){if(ts.isFunctionDeclaration(n)&&n.name&&names.includes(n.name.text))found.set(n.name.text,n.getText(tree).replace(/^export\s+/,''));ts.forEachChild(n,visit);}
 visit(tree);
 for(const n of names)if(!found.has(n))throw Error(`Função não encontrada: ${file} ${n}`);
 const sourceJS=ts.transpileModule([...found.values()].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 return new Function(...Object.keys(deps),sourceJS+';return {'+names.join(',')+'};')(...Object.values(deps));
}
export function valorReal(file,name,deps={}) {
 const source=fs.readFileSync(file,'utf8');
 const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 let found;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(tree)===name&&n.initializer&&!found)found=n.initializer.getText(tree);ts.forEachChild(n,visit);}visit(tree);
 if(!found)throw Error(`Valor não encontrado: ${file} ${name}`);
 const js=ts.transpileModule(`const ${name} = ${found};`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 return new Function(...Object.keys(deps),js+`;return ${name};`)(...Object.values(deps));
}
export function bancoSimulado(initial={},options={}){
 const tables=structuredClone(initial),calls=[];let serial=0;
 class Query{
  constructor(table){this.table=table;this.op='read';this.filters=[];this.singleRow=false;this.payload=null;this.start=0;this.end=null;this.head=false;}
  select(_cols,settings){this.head=!!settings?.head;return this;}
  eq(k,v){this.filters.push(r=>r[k]===v);return this;}
  neq(k,v){this.filters.push(r=>r[k]!==v);return this;}
  in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}
  is(k,v){this.filters.push(r=>(r[k]??null)===v);return this;}
  not(k,op,v){if(op==='is')this.filters.push(r=>(r[k]??null)!==v);return this;}
  gt(k,v){this.filters.push(r=>r[k]>v);return this;}
  gte(k,v){this.filters.push(r=>r[k]>=v);return this;}
  lte(k,v){this.filters.push(r=>r[k]<=v);return this;}
  lt(k,v){this.filters.push(r=>r[k]<v);return this;}
  order(){return this;}or(){return this;}ilike(){return this;}
  range(a,b){this.start=a;this.end=b;return this;}
  limit(n){this.start=0;this.end=n-1;return this;}
  single(){this.singleRow=true;return this;}maybeSingle(){this.singleRow=true;return this;}
  insert(v){this.op='insert';this.payload=v;return this;}
  upsert(v){this.op='insert';this.payload=v;return this;}
  update(v){this.op='update';this.payload=v;return this;}
  delete(){this.op='delete';return this;}
  async execute(){
   const call={table:this.table,operation:this.op,payload:structuredClone(this.payload)};calls.push(call);
   const failure=options.fail?.(call,calls);
   if(failure)return {data:null,error:{code:'SIMULATED_DB_FAILURE',message:failure},count:null};
   const list=tables[this.table]??=[];
   const matches=list.filter(r=>this.filters.every(f=>f(r)));
   let result;
   if(this.op==='read'){
    result=structuredClone(matches.slice(this.start,(this.end??(options.cap===false?matches.length:999))+1));
    if(options.afterRead)await options.afterRead(call,result);
   }else if(this.op==='insert'){
    result=(Array.isArray(this.payload)?this.payload:[this.payload]).map(r=>({id:'gerado-'+(++serial),...structuredClone(r)}));list.push(...result);result=structuredClone(result);
   }else if(this.op==='update'){
    for(const r of matches)Object.assign(r,structuredClone(this.payload));result=structuredClone(matches);
   }else{
    tables[this.table]=list.filter(r=>!matches.includes(r));result=structuredClone(matches);
   }
   return {data:this.head?null:this.singleRow?(result[0]??null):result,error:null,count:matches.length};
  }
  then(resolve,reject){return this.execute().then(resolve,reject);}
 }
 const db={from:t=>new Query(t),rpc:async()=>({data:null,error:null}),auth:{getUser:async()=>({data:{user:{id:'usuario-autorizado'}},error:null})}};
 return {db,tables,calls};
}
export const NextResponse={json:(data,init)=>Response.json(data,init)};
export const request=(body,method='POST')=>new Request('http://somente-laboratorio.invalid/api/teste',{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
