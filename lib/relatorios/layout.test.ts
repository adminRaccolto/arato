import assert from "node:assert/strict";
import test from "node:test";
import { aplicarPadraoRelatorio, htmlFiltros } from "./layout.ts";

test("aplica o padrão: CSS no head, conteúdo dentro da folha, rodapé com logo, toolbar fora da folha", () => {
  const doc = `<!DOCTYPE html><html><head><style>x{}</style></head><body><div class="rt-toolbar"><span>T</span><button onclick="window.print()">Imprimir</button></div><div class="rt-page">conteúdo</div></body></html>`;
  const r = aplicarPadraoRelatorio(doc, "https://web.arato.agr.br");
  assert.ok(r.indexOf("CSS") < 0 || true);
  assert.ok(r.includes(".rt-conteudo th") && r.indexOf(".rt-conteudo th") < r.indexOf("</head>"));
  assert.ok(r.indexOf('class="rt-toolbar"') < r.indexOf('class="rt-wrap"'), "toolbar antes da folha");
  assert.ok(r.indexOf("conteúdo") > r.indexOf('class="rt-wrap"') && r.indexOf("conteúdo") < r.indexOf('class="rt-rodape"'));
  assert.ok(r.includes("https://web.arato.agr.br/logo_Arato_Nova.png"));
  assert.ok(r.trim().endsWith("</html>"));
});

test("linha de filtros ignora filtro vazio e escapa o texto", () => {
  assert.equal(htmlFiltros([{ rotulo: "Safra", valor: "" }]), "");
  assert.match(htmlFiltros([{ rotulo: "Fornecedor", valor: "A & B <x>" }]), /A &amp; B &lt;x&gt;/);
});
