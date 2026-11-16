import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, test } from "node:test";

const mock = { negado: false, completo: true, chamadas: 0, resultado: {} };
globalThis[Symbol.for("arato.sieg.diagnostico.rota")]=mock;
registerHooks({ resolve(spec, ctx, next) {
  const m = 'globalThis[Symbol.for("arato.sieg.diagnostico.rota")]';
  let source;
  if (spec === "next/server") source = "export const NextResponse={json:(v,i)=>Response.json(v,i)};";
  if (spec.endsWith("/lib/api-auth")) source = `export const exigirLogin=async()=>${m}.negado?Response.json({erro:'Negado'},{status:403}):null;export const exigirAcessoFazenda=exigirLogin;`;
  if (spec.endsWith("/lib/sieg")) source = `export const credenciaisEnv=()=>({});export const credenciaisValidas=()=>${m}.completo;`;
  if (spec.endsWith("/lib/fiscal/sieg-diagnostico")) source = `export async function diagnosticarSieg(){${m}.chamadas++;return ${m}.resultado;}`;
  return source ? { url: "data:text/javascript,"+encodeURIComponent(source), shortCircuit: true } : next(spec, ctx);
} });
const { GET } = await import("../../app/api/integracoes/sieg-test/route.ts");
const chamar = fazenda => GET({ nextUrl: new URL("https://app.example/api/integracoes/sieg-test" + (fazenda ? "?fazenda_id=teste" : "")) });
beforeEach(() => Object.assign(mock, { negado: false, completo: true, chamadas: 0, resultado: { sieg_status: 200, sieg_ok: true, retry_after: 0 } }));

test("diagnóstico exige acesso à fazenda ou login antes de consultar", async () => {
  mock.negado = true;
  for (const fazenda of [true, false]) assert.equal((await chamar(fazenda)).status, 403);
  assert.equal(mock.chamadas, 0);
});
test("429 é entregue com Retry-After e sem cache HTTP", async () => {
  mock.resultado = { sieg_status: 429, sieg_ok: false, situacao: "limite_requisicoes", retry_after: 120 };
  const res = await chamar(true);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "120");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal((await res.json()).situacao, "limite_requisicoes");
});
test("configuração incompleta é informada sem chamar o provedor", async () => {
  mock.completo = false;
  const res = await chamar(true);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).situacao, "configuracao_pendente");
  assert.equal(mock.chamadas, 0);
});
test("acesso confirmado não envia Retry-After", async () => {
  const res = await chamar(true);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Retry-After"), null);
  assert.equal((await res.json()).sieg_ok, true);
});
