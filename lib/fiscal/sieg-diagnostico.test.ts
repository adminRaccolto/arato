import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { diagnosticarSieg } from "./sieg-diagnostico";
import { apresentarDiagnosticoSieg, segundosRetryAfter } from "./sieg-diagnostico-modelo";

const fetchOriginal = globalThis.fetch;
const agoraOriginal = Date.now;
let sequencia = 0;
const credenciais = () => ({ apiKey: `chave-ficticia-${++sequencia}`, secretKey: "segredo-ficticio", clienteId: "cliente-ficticio" });
const jwt = () => Response.json("token-ficticio");
afterEach(() => { globalThis.fetch = fetchOriginal; Date.now = agoraOriginal; });

test("429 na consulta conserva o prazo, não repete chamadas e volta a consultar após a espera", async () => {
  let agora = agoraOriginal(), chamadas = 0;
  Date.now = () => agora;
  const creds = credenciais();
  globalThis.fetch = async input => {
    chamadas++;
    if (String(input).endsWith("create-jwt")) return jwt();
    return chamadas === 2 ? new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "120" } }) : Response.json(["XML-PRIVADO"]);
  };
  const resultado = await diagnosticarSieg(creds);
  assert.equal(resultado.situacao, "limite_requisicoes");
  assert.equal(resultado.sieg_ok, false);
  assert.equal(resultado.retry_after, 120);
  agora += 20_000;
  assert.equal((await diagnosticarSieg(creds)).retry_after, 100);
  assert.equal(chamadas, 2);
  agora += 101_000;
  assert.equal((await diagnosticarSieg(creds)).situacao, "autenticado");
  assert.equal(chamadas, 3, "o JWT já emitido deve ser reutilizado");
});

test("testes simultâneos compartilham a mesma consulta", async () => {
  let chamadas = 0;
  let liberar!: () => void;
  const espera = new Promise<void>(resolve => { liberar = resolve; });
  const creds = credenciais();
  globalThis.fetch = async input => {
    chamadas++;
    if (String(input).endsWith("create-jwt")) { await espera; return jwt(); }
    return Response.json([]);
  };
  const primeiro = diagnosticarSieg(creds), segundo = diagnosticarSieg(creds);
  liberar();
  assert.deepEqual(await primeiro, await segundo);
  assert.equal(chamadas, 2);
});

test("429 ao emitir JWT mantém a classificação e Retry-After em data HTTP", async () => {
  const agora = Date.parse("2026-11-16T12:00:00Z");
  Date.now = () => agora;
  let chamadas = 0;
  globalThis.fetch = async () => { chamadas++; return new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "Mon, 16 Nov 2026 12:03:00 GMT" } }); };
  const r = await diagnosticarSieg(credenciais());
  assert.equal(r.etapa, "create-jwt");
  assert.equal(r.sieg_status, 429);
  assert.equal(r.retry_after, 180);
  assert.equal(r.situacao, "limite_requisicoes");
  assert.equal(chamadas, 1);
});

test("401 na consulta renova JWT uma única vez e informa acesso recusado", async () => {
  let chamadas = 0;
  globalThis.fetch = async input => { chamadas++; return String(input).endsWith("create-jwt") ? jwt() : new Response("negado", { status: 401 }); };
  const r = await diagnosticarSieg(credenciais());
  assert.equal(r.situacao, "acesso_recusado");
  assert.equal(r.sieg_status, 401);
  assert.equal(chamadas, 4);
});

test("erro 403 na autenticação conserva o status sem devolver corpo ou credenciais", async () => {
  globalThis.fetch = async () => new Response("segredo-ficticio token-ficticio", { status: 403 });
  const r = await diagnosticarSieg(credenciais());
  assert.equal(r.situacao, "acesso_recusado");
  assert.equal(r.etapa, "create-jwt");
  assert.doesNotMatch(JSON.stringify(r), /segredo-ficticio|token-ficticio|chave-ficticia/);
});

test("consulta vazia, indisponibilidade e erro de rede têm mensagens distintas", async () => {
  for (const [status, situacao] of [[404, "sem_documentos"], [503, "indisponivel"], [0, "indisponivel"]] as const) {
    globalThis.fetch = async input => {
      if (String(input).endsWith("create-jwt")) return jwt();
      if (!status) throw new Error("falha interna token-ficticio");
      return new Response("XML-PRIVADO", { status });
    };
    const r = await diagnosticarSieg(credenciais());
    assert.equal(r.situacao, situacao);
    assert.equal(r.sieg_status, status);
    assert.equal(r.sieg_ok, false);
    assert.doesNotMatch(JSON.stringify(r), /XML-PRIVADO|token-ficticio|falha interna/);
  }
});

test("consulta aceita não devolve documentos fiscais nem o JWT", async () => {
  globalThis.fetch = async input => String(input).endsWith("create-jwt") ? jwt() : Response.json(["XML-PRIVADO"]);
  const r = await diagnosticarSieg(credenciais());
  assert.equal(r.sieg_ok, true);
  assert.equal(r.situacao, "autenticado");
  assert.doesNotMatch(JSON.stringify(r), /XML-PRIVADO|token-ficticio/);
});

test("prazo ausente ou inválido usa 60s; prazo informado aceita segundos e data", () => {
  const agora = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(segundosRetryAfter(null), 60);
  assert.equal(segundosRetryAfter(""), 60);
  assert.equal(segundosRetryAfter("inválido"), 60);
  assert.equal(segundosRetryAfter("90"), 90);
  assert.equal(segundosRetryAfter("172800"), 172800);
  assert.equal(segundosRetryAfter("0"), 1);
  assert.equal(segundosRetryAfter("Mon, 16 Nov 2026 12:02:00 GMT", agora), 120);
  assert.equal(apresentarDiagnosticoSieg(404, "create-jwt").situacao, "indisponivel");
});
