// Adds inert presentation markers. Current layout, handlers and business expressions are retained.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const exclude = /(?:\.legado\.|Navigation|LayoutProvider|LayoutShell|LayoutSettings|Appearance|SelectField|TicketBalanca|MapaLeaflet|ReprogramarEmpresaModal|SiegManifestacao|OliviaWidget)/;
const coverage = [];
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.tsx') && !exclude.test(e.name) ? [path.join(dir, e.name)] : []); }
for (const file of [...files('app'), ...files('components')]) {
  if (file.includes('/danfe/')) continue;
  const source = fs.readFileSync(file, 'utf8'), tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const variables = new Map(), edits = [], roles = {};
  function collect(node) { if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) variables.set(node.name.text, node.initializer); ts.forEachChild(node, collect); }
  collect(tree);
  function styleValues(node, depth = 0) {
    if (!node || depth > 6) return {};
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return styleValues(node.expression, depth + 1);
    if (ts.isIdentifier(node)) return styleValues(variables.get(node.text), depth + 1);
    if (!ts.isObjectLiteralExpression(node)) return {};
    const result = {};
    for (const prop of node.properties) {
      if (ts.isSpreadAssignment(prop)) Object.assign(result, styleValues(prop.expression, depth + 1));
      else if (ts.isPropertyAssignment(prop)) result[prop.name.getText(tree).replace(/["']/g, '')] = prop.initializer.getText(tree).replace(/^["']|["']$/g, '');
    }
    return result;
  }
  function element(node) { return ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null; }
  function jsxChildren(node) { return ts.isJsxElement(node) ? node.children.filter(n => !(ts.isJsxText(n) && !n.text.trim())) : []; }
  function has(node, predicate) { let found = false; function visit(n) { if (found) return; if (predicate(n)) { found = true; return; } ts.forEachChild(n, visit); } visit(node); return found; }
  const controls = node => has(node, n => { const e = element(n); return e && /^(input|select|textarea|SelectField|InputData|InputNumerico|InputMonetario|SelectBusca|CascadeSelector|MultiSelectDropdown)$/.test(e.tagName.getText(tree)); });
  const labels = node => has(node, n => element(n)?.tagName.getText(tree) === 'label');
  const tables = node => has(node, n => element(n)?.tagName.getText(tree) === 'table');
  const interactive = node => has(node, n => { const e = element(n); return e && (['button', 'a', 'Link', 'input', 'select', 'textarea'].includes(e.tagName.getText(tree)) || e.attributes.properties.some(p => ts.isJsxAttribute(p) && /^(onClick|onChange)$/.test(p.name.getText(tree)))); });
  const getStyle = opening => { const attr = opening.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(tree) === 'style'); return attr && ts.isJsxExpression(attr.initializer) ? styleValues(attr.initializer.expression) : {}; };
  function mark(opening, name, value = 'true') {
    const key = `data-arato-${name}`;
    roles[name] = (roles[name] ?? 0) + 1;
    if (opening.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(tree) === key)) return;
    edits.push({ pos: opening.tagName.end, text: ` ${key}="${value}"` });
  }
  function context(node, pattern) { let n = node; for (let i = 0; n && i < 9; i++, n = n.parent) if (pattern.test(n.getText(tree).slice(0, 250))) return true; return false; }
  function visit(node, protectedDocument = false, inDialog = false) {
    const opening = element(node);
    if (opening) {
      const tag = opening.tagName.getText(tree), text = opening.getText(tree);
      const staticDocument = protectedDocument || /^(svg|canvas)$/.test(tag) || /data-theme-static|print-area|rom-print-area|print-only|printArea/.test(text);
      if (staticDocument) return;
      const style = getStyle(opening), content = node.getText(tree), children = jsxChildren(node);
      const overlay = tag === 'div' && style.position === 'fixed' && (style.inset === '0' || (style.top === '0' && style.left === '0' && style.right === '0' && style.bottom === '0')) && style.display === 'flex';
      const parentOpen = element(node.parent), parentStyle = parentOpen ? getStyle(parentOpen) : {};
      const dialog = ['div', 'section'].includes(tag) && ((parentStyle.position === 'fixed' && parentStyle.display === 'flex' && (parentStyle.inset === '0' || (parentStyle.top === '0' && parentStyle.left === '0' && parentStyle.right === '0' && parentStyle.bottom === '0')) && (style.width || style.maxWidth || style.background)) || /modal-box/.test(text));
      if (parentStyle.position === 'fixed' && parentStyle.display === 'flex' && !(parentStyle.inset === '0' || (parentStyle.top === '0' && parentStyle.left === '0' && parentStyle.right === '0' && parentStyle.bottom === '0')) && !/modal-box/.test(text)) {
        const previous = opening.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(tree) === 'data-arato-dialog');
        if (previous && previous.initializer && ts.isStringLiteral(previous.initializer)) edits.push({ pos: previous.getStart(tree), end: previous.end, text: '' });
      }
      if (overlay) mark(opening, 'overlay');
      let dialogType = 'form';
      if (dialog) {
        if (/financeiro\/(pagar|receber)\/page/.test(file) && context(node, /modalBaixa|modalReprog/)) dialogType = 'drawer';
        else if (((Number(style.width) >= 680 || Number(style.maxWidth) >= 680)) || [...(style.width ?? '').matchAll(/(\d{3,4})px/g)].some(m => Number(m[1]) >= 680) || (content.match(/<label\b/g) ?? []).length >= 7) dialogType = 'page';
        else if (!controls(node) && !labels(node) && !/\{children\}/.test(content)) dialogType = 'confirmation';
        mark(opening, 'dialog', dialogType);
        inDialog = true;
      }
      if (tag === 'div' && children.some(c => element(c)?.tagName.getText(tree) === 'TopNav')) mark(opening, 'page');
      if (/^(h1|h2|h3|label|fieldset)$/.test(tag)) mark(opening, tag);
      if (tag === 'button') {
        const background = style.background ?? style.backgroundColor ?? '', attributes = opening.attributes.getText(tree);
        const isToggle = /\?/.test(background) || /aria-pressed|aria-selected/.test(attributes) || /setAba|setTab|setSubAba|setTipo|setEtapa/.test(attributes);
        const primary = !isToggle && (/^(#[0-9A-Fa-f]{3,6}|var\(--c-primary\))$/.test(background) && !/^#(?:fff(?:fff)?|f[0-9a-f]{5}|e[0-9a-f]{5})$/i.test(background) || /\b(?:btnV|btnPrimary|btnVerde)\b/.test(text));
        const danger = /^(#B91C1C|#DC2626|#EF4444|#E24B4A|#FCEBEB|#FEF2F2)$/i.test(background) || /btnX|btnDanger/.test(text);
        const icon = /^\s*[×✕✖✎⋯＋+−‹›]\s*$/.test(children.filter(ts.isJsxText).map(c => c.text).join('').trim());
        mark(opening, 'button', isToggle ? 'toggle' : danger ? 'danger' : primary ? 'primary' : icon ? 'icon' : 'secondary');
      }
      if (tag === 'table') mark(opening, 'grid');
      if (tag === 'div' && (style.overflowX === 'auto' || style.overflowX === 'scroll' || (style.overflow === 'auto' && tables(node) && !dialog))) mark(opening, 'grid-container');
      if (tag === 'div' && style.display === 'grid' && controls(node) && labels(node) && !tables(node) && !dialog) mark(opening, 'fields');
      if (tag === 'div' && style.display === 'grid' && controls(node) && !labels(node) && !tables(node)) mark(opening, 'item-grid');
      if (tag === 'div' && style.display === 'flex' && style.flexWrap === 'wrap' && controls(node) && !tables(node) && !inDialog) mark(opening, 'filters');
      if (['div', 'section'].includes(tag) && (style.border || style.borderRadius) && style.padding && controls(node) && !tables(node) && !dialog && !overlay && !style.position) mark(opening, 'panel');
      if (tag === 'div' && style.justifyContent === 'space-between' && (has(node, n => element(n)?.tagName.getText(tree) === 'h1')) && !tables(node)) mark(opening, 'page-heading');
      if (tag === 'header' && !/data-arato-legacy-navigation/.test(text) && !inDialog) mark(opening, 'page-heading');
      if (tag === 'div' && inDialog && parentOpen && parentOpen.attributes.getText(tree).includes('data-arato-dialog')) mark(opening, 'dialog-body');
      if (tag === 'div' && inDialog && style.display === 'flex' && style.justifyContent === 'space-between' && !controls(node) && /<button/.test(content)) mark(opening, 'dialog-heading');
      if (tag === 'div' && inDialog && style.display === 'flex' && style.justifyContent === 'flex-end' && !controls(node) && /<button/.test(content)) mark(opening, 'dialog-actions');
      if (tag === 'div' && !inDialog && !controls(node) && !tables(node) && (style.padding || style.background || style.border) && has(node, n => { const e = element(n); return e && /^(div|span|strong)$/.test(e.tagName.getText(tree)) && Number(getStyle(e).fontSize) >= 18; }) && children.length <= 6 && !has(node, n => /^(h1|svg|canvas|.*Chart|.*Grafico|.*Mapa)$/.test(element(n)?.tagName.getText(tree) ?? '')) && !/Resumo de custo|valor_total|totalItens|parcela|Saldo inicial|saldosBancarios/.test(content.slice(0, 700))) {
        mark(opening, 'statistic', interactive(node) ? 'action' : 'display');
      }
      if (tag === 'div' && /^\d+(px)?$/.test(style.padding ?? '') && style.marginBottom && style.maxWidth && !dialog && !overlay && !inDialog && controls(node)) mark(opening, 'content');
    }
    ts.forEachChild(node, child => visit(child, protectedDocument, inDialog));
  }
  visit(tree);
  if (edits.length) {
    edits.sort((a, b) => b.pos - a.pos);
    let updated = source;
    for (const edit of edits) updated = updated.slice(0, edit.pos) + edit.text + updated.slice(edit.end ?? edit.pos);
    fs.writeFileSync(file, updated);
  }
  if (file.startsWith('app/') && /\/(page|layout)\.tsx$/.test(file)) coverage.push({ file, roles });
}
fs.writeFileSync('lib/modern-layout-coverage.json', JSON.stringify(coverage, null, 2) + '\n');
console.log(`Apresentação mapeada em ${coverage.length} páginas/layouts; apenas atributos de apresentação adicionados.`);
