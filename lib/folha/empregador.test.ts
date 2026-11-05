import { test } from "node:test";
import assert from "node:assert/strict";
import { criarResolvedorEmpregador, funcionariosSemFolha } from "./empregador.ts";

const CNPJ = "12.345.678/0001-90";
const empresas = [{ id: "emp-b", cpf_cnpj: CNPJ }, { id: "emp-a", cpf_cnpj: "12345678000190" }, { id: "emp-sem", cpf_cnpj: null }];
const produtores = [{ id: "prod-pj", cpf_cnpj: CNPJ }, { id: "prod-pf", cpf_cnpj: "111.222.333-44" }, { id: "prod-sem", cpf_cnpj: "" }];

test("mesmo CNPJ como produtor PJ e como empresa vira um só empregador, e a empresa é o empregador", () => {
  const r = criarResolvedorEmpregador(empresas, produtores, [{ empresa_id: "emp-b" }, { empresa_id: "emp-b" }, { empresa_id: "emp-a" }]);
  const viaEmpresa = r({ empresa_id: "emp-a", produtor_id: "prod-pj" });
  const viaProdutor = r({ produtor_id: "prod-pj" });
  assert.equal(viaEmpresa.chave, "doc:12345678000190");
  assert.equal(viaProdutor.chave, viaEmpresa.chave);
  assert.equal(viaEmpresa.empresa_id, "emp-b");   // empresa repetida: a mais usada
  assert.equal(viaProdutor.empresa_id, "emp-b");  // sem empresa no cadastro, mas há empresa com o CNPJ: INSS patronal volta
  assert.equal(viaProdutor.produtor_id, "prod-pj");
});

test("empate no uso escolhe o menor id; produtor rural pessoa física continua produtor", () => {
  const r = criarResolvedorEmpregador(empresas, produtores);
  assert.equal(r({ empresa_id: "emp-b" }).empresa_id, "emp-a");
  assert.deepEqual(r({ produtor_id: "prod-pf" }), { empresa_id: null, produtor_id: "prod-pf", chave: "doc:11122233344" });
});

test("cadastro sem documento continua separado pelo registro", () => {
  const r = criarResolvedorEmpregador(empresas, produtores);
  assert.equal(r({ empresa_id: "emp-sem" }).chave, "emp:emp-sem");
  assert.equal(r({ produtor_id: "prod-sem" }).chave, "prod:prod-sem");
  assert.equal(r({}).chave, "");
});

test("aviso de quem ficou fora da folha: só quem estava no mês anterior ou foi admitido agora", () => {
  const ativos = [
    { id: "cleiton", data_admissao: "2026-04-22" },                      // estava em setembro, faltou em outubro
    { id: "socio", data_admissao: null },                                // nunca entrou em folha
    { id: "novo", data_admissao: "2026-10-03" },                         // admitido no mês
    { id: "incluido", data_admissao: "2020-01-01" },                     // já está na folha
    { id: "demitido", data_admissao: "2020-01-01", data_demissao: "2026-09-10" },
    { id: "futuro", data_admissao: "2026-11-02" },
    { id: "inativo", ativo: false, data_admissao: "2026-10-01" },
  ];
  const fora = funcionariosSemFolha("2026-10", ativos, new Set(["incluido"]), new Set(["cleiton", "incluido", "demitido"]));
  assert.deepEqual(fora.map(f => f.id), ["cleiton", "novo"]);
  assert.deepEqual(funcionariosSemFolha("2026-01", [{ id: "x", data_admissao: "2025-12-15" }], new Set(), new Set()).map(f => f.id), ["x"]);
});
