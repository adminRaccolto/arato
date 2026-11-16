import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notaPendenteDaRemessa, remessaPendenteDe, remessaSemRegistro, transmitirRemessaPendente, type NotaRemessa } from "./remessa-pendente";

const pendente = { corpo: { fazenda_id: "faz-1", modulo_key: "fiscal_pf_1", itens: [{ cfop: "5905" }] }, registro: { acao: "registrar", fazenda_id: "faz-1", data: "2026-11-10", itens: [{ insumo_id: "i1", quantidade: 10 }] } };

test("linha do painel: rascunho em digitação com o corpo da emissão e o registro guardados", () => {
  const n = notaPendenteDaRemessa({ fazenda_id: "faz-1", numero: "000123", serie: "1", cfop: "5905", natureza: "Remessa para depósito", destinatario: "ARMAZEM",
    cnpj_destinatario: "05.198.812/0001-07", data: "2026-11-10", itens: [{ descricao: "SOJA", ncm: "12019000", unidade: "KG", quantidade: 10, valor_unitario: 2.5, valor_total: 25 }],
    pendente, destino: { uf: "MT", ibge: "5105259" } });
  assert.equal(n.status, "em_digitacao");
  assert.equal(n.cfop, "5.905");
  assert.equal(n.cnpj_destinatario, "05198812000107");
  assert.equal(n.valor_total, 25);
  const d = n.dados_nf_json as Record<string, unknown>;
  assert.equal(d.rascunho, true);
  assert.equal(d.modulo_key, "fiscal_pf_1");
  assert.deepEqual(remessaPendenteDe(d), pendente);
  assert.equal(remessaPendenteDe({ rascunho: true }), null);
  assert.equal(remessaPendenteDe({ remessa_pendente: { corpo: {} } }), null);
});

test("remessaSemRegistro: só autorizada vinda de remessa pendente e ainda sem remessa_id", () => {
  const base: NotaRemessa = { id: "n1", fazenda_id: "faz-1", status: "autorizada", dados_nf_json: { remessa_pendente: pendente } };
  assert.equal(remessaSemRegistro(base), true);
  assert.equal(remessaSemRegistro({ ...base, dados_nf_json: { remessa_pendente: pendente, remessa_id: "r1" } }), false);
  assert.equal(remessaSemRegistro({ ...base, status: "em_digitacao" }), false);
  assert.equal(remessaSemRegistro({ ...base, dados_nf_json: {} }), false);
});

// Banco e rede simulados: guarda os updates em notas_fiscais e responde emissão/registro conforme o cenário
function cenario(emissao: Record<string, unknown>, registro: Record<string, unknown> = { ok: true, remessa_id: "rem-1" }) {
  const updates: Record<string, unknown>[] = [];
  const chamadas: { url: string; body: Record<string, unknown> }[] = [];
  const db = { from: () => ({ update: (v: Record<string, unknown>) => { updates.push(v); const q = { eq: () => q, then: (ok: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(ok) }; return q; } }) } as unknown as SupabaseClient;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(url.includes("emitir-nfe") ? emissao : registro), { status: 200 });
  }) as typeof fetch;
  return { db, updates, chamadas };
}
const nota: NotaRemessa = { id: "n1", fazenda_id: "faz-1", numero: "000123", serie: "1", status: "em_digitacao", data_emissao: "2026-11-10",
  dados_nf_json: { rascunho: true, remessa_pendente: pendente, sefaz_erro: "anterior" } };

test("transmitir do painel: autorizada → nota atualizada e remessa registrada com a NF e a data da autorização", async () => {
  const { db, updates, chamadas } = cenario({ sucesso: true, chave: "5".repeat(44), numero: "130", serie: "1", protocolo: "151", xmlUrl: "u", emit_razao: "PRODUTOR" });
  const r = await transmitirRemessaPendente(db, nota, "2026-11-16");
  assert.deepEqual(r, { ok: true, numero: "130" });
  assert.equal(chamadas[0].url, "/api/fiscal/emitir-nfe");
  assert.equal(chamadas[0].body.nota_id, "n1");
  assert.equal(chamadas[0].body.modulo_key, "fiscal_pf_1");
  assert.equal(chamadas[1].url, "/api/fiscal/remessas");
  assert.equal(chamadas[1].body.data, "2026-11-16");
  assert.deepEqual(chamadas[1].body.nf, { numero: "130", serie: "1", chave: "5".repeat(44), protocolo: "151", xml_url: "u", emit: { emit_razao: "PRODUTOR" } });
  assert.equal(updates[0].status, "autorizada");
  const d0 = updates[0].dados_nf_json as Record<string, unknown>;
  assert.equal(d0.rascunho, undefined);
  assert.equal(d0.sefaz_erro, undefined);
  assert.equal((updates[1].dados_nf_json as Record<string, unknown>).remessa_id, "rem-1");
});

test("transmitir do painel: rejeitada fica pendente com o motivo; SEFAZ sem resposta não grava nada nem registra", async () => {
  let c = cenario({ sucesso: false, cStat: "778", xMotivo: "NCM inexistente" });
  let r = await transmitirRemessaPendente(c.db, nota, "2026-11-16");
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.erro : "", /continua pendente[\s\S]*cStat 778: NCM inexistente/);
  assert.equal(c.chamadas.length, 1);
  assert.equal((c.updates[0].dados_nf_json as Record<string, unknown>).sefaz_erro, "cStat 778: NCM inexistente");
  assert.equal(c.updates[0].status, undefined);

  c = cenario({ sucesso: false, pendente: true, xMotivo: "Lote em processamento" });
  r = await transmitirRemessaPendente(c.db, nota, "2026-11-16");
  assert.equal(!r.ok && r.pendenteSefaz, true);
  assert.equal(c.updates.length, 0);
  assert.equal(c.chamadas.length, 1);
});

test("autorizada mas o registro falhou: avisa para não emitir outra e guarda o erro para tentar de novo", async () => {
  const { db, updates } = cenario({ sucesso: true, chave: "5".repeat(44), numero: "130" }, { ok: false, error: "depósito inválido" });
  const r = await transmitirRemessaPendente(db, nota, "2026-11-16");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.autorizada, true);
  assert.match(!r.ok ? r.erro : "", /autorizada[\s\S]*Registrar remessa[\s\S]*Não emita outra/);
  assert.equal((updates[1].dados_nf_json as Record<string, unknown>).remessa_registro_erro, "depósito inválido");
});
