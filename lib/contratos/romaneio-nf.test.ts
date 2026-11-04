import { test } from "node:test";
import assert from "node:assert/strict";
import { conferirNfComRomaneio, notaAguardaRomaneio, pesoDaNota, pesoRealDoRomaneio } from "./romaneio-nf.ts";

test("peso real: destino, depois classificado, depois líquido", () => {
  assert.equal(pesoRealDoRomaneio({ peso_liquido_destino: 36500, peso_classificado_kg: 37000 }), 36500);
  assert.equal(pesoRealDoRomaneio({ peso_classificado_kg: 37000, peso_liquido_kg: 38000 }), 37000);
  assert.equal(pesoRealDoRomaneio({ peso_liquido_kg: 38000 }), 38000);
});

test("peso da nota em kg", () => {
  assert.equal(pesoDaNota([{ unidade: "KG", quantidade: 37000 }]), 37000);
  assert.equal(pesoDaNota([{ unidade: "SC", quantidade: 10 }]), 600);
});

test("romaneio maior pede complemento; menor sinaliza; valor pelo preço da NF", () => {
  const mais = conferirNfComRomaneio(37000, 37500, 74000);
  assert.equal(mais.situacao, "complemento");
  assert.equal(mais.diferenca_kg, 500);
  assert.equal(mais.valor_diferenca, 1000);
  assert.equal(mais.valor_real, 75000);
  const menos = conferirNfComRomaneio(37000, 36500, 74000);
  assert.equal(menos.situacao, "a_menor");
  assert.equal(menos.valor_real, 73000);
  assert.equal(conferirNfComRomaneio(37000, 37000, 74000).situacao, "igual");
});

test("só NF direta autorizada e sem romaneio aguarda romaneio", () => {
  assert.equal(notaAguardaRomaneio({ status: "autorizada", dados_nf_json: { faturamento_direto: true } }), true);
  assert.equal(notaAguardaRomaneio({ status: "autorizada", dados_nf_json: { faturamento_direto: true, romaneio_id: "r" } }), false);
  assert.equal(notaAguardaRomaneio({ status: "rejeitada", dados_nf_json: { faturamento_direto: true } }), false);
  assert.equal(notaAguardaRomaneio({ status: "autorizada", dados_nf_json: {} }), false);
});
