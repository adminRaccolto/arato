import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotaFiscal } from "../supabase";
import { camposDoRascunho, corpoDaVendaPendente, excluirRascunhoVenda, salvarRascunhoVenda, transmitirVendaPendente, vendaPendenteDe, vendaPendenteEditavel } from "./venda-pendente";

const corpo = { fazenda_id: "f1", modulo_key: "fiscal_pf_1", data_emissao: "2026-11-17", emit_ie_override: "123",
  destinatario: { nome: "Comprador", municipio_ibge: "5103403" }, operacao_fiscal_id: "op1", variaveis_fiscais: { origem: "MT" },
  itens: [{ descricao: "Milho", cfop: "6101", cst_icms: "20", cst_icms_manual: true, pICMS: 12, pRedBC: 61.11 }],
  transporte: { nome: "Transportador", placa: "ABC1D23" }, nfe_ref: "1".repeat(44), fin_nfe: "2", inf_cpl: "Observação" };
const dados = { rascunho: true, venda_pendente: { corpo, formulario: { data_emissao: "2026-11-17", local_entrega: "Silo", cst_icms: "020", peso_aproximado: false }, itens: [{ produto_id: "p1" }] } };
const nota = { id: "n1", fazenda_id: "f1", status: "em_digitacao", numero: "001", serie: "1", dados_nf_json: dados } as unknown as NotaFiscal;

test("rascunho preserva corpo fiscal e formulário completo; transmite com o ID real", () => {
  assert.deepEqual(corpoDaVendaPendente(nota), { ...corpo, nota_id: "n1" });
  assert.equal(vendaPendenteEditavel(nota), true);
  assert.equal(vendaPendenteEditavel({ ...nota, status: "autorizada" }), false);
  assert.equal(vendaPendenteEditavel({ ...nota, chave_acesso: "1" }), false);
  assert.equal(vendaPendenteDe({ venda_pendente: { corpo: {}, formulario: {}, itens: [null] } }), null);
  assert.throws(() => corpoDaVendaPendente({ ...nota, fazenda_id: "outra" }), /não correspondem/);
  assert.deepEqual(camposDoRascunho({ local_entrega: "", peso_aproximado: true, data_emissao: "" }, dados.venda_pendente.formulario),
    { local_entrega: "Silo", peso_aproximado: false, data_emissao: "2026-11-17" });
  assert.deepEqual(camposDoRascunho({ ativo: false, nome: "" }, { ativo: "false", nome: 12, extra: "ignorar" }), {});
});

test("salvar/excluir usam RPC com ID estável e confirmação, sem emissão ou financeiro", async () => {
  const chamadas: unknown[] = [];
  const anterior = globalThis.fetch;
  globalThis.fetch = (() => { throw Error("Não pode acessar serviços ao salvar"); }) as typeof fetch;
  try {
    const db = { rpc: async (nome: string, p: Record<string, unknown>) => {
      chamadas.push([nome, p]); return { data: p.p_acao === "excluir" ? { excluida: true } : nota, error: null };
    } } as unknown as SupabaseClient;
    const { id: _id, ...payload } = nota; void _id;
    await salvarRascunhoVenda(db, "n1", payload);
    await salvarRascunhoVenda(db, "n1", payload);
    await excluirRascunhoVenda(db, "n1");
    assert.deepEqual(chamadas[0], chamadas[1]);
    assert.deepEqual(chamadas[2], ["fiscal_rascunho_nfe", { p_id: "n1", p_acao: "excluir", p_dados: null }]);
    const falha = { rpc: async () => ({ data: null, error: null }) } as unknown as SupabaseClient;
    await assert.rejects(salvarRascunhoVenda(falha, "n1", payload), /não foi confirmado/);
    await assert.rejects(excluirRascunhoVenda(falha, "n1"), /não foi confirmada/);
  } finally { globalThis.fetch = anterior; }
});

function cenario(resposta: unknown, op: { status?: number; ativa?: boolean; falhaGravacao?: boolean; semRegistro?: boolean; falhaVinculo?: boolean; rede?: boolean } = {}) {
  const updates: { tabela: string; dados: Record<string, unknown> }[] = [];
  const chamadas: { url: string; body: unknown }[] = [];
  const db = { from: (tabela: string) => ({
    select: () => {
      const q = { eq: () => q, in: () => q, limit: async () => ({ data: op.ativa ? [{ id: "op1" }] : [], error: null }),
        maybeSingle: async () => ({ data: { dados_nf_json: { original: true } }, error: null }) };
      return q;
    },
    update: (v: Record<string, unknown>) => {
      updates.push({ tabela, dados: v });
      const resultado = () => ({ data: op.semRegistro ? null : { id: "n1" }, error: op.falhaGravacao ? { message: "Falha de gravação" } : null });
      const q = { eq: () => q, in: () => q, select: () => q, maybeSingle: async () => resultado(), then: (resolve: (v: unknown) => unknown) => Promise.resolve(resultado()).then(resolve) };
      return q;
    },
  }) } as unknown as SupabaseClient;
  const anterior = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, body: JSON.parse(String(init.body)) });
    if (op.rede) throw new Error("Sem resposta");
    const emissao = url.endsWith("emitir-nfe");
    return new Response(JSON.stringify(emissao ? resposta : op.falhaVinculo ? { ok: false, erro: "Indisponível" } : { ok: true }), { status: emissao ? op.status ?? 200 : op.falhaVinculo ? 422 : 200 });
  }) as typeof fetch;
  return { db, updates, chamadas, restaurar: () => { globalThis.fetch = anterior; } };
}
const autorizada = { sucesso: true, chave: "5".repeat(44), numero: "321", serie: "9", protocolo: "151", totais: { vNF: 100 }, emit_razao: "Produtor" };

