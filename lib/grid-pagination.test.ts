import assert from "node:assert/strict";
import test from "node:test";
import { gridPage } from "./grid-pagination";

test("todos os títulos e borderôs são alcançáveis sem duplicação entre páginas", () => {
  const rows = Array.from({ length: 2272 }, (_, id) => ({ id, kind: id < 71 ? "bordero" : "titulo" }));
  const visited: typeof rows = [];
  for (let page = 1; page <= 23; page++) {
    const range = gridPage(rows.length, page, 100);
    visited.push(...rows.slice(range.offset, range.end));
  }
  assert.deepEqual(visited, rows);
  assert.equal(new Set(visited.map(row => row.id)).size, rows.length);
  assert.equal(visited[0], rows[0]);
  assert.equal(rows.length, 2272);
});

test("remoções e filtros mantêm uma página válida, inclusive sem resultados", () => {
  assert.deepEqual(gridPage(72, 23, 100), { page: 1, pages: 1, size: 100, offset: 0, end: 72, total: 72 });
  assert.deepEqual(gridPage(0, 1, 100), { page: 1, pages: 1, size: 100, offset: 0, end: 0, total: 0 });
  assert.equal(gridPage(2272, 23, 100).end, 2272);
  assert.equal(gridPage(2272, 1, 500).pages, 5);
});
