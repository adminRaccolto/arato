import test from "node:test";
import assert from "node:assert/strict";
import { ehConfiguracaoPorGrupo, grupoLiberaConfiguracao, moduloDaTelaDeConfiguracao } from "./permissoes-configuracao.ts";

test("módulos de configuração seguem o grupo; os da Raccolto e os demais não", () => {
  assert.equal(ehConfiguracaoPorGrupo("conf_fiscal"), true);
  assert.equal(ehConfiguracaoPorGrupo("conf_raccotlo"), false);
  assert.equal(ehConfiguracaoPorGrupo("fin_pagar"), false);
});

test("só libera com visualizar marcado: não marcado é sem acesso", () => {
  assert.equal(grupoLiberaConfiguracao(["visualizar", "editar"]), true);
  assert.equal(grupoLiberaConfiguracao(["editar"]), false);
  assert.equal(grupoLiberaConfiguracao([]), false);
  assert.equal(grupoLiberaConfiguracao(undefined), false);
  assert.equal(grupoLiberaConfiguracao("escrita"), true);
  assert.equal(grupoLiberaConfiguracao("nenhum"), false);
});

test("tela protegida por módulo; a que também abre por outro menu fica de fora", () => {
  assert.equal(moduloDaTelaDeConfiguracao("/configuracoes/modulos"), "conf_fiscal");
  assert.equal(moduloDaTelaDeConfiguracao("/configuracoes/financeiras/taxas"), "conf_financeiro");
  assert.equal(moduloDaTelaDeConfiguracao("/configuracoes/classificacao"), null);
  assert.equal(moduloDaTelaDeConfiguracao("/configuracoes/modulos-x"), null);
});
