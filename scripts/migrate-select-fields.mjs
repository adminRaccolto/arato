// Preserve native select props, children and change events; enhance long lists only in the new layout.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const excluded = /(?:\.legado\.|SelectField|Navigation|LayoutProvider|Appearance|ReprogramarEmpresaModal|SiegManifestacao|TicketBalanca|MapaLeaflet)/;
function scan(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?scan(path.join(dir,e.name)):e.name.endsWith('.tsx')&&!excluded.test(e.name)?[path.join(dir,e.name)]:[]); }
let count=0;
for(const file of [...scan('app'),...scan('components')]){
 if(file.includes('/danfe/'))continue;
 const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
 function visit(node,protectedDocument=false){
  if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)){
   const opening=ts.isJsxElement(node)?node.openingElement:node;
   if(protectedDocument||/data-theme-static|print-area|rom-print-area|print-only|printArea/.test(opening.getText(tree)))return;
   if(opening.tagName.getText(tree)==='select'&&!opening.attributes.properties.some(p=>ts.isJsxAttribute(p)&&p.name.getText(tree)==='ref')){
    edits.push({start:opening.tagName.getStart(tree),end:opening.tagName.end,text:'SelectField'});
    if(ts.isJsxElement(node))edits.push({start:node.closingElement.tagName.getStart(tree),end:node.closingElement.tagName.end,text:'SelectField'});
   }
  }
  ts.forEachChild(node,n=>visit(n,protectedDocument));
 }
 visit(tree);if(!edits.length)continue;
 let updated=source;edits.sort((a,b)=>b.start-a.start);for(const edit of edits)updated=updated.slice(0,edit.start)+edit.text+updated.slice(edit.end);
 let relative=path.relative(path.dirname(file),'components/SelectField').split(path.sep).join('/');if(!relative.startsWith('.'))relative='./'+relative;
 const firstImport=tree.statements.find(ts.isImportDeclaration);const position=firstImport?.getStart(tree)??(tree.statements[0]?.end??0);
 updated=updated.slice(0,position)+`import SelectField from "${relative}";\n`+updated.slice(position);
 fs.writeFileSync(file,updated);count++;
}
console.log(`Seletores compatíveis aplicados em ${count} arquivos.`);
