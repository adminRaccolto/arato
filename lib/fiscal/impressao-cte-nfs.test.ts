import { test } from "node:test";
import assert from "node:assert/strict";
import { dacteDoRegistro, dacteDoXml } from "./dacte-xml.ts";
import { htmlDacte } from "./dacte.ts";
import { corpoEspelhoNfs, htmlEspelhosNfs, totalRetencoes } from "./espelho-nfs.ts";

const CTE = `<cteProc><CTe><infCte Id="CTe51261057638274000128570020000032081916760220" versao="4.00">
<ide><CFOP>6932</CFOP><natOp>PRESTACAO DE SERVICO</natOp><serie>2</serie><nCT>3208</nCT><dhEmi>2026-10-23T06:55:00-04:00</dhEmi><tpCTe>0</tpCTe>
<xMunIni>PARANAGUA</xMunIni><UFIni>PR</UFIni><xMunFim>CANARANA</xMunFim><UFFim>MT</UFFim><toma3><toma>3</toma></toma3></ide>
<compl><xObs>OBS DO CTE</xObs></compl>
<emit><CNPJ>11222333000144</CNPJ><IE>1</IE><xNome>TRANSPORTADORA X</xNome></emit>
<rem><CNPJ>55666777000188</CNPJ><IE>2</IE><xNome>FORNECEDOR Y</xNome><enderReme><xLgr>AV A</xLgr><nro>10</nro><xMun>PARANAGUA</xMun><UF>PR</UF></enderReme></rem>
<exped><CNPJ>55666777000188</CNPJ><xNome>FORNECEDOR Y</xNome><enderExped><xLgr>AV A</xLgr><xCpl>SALA 1</xCpl><nro>10</nro><xBairro>CENTRO</xBairro><cMun>4118204</cMun><xMun>PARANAGUA</xMun><CEP>83212250</CEP><UF>PR</UF></enderExped></exped>
<dest><CPF>12345678901</CPF><IE>3</IE><xNome>PRODUTOR Z</xNome><enderDest><xMun>CANARANA</xMun><UF>MT</UF></enderDest></dest>
<vPrest><vTPrest>20400.00</vTPrest><vRec>20400.00</vRec></vPrest>
<imp><ICMS><ICMS00><CST>00</CST><vBC>20400.00</vBC><pICMS>12.00</pICMS><vICMS>2448.00</vICMS></ICMS00></ICMS></imp>
<infCTeNorm><infCarga><vCarga>125809.44</vCarga><proPred>FERTILIZANTES</proPred><infQ><cUnid>02</cUnid><qCarga>48.0000</qCarga></infQ></infCarga>
<infDoc><infNFe><chave>41261061156501010976550010002397801328224431</chave></infNFe><infNFe><chave>41261061156501010976550010002397801328224432</chave></infNFe></infDoc>
<infModal><rodo><RNTRC>57406888</RNTRC></rodo></infModal></infCte></CTe>
<protCTe><infProt><nProt>151261029692308</nProt></infProt></protCTe></cteProc>`;

test("DACTE do XML do CT-e recebido: partes, valores, ICMS, peso, NF-e e RNTRC", () => {
  const r = dacteDoXml(CTE)!;
  assert.equal(r.rntrc, "57406888");
  const d = r.dados as unknown as Record<string, unknown>;
  assert.equal(d.numero_cte, "3208");
  assert.equal(d.chave_acesso, "51261057638274000128570020000032081916760220");
  assert.equal(d.data_emissao, "2026-10-23");
  assert.equal(d.tomador_tipo, "destinatario");
  assert.equal(d.emitente_cnpj, "11.222.333/0001-44");
  assert.equal(d.destinatario_cnpj, "123.456.789-01");
  assert.equal(d.valor_frete, 20400);
  assert.equal(d.valor_icms, 2448);
  assert.equal(d.cst_icms, "00");
  assert.equal(d.peso_bruto_kg, 48000);
  assert.equal(d.nfe_chave, "41261061156501010976550010002397801328224431, 41261061156501010976550010002397801328224432");
  assert.equal(d.protocolo_autorizacao, "151261029692308");
  assert.equal(d.expedidor_logradouro, "AV A - SALA 1");
  assert.equal(d.observacao, "OBS DO CTE");
  assert.match(htmlDacte(r.dados, null, r.rntrc), /DACTE CT-e 3208/);
  assert.equal(dacteDoXml("<nada/>"), null);
});

test("DACTE de CT-e lançado à mão (sem XML) avisa a origem", () => {
  const r = dacteDoRegistro({ numero: "77", serie: "1", status: "cancelada", tomador_tipo: "destinatario", emitente_nome: "T", emitente_cnpj: "11222333000144", valor_prestacao: 500, peso_kg: 1000, nfe_chaves: ["a"] });
  assert.equal(r.dados.status, "cancelado");
  assert.equal(r.dados.valor_frete, 500);
  assert.match(String(r.dados.observacao), /sem XML/);
});

test("espelho da NFS: retenções, líquido e aviso de espelho", () => {
  const r = { numero_nf: "123", prestador_nome: "Prestador <A>", prestador_cnpj: "11222333000144", valor_servico: 1000, valor_iss: 50, iss_retido: true, valor_inss: 110, valor_ir: 15, valor_outras_retencoes: 0 };
  assert.equal(totalRetencoes(r), 175);
  assert.equal(totalRetencoes({ ...r, iss_retido: false }), 125);
  const html = corpoEspelhoNfs(r);
  assert.match(html, /ESPELHO PARA CONFERÊNCIA/);
  assert.match(html, /Prestador &lt;A&gt;/);
  assert.match(html, /11\.222\.333\/0001-44/);
  assert.match(html, /R\$\s?825,00/);
  assert.match(htmlEspelhosNfs([{ r }, { r: { ...r, numero_nf: "124" } }]), /Nº 124/);
});
