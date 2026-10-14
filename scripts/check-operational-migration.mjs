import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const coverage = JSON.parse(fs.readFileSync('lib/operational-ui-coverage.json', 'utf8'));
function fingerprints(file, source) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = [], logic = [];
  function jsx(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
    return ts.forEachChild(node, jsx) ?? false;
  }
  function visit(node) {
    if ((ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'OperationalSummary') || (ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'OperationalSummary')) return;
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(tree))) handlers.push(node.getText(tree));
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isVariableDeclaration(node)) && !jsx(node)) logic.push(node.getText(tree));
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { handlers: handlers.sort(), logic: logic.sort() };
}
for (const { file } of coverage) {
  const before = execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8' });
  const after = fs.readFileSync(file, 'utf8');
  const old = fingerprints(file, before), current = fingerprints(file, after);
  if (JSON.stringify(old) !== JSON.stringify(current)) throw new Error(`Operational logic or handlers changed: ${file}`);
}
console.log(`Lógica e handlers existentes preservados nas ${coverage.length} telas integradas.`);
