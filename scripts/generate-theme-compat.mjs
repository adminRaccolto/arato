// Compatibilidade de tela para estilos inline legados. Novos componentes devem usar os tokens semânticos.
// A impressão e os documentos/previews explicitamente marcados ficam fora dessas regras.
import fs from 'node:fs';
import path from 'node:path';
const colors = new Set(['#000', '#fff', '#111111', '#333', '#666', '#888']);
const rgbaColors = new Set();
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (file.endsWith('.tsx') && !file.includes('.legado.')) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if ([4, 7].includes(m[0].length)) colors.add(m[0].toLowerCase());
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0?\.\d+|1)\s*\)/g)) {
        rgbaColors.add(JSON.stringify(m.slice(1).map(Number)));
      }
    }
  }
}
scan('app'); scan('components');
function rgb(hex) {
  const s = hex.slice(1), full = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}
function luminance(c) { const x = c.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }); return x[0] * .2126 + x[1] * .7152 + x[2] * .0722; }
function tone(c, neutralThreshold = 22) {
  const max = Math.max(...c), min = Math.min(...c), delta = max - min;
  if (delta < neutralThreshold) return 'neutral';
  const [r, g, b] = c;
  let hue = (max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60;
  if (hue < 0) hue += 360;
  return hue < 18 || hue >= 335 ? 'danger' : hue < 75 ? 'warning' : hue < 170 ? 'success' : hue < 260 ? 'info' : 'violet';
}
const grouped = new Map();
function add(property, value, token) {
  const key = property + '|' + token;
  if (!grouped.has(key)) grouped.set(key, new Set());
  grouped.get(key).add(value);
}
for (const hex of colors) {
  const c = rgb(hex), avg = c.reduce((a, b) => a + b) / 3, t = tone(c), value = `rgb(${c.join(', ')})`, l = luminance(c);
  if (t === 'neutral' && avg < 245) add('color', value, avg < 65 ? '--text-1' : avg < 140 ? '--text-2' : '--text-3');
  else if (t !== 'neutral') add('color', value, `--status-${t}-text`);
  if (l > .5 || (t === 'neutral' && avg > 160)) {
    const backgroundTone = tone(c, 8);
    const token = backgroundTone === 'neutral' ? (avg > 245 ? '--bg-card' : '--bg-tag') : `--status-${backgroundTone}-bg`;
    add('background', value, token); add('background-color', value, token);
  } else if (t !== 'neutral' && l >= .18) {
    add('bright-background', value, '--on-bright-bg');
  }
}
// Painéis brancos translúcidos também precisam acompanhar o fundo escuro.
for (const encoded of rgbaColors) {
  const [r, g, b, alpha] = JSON.parse(encoded);
  const c = [r, g, b], t = tone(c), avg = (r + g + b) / 3;
  const value = `rgba(${r}, ${g}, ${b}, ${alpha})`;
  if (avg < 245 && alpha > 0) add('color', value, t === 'neutral' ? (alpha < .7 ? '--text-3' : '--text-2') : `--status-${t}-text`);
  if (alpha >= .5 && luminance(c) > .5) {
    const bgTone = tone(c, 8);
    const token = bgTone === 'neutral' ? '--bg-card' : `--status-${bgTone}-bg`;
    add('background', value, token); add('background-color', value, token);
  }
}
const excluded = ':not([data-theme-static], [data-theme-static] *, .print-area, .print-area *, #rom-print-area, #rom-print-area *)';
const rules = [];
const brightRules = [];
for (const [key, values] of grouped) {
  const [property, token] = key.split('|');
  if (property === 'bright-background') {
    const selectors = [...values].flatMap(v => ['background', 'background-color'].flatMap(p => [`[style^="${p}: ${v}"]`, `[style*="; ${p}: ${v}"]`]));
    brightRules.push(`  :root[data-theme="dark"] :is(${selectors.join(',')})${excluded} { color: var(${token}) !important; }`);
  } else {
    const selectors = [...values].flatMap(v => [`[style^="${property}: ${v}"]`, `[style*="; ${property}: ${v}"]`]);
    rules.push(`  :root[data-theme="dark"] :is(${selectors.join(',')})${excluded} { ${property}: var(${token}) !important; }`);
  }
}
rules.push(...brightRules);
rules.push(`  :root[data-theme="dark"] :is([style*="background: var(--c-primary)"] ,[style*="background-color: var(--c-primary)"])${excluded} { color: var(--on-primary) !important; }`);
rules.push('  :root[data-theme="dark"] svg text:is([fill="#111"], [fill="#111111"], [fill="#000"], [fill="#000000"], [fill="#333"], [fill="#666"], [fill="#888"]) { fill: var(--text-2); }');
fs.writeFileSync('app/theme-compat.css', `/* Gerado por scripts/generate-theme-compat.mjs. Cores inline legadas adaptadas somente na tela. */\n@media screen {\n${rules.join('\n')}\n}\n`);
console.log(`Compatibilidade gerada: ${grouped.size} famílias de cores.`);
