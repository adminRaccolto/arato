import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoParaContas, avisosPendentes, blocosDoTexto, linkInternoValido, statusAviso, validarAviso, type Aviso } from "./avisos.ts";

const base: Aviso = {
  id: "a", titulo: "Parada", mensagem: "Texto", tipo: "informativo", publico: "todos", conta_ids: null,
  inicio: "2026-11-10T10:00:00.000Z", fim: "2026-11-20T10:00:00.000Z", obrigatorio: false, botao_texto: null, botao_link: null, ativo: true,
};
const agora = new Date("2026-11-13T12:00:00.000Z");

test("situação: no ar, agendado, encerrado e desativado", () => {
  assert.equal(statusAviso(base, agora), "no_ar");
  assert.equal(statusAviso({ ...base, inicio: "2026-11-14T00:00:00.000Z" }, agora), "agendado");
  assert.equal(statusAviso({ ...base, fim: "2026-11-12T00:00:00.000Z" }, agora), "encerrado");
  assert.equal(statusAviso({ ...base, fim: null }, agora), "no_ar");
  assert.equal(statusAviso({ ...base, ativo: false }, agora), "desativado");
});

test("público: todos os clientes ou só os escolhidos", () => {
  assert.equal(avisoParaContas(base, []), true);
  const so = { ...base, publico: "contas" as const, conta_ids: ["c1", "c2"] };
  assert.equal(avisoParaContas(so, ["c2"]), true);
  assert.equal(avisoParaContas(so, ["c3"]), false);
  assert.equal(avisoParaContas(so, []), false);
});

test("pendentes: no ar, do público, sem ciência; importante primeiro", () => {
  const avisos: Aviso[] = [
    { ...base, id: "info" },
    { ...base, id: "imp", tipo: "importante", inicio: "2026-11-12T00:00:00.000Z" },
    { ...base, id: "lido" },
    { ...base, id: "outro", publico: "contas", conta_ids: ["x"] },
    { ...base, id: "futuro", inicio: "2026-12-01T00:00:00.000Z" },
  ];
  assert.deepEqual(avisosPendentes(avisos, ["c1"], ["lido"], agora).map(a => a.id), ["imp", "info"]);
});

test("texto: parágrafos, lista com '- ' e negrito com **", () => {
  const b = blocosDoTexto("Olá, **cliente**.\nSegunda linha\n\n- item um\n- item **dois**\n\nFim");
  assert.equal(b.length, 3);
  assert.deepEqual(b[0], { tipo: "paragrafo", linhas: [[{ texto: "Olá, ", negrito: false }, { texto: "cliente", negrito: true }, { texto: ".", negrito: false }], [{ texto: "Segunda linha", negrito: false }]] });
  assert.equal(b[1].tipo, "lista");
  assert.equal(b[1].tipo === "lista" && b[1].itens.length, 2);
  assert.deepEqual(b[2], { tipo: "paragrafo", linhas: [[{ texto: "Fim", negrito: false }]] });
});

test("link do botão: só tela do Arato", () => {
  assert.equal(linkInternoValido("/fiscal"), true);
  assert.equal(linkInternoValido("/financeiro/pagar?aba=x"), true);
  assert.equal(linkInternoValido("https://site.com"), false);
  assert.equal(linkInternoValido("//site.com"), false);
  assert.equal(linkInternoValido(""), false);
});

test("validação antes de salvar", () => {
  assert.equal(validarAviso(base), null);
  assert.match(validarAviso({ ...base, titulo: " " }) ?? "", /título/);
  assert.match(validarAviso({ ...base, fim: "2026-11-01T00:00:00.000Z" }) ?? "", /depois do início/);
  assert.match(validarAviso({ ...base, publico: "contas", conta_ids: [] }) ?? "", /cliente/);
  assert.match(validarAviso({ ...base, botao_texto: "Abrir", botao_link: "https://x" }) ?? "", /começando com/);
  assert.equal(validarAviso({ ...base, botao_texto: "Abrir", botao_link: "/fiscal" }), null);
});
