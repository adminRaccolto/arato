// Inert presentation markers keep current layouts and tab handlers intact.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const setter = /^set(?:Aba\w*|SubAba\w*|Tab\w*|SubTab\w*|ActiveTab|Visao|View)$/;
const excluded = /(?:\.legado\.|TopNav|ModernNavigation|SidebarAtalhos|Appearance|Layout|OliviaWidget|ReprogramarEmpresaModal|SiegManifestacao)/;
function files(dir) { return fs.readdirSync(dir, { withFileTypes:true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir,entry.name)) : entry.name.endsWith('.tsx') && !excluded.test(entry.name) ? [path.join(dir,entry.name)] : []); }
let strips = 0, buttons = 0;
for (const file of [...files('app'), ...files('components')]) {
  if (/^app\/(admin|bpo|raccotlo|seletor-cliente|campo|login|auth|cadastro)\//.test(file)) continue;
  const source = fs.readFileSync(file,'utf8'), tree = ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX), states = new Map(), edits = [], marked = new Set();
  function bindings(node) {
    if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name)) {
      const [state,update] = node.name.elements;
      if (state && update && ts.isBindingElement(state) && ts.isBindingElement(update) && ts.isIdentifier(state.name) && ts.isIdentifier(update.name)) states.set(update.name.text,state.name.text);
    }
    ts.forEachChild(node,bindings);
  }
  bindings(tree);
  function tabCall(opening) {
    const click = opening.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(tree) === 'onClick');
    let call;
    function find(node) { if (!call && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && setter.test(node.expression.text) && node.arguments.length === 1) call = node; ts.forEachChild(node,find); }
    if (click) find(click);
    return call;
  }
  function mark(opening,name,value='"true"') {
    if (opening.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(tree) === name)) return;
    edits.push({pos:opening.tagName.end,text:` ${name}=${value}`});
  }
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'button') {
      const opening = node.openingElement, call = tabCall(opening);
      if (call) {
        let parent = node.parent;
        while (parent && !ts.isJsxElement(parent)) parent = parent.parent;
        if (parent && ts.isJsxElement(parent)) {
          const container = parent.openingElement, attrs = container.getText(tree), tag = container.tagName.getText(tree);
          const keyed = opening.attributes.properties.some(attr => ts.isJsxAttribute(attr) && ['key','aria-selected','role'].includes(attr.name.getText(tree)));
          const directTabs = parent.children.filter(child => ts.isJsxElement(child) && child.openingElement.tagName.getText(tree) === 'button' && tabCall(child.openingElement)).length;
          if (['div','nav','section','header'].includes(tag) && (keyed || directTabs > 1) && (tag === 'nav' || /flex|tablist|data-arato-tabs|tabs/.test(attrs))) {
            if (!marked.has(container)) { mark(container,'data-arato-tabs'); marked.add(container); strips++; }
            mark(opening,'data-arato-tab');
            const state = states.get(call.expression.text);
            if (state) mark(opening,'data-arato-tab-active',`{${state} === (${call.arguments[0].getText(tree)})}`);
            buttons++;
          }
        }
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(tree);let output=source;
  for (const edit of edits.sort((a,b)=>b.pos-a.pos)) output=output.slice(0,edit.pos)+edit.text+output.slice(edit.pos);
  if (edits.length) fs.writeFileSync(file,output);
}
console.log(`${strips} faixas de abas, ${buttons} seletores; callbacks preservados.`);
