import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const excluded = /^(?:app\/(?:admin|auth|bpo|login|cadastro|planos|pagamento|offline|alterar-senha|seletor-cliente|raccotlo|api)(?:\/|\.)|.*(?:\.legado\.|\/danfe\/))/;
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []);
const coverage = [];
for (const file of files('app')) {
  if (excluded.test(file)) continue;
  const source = fs.readFileSync(file, 'utf8');
  if (!/^['"]use client['"];/.test(source)) continue;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [], names = new Set(), counts = {};
  const attr = (opening, name) => opening.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(tree) === name);
  function visit(node, protectedArea = false, dialog = false) {
    if (!ts.isJsxElement(node)) { ts.forEachChild(node, n => visit(n, protectedArea, dialog)); return; }
    const opening = node.openingElement, tag = opening.tagName.getText(tree);
    const protectedHere = protectedArea || !!attr(opening, 'data-theme-static') || /print-area|rom-print-area|print-only|printArea/.test(opening.getText(tree));
    if (protectedHere) return;
    const inDialog = dialog || !!attr(opening, 'data-arato-dialog');
    if (['OperationalButton', 'OperationalGrid', 'OperationalFilters', 'OperationalHeading'].includes(tag)) counts[tag] = (counts[tag] ?? 0) + 1;
    let component;
    if (tag === 'button' && attr(opening, 'data-arato-button')) component = 'OperationalButton';
    if (tag === 'table' && attr(opening, 'data-arato-grid')) component = 'OperationalGrid';
    if (tag === 'div' && attr(opening, 'data-arato-filters') && !inDialog) component = 'OperationalFilters';
    if (['div', 'header'].includes(tag) && attr(opening, 'data-arato-page-heading') && !inDialog) component = 'OperationalHeading';
    if (component) {
      names.add(component); counts[component] = (counts[component] ?? 0) + 1;
      edits.push({ start: opening.tagName.getStart(tree), end: opening.tagName.end, value: component + (tag === 'header' ? ' as="header"' : '') });
      edits.push({ start: node.closingElement.tagName.getStart(tree), end: node.closingElement.tagName.end, value: component });
    }
    node.children.forEach(n => visit(n, protectedHere, inDialog));
  }
  visit(tree);
  if (!edits.length) {
    if (Object.keys(counts).length) coverage.push({ file, ...counts });
    continue;
  }
  const relative = path.relative(path.dirname(file), 'components/OperationalUI').split(path.sep).join('/');
  const existing = tree.statements.find(s => ts.isImportDeclaration(s) && s.moduleSpecifier.text === (relative.startsWith('.') ? relative : './' + relative));
  if (existing) throw new Error(`Unexpected existing import in ${file}`);
  edits.push({ start: tree.statements[0].end, end: tree.statements[0].end, value: `\nimport { ${[...names].sort().join(', ')} } from "${relative.startsWith('.') ? relative : './' + relative}";` });
  let updated = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.value + updated.slice(edit.end);
  fs.writeFileSync(file, updated);
  coverage.push({ file, ...counts });
}
fs.writeFileSync('lib/operational-ui-coverage.json', JSON.stringify(coverage, null, 2) + '\n');
console.log(JSON.stringify({ pages: coverage.length, components: coverage.reduce((result, page) => { for (const [key, value] of Object.entries(page)) if (key !== 'file') result[key] = (result[key] ?? 0) + value; return result; }, {}) }));
