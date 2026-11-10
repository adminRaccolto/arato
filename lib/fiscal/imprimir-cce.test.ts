import { test } from "node:test";
import assert from "node:assert/strict";
import { htmlCce } from "./imprimir-cce.ts";

test("DACCE traz NF, chave, destinatário, sequência, protocolo e o texto escapado", () => {
  const h = htmlCce({ numero: "58", serie: "930", data_emissao: "2026-11-10", chave_acesso: "51261100017679842949559300000000581956046781",
    destinatario: "MOMESSO IND DE MAQUINAS LTDA", cnpj_destinatario: "48712319000176", dados_nf_json: { emit_razao: "DIRCEU OGLIARI", emit_cnpj: "17679842949" } },
    { sequencia: 1, texto_correcao: "IE 214001460114 <rua>", protocolo_evento: "151260000123", created_at: "2026-11-10T21:00:00Z" });
  assert.match(h, /CARTA DE CORREÇÃO ELETRÔNICA/);
  assert.match(h, /5126 1100 0176/);
  assert.match(h, /48\.712\.319\/0001-76/);
  assert.match(h, /151260000123/);
  assert.match(h, /&lt;rua&gt;/);
  assert.match(h, /Convenio/);
});
