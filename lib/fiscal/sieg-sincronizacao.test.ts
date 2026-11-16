import assert from "node:assert/strict";
import { test } from "node:test";
import { sincronizarDocumentosSieg } from "./sieg-sincronizacao.ts";

const parametros = {
  fazenda_id: "fazenda-teste", data_inicio: "2026-10-01", data_fim: "2026-10-28", force_reimport: true,
};

test("NF Terceiros busca NF-e/CT-e e NFS-e com o mesmo período e opção de reimportação", async t => {
  const chamadas: Array<{ url: string; body: unknown }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ url, body: JSON.parse(String(init.body)) });
    return Response.json(url.endsWith("sieg-sync-nfse")
      ? { importadas: 3, duplicadas: 2, canceladas: 1 }
      : { importados_nfe: 4, importados_cte: 1, canceladas_cte: 2 });
  });
  const msg = await sincronizarDocumentosSieg(parametros);
  assert.deepEqual(chamadas, [
    { url: "/api/integracoes/sieg-sync", body: parametros },
    { url: "/api/integracoes/sieg-sync-nfse", body: parametros },
  ]);
  assert.match(msg, /^✓ NF-e: 4 importadas/);
  assert.match(msg, /CT-e: 1 importados/);
  assert.match(msg, /2 CT-e cancelados/);
  assert.match(msg, /NFS-e: 3 importadas · 2 já existiam · 1 cancelada/);
});

test("falha de rede em NF-e não impede a importação de NFS-e", async t => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    if (url.endsWith("sieg-sync")) throw new Error("Conexão interrompida");
    return Response.json({ importadas: 5 });
  });
  const msg = await sincronizarDocumentosSieg(parametros);
  assert.match(msg, /^✗ NF-e\/CT-e: Conexão interrompida/);
  assert.match(msg, /NFS-e: 5 importadas/);
});

test("falha em NFS-e é informada junto das NF-e importadas", async t => {
  t.mock.method(globalThis, "fetch", async (url: string) =>
    url.endsWith("sieg-sync-nfse")
      ? Response.json({ erro: "SIEG indisponível" }, { status: 502 })
      : Response.json({ importados_nfe: 2 }));
  const msg = await sincronizarDocumentosSieg(parametros);
  assert.match(msg, /^✗ NF-e: 2 importadas/);
  assert.match(msg, /NFS-e: SIEG indisponível/);
});

test("timeout com resposta HTML em NF-e permite continuar com NFS-e", async t => {
  t.mock.method(globalThis, "fetch", async (url: string) =>
    url.endsWith("sieg-sync")
      ? new Response("<html>Gateway Timeout</html>", { status: 504 })
      : Response.json({ importadas: 1 }));
  const msg = await sincronizarDocumentosSieg(parametros);
  assert.match(msg, /NF-e\/CT-e: Resposta inválida \(HTTP 504\)/);
  assert.match(msg, /NFS-e: 1 importada/);
});

test("erros parciais e cancelamento de NFS-e processada ficam visíveis", async t => {
  t.mock.method(globalThis, "fetch", async (url: string) => Response.json(url.endsWith("sieg-sync-nfse")
    ? { importadas: 1, erros: ["NFSe 123: falha ao salvar"], canceladas_processadas: ["456"] }
    : { importados_nfe: 0, avisos: ["Consulta de CT-e incompleta"] }));
  const msg = await sincronizarDocumentosSieg(parametros);
  assert.match(msg, /^✗/);
  assert.match(msg, /Consulta de CT-e incompleta/);
  assert.match(msg, /NFSe 123: falha ao salvar/);
  assert.match(msg, /nº 456 \(verifique o estorno\)/);
});

test("download recusado em aviso legado não aparece como sucesso", async t => {
  t.mock.method(globalThis, "fetch", async (url: string) => Response.json(url.endsWith("sieg-sync-nfse")
    ? { importadas: 0, diagnostico: ["CnpjTom: ERRO (HTTP 401: API Key inválida)"] }
    : { sucesso: true, erros: [], avisos: ["NF-e não consultadas: HTTP 401 API Key inválida"] }));
  const msg = await sincronizarDocumentosSieg(parametros);
  assert.match(msg, /^✗/); assert.match(msg, /API Key inválida/); assert.match(msg, /CnpjTom/);
});
test("consulta incompleta e falha declarada não viram consulta vazia bem-sucedida", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ sucesso: false, consulta_completa: false, situacao: "falha", importados_nfe: 0 }));
  assert.match(await sincronizarDocumentosSieg(parametros), /^✗/);
});
test("consulta válida sem resultados informa ausência de documentos", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ sucesso: true, consulta_completa: true }));
  const msg = await sincronizarDocumentosSieg(parametros);
  assert.match(msg, /^✓/); assert.match(msg, /Nenhum documento encontrado/);
});
test("consulta completa por índice alternativo é aviso, preservando as notas importadas", async t => {
  t.mock.method(globalThis, "fetch", async (url: string) => Response.json(url.endsWith("sieg-sync-nfse")
    ? { importadas: 2, sucesso: true, consulta_completa: true, diagnostico: ["Primeiro índice: ERRO (HTTP 400); segundo índice: 2 XMLs"] }
    : { importados_nfe: 1, sucesso: true, consulta_completa: true }));
  const msg = await sincronizarDocumentosSieg(parametros);
  assert.match(msg, /^⚠/); assert.match(msg, /NFS-e: 2 importadas/); assert.match(msg, /tentativa alternativa/);
});
