import assert from "node:assert/strict";
import test from "node:test";
import { indexarConfigsEmitentes } from "./configs-emitentes.ts";

const modulo = "fiscal_pf_12345678909";
const completo = { razao_social: "Produtor A", cpf_cnpj_emitente: "123.456.789-09" };
const registro = (fazenda_id: string, config: Record<string, string>, updated_at = "2026-10-01") => ({ modulo, fazenda_id, config, updated_at });

test("cadastro incompleto de outra fazenda não apaga CPF/CNPJ, independentemente da ordem", () => {
  const valido = registro("outra", completo);
  const incompleto = registro("ativa", { razao_social: "Produtor A" }, "2026-10-23");
  for (const registros of [[valido, incompleto], [incompleto, valido]]) {
    const configs = indexarConfigsEmitentes(registros, "ativa");
    assert.deepEqual(Object.keys(configs), [modulo]);
    assert.deepEqual(configs[modulo], completo);
  }
});

test("prefere cadastro completo mesmo quando o local tem CPF e está sem nome", () => {
  const configs = indexarConfigsEmitentes([
    registro("outra", completo),
    registro("ativa", { cpf_cnpj_emitente: completo.cpf_cnpj_emitente }),
  ], "ativa");
  assert.deepEqual(configs[modulo], completo);
});

test("entre cadastros completos prefere a fazenda ativa, depois o mais recente", () => {
  const local = { ...completo, municipio: "Tapurah" };
  const recente = { ...completo, municipio: "Sorriso" };
  const registros = [registro("ativa", local), registro("outra", recente, "2026-10-23")];
  assert.deepEqual(indexarConfigsEmitentes(registros, "ativa")[modulo], local);
  assert.deepEqual(indexarConfigsEmitentes(registros, "terceira")[modulo], recente);
});

test("não mistura ajustes por IE ou dados de outro titular com a configuração base", () => {
  const outroModulo = "fiscal_emp_12345678000190";
  const empresa = { razao_social: "Empresa B", cpf_cnpj_emitente: "12345678000190" };
  const configs = indexarConfigsEmitentes([
    registro("outra", completo),
    registro("ativa", empresa),
    { ...registro("ativa", { serie: "5" }), modulo: `${modulo}__ie_inscricao` },
    { ...registro("ativa", empresa), modulo: outroModulo },
  ], "ativa");
  assert.deepEqual(configs, { [modulo]: completo, [outroModulo]: empresa });
});

test("sem configurações não conserva emitentes da carga anterior", () => {
  assert.deepEqual(indexarConfigsEmitentes([], "ativa"), {});
});
