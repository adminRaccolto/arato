import { test } from "node:test";
import assert from "node:assert/strict";
import { descreverEvento, agruparEventos, type EventoAud } from "./descrever.ts";

const ev = (p: Partial<EventoAud>): EventoAud => ({
  id: Math.random().toString(36), tabela: "lancamentos", registro_id: "r", acao: "UPDATE",
  dados_antes: null, dados_depois: null, campos_alterados: null, usuario_app: "Ana", created_at: "2026-10-21T10:00:00Z", ...p,
});

test("título gerado pela NF é automático e diz a origem", () => {
  const d = descreverEvento(ev({ acao: "INSERT", dados_depois: { tipo: "pagar", descricao: "NF 123 — X", valor: 100, origem_lancamento: "nf_entrada" } }));
  assert.equal(d.automatico, true);
  assert.match(d.texto, /Sistema gerou a conta a pagar .* a partir de NF de Entrada/);
});

test("cancelamento pelo saldo do pedido é automático; cancelamento comum é do usuário", () => {
  const auto = descreverEvento(ev({ dados_antes: { status: "em_aberto" }, dados_depois: { status: "cancelado", observacao: "[Saldo do pedido zerado pelas NFs vinculadas]", tipo: "pagar", valor: 10 }, campos_alterados: ["status", "observacao"] }));
  assert.equal(auto.automatico, true);
  assert.match(auto.texto, /NFs vinculadas ao pedido cobriram o saldo/);
  const manual = descreverEvento(ev({ dados_antes: { status: "em_aberto" }, dados_depois: { status: "cancelado", tipo: "pagar", valor: 10 }, campos_alterados: ["status"] }));
  assert.equal(manual.automatico, false);
  assert.equal(manual.tipo, "cancelou");
});

test("baixa e alteração de valor ficam legíveis", () => {
  assert.match(descreverEvento(ev({ dados_antes: { status: "em_aberto" }, dados_depois: { status: "baixado", valor: 50, valor_pago: 50, data_baixa: "2026-10-20", tipo: "pagar" }, campos_alterados: ["status", "valor_pago", "data_baixa"] })).texto, /^Baixou .* em 20\/10\/2026/);
  assert.match(descreverEvento(ev({ dados_antes: { valor: 10 }, dados_depois: { valor: 20, tipo: "pagar" }, campos_alterados: ["valor"] })).texto, /valor R\$\s?10,00 → R\$\s?20,00/);
});

test("só campos técnicos = automático", () => {
  assert.equal(descreverEvento(ev({ dados_depois: { tipo: "pagar" }, campos_alterados: ["produtor_id"] })).automatico, true);
  assert.equal(descreverEvento(ev({ tabela: "pedidos_compra", dados_depois: { numero: 5 }, campos_alterados: ["lancamento_id"] })).automatico, true);
});

test("pedido aprovado e entregue pelas NFs", () => {
  assert.match(descreverEvento(ev({ tabela: "pedidos_compra", dados_antes: { status: "rascunho" }, dados_depois: { numero: 9, status: "aprovado" }, campos_alterados: ["status"] })).texto, /^Aprovou o pedido de compra nº 9/);
  assert.equal(descreverEvento(ev({ tabela: "pedidos_compra", dados_antes: { status: "aprovado" }, dados_depois: { numero: 9, status: "entregue" }, campos_alterados: ["status"] })).automatico, true);
});

