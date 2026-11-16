import test from "node:test";
import assert from "node:assert/strict";
import { bloqueioEscrita, definirPermissoesEscrita, protegerEscritas } from "./permissao-escrita";

const so_ver = { _v2: true, estoque: ["visualizar"], fin_pagar: ["visualizar", "criar", "editar"], cadastros: ["visualizar", "excluir"] };
const estado = (permissoes: Record<string, unknown>, role = "client") => ({ role, permissoes, carregado: true });

test("só Ver: não grava; ações marcadas gravam; vale o módulo da tela aberta", () => {
  const e = estado(so_ver);
  assert.match(bloqueioEscrita("movimentacoes_estoque", "insert", "/estoque/kardex", "", e)!, /criar/);
  assert.equal(bloqueioEscrita("lancamentos", "insert", "/financeiro/pagar", "", e), null);
  assert.equal(bloqueioEscrita("lancamentos", "update", "/financeiro/pagar", "", e), null);
  assert.match(bloqueioEscrita("lancamentos", "delete", "/financeiro/pagar", "", e)!, /excluir/);
  assert.equal(bloqueioEscrita("pessoas", "delete", "/cadastros", "?tab=pessoas", e), null);
  assert.match(bloqueioEscrita("pessoas", "upsert", "/cadastros", "?tab=pessoas", e)!, /gravar/);
});

test("não bloqueia: equipe Raccolto, usuário sem grupo, grupo antigo, tela fora do menu, gravação de manutenção, permissões ainda carregando", () => {
  assert.equal(bloqueioEscrita("lancamentos", "delete", "/financeiro/pagar", "", estado(so_ver, "raccotlo")), null);
  assert.equal(bloqueioEscrita("lancamentos", "delete", "/financeiro/pagar", "", estado({})), null);
  assert.equal(bloqueioEscrita("lancamentos", "delete", "/financeiro/pagar", "", estado({ fin_pagar: [] })), null);
  assert.equal(bloqueioEscrita("lancamentos", "delete", "/", "", estado(so_ver)), null);
  assert.equal(bloqueioEscrita("preferencias_grid", "upsert", "/estoque", "", estado(so_ver)), null);
  assert.equal(bloqueioEscrita("lancamentos", "delete", "/financeiro/pagar", "", { ...estado(so_ver), carregado: false }), null);
});

test("cliente protegido: gravação bloqueada não chega ao banco e devolve erro no formato do Supabase", async () => {
  const chamadas: string[] = [];
  const builder = (tabela: string) => ({
    select: () => ({ eq: () => Promise.resolve({ data: [tabela], error: null }) }),
    insert: () => { chamadas.push("insert " + tabela); return { select: () => ({ single: () => Promise.resolve({ data: { id: 1 }, error: null }) }) }; },
    delete: () => { chamadas.push("delete " + tabela); return { eq: () => Promise.resolve({ data: null, error: null }) }; },
  });
  const cliente = protegerEscritas({ from: builder, outro: 1 });
  (globalThis as { window?: unknown }).window = { location: { pathname: "/estoque", search: "" } };
  try {
    definirPermissoesEscrita(estado(so_ver));
    const r = await cliente.from("movimentacoes_estoque").insert({}).select().single() as unknown as { error: { code: string; message: string } };
    assert.equal(r.error.code, "42501");
    assert.match(r.error.message, /Usuários e Permissões/);
    const leitura = await cliente.from("insumos").select().eq();
    assert.deepEqual(leitura.data, ["insumos"]);
    definirPermissoesEscrita(estado({}));
    await cliente.from("insumos").delete().eq();
    assert.deepEqual(chamadas, ["delete insumos"]);
    assert.equal(cliente.outro, 1);
  } finally {
    delete (globalThis as { window?: unknown }).window;
    definirPermissoesEscrita({ role: null, permissoes: {}, carregado: false });
  }
});