test("painel transmite exatamente o corpo salvo e vincula contrato/romaneio só após autorização", async () => {
  const c = cenario(autorizada);
  try {
    const n = { ...nota, dados_nf_json: { ...dados, contrato_id: "c1", recebimento_por_carga: true, romaneio_id: "r1" } };
    assert.deepEqual(await transmitirVendaPendente(c.db, n), { ok: true, numero: "321" });
    assert.deepEqual(c.chamadas[0], { url: "/api/fiscal/emitir-nfe", body: { ...corpo, nota_id: "n1" } });
    assert.deepEqual(c.chamadas.map(x => x.url), ["/api/fiscal/emitir-nfe", "/api/fiscal/vincular-nota", "/api/contratos/faturar-carga"]);
    assert.equal(c.updates[0].dados.status, "autorizada");
    const dj = c.updates[0].dados.dados_nf_json as Record<string, unknown>;
    assert.equal(dj.rascunho, undefined);
    assert.deepEqual(dj.venda_pendente, dados.venda_pendente);
    assert.equal(c.updates[1].tabela, "romaneios");
    assert.equal(c.updates[1].dados.nfe_status, "autorizada");
  } finally { c.restaurar(); }
});

test("avulsa não gera CR de contrato nem movimentação de estoque", async () => {
  const c = cenario(autorizada);
  try {
    assert.equal((await transmitirVendaPendente(c.db, nota)).ok, true);
    assert.deepEqual(c.chamadas.map(x => x.url), ["/api/fiscal/emitir-nfe", "/api/fiscal/vincular-nota"]);
    assert.deepEqual(c.updates.map(x => x.tabela), ["notas_fiscais"]);
  } finally { c.restaurar(); }
});

test("rejeição conserva o rascunho; incerteza não autoriza, não efetiva e não repete emissão", async t => {
  for (const op of [ { resposta: { sucesso: false, xMotivo: "NCM inválido" } }, { resposta: { pendente: true } },
    { resposta: null }, { resposta: {} }, { resposta: "Resposta inesperada" }, { resposta: { sucesso: true } }, { resposta: {}, status: 500 }, { resposta: {}, rede: true } ]) {
    await t.test(JSON.stringify(op), async () => {
      const c = cenario(op.resposta, op);
      try {
        const r = await transmitirVendaPendente(c.db, nota);
        assert.equal(r.ok, false);
        assert.equal(c.chamadas.length, 1);
        assert.ok(c.updates.every(u => u.dados.status !== "autorizada"));
        if (op.resposta && typeof op.resposta === "object" && "xMotivo" in op.resposta) {
          assert.equal((c.updates[0].dados.dados_nf_json as Record<string, unknown>).rascunho, true);
        } else assert.equal(c.updates.length, 0);
      } finally { c.restaurar(); }
    });
  }
});

test("operação ativa bloqueia nova transmissão e preserva o rascunho", async () => {
  const c = cenario(autorizada, { ativa: true });
  try {
    const r = await transmitirVendaPendente(c.db, nota);
    assert.equal(!r.ok && r.pendente, true);
    assert.equal(c.chamadas.length, 0); assert.equal(c.updates.length, 0);
  } finally { c.restaurar(); }
});

test("autorização sem gravação local orienta conferência; falha posterior registra pendência sem reemitir", async t => {
  await t.test("gravação", async () => {
    const c = cenario(autorizada, { falhaGravacao: true });
    try {
      const r = await transmitirVendaPendente(c.db, nota);
      assert.equal(!r.ok && r.autorizada, true); assert.equal(c.chamadas.length, 1);
    } finally { c.restaurar(); }
  });
  await t.test("atualização sem linha confirmada", async () => {
    const c = cenario(autorizada, { semRegistro: true });
    try {
      const r = await transmitirVendaPendente(c.db, nota);
      assert.equal(!r.ok && r.autorizada, true); assert.equal(c.chamadas.length, 1);
    } finally { c.restaurar(); }
  });
  await t.test("vínculo posterior", async () => {
    const c = cenario(autorizada, { falhaVinculo: true });
    try {
      const r = await transmitirVendaPendente(c.db, nota);
      assert.equal(r.ok, true); assert.match(r.ok ? r.aviso! : "", /não emita outra/);
      assert.equal(c.chamadas.filter(x => x.url.endsWith("emitir-nfe")).length, 1);
      assert.ok((c.updates.at(-1)!.dados.dados_nf_json as Record<string, unknown>).pendencias_pos_emissao);
    } finally { c.restaurar(); }
  });
});

test("complemento e retorno atualizam a origem depois da autorização", async () => {
  const c = cenario(autorizada);
  try {
    assert.equal((await transmitirVendaPendente(c.db, { ...nota, dados_nf_json: { ...dados, retorno_origem_id: "or1", complementar_de: "or2" } })).ok, true);
    assert.equal((c.updates[1].dados.dados_nf_json as Record<string, unknown>).retornada, true);
    assert.equal((c.updates[2].dados.dados_nf_json as Record<string, unknown>).complemento_numero, "321");
  } finally { c.restaurar(); }
});
