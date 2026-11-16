import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { buildNFe } from "../nfe/builder";
import { marcarHtmlEspelho, nfeProcEspelho } from "./espelho";
import { gerarDanfePdf, marcarPdfEspelho } from "./danfe-pdf";

const nfe = (itens = 1) => buildNFe({
  emitente: { cpf_cnpj: "17679842949", razao_social: "PRODUTOR TESTE", ie: "138830525", crt: "3", logradouro: "ROD MT-338", numero: "SN",
    bairro: "ZONA RURAL", municipio_ibge: "5108006", municipio_nome: "Tapurah", uf: "MT", cep: "78573000", ambiente: "producao", serie: "1", numero_nfe: 5566 },
  destinatario: { nome: "ARMAZEM TESTE", cpf_cnpj: "05198812000107", ie: "132158159", municipio_ibge: "5105259", municipio_nome: "Lucas do Rio Verde", uf: "MT", cep: "78455000", logradouro: "AV", numero: "1", bairro: "CENTRO" },
  itens: Array.from({ length: itens }, (_, k) => ({ codigo: String(k + 1).padStart(4, "0"), descricao: "PRODUTO " + k, ncm: "38089199", cfop: "5905", unidade: "KG", quantidade: 2, valor_unitario: 246.92 })),
  natureza: "REMESSA PARA DEPOSITO",
});

test("nfeProcEspelho: XML da NF-e dentro de nfeProc, com protocolo vazio e a chave da nota", () => {
  const { xml, chave } = nfe();
  const proc = nfeProcEspelho(xml);
  assert.match(proc, /^<\?xml[^>]*\?><nfeProc /);
  assert.equal((proc.match(/<\?xml/g) ?? []).length, 1);
  assert.match(proc, new RegExp(`<chNFe>${chave}</chNFe><dhRecbto></dhRecbto><nProt></nProt>`));
  assert.match(proc, /<infProt><tpAmb>1<\/tpAmb>/);
  assert.throws(() => nfeProcEspelho("<CTe/>"), /inválido/);
});

test("DANFE do espelho: gera e marca todas as folhas (inclusive nota com várias folhas)", async () => {
  for (const itens of [1, 60]) {
    const cru = await gerarDanfePdf(nfeProcEspelho(nfe(itens).xml));
    const marcado = await marcarPdfEspelho(cru);
    const doc = await PDFDocument.load(marcado);
    assert.equal(doc.getPageCount(), (await PDFDocument.load(cru)).getPageCount());
    if (itens === 60) assert.ok(doc.getPageCount() > 1);
    assert.ok(marcado.length > cru.length * 0.5);
  }
});

test("marcarHtmlEspelho: faixa e marca d'água no corpo, título com ESPELHO", () => {
  const h = marcarHtmlEspelho(`<html><head><title>DACTE 12</title></head><body class="x"><div>conteudo</div></body></html>`);
  assert.match(h, /<title>ESPELHO — DACTE 12<\/title>/);
  assert.match(h, /<body class="x"><div class="arato-espelho-faixa">ESPELHO PARA CONFERÊNCIA — SEM VALOR FISCAL/);
  assert.match(h, /arato-espelho-marca/);
  assert.match(h, /<style>[\s\S]*<\/style><\/head>/);
  assert.match(marcarHtmlEspelho("<div>sem body</div>"), /^<div class="arato-espelho-faixa">[\s\S]*<style>[\s\S]*<div>sem body<\/div>$/);
});