test("agrupa a ação do usuário com as consequências automáticas próximas", () => {
  const lista = [
    ev({ id: "c", created_at: "2026-10-21T10:00:03Z", usuario_app: null, dados_antes: { status: "em_aberto" }, dados_depois: { status: "cancelado", observacao: "[Saldo do pedido zerado pelas NFs vinculadas]", tipo: "pagar" }, campos_alterados: ["status", "observacao"] }),
    ev({ id: "b", created_at: "2026-10-21T10:00:02Z", tabela: "pedidos_compra", dados_antes: { status: "aprovado" }, dados_depois: { numero: 1, status: "entregue" }, campos_alterados: ["status"] }),
    ev({ id: "a", created_at: "2026-10-21T10:00:01Z", acao: "INSERT", dados_depois: { tipo: "pagar", origem_lancamento: "manual", descricao: "x", valor: 1 } }),
    ev({ id: "z", created_at: "2026-10-21T09:00:00Z", acao: "INSERT", dados_depois: { tipo: "pagar", descricao: "y", valor: 1 } }),
  ];
  const g = agruparEventos(lista);
  assert.equal(g.length, 2);
  assert.equal(g[0].principal.id, "a");
  assert.deepEqual(g[0].consequencias.map(c => c.e.id).sort(), ["b", "c"]);
});

test("NF processada é a ação principal; pedido recalculado sem mudança é automático", () => {
  const lista = [
    ev({ id: "t", created_at: "2026-10-20T13:23:53Z", usuario_app: "Jack", dados_antes: { status: "em_aberto" }, dados_depois: { status: "cancelado", observacao: "[Saldo do pedido zerado pelas NFs vinculadas]", tipo: "pagar" }, campos_alterados: ["status", "observacao"] }),
    ev({ id: "p", created_at: "2026-10-20T13:23:52Z", usuario_app: "Jack", tabela: "pedidos_compra", dados_antes: { numero: 453 }, dados_depois: { numero: 453, nr_pedido_fornecedor: "1009" }, campos_alterados: [] }),
    ev({ id: "n", created_at: "2026-10-20T13:23:51Z", usuario_app: "Jack", tabela: "nf_entradas", dados_antes: { status: "pendente" }, dados_depois: { status: "processada", numero: "50997", emitente_nome: "COOP", valor_total: 10126.31 }, campos_alterados: ["status"] }),
    ev({ id: "h", created_at: "2026-10-20T13:23:50Z", usuario_app: "Jack", tabela: "nf_entradas", dados_antes: { valor_total: 1 }, dados_depois: { numero: "50997", valor_total: 10126.31 }, campos_alterados: ["valor_total"] }),
  ];
  const [g] = agruparEventos(lista);
  assert.equal(g.principal.id, "n");
  assert.match(g.descricao.texto, /^Processou a NF 50997 de COOP/);
  assert.match(descreverEvento(lista[1]).texto, /^Sistema recalculou o pedido de compra nº 453/);
  assert.equal(descreverEvento(lista[1]).automatico, true);
});

test("título de Empresa: exclusão e baixa são descritas como os demais títulos", () => {
  const exc = descreverEvento(ev({ tabela: "empresa_lancamentos", acao: "DELETE", dados_antes: { tipo: "pagar", descricao: "NF 2503 — A B", valor: 1533.34, origem: "nf_entrada" } }));
  assert.equal(exc.tipo, "excluiu");
  assert.match(exc.texto, /NF 2503 — A B \(Empresa\)/);
  const baixa = descreverEvento(ev({ tabela: "empresa_lancamentos", dados_antes: { status: "pendente", tipo: "pagar", valor: 10 }, dados_depois: { status: "pago", tipo: "pagar", valor: 10, valor_pago: 10, data_pagamento: "2026-10-22" }, campos_alterados: ["status"] }));
  assert.equal(baixa.tipo, "baixou");
});

test("exclusão de título gerado por NF: com usuário é ação dele; sem usuário é rotina do sistema", () => {
  const antes = { tipo: "pagar", descricao: "NF 199361 — AGROPECUARIA", valor: 458, origem_lancamento: "nf_entrada" };
  const comUsuario = descreverEvento(ev({ acao: "DELETE", dados_antes: antes, usuario_app: "Marcia" }));
  assert.equal(comUsuario.automatico, false);
  assert.match(comUsuario.texto, /^Excluiu a .* \(gerada por NF de Entrada\)/);
  assert.equal(descreverEvento(ev({ acao: "DELETE", dados_antes: antes, usuario_app: null })).automatico, true);
});
