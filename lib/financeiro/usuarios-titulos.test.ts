import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarUsuariosTitulos, usuarioDoDocumento, type EventoUsuario } from "./usuarios-titulos.ts";

const evento = (p: Partial<EventoUsuario>): EventoUsuario => ({
  id: "evento", registro_id: "titulo", acao: "INSERT", usuario_app: "Ana", created_at: "2026-11-01T10:00:00Z", ...p,
});

test("autor é quem criou o pedido ou título, mesmo depois de edição e baixa por outro usuário", () => {
  assert.equal(usuarioDoDocumento([
    evento({ acao: "UPDATE", usuario_app: "Bruno", created_at: "2026-11-02T10:00:00Z" }), evento({}),
  ]), "Ana");
});

test("NF usa o último processamento e ignora importação, edição e baixa", () => {
  assert.equal(usuarioDoDocumento([
    evento({ usuario_app: "Importador", depois_status: "pendente" }),
    evento({ acao: "UPDATE", usuario_app: "Bruno", antes_status: "pendente", depois_status: "processada", created_at: "2026-11-02T10:00:00Z" }),
    evento({ acao: "UPDATE", usuario_app: "Carla", antes_status: "processada", depois_status: "processada", created_at: "2026-11-03T10:00:00Z" }),
  ], true), "Bruno");
  assert.equal(usuarioDoDocumento([evento({ depois_status: "autorizada" })], true), "Ana");
  assert.equal(usuarioDoDocumento([evento({ depois_status: "pendente" })], true), null);
});

test("ausência de autor mantém o usuário desconhecido", () => {
  assert.equal(usuarioDoDocumento([]), null);
  assert.equal(usuarioDoDocumento([evento({ usuario_app: null })]), null);
});

type Registro = Record<string, unknown>;
function banco(tabelas: Record<string, Registro[]>) {
  return { from(tabela: string) {
    let rows = tabelas[tabela] ?? [];
    const query = {
      select() { return query; },
      in(campo: string, valores: unknown[]) { rows = rows.filter(r => valores.includes(r[campo])); return query; },
      eq(campo: string, valor: unknown) { rows = rows.filter(r => r[campo] === valor); return query; },
      order() { return query; },
      range(inicio: number, fim: number) { rows = rows.slice(inicio, fim + 1); return query; },
      then(resolve: (v: { data: Registro[]; error: null }) => unknown) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
    };
    return query;
  } } as unknown as SupabaseClient;
}

test("NF prevalece sobre pedido vinculado; pedido usa autor do pedido; CP e CR respeitam a tabela de origem", async () => {
  const db = banco({
    lancamentos: [{ id: "nf", nf_entrada_id: "nota", pedido_compra_id: "pedido" }, { id: "pc", pedido_compra_id: "pedido" }, { id: "manual" }],
    empresa_lancamentos: [{ id: "manual" }],
    nf_entradas: [{ id: "nota", processado_por: "Processou a NF" }],
    audit_log: [
      { ...evento({ registro_id: "pedido", usuario_app: "Lançou o pedido" }), tabela: "pedidos_compra" },
      { ...evento({ registro_id: "pc", usuario_app: "Aprovou o pedido" }), tabela: "lancamentos" },
      { ...evento({ registro_id: "manual", usuario_app: "Usuário produtor" }), tabela: "lancamentos" },
      { ...evento({ registro_id: "manual", usuario_app: "Usuário empresa" }), tabela: "empresa_lancamentos" },
    ],
  });
  const linhas = await carregarUsuariosTitulos(db, [
    { id: "nf", origem_tabela: "lancamentos" }, { id: "pc", origem_tabela: "lancamentos" },
    { id: "manual", origem_tabela: "lancamentos" }, { id: "manual", origem_tabela: "empresa_lancamentos" },
  ]);
  assert.deepEqual(linhas.map(l => l.usuario_origem), ["Processou a NF", "Lançou o pedido", "Usuário produtor", "Usuário empresa"]);
});

test("NFS-e com mesmo número em fornecedores distintos usa o processador do fornecedor correto", async () => {
  const db = banco({
    lancamentos: [{ id: "cp", origem_lancamento: "nf_servico", fazenda_id: "f", pessoa_id: "p1", nfe_numero: "42" }],
    nf_servicos: [
      { id: "n1", fazenda_id: "f", numero_nf: "42", prestador_id: "p1", processado_por: "Ana" },
      { id: "n2", fazenda_id: "f", numero_nf: "42", prestador_id: "p2", processado_por: "Bruno" },
    ],
  });
  const [l] = await carregarUsuariosTitulos(db, [{ id: "cp", origem_tabela: "lancamentos" }]);
  assert.equal(l.usuario_origem, "Ana");
});

test("CR originado de NF usa a autorização da chave vinculada", async () => {
  const db = banco({
    lancamentos: [{ id: "cr", origem_lancamento: "nf_saida", chave_xml: "chave" }],
    notas_fiscais: [{ id: "nota", chave_acesso: "chave" }],
    audit_log: [
      { ...evento({ registro_id: "cr", usuario_app: "Rotina financeira" }), tabela: "lancamentos" },
      { ...evento({ registro_id: "nota", usuario_app: "Emitiu NF", depois_status: "autorizada" }), tabela: "notas_fiscais" },
    ],
  });
  const [l] = await carregarUsuariosTitulos(db, [{ id: "cr", origem_tabela: "lancamentos" }]);
  assert.equal(l.usuario_origem, "Emitiu NF");
});

test("histórico de NF com mais de mil alterações não perde o processamento mais recente", async () => {
  const db = banco({
    lancamentos: [{ id: "cp", nf_entrada_id: "nota" }],
    nf_entradas: [{ id: "nota", processado_por: null }],
    audit_log: Array.from({ length: 1001 }, (_, i) => ({
      ...evento({ id: String(i), registro_id: "nota", acao: "UPDATE", usuario_app: i === 1000 ? "Último processador" : "Ana",
        antes_status: "pendente", depois_status: "processada", created_at: `2026-11-01T10:00:${i === 1000 ? "01" : "00"}Z` }),
      tabela: "nf_entradas",
    })),
  });
  const [l] = await carregarUsuariosTitulos(db, [{ id: "cp", origem_tabela: "lancamentos" }]);
  assert.equal(l.usuario_origem, "Último processador");
});
