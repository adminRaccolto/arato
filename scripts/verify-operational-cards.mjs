/** Regressão visual e funcional sem autenticação, banco ou dados reais.
 * Requer Playwright no ambiente (ou ARATO_PLAYWRIGHT_MODULE) e Chromium instalado
 * (ou ARATO_CHROMIUM_EXECUTABLE). Usa os componentes e CSS reais do projeto.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url),
  root = resolve(import.meta.dirname, "..");
const { chromium } = await import(
  process.env.ARATO_PLAYWRIGHT_MODULE || "playwright"
);
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const temporary = await mkdtemp(join(tmpdir(), "arato-cards-"));
let browser;
try {
  await writeFile(
    join(temporary, "loader.cjs"),
    `const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`,
  );
  await new Promise((ok, fail) =>
    webpack(
      {
        mode: "development",
        devtool: false,
        context: root,
        entry: join(root, "scripts/fixtures/operational-cards.tsx"),
        output: { path: temporary, filename: "fixture.js" },
        resolve: { extensions: [".tsx", ".ts", ".js"] },
        module: {
          rules: [
            {
              test: /\.tsx?$/,
              exclude: /node_modules/,
              use: join(temporary, "loader.cjs"),
            },
          ],
        },
      },
      (error, stats) =>
        error || stats.hasErrors()
          ? fail(
              error || new Error(stats.toString({ all: false, errors: true })),
            )
          : ok(),
    ),
  );
  const css = (
    await Promise.all(
      ["app/operational.css", "app/arato-operational.css"].map((p) =>
        readFile(join(root, p), "utf8"),
      ),
    )
  ).join("\n");
  await writeFile(
    join(temporary, "index.html"),
    `<!doctype html><html lang="pt-BR" data-theme="light" data-layout="classic" data-layout-workspace="true" data-grid-density="compact"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>:root{--text-1:#27434d;--text-2:#526e72;--border-row:#d7e4e4;--bg-card:#fff}*{box-sizing:border-box}body{margin:0;font:14px Arial}#arato-content{padding:16px}button{cursor:pointer}${css}</style></head><body><div class="arato-operational"><main id="arato-content"><div id="root"></div></main></div><script src="fixture.js"></script></body></html>`,
  );
  browser = await chromium.launch({
    headless: true,
    ...(process.env.ARATO_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.ARATO_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const resultados = [];
  for (const width of [2560, 1280, 820, 393]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(pathToFileURL(join(temporary, "index.html")).href);
    const bombas = page.getByTestId("bombas"),
      financeiro = page.getByTestId("financeiro");
    await bombas
      .getByText("2 registros nesta página", { exact: true })
      .waitFor();
    await bombas.getByRole("button", { name: "Fichas", exact: true }).click();
    await financeiro
      .getByRole("button", { name: "Fichas", exact: true })
      .click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("[data-view=cards] tbody>tr>td")].some(
        (c) => c.dataset.nativeLabel === "Estoque atual (L)",
      ),
    );
    for (const globalDensity of ["compact", "comfortable"]) {
      await page.evaluate(
        (density) => (document.documentElement.dataset.gridDensity = density),
        globalDensity,
      );
      for (const compact of [false, true]) {
        if (compact) {
          await bombas
            .getByRole("button", { name: /Usar linhas compactas/ })
            .click();
          await financeiro
            .getByRole("button", { name: /Usar linhas compactas/ })
            .click();
        }
        const defects = await page.evaluate(() => {
          const defects = [];
          for (const table of document.querySelectorAll(
            ".native-data-grid[data-view=cards]>.native-grid-viewport>.native-grid-table",
          )) {
            for (const row of [...table.tBodies]
              .flatMap((b) => [...b.rows])
              .filter((r) => !r.hidden))
              for (const cell of row.cells) {
                const box = cell.getBoundingClientRect();
                if (!box.width || !box.height) continue;
                const style = getComputedStyle(cell),
                  pseudo = getComputedStyle(cell, "::before");
                if (
                  cell.colSpan === 1 &&
                  pseudo.content &&
                  pseudo.content !== "none" &&
                  pseudo.content !== '""'
                ) {
                  const contents = [...cell.childNodes]
                    .filter((node) =>
                      node.nodeType === Node.TEXT_NODE
                        ? node.textContent.trim()
                        : node.getClientRects().length &&
                          !node.matches("[popover]"),
                    )
                    .flatMap((node) => {
                      const range = document.createRange();
                      range.selectNode(node);
                      return [...range.getClientRects()].filter(
                        (r) => r.width && r.height,
                      );
                    });
                  const contentHeight = contents.length
                    ? Math.max(...contents.map((r) => r.bottom)) -
                      Math.min(...contents.map((r) => r.top))
                    : 0;
                  const need =
                    parseFloat(style.paddingTop) +
                    parseFloat(style.paddingBottom) +
                    (parseFloat(pseudo.height) ||
                      parseFloat(pseudo.lineHeight)) +
                    contentHeight +
                    (contents.length ? parseFloat(style.rowGap || "0") : 0);
                  if (box.height + 1 < need)
                    defects.push({
                      label: cell.dataset.nativeLabel,
                      height: box.height,
                      required: need,
                    });
                }
                for (const node of cell.childNodes) {
                  if (
                    node.nodeType === Node.ELEMENT_NODE &&
                    (!node.getClientRects().length || node.matches("[popover]"))
                  )
                    continue;
                  const range = document.createRange();
                  range.selectNode(node);
                  for (const rect of range.getClientRects())
                    if (
                      rect.width &&
                      rect.height &&
                      (rect.top < box.top - 1 ||
                        rect.bottom > box.bottom + 1 ||
                        rect.right > box.right + 1)
                    )
                      defects.push({
                        label: cell.dataset.nativeLabel,
                        text: node.textContent?.slice(0, 55),
                        cell: {
                          top: box.top,
                          bottom: box.bottom,
                          right: box.right,
                        },
                        content: {
                          top: rect.top,
                          bottom: rect.bottom,
                          right: rect.right,
                        },
                      });
                }
              }
          }
          return defects;
        });
        assert.deepEqual(
          defects,
          [],
          `Conteúdo sobreposto/cortado: ${width}px, densidade ${globalDensity}, compacta ${compact}`,
        );
        assert.equal(
          await bombas
            .getByTestId("bomba-a")
            .evaluate(
              (row) =>
                getComputedStyle(row).gridTemplateColumns.split(" ").length,
            ),
          width > 1100 ? 4 : width > 660 ? 2 : 1,
          "Quantidade de colunas acompanha o espaço disponível",
        );
        assert.notEqual(
          await financeiro
            .getByTestId("titulo-a")
            .locator("td")
            .first()
            .evaluate((cell) => getComputedStyle(cell).gridColumnEnd),
          "-1",
          "colSpan=1 continua como um campo da ficha",
        );
        assert.equal(
          await page
            .getByTestId("detalhes-a")
            .evaluate((t) => getComputedStyle(t).display),
          "table",
          "Tabela interna mantém sua estrutura",
        );
        assert.ok(
          await page.getByTestId("pendente").isHidden(),
          "Registro explicitamente oculto não reaparece",
        );
        resultados.push({
          width,
          globalDensity,
          compact,
          semSobreposicao: true,
        });
      }
      // Devolve o botão ao estado inicial antes da próxima densidade global.
      await bombas
        .getByRole("button", { name: /Usar linhas compactas/ })
        .click();
      await financeiro
        .getByRole("button", { name: /Usar linhas compactas/ })
        .click();
    }
    await financeiro.getByLabel("Selecionar a", { exact: true }).check();
    await financeiro.getByText(/1 marcados nesta página/).waitFor();
    await financeiro
      .getByRole("button", { name: "Descrição", exact: true })
      .click();
    assert.equal(
      await financeiro.locator("tbody>tr").first().getAttribute("data-testid"),
      "titulo-b",
    );
    await bombas
      .getByTestId("bomba-a")
      .getByRole("button", { name: "Movimentos", exact: true })
      .click();
    await bombas
      .getByRole("button", { name: "Editar", exact: true })
      .filter({ visible: true })
      .click();
    await page.getByTestId("edicoes").filter({ hasText: "1" }).waitFor();
    await bombas.getByRole("button", { name: "Grade", exact: true }).click();
    assert.equal(
      await bombas
        .locator("table")
        .evaluate((t) => getComputedStyle(t).display),
      "table",
    );
    await financeiro
      .getByRole("button", { name: "Grade", exact: true })
      .click();
    assert.ok(
      await financeiro.getByLabel("Selecionar a", { exact: true }).isChecked(),
      "Trocar a apresentação preserva seleção",
    );
    await financeiro
      .getByRole("button", { name: "Fichas", exact: true })
      .click();
    await page.getByTestId("mostrar").click();
    assert.ok(await page.getByTestId("pendente").isVisible());
    assert.ok(
      await page
        .getByTestId("agrupado")
        .getByRole("button", { name: "Fichas", exact: true })
        .isDisabled(),
    );
    assert.equal(
      await page.getByTestId("padrao").locator(".native-grid-toolbar").count(),
      0,
    );
    assert.equal(
      await page
        .getByTestId("padrao")
        .locator("table")
        .evaluate((t) => getComputedStyle(t).display),
      "table",
    );
    await page.emulateMedia({ media: "print" });
    assert.equal(
      await financeiro
        .locator(".native-grid-table")
        .first()
        .evaluate((t) => getComputedStyle(t).display),
      "table",
      "Impressão preserva a estrutura tabular",
    );
    assert.deepEqual(errors, [], "Sem erros de execução no navegador");
    if (process.env.ARATO_CARDS_SCREENSHOTS) {
      await page.emulateMedia({ media: "screen" });
      await bombas.getByRole("button", { name: "Fichas", exact: true }).click();
      await page.screenshot({
        path: join(process.env.ARATO_CARDS_SCREENSHOTS, `fichas-${width}.png`),
        fullPage: true,
      });
    }
    await page.close();
  }
  console.log(
    JSON.stringify(
      {
        cenarios: resultados.length,
        resultados,
        interacoes:
          "seleção, ordenação, ações, visibilidade, grade, fichas, cabeçalho agrupado, Padrão e impressão",
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
