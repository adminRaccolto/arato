import test from "node:test";
import assert from "node:assert/strict";
import { MODULOS, MODULOS_PERMISSAO, ehAddon, ehExclusivoRaccolto, gruposContrataveis, modulosDoPlano } from "./modulos";
import { PLANOS_DEFAULT } from "./planos";

// Listas como estavam em lib/planos.ts antes do catálogo único (16/11/2026). Mudanças decididas pelo dono:
// Apoio Financeiro virou add-on (sai dos planos) e Folha passa a constar em todos (sempre esteve visível a todos).
const ANTES = {
  essencial: ["cadastros","propriedades","lavoura_plantio","lavoura_pulv","lavoura_colheita","lavoura_plan","fin_pagar","fin_receber","configuracoes"],
  gestao: ["cadastros","propriedades","lavoura_plantio","lavoura_pulv","lavoura_colheita","lavoura_plan","fin_pagar","fin_receber","custos","fin_relatorios","configuracoes",
    "contratos","expedicao","arrendamento","estoque","compras","nf_entrada","nf_servico","fin_contratos","fin_tesouraria","fin_seguros","apoio_financeiro","transporte","usuarios"],
  performance: ["cadastros","propriedades","lavoura_plantio","lavoura_pulv","lavoura_colheita","lavoura_plan","fin_pagar","fin_receber","custos","fin_relatorios","configuracoes",
    "contratos","expedicao","arrendamento","compras","nf_entrada","nf_servico","fin_contratos","fin_tesouraria","fin_seguros","apoio_financeiro",
    "transporte","usuarios","estoque","empresas","fiscal_nfe","fiscal_sped","automacoes","whatsapp_agente"],
} as const;

test("planos: mesmos módulos de antes, sem Apoio Financeiro e com Folha", () => {
  for (const pid of ["essencial", "gestao", "performance"] as const) {
    const esperado = new Set<string>(ANTES[pid].filter(x => x !== "apoio_financeiro"));
    esperado.add("folha");
    assert.deepEqual(new Set(modulosDoPlano(pid)), esperado, pid);
    assert.deepEqual(PLANOS_DEFAULT[pid].modulos, modulosDoPlano(pid));
  }
});

test("catálogo: ids únicos; add-on e exclusivo Raccolto nunca vêm em plano", () => {
  const ids = MODULOS.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const x of MODULOS) {
    if (x.addon || x.exclusivoRaccolto) assert.equal(x.planos.length, 0, x.id);
    assert.ok(x.acoes.includes("visualizar"), x.id);
  }
});

test("decisões de 16/11/2026: BI exclusivo da Raccolto, Apoio Financeiro e Proteção de Margem são add-on", () => {
  assert.ok(ehExclusivoRaccolto("bi"));
  assert.ok(!MODULOS_PERMISSAO.some(x => x.id === "bi"));
  assert.ok(ehAddon("apoio_financeiro"));
  assert.ok(ehAddon("protecao_margem"));
  assert.ok(!ehAddon("empresas"), "Empresas vem no Performance");
});

test("Módulos do Sistema mostra os módulos de plano e os add-ons, nunca configuração nem exclusivo Raccolto", () => {
  const ids = gruposContrataveis().flatMap(g => g.modulos.map(x => x.id));
  for (const id of ["automacoes", "whatsapp_agente", "apoio_financeiro", "ia_apolice", "fiscal_nfe"]) assert.ok(ids.includes(id), id);
  for (const id of ["bi", "conf_fiscal", "conf_raccotlo", "configuracoes", "folha"]) assert.ok(!ids.includes(id), id);
  assert.equal(gruposContrataveis().at(-1)?.label, "Sistema");
});
