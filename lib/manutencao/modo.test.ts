import test from "node:test";
import assert from "node:assert/strict";
import { decidirManutencao, paginaManutencao } from "./modo";

const CHAVE = "chave-secreta-com-20c";
const base = { ativo: "1", chave: CHAVE, pathname: "/financeiro", chaveNaUrl: null, cookie: undefined };

test("desligado: tudo segue", () => {
  assert.equal(decidirManutencao({ ...base, ativo: undefined }).tipo, "seguir");
  assert.equal(decidirManutencao({ ...base, ativo: "0" }).tipo, "seguir");
});

test("ligado: páginas e rotas de servidor (inclusive crons) ficam bloqueadas", () => {
  assert.equal(decidirManutencao(base).tipo, "bloquear_pagina");
  assert.equal(decidirManutencao({ ...base, pathname: "/login" }).tipo, "bloquear_pagina");
  assert.equal(decidirManutencao({ ...base, pathname: "/api/cron/sieg-auto" }).tipo, "bloquear_api");
  assert.equal(decidirManutencao({ ...base, pathname: "/logo_Arato_Nova.png" }).tipo, "estatico");
});

test("equipe entra com a chave na URL e depois pelo cookie", () => {
  assert.equal(decidirManutencao({ ...base, chaveNaUrl: CHAVE }).tipo, "liberar_acesso");
  assert.equal(decidirManutencao({ ...base, cookie: CHAVE }).tipo, "seguir");
  assert.equal(decidirManutencao({ ...base, pathname: "/api/fiscal/x", cookie: CHAVE }).tipo, "seguir");
  assert.equal(decidirManutencao({ ...base, chaveNaUrl: "errada" }).tipo, "bloquear_pagina");
});

test("chave curta ou vazia nunca libera", () => {
  for (const chave of [undefined, "", "curta"]) {
    assert.equal(decidirManutencao({ ...base, chave, chaveNaUrl: chave ?? null, cookie: chave }).tipo, "bloquear_pagina");
  }
});

test("página escapa a previsão", () => {
  assert.match(paginaManutencao("sábado <b>22h</b>"), /sábado &lt;b&gt;22h&lt;\/b&gt;/);
  assert.doesNotMatch(paginaManutencao(undefined), /Previsão/);
});
