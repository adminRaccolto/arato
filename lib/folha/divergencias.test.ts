import assert from "node:assert/strict";
import test from "node:test";
import { assinaturaAusencia, confirmacaoAusencia, validarDecisaoAusencia, type DecisaoDivergencia } from "./divergencias.ts";
import { alvosFolha } from "./alvos-acesso.ts";
const f = { id: "func", fazenda_id: "faz", empresa_id: "emp", ativo: true, data_admissao: "2026-01-01" };
const decisao: DecisaoDivergencia = { id: "1", funcionario_id: f.id, funcionario_nome: "Ana", fazenda_id: "faz", competencia: "2026-11", assinatura: assinaturaAusencia("2026-11", f), acao: "confirmar_fora", motivo: "Ausência esperada neste mês", usuario_nome: "Gestor", created_at: "2026-11-06T10:00:00Z" };
test("confirmação vale apenas para o funcionário e competência analisados", () => {
  assert.equal(confirmacaoAusencia("2026-11", f, [decisao])?.id,"1");
  assert.equal(confirmacaoAusencia("2026-12", f, [decisao]),undefined);
  assert.equal(confirmacaoAusencia("2026-11", {...f,id:"outro"}, [decisao]),undefined);
});
test("troca de empregador, fazenda ou datas do vínculo exige nova análise", () => {
  for (const alteracao of [{empresa_id:"emp2"},{fazenda_id:"faz2"},{data_admissao:"2026-02-01"},{data_demissao:"2026-11-05"},{ativo:false}]) {
    assert.equal(confirmacaoAusencia("2026-11", {...f,...alteracao}, [decisao]),undefined);
  }
});
test("reabrir preserva a decisão anterior e devolve a pendência", () => {
  const reaberta: DecisaoDivergencia = {...decisao,id:"2",acao:"reabrir",created_at:"2026-11-06T11:00:00Z"};
  assert.equal(confirmacaoAusencia("2026-11",f,[reaberta,decisao]),undefined);
  const nova = {...decisao,id:"3",created_at:"2026-11-06T12:00:00Z"};
  assert.equal(confirmacaoAusencia("2026-11",f,[nova,reaberta,decisao])?.id,"3");
});
test("decisão exige mês válido, ação conhecida e motivo", () => {
  assert.equal(validarDecisaoAusencia({competencia:"2026-11",acao:"confirmar_fora",motivo:"Licença no mês"}),null);
  for(const p of [{competencia:"2026-13",acao:"confirmar_fora",motivo:"Licença"},{competencia:"2026-11",acao:"excluir",motivo:"Licença"},{competencia:"2026-11",acao:"confirmar_fora",motivo:"  "}]) assert.ok(validarDecisaoAusencia(p));
});
test("API valida todas as fazendas da consulta e todos os funcionários da decisão em lote", () => {
  assert.deepEqual(alvosFolha("listar_divergencias_decisoes",{fazenda_ids:["f1","f2"]})?.fazendas,["f1","f2"]);
  assert.deepEqual(alvosFolha("decidir_divergencias",{rows:[{funcionario_id:"p1"},{funcionario_id:"p2"}]})?.funcionarios,["p1","p2"]);
});
