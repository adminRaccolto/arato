import assert from "node:assert/strict";
import test from "node:test";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OperationalButton, OperationalFilters, OperationalGrid, OperationalHeading } from "../components/OperationalUI";

test("interface original preserva os comandos, filhos e atributos dos botões", () => {
  const onClick = () => {}, ref = createRef<HTMLButtonElement>();
  const button = OperationalButton({ children: "Baixar", onClick, ref, disabled: true, "data-arato-button": "secondary" });
  assert.equal(button.type, "button");
  assert.equal(button.props.onClick, onClick);
  assert.equal(button.props.ref, ref);
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.children, "Baixar");
});
test("grid original renderiza a tabela com seleção e ações, sem montar outra visualização", () => {
  const onChange = () => {}, onClick = () => {}, ref = createRef<HTMLTableElement>();
  const children = createElement("tbody", null, createElement("tr", null, createElement("td", null, createElement("input", { type: "checkbox", onChange })), createElement("td", null, createElement("button", { onClick }, "Ver"))));
  const table = OperationalGrid({ children, ref, "data-arato-grid": "true" });
  assert.equal(table.type, "table");
  assert.equal(table.props.children, children);
  assert.equal(table.props.ref, ref);
  const html = renderToStaticMarkup(table);
  assert.match(html, /^<table/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, />Ver<\/button>/);
  assert.doesNotMatch(html, /op-grid|cards|Fichas/);
});
test("filtros e cabeçalhos mantêm a estrutura original sem painéis intermediários", () => {
  const onKeyDown = () => {};
  const children = createElement("input", { defaultValue: "2026-10-30" });
  const filters = OperationalFilters({ children, onKeyDown, className: "filtros" });
  assert.equal(filters.type, "div");
  assert.equal(filters.props.children, children);
  assert.equal(filters.props.onKeyDown, onKeyDown);
  const heading = OperationalHeading({ as: "header", children });
  assert.equal(heading.type, "header");
  assert.equal(heading.props.children, children);
});
