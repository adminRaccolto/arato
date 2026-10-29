import assert from "node:assert/strict";
import { test } from "node:test";
import { gerarNumeroCiot, GERADOR_CIOT_PRODUCAO } from "./gerador";
import { CiotService } from "./ciot";

test("gerador oficial em produção", async t => {
  const anterior = process.env.ANTT_GERADOR_CHAVE;
  t.after(() => { if (anterior === undefined) delete process.env.ANTT_GERADOR_CHAVE; else process.env.ANTT_GERADOR_CHAVE = anterior; });

  await t.test("reserva usa o serviço oficial com token e CPF/CNPJ normalizado", async t => {
    process.env.ANTT_GERADOR_CHAVE = "chave-teste-fluxo";
    const chamadas: Array<{ url: string; init: RequestInit }> = [];
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return Response.json(url.endsWith("/token") ? { token: "token-teste" } : { Sucesso: true, Dados: { CIOT: "560000000001" } });
    });
    const svc = new CiotService({ cert: "certificado-nao-enviado-ao-gerador", key: "chave-privada-nao-enviada" }, "producao");
    const r = await svc.gerar("21.016.959/0001-95");
    assert.equal(r.Sucesso, true);
    assert.equal(r.Dados.CIOT, "560000000001");
    assert.deepEqual(chamadas.map(c => c.url), [`${GERADOR_CIOT_PRODUCAO}/token`, `${GERADOR_CIOT_PRODUCAO}/gerar`]);
    assert.equal(chamadas[0].init.body, "{}");
    assert.equal((chamadas[0].init.headers as Record<string, string>).chave, "chave-teste-fluxo");
    assert.equal((chamadas[1].init.headers as Record<string, string>).Authorization, "Bearer token-teste");
    assert.deepEqual(JSON.parse(String(chamadas[1].init.body)), { cpfCnpj: "21016959000195" });
    assert.ok(!JSON.stringify(chamadas).includes("chave-privada-nao-enviada"));
  });
  await t.test("token é reutilizado sem repetir a autenticação a cada reserva", async t => {
    process.env.ANTT_GERADOR_CHAVE = "chave-teste-cache";
    const chamadas: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string) => {
      chamadas.push(url);
      return Response.json(url.endsWith("/token") ? { token: "token-cache" } : { dados: { ciot: "560000000002" } });
    });
    await gerarNumeroCiot("21016959000195");
    const r = await gerarNumeroCiot("21016959000195");
    assert.equal(r.Dados.CIOT, "560000000002");
    assert.equal(chamadas.filter(u => u.endsWith("/token")).length, 1);
    assert.equal(chamadas.filter(u => u.endsWith("/gerar")).length, 2);
  });
  await t.test("sem chave não transmite uma reserva", async t => {
    delete process.env.ANTT_GERADOR_CHAVE;
    const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("Não deveria chamar"); });
    const r = await gerarNumeroCiot("21016959000195");
    assert.equal(r.Sucesso, false);
    assert.equal(r.ResultadoIncerto, false);
    assert.equal(fetchMock.mock.callCount(), 0);
  });
  await t.test("falha de autenticação não chega a gerar o número", async t => {
    process.env.ANTT_GERADOR_CHAVE = "chave-teste-auth";
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("indisponível", { status: 503 }));
    const r = await gerarNumeroCiot("21016959000195");
    assert.equal(r.HttpStatus, 503);
    assert.equal(r.ResultadoIncerto, false);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
  await t.test("HTTP 503 na reserva não provoca nova emissão nem troca de ambiente", async t => {
    process.env.ANTT_GERADOR_CHAVE = "chave-teste-503";
    const chamadas: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string) => {
      chamadas.push(url);
      return url.endsWith("/token") ? Response.json({ token: "token-503" }) : new Response("Service Unavailable", { status: 503 });
    });
    const r = await gerarNumeroCiot("21016959000195");
    assert.equal(r.Sucesso, false);
    assert.equal(r.HttpStatus, 503);
    assert.equal(r.ResultadoIncerto, true);
    assert.equal(chamadas.filter(u => u.endsWith("/gerar")).length, 1);
    assert.ok(chamadas.every(u => u.startsWith(GERADOR_CIOT_PRODUCAO)));
  });
  await t.test("conexão perdida depois do envio preserva resultado incerto", async t => {
    process.env.ANTT_GERADOR_CHAVE = "chave-teste-conexao";
    const fetchMock = t.mock.method(globalThis, "fetch", async (url: string) => {
      if (url.endsWith("/token")) return Response.json({ token: "token-conexao" });
      throw new Error("ECONNRESET");
    });
    const r = await gerarNumeroCiot("21016959000195");
    assert.equal(r.ResultadoIncerto, true);
    assert.equal(fetchMock.mock.callCount(), 2);
  });
  await t.test("resposta sem CIOT de 12 dígitos não é sucesso", async t => {
    process.env.ANTT_GERADOR_CHAVE = "chave-teste-resposta";
    t.mock.method(globalThis, "fetch", async (url: string) => Response.json(url.endsWith("/token") ? { token: "token-resposta" } : { Dados: { CIOT: "123" } }));
    const r = await gerarNumeroCiot("21016959000195");
    assert.equal(r.Sucesso, false);
    assert.equal(r.ResultadoIncerto, true);
  });
});
