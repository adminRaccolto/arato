import assert from "node:assert/strict";
import test from "node:test";
import { aplicarIdentidadeTitular, documentoDoModulo, escolherModuloUnico, ibgePeloNome, ibgeValido, type TitularCadastro } from "./identidade-fiscal.ts";

const CPF = "31020674091";
const titular: TitularCadastro = { nome: "Flávio", cpf_cnpj: "310.206.740-91", inscricao_est: "132354195", logradouro: "Rua A", numero: "10", bairro: "Centro", municipio: "Canarana", municipio_ibge: "5102702", estado: "MT", cep: "78640-000", telefone: "66" };

test("configuração só com certificado funciona: a identidade vem do cadastro", () => {
  const c = aplicarIdentidadeTitular({ cert_a1_path: "x.pfx", cert_a1_senha: "s" }, CPF, titular);
  assert.equal(c.cpf_cnpj_emitente, "310.206.740-91");
  assert.equal(c.razao_social, "Flávio");
  assert.equal(c.logradouro, "Rua A");
  assert.equal(c.cep, "78640000");
  assert.equal(c.cert_a1_path, "x.pfx");
});

test("cadastro vale sobre a cópia antiga da configuração", () => {
  const c = aplicarIdentidadeTitular({ cpf_cnpj_emitente: CPF, razao_social: "Nome velho", logradouro: "Rua velha" }, CPF, titular);
  assert.equal(c.razao_social, "Flávio");
  assert.equal(c.logradouro, "Rua A");
});

test("CPF preenchido e diferente do titular bloqueia", () => {
  assert.throws(() => aplicarIdentidadeTitular({ cpf_cnpj_emitente: "111.111.111-11" }, CPF, titular), /não corresponde/);
});

test("CPF vazio não é CPF diferente", () => {
  assert.doesNotThrow(() => aplicarIdentidadeTitular({ cpf_cnpj_emitente: "" }, CPF, titular));
});

test("campo em branco no cadastro usa a configuração", () => {
  const c = aplicarIdentidadeTitular({ logradouro: "Rua da config", numero: "5" }, CPF, { ...titular, logradouro: "", numero: null });
  assert.equal(c.logradouro, "Rua da config");
  assert.equal(c.numero, "5");
});

test("município e IBGE vêm sempre do mesmo lugar", () => {
  const semIbge = aplicarIdentidadeTitular({ municipio_nome: "Nova Mutum", municipio_ibge: "5106224" }, CPF, { ...titular, municipio_ibge: null });
  assert.equal(semIbge.municipio_nome, "Nova Mutum");
  assert.equal(semIbge.municipio_ibge, "5106224");
  const comIbge = aplicarIdentidadeTitular({ municipio_nome: "Nova Mutum", municipio_ibge: "5106224" }, CPF, titular);
  assert.equal(comIbge.municipio_nome, "Canarana");
  assert.equal(comIbge.municipio_ibge, "5102702");
});

test("IE do produtor não é escolhida aqui; a da empresa sim", () => {
  assert.equal(aplicarIdentidadeTitular({}, CPF, titular).ie_emitente ?? "", "");
  assert.equal(aplicarIdentidadeTitular({}, "50553198000109", { ...titular, inscricao_est: "999" }).ie_emitente, "999");
});

test("sem titular no cadastro: mantém a configuração e o documento da chave", () => {
  const c = aplicarIdentidadeTitular({ razao_social: "Da config" }, CPF, null);
  assert.equal(c.razao_social, "Da config");
  assert.equal(c.cpf_cnpj_emitente, CPF);
});

test("documento só de chave de titular", () => {
  assert.equal(documentoDoModulo("fiscal_pf_31020674091"), CPF);
  assert.equal(documentoDoModulo("fiscal_emp_50553198000109"), "50553198000109");
  assert.equal(documentoDoModulo("fiscal_pf_2cb11881-64c1-4b99-bb03-3e1d7e2aa030"), null);
  assert.equal(documentoDoModulo("fiscal"), null);
});

const linhas = (l: [string, string][]) => l.map(([modulo, fazenda_id]) => ({ modulo, fazenda_id }));

test("emitente padrão: nunca adivinha entre titulares diferentes", () => {
  assert.equal(escolherModuloUnico(linhas([["fiscal_pf_1", "a"], ["fiscal_pf_2", "a"]]), "a"), "");
  assert.equal(escolherModuloUnico(linhas([["fiscal_pf_1", "b"], ["fiscal_pf_2", "c"]]), "a"), "");
});

test("emitente padrão: único da fazenda, ou único do cliente", () => {
  assert.equal(escolherModuloUnico(linhas([["fiscal_pf_1", "a"], ["fiscal_pf_2", "b"]]), "a"), "fiscal_pf_1");
  assert.equal(escolherModuloUnico(linhas([["fiscal_pf_1", "b"], ["fiscal_pf_1", "c"]]), "a"), "fiscal_pf_1");
  assert.equal(escolherModuloUnico([], "a"), "");
});

test("código IBGE do emitente sai do nome do município, sem diferenciar acento ou maiúscula", () => {
  const lista = [{ id: 5106224, nome: "Nova Mutum" }, { id: 5107925, nome: "Sorriso" }];
  assert.equal(ibgePeloNome(lista, "NOVA MUTUM"), "5106224");
  assert.equal(ibgePeloNome(lista, "Cuiabá"), "");
  assert.equal(ibgePeloNome(lista, ""), "");
  assert.equal(ibgeValido("5106224"), true);
  assert.equal(ibgeValido(""), false);
});
