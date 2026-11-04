import { test } from "node:test";
import assert from "node:assert/strict";
import { ehRascunho, montarRascunhoDuplicado, podeDuplicarNota } from "./duplicar-nota.ts";

const base = { id: "n1", fazenda_id: "f1", tipo: "saida", status: "autorizada", numero: "100", serie: "1", cfop: "6.101", natureza: "Venda", destinatario: "Bunge", valor_total: 500, itens_json: [{ item: "Soja" }] };

test("a cópia é rascunho e não leva nada que identifique a nota original", () => {
  const r = montarRascunhoDuplicado({ ...base, dados_nf_json: {
    modulo_key: "fiscal_pf_1", produtor_id: "p1", dest_ie: "123", placa: "ABC1D23", contrato_id: "c1",
    protocolo_autorizacao: "999", romaneio_id: "r1", romaneio_numero: "7", retornada: true, sefaz_erro: "x", faturamento_direto: true, peso_aproximado: true,
  } }, { numero: "101" }, "2026-11-03");
  assert.equal(r.status, "em_digitacao");
  assert.equal(r.numero, "101");
  assert.equal(r.data_emissao, "2026-11-03");
  assert.ok(!("chave_acesso" in r));
  assert.deepEqual(r.dados_nf_json, { modulo_key: "fiscal_pf_1", produtor_id: "p1", dest_ie: "123", placa: "ABC1D23", contrato_id: "c1", rascunho: true, duplicada_de: "n1", duplicada_de_numero: "100" });
  assert.ok(ehRascunho(r));
});

test("só duplica nota de saída emitida ou recusada, sem nota referenciada", () => {
  assert.equal(podeDuplicarNota(base), true);
  assert.equal(podeDuplicarNota({ ...base, status: "cancelada" }), true);
  assert.equal(podeDuplicarNota({ ...base, status: "em_digitacao" }), false);
  assert.equal(podeDuplicarNota({ ...base, tipo: "entrada" }), false);
  assert.equal(podeDuplicarNota({ ...base, dados_nf_json: { nf_ref_chave: "511" } }), false);
  assert.equal(podeDuplicarNota({ ...base, natureza: "Devolução de Compra" }), false);
});

test("nota em digitação sem a marca de rascunho não é rascunho", () => {
  assert.equal(ehRascunho({ status: "em_digitacao", dados_nf_json: {} }), false);
  assert.equal(ehRascunho({ status: "autorizada", dados_nf_json: { rascunho: true } }), false);
});
