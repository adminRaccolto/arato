import assert from "node:assert/strict";
import test from "node:test";
import forge from "node-forge";
import { ERRO_CERTIFICADO_A1, ERRO_CERTIFICADOS_CONSULTA, selecionarCertificadoA1ParaConsulta, validarCertificadoA1 } from "./certificado-a1";

const senha = " senha de teste ";
const chaves = forge.pki.rsa.generateKeyPair(1024);
const certificado = forge.pki.createCertificate();
certificado.publicKey = chaves.publicKey;
certificado.serialNumber = "01";
certificado.validity.notBefore = new Date("2026-01-01T00:00:00Z");
certificado.validity.notAfter = new Date("2027-01-01T00:00:00Z");
certificado.setSubject([{ name: "commonName", value: "Certificado de teste" }]);
certificado.setIssuer(certificado.subject.attributes);
certificado.sign(chaves.privateKey, forge.md.sha256.create());
const asn1 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, certificado, senha, { algorithm: "3des" });
const pfx = Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");

test("certificado e senha válidos retornam a chave e o vencimento; preserva espaços na senha", () => {
  const resultado = validarCertificadoA1(pfx, senha);
  assert.equal(resultado.vencimento, "2027-01-01");
  assert.match(resultado.pem.cert, /BEGIN CERTIFICATE/);
  assert.match(resultado.pem.key, /BEGIN RSA PRIVATE KEY/);
});

test("senha incorreta, arquivo corrompido e arquivo sem chave privada são rejeitados", () => {
  const semChave = forge.pkcs12.toPkcs12Asn1(null, certificado, senha, { algorithm: "3des" });
  for (const [buffer, password] of [[pfx, "incorreta"], [Buffer.from("arquivo inválido"), senha], [Buffer.from(forge.asn1.toDer(semChave).getBytes(), "binary"), senha]] as const) {
    assert.throws(() => validarCertificadoA1(buffer, password), { message: ERRO_CERTIFICADO_A1 });
  }
});

test("consulta tenta o próximo certificado quando a configuração padrão tem senha incorreta", async () => {
  const caminhos: string[] = [];
  const pem = await selecionarCertificadoA1ParaConsulta([
    { fazendaId: "fazenda-a", caminho: "antigo.pfx", senha: "incorreta" },
    { fazendaId: "fazenda-b", caminho: "valido.pfx", senha },
  ], async caminho => { caminhos.push(caminho); return pfx; });
  assert.deepEqual(caminhos, ["antigo.pfx", "valido.pfx"]);
  assert.match(pem.cert, /BEGIN CERTIFICATE/);
});

test("consulta continua após arquivo ausente e tenta outra senha da mesma configuração", async () => {
  const pem = await selecionarCertificadoA1ParaConsulta([
    { fazendaId: "fazenda-a", caminho: "ausente.pfx", senha },
    { fazendaId: "fazenda-a", caminho: "valido.pfx", senha: "incorreta" },
    { fazendaId: "fazenda-a", caminho: "valido.pfx", senha },
  ], async caminho => {
    if (caminho === "ausente.pfx") throw new Error("Arquivo ausente");
    return pfx;
  });
  assert.match(pem.key, /BEGIN RSA PRIVATE KEY/);
});

test("duplicatas não são reprocessadas; erro final orienta a correção sem expor a senha", async () => {
  let leituras = 0;
  const candidato = { fazendaId: "fazenda-a", caminho: "invalido.pfx", senha: "senha secreta de teste" };
  await assert.rejects(selecionarCertificadoA1ParaConsulta([candidato, candidato], async () => {
    leituras++;
    return pfx;
  }), { message: ERRO_CERTIFICADOS_CONSULTA });
  assert.equal(leituras, 1);
  assert.equal(ERRO_CERTIFICADOS_CONSULTA.includes(candidato.senha), false);
});
