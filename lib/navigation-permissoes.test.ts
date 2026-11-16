import test from "node:test";
import assert from "node:assert/strict";
import { NAV, NAV_MODULE_MAP, type NavLink } from "./navigation";
import { MODULOS, moduloPorId } from "./modulos";

function itensDoMenu(): { grupo: string; item: NavLink }[] {
  const out: { grupo: string; item: NavLink }[] = [];
  for (const it of NAV) {
    if (it.type !== "group") { out.push({ grupo: "", item: it as NavLink }); continue; }
    for (const c of it.children) {
      if (c.type === "divider") continue;
      for (const x of c.type === "subgroup" ? c.children : [c as NavLink]) out.push({ grupo: it.id, item: x });
    }
  }
  return out;
}

test("todo item do menu (fora Início e Ajuda) tem módulo de permissão do catálogo", () => {
  const livres = new Set(["inicio", "ajuda-learning", "ajuda-suporte-remoto"]);
  for (const { item } of itensDoMenu()) {
    if (livres.has(item.id)) { assert.equal(item.moduleId, undefined, item.id); continue; }
    assert.ok(item.moduleId, `${item.id} (${item.label}) sem moduleId — aparece para qualquer grupo`);
    const mod = moduloPorId(item.moduleId!);
    assert.ok(mod, `${item.id}: módulo ${item.moduleId} não está em lib/modulos.ts`);
    assert.ok(mod!.permissao || mod!.exclusivoRaccolto || mod!.addon, `${item.id}: ${item.moduleId} não aparece em Usuários e Permissões`);
  }
});

test("toda caixa da tela de permissões controla algum item do menu", () => {
  const usados = new Set(itensDoMenu().map(x => x.item.moduleId).filter(Boolean));
  const semMenu = MODULOS.filter(m => m.permissao && !usados.has(m.id)).map(m => m.id);
  assert.deepEqual(semMenu, []);
});

test("mapa de grupos sai dos próprios itens e inclui as áreas novas", () => {
  assert.ok(NAV_MODULE_MAP.producao.includes("maquinas"));
  assert.ok(NAV_MODULE_MAP.producao.includes("lavoura_monitoramento"));
  assert.ok(NAV_MODULE_MAP.cadastros.includes("cadastros"));
  assert.ok(NAV_MODULE_MAP.comercial.includes("balanca"));
  assert.equal(NAV_MODULE_MAP.ajuda, undefined, "Ajuda fica sempre visível");
});
