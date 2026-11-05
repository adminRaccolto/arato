import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NAV } from "../navigation.ts";
import { CONHECIMENTO_OLIVIA } from "../conhecimento-olivia.ts";
import { montarMapaMenu, rotasInvalidas } from "./mapa-menu.ts";

test("mapa traz o caminho real da NFS-e e marca telas da equipe Raccolto", () => {
  const mapa = montarMapaMenu(NAV);
  assert.match(mapa, /Documentos Fiscais → Notas de Entrada → Notas de Terceiro/);
  assert.match(mapa, /Automações \(só a equipe Raccolto vê\)/);
  assert.doesNotMatch(mapa, /Triangulação/); // tela desativada não entra
});

test("reconhece os caminhos errados que a Olívia já indicou", () => {
  assert.deepEqual(rotasInvalidas("Vá em **Compras & Estoque → NF de Serviços**.", NAV), ["Compras & Estoque → NF de Serviços"]);
  assert.equal(rotasInvalidas("Documentos Fiscais → Notas de Serviço", NAV).length, 1);
  assert.equal(rotasInvalidas("Lavoura → Plantio → + Novo", NAV).length, 1);
  assert.equal(rotasInvalidas("Financeiro → CP → Baixar", NAV).length, 1);
});

test("aceita caminhos reais", () => {
  for (const c of ["Documentos Fiscais → Notas de Entrada → Notas de Terceiro", "Financeiro → Contas a Pagar", "Comercial & Logística → Estoque → Transferência entre Fazendas",
    "Produção → Operações de Campo → Plantio", "Configurações → Sistema → Parâmetros Fiscais (NF-e)", "Fiscal → Obrigações → LCDPR", "Cadastros → Entidades → Pessoas e Entidades"]) {
    assert.deepEqual(rotasInvalidas(c, NAV), [], c);
  }
});

test("não confunde seta de explicação com caminho de menu", () => {
  assert.deepEqual(rotasInvalidas("Prestador → Serviço → Tributação. Rascunho → Emitir NF.", NAV), []);
});

// Se alguém mudar o menu ou escrever uma rota errada, o teste falha antes do envio
test("base de conhecimento e prompt só citam caminhos que existem", () => {
  assert.deepEqual(rotasInvalidas(CONHECIMENTO_OLIVIA, NAV), []);
  const prompt = readFileSync("lib/olivia/prompt.ts", "utf8");
  assert.deepEqual(rotasInvalidas(prompt, NAV), []);
});

test("passo a passo de implantação e manual do proprietário só citam caminhos que existem", () => {
  for (const arq of ["lib/onboarding.ts", "app/admin/manual/page.tsx"]) {
    const texto = readFileSync(arq, "utf8").replace(/<\/?strong>|"/g, "");
    assert.deepEqual(rotasInvalidas(texto, NAV), [], arq);
  }
});

test("Olívia em produção usa o modelo aprovado pela bateria e cache na parte fixa", () => {
  const rota = readFileSync("app/api/suporte/chat/route.ts", "utf8");
  assert.match(rota, /MODELO_OLIVIA = "claude-haiku-5-5"/);
  assert.match(rota, /cache_control: \{ type: "ephemeral" \}/);
  assert.ok(rota.indexOf("cache_control") < rota.indexOf("contextoDinamico) system.push"), "contexto da fazenda vem depois do cache");
});
