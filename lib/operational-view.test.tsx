import assert from "node:assert/strict";
import test from "node:test";
import { Fragment } from "react";
import { contains, filterValue, nodes, tableModel } from "./operational-view";

test("fichas preservam seleção, ações e identidade dos registros", () => {
  const change = () => {}, command = () => {};
  const children = <><thead><tr><th>Selecionar</th><th>Fornecedor</th><th>Ações</th></tr></thead><tbody>{["a", "b"].map(id => <Fragment key={id}><tr key={id}><td><input type="checkbox" onChange={change} /></td><td>{id}</td><td><button onClick={command}>Baixar</button></td></tr></Fragment>)}</tbody></>;
  const model = tableModel(children);
  assert.equal(model.cards, true);
  assert.equal(model.dataRows.length, 2);
  assert.equal(nodes(model.rows[0].props.children).length, 3);
});

test("borderôs horizontais podem virar fichas; cabeçalhos mesclados mantêm a tabela", () => {
  const model = tableModel(<><thead><tr><th>Fornecedor</th><th>Valor</th></tr></thead><tbody><tr><td colSpan={2}>Borderô</td></tr><tr><td>Fornecedor</td><td>100</td></tr></tbody></>);
  assert.equal(model.cards, true);
  assert.equal(model.regular, false);
  assert.equal(model.dataRows.length, 1);
  assert.equal(tableModel(<><thead><tr><th colSpan={2}>Resumo</th></tr><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></>).cards, false);
});

test("borderô clicável e detalhes expandidos preservam seus nós e comandos nas fichas", () => {
  const command = () => {};
  const model = tableModel(<><thead><tr><th>Fornecedor</th><th>Valor</th></tr></thead><tbody><tr onClick={command}><td colSpan={2}>Borderô pendente</td></tr><tr><td colSpan={2}><table><tbody><tr><td>Detalhe</td></tr></tbody></table></td></tr><tr><td>Fornecedor</td><td>100</td></tr></tbody></>);
  assert.equal(model.cards, true);
  assert.equal(model.regular, false);
  assert.equal(model.decoratable, true);
  assert.equal(model.rows[0].props.onClick, command);
  assert.equal(model.dataRows.length, 2);
});

test("células com rowspan e linhas incompletas não são convertidas em fichas", () => {
  assert.equal(tableModel(<><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td rowSpan={2}>Grupo</td><td>1</td></tr><tr><td>2</td></tr></tbody></>).cards, false);
  assert.equal(tableModel(<><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>Apenas uma célula</td></tr></tbody></>).cards, false);
});

test("matrizes editáveis não oferecem fichas que alterariam o formulário", () => {
  assert.equal(tableModel(<><thead><tr><th>Item</th><th>Valor</th></tr></thead><tbody><tr><td>Item</td><td><input value="100" readOnly /></td></tr></tbody></>).cards, false);
});

test("critérios mostram datas, zero e os rótulos das opções sem chamar handlers", () => {
  assert.deepEqual(filterValue(<><input type="date" value="2026-10-14" readOnly /><input value={0} readOnly /><select value="empresa" onChange={() => {}}><option value="produtor">Produtor</option><option value="empresa">Empresa</option></select></>), ["14/10/2026", "0", "Empresa"]);
});


test("inspeção preserva os elementos recebidos e não executa componentes", () => {
  let invoked = false;
  function CustomControl() { invoked = true; return <input />; }
  const control = <CustomControl />;
  assert.equal(contains(<><span>Texto</span>{control}</>, child => child === control), true);
  assert.equal(invoked, false);
  assert.equal(contains(<><span>Texto</span></>, child => child.type === Fragment), false);
});
