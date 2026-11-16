import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import AdmZip from "adm-zip";
import { baixarXmlNfePorChaveSieg, buscarXmlNfePorChaveSieg } from "../sieg";

const chave = "51260911222333000181550010000000421000000010";
const destino = "52998224725";
const xml = (cpf = destino, k = chave) => `<NFe><infNFe Id="NFe${k}"><ide><nNF>42</nNF><serie>1</serie><dhEmi>2026-09-28T08:00:00-04:00</dhEmi></ide><emit><CNPJ>11222333000181</CNPJ></emit><dest><CPF>${cpf}</CPF></dest></infNFe></NFe>`;
const fetchOriginal = globalThis.fetch;
let seq = 0;
const creds = () => ({ apiKey: "chave-ficticia-"+(++seq), secretKey: "segredo-ficticio", clienteId: "cliente-ficticio" });
afterEach(() => { globalThis.fetch = fetchOriginal; });
function zip(texto = xml()) { const z = new AdmZip(); z.addFile("nota.xml", Buffer.from(texto)); return new Response(new Uint8Array(z.toBuffer())); }

test("busca por chave chama o endpoint individual e não depende do filtro de emissão", async () => {
  const chamadas: { url: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    chamadas.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.endsWith("create-jwt")) return Response.json("token-ficticio");
    assert.ok(url.endsWith("/baixar-xml"));
    return zip();
  };
  assert.equal(await buscarXmlNfePorChaveSieg(creds(), chave, [destino]), xml());
  assert.equal(chamadas.length, 2);
  assert.deepEqual(chamadas[1].body, { ChaveXml: chave, TipoXml: 1, BaixarEventos: false });
});

test("download individual aceita XML e formatos JSON de XML/base64", async () => {
  const b64 = Buffer.from(xml()).toString("base64");
  for (const resposta of [() => new Response(xml()), () => Response.json([{ Xml: b64 }]), () => Response.json([b64]), () => Response.json({ XmlBase64: b64 }), () => Response.json(b64)]) {
    globalThis.fetch = async input => String(input).endsWith("create-jwt") ? Response.json("token-ficticio") : resposta();
    assert.equal(await baixarXmlNfePorChaveSieg(creds(), chave), xml());
  }
});

test("respostas de controle, XML inválido e outra chave não viram ausência de documentos", async () => {
  for (const resposta of [() => Response.json({ Status: "Erro", Mensagens: ["falha privada"] }), () => new Response("indisponível"), () => new Response(xml(destino, chave.slice(0, -1)+"9")), () => Response.json([{}])]) {
    globalThis.fetch = async input => String(input).endsWith("create-jwt") ? Response.json("token-ficticio") : resposta();
    await assert.rejects(baixarXmlNfePorChaveSieg(creds(), chave), /consulta não confirmada|não corresponde/);
  }
});

test("429 da consulta individual interrompe sem nova tentativa automática", async () => {
  let chamadas = 0;
  globalThis.fetch = async input => { chamadas++; return String(input).endsWith("create-jwt") ? Response.json("token-ficticio") : new Response("Limite", { status: 429, headers: { "Retry-After": "60" } }); };
  await assert.rejects(buscarXmlNfePorChaveSieg(creds(), chave, [destino]), /HTTP 429/);
  assert.equal(chamadas, 2);
});

test("XML destinado a outro cliente não é devolvido nem procura alternativa para liberá-lo", async () => {
  let chamadas = 0;
  globalThis.fetch = async input => { chamadas++; return String(input).endsWith("create-jwt") ? Response.json("token-ficticio") : zip(xml("11144477735")); };
  await assert.rejects(buscarXmlNfePorChaveSieg(creds(), chave, [destino]), /destinatário/);
  assert.equal(chamadas, 2);
});

test("404 individual permite recuperar pelo índice anterior, conferindo chave e destinatário", async () => {
  let consultas = 0;
  globalThis.fetch = async input => {
    if (String(input).endsWith("create-jwt")) return Response.json("token-ficticio");
    consultas++;
    return String(input).endsWith("/baixar-xml") ? new Response("Não encontrada", { status: 404 }) : zip();
  };
  assert.equal(await buscarXmlNfePorChaveSieg(creds(), chave, [destino]), xml());
  assert.equal(consultas, 2);
});
