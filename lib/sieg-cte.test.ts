import assert from "node:assert/strict";
import test from "node:test";
import { parseCTeXml, parseEventoCancelamentoCteXml } from "./sieg.ts";

const XML = `<?xml version="1.0" encoding="UTF-8"?><cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00"><CTe><infCte Id="CTe51261012345678000190570010000012341000012345" versao="4.00">
<ide><cUF>51</cUF><CFOP>6352</CFOP><natOp>PRESTACAO DE SERVICO DE TRANSPORTE</natOp><mod>57</mod><serie>1</serie><nCT>1234</nCT><dhEmi>2026-10-20T08:00:00-04:00</dhEmi>
<xMunIni>NOVA MUTUM</xMunIni><UFIni>MT</UFIni><xMunFim>RONDONOPOLIS</xMunFim><UFFim>MT</UFFim><toma3><toma>0</toma></toma3></ide>
<emit><CNPJ>12345678000190</CNPJ><IE>131234567</IE><xNome>TRANSPORTADORA BOA VIAGEM LTDA</xNome><enderEmit><xMun>SORRISO</xMun><UF>MT</UF></enderEmit></emit>
<rem><CPF>12345678901</CPF><xNome>PRODUTOR RURAL JOAO</xNome></rem>
<dest><CNPJ>02003402000922</CNPJ><xNome>ADM DO BRASIL LTDA</xNome></dest>
<vPrest><vTPrest>4850.50</vTPrest><vRec>4850.50</vRec></vPrest><imp><ICMS><ICMS00><CST>00</CST><vBC>4850.50</vBC><pICMS>12.00</pICMS><vICMS>582.06</vICMS></ICMS00></ICMS></imp>
<infCTeNorm><infCarga><vCarga>98000.00</vCarga><proPred>SOJA EM GRAOS</proPred><infQ><cUnid>01</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>37500.0000</qCarga></infQ><infQ><cUnid>03</cUnid><tpMed>UNIDADE</tpMed><qCarga>1</qCarga></infQ></infCarga>
<infDoc><infNFe><chave>51261012345678901234550010000000011000000011</chave></infNFe></infDoc></infCTeNorm></infCte></CTe><protCTe versao="4.00"><infProt><chCTe>51261012345678000190570010000012341000012345</chCTe><cStat>100</cStat></infProt></protCTe></cteProc>`;

test("lê o CT-e: tomador remetente, valores, peso em kg e NF-e transportada", () => {
  const c = parseCTeXml(XML)!;
  assert.equal(c.chave, "51261012345678000190570010000012341000012345");
  assert.deepEqual([c.numero, c.serie, c.data_emissao, c.cfop], ["1234", "1", "2026-10-20", "6352"]);
  assert.deepEqual(c.emitente, { cnpj: "12345678000190", nome: "TRANSPORTADORA BOA VIAGEM LTDA", ie: "131234567", uf: "MT" });
  assert.deepEqual(c.tomador, { tipo: "remetente", cnpj: "12345678901", nome: "PRODUTOR RURAL JOAO" });
  assert.deepEqual([c.valor_prestacao, c.valor_receber, c.valor_icms, c.peso_kg, c.valor_mercadoria], [4850.5, 4850.5, 582.06, 37500, 98000]);
  assert.deepEqual([c.uf_origem, c.municipio_destino, c.produto], ["MT", "RONDONOPOLIS", "SOJA EM GRAOS"]);
  assert.deepEqual(c.nfe_chaves, ["51261012345678901234550010000000011000000011"]);
});
test("tomador 'outros' (toma4) vem do próprio bloco; toneladas viram kg", () => {
  const x = XML.replace("<toma3><toma>0</toma></toma3>", "<toma4><toma>4</toma><CNPJ>99888777000166</CNPJ><xNome>FAZENDA OUTRA</xNome></toma4>")
    .replace("<cUnid>01</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>37500.0000", "<cUnid>02</cUnid><tpMed>PESO BRUTO</tpMed><qCarga>37.5");
  const c = parseCTeXml(x)!;
  assert.deepEqual(c.tomador, { tipo: "outros", cnpj: "99888777000166", nome: "FAZENDA OUTRA" });
  assert.equal(c.peso_kg, 37500);
});
test("evento de cancelamento de CT-e devolve a chave; XML sem infCte é ignorado", () => {
  assert.equal(parseEventoCancelamentoCteXml("<procEventoCTe><eventoCTe><infEvento><chCTe>51261012345678000190570010000012341000012345</chCTe><tpEvento>110111</tpEvento></infEvento></eventoCTe></procEventoCTe>"), "51261012345678000190570010000012341000012345");
  assert.equal(parseEventoCancelamentoCteXml("<tpEvento>110110</tpEvento><chCTe>1</chCTe>"), null);
  assert.equal(parseCTeXml("<protCTe><chCTe>1</chCTe></protCTe>"), null);
});
