import test from "node:test";
import assert from "node:assert/strict";
import { prepararConsultaSieg, periodoSieg, correspondeConsultaSieg, autenticacaoSiegRecusada } from "./sieg-consulta";
const emitente = "11222333000181", destino = "52998224725";
const chave = `512609${emitente}550010000000421000000010`;
test("período manual consulta emissão; robô mantém upload incremental", () => {
  assert.equal(prepararConsultaSieg({}).base, "upload");
  const manual = prepararConsultaSieg({ data_inicio: "2026-09-28", data_fim: "2026-09-28" });
  assert.deepEqual(periodoSieg(manual.base, manual.inicio!, manual.fim!), { DataEmissaoInicio: "2026-09-28T00:00:00.000Z", DataEmissaoFim: "2026-09-28T23:59:59.999Z" });
  assert.equal(prepararConsultaSieg({ base_periodo: "upload", data_inicio: "2026-09-28" }).base, "upload");
});
test("chave recupera mês histórico, fornecedor e não depende da data atual do grid", () => {
  assert.equal(chave.length, 44);
  const c = prepararConsultaSieg({ chaves_acesso: [chave], data_inicio: "2026-11-16", data_fim: "2026-11-16" });
  assert.equal(c.inicio, "2026-09-01T00:00:00.000Z"); assert.equal(c.fim, "2026-09-30T23:59:59.999Z");
  assert.equal(c.emitente, emitente); assert.equal(c.base, "emissao");
});
test("consulta pontual valida dados, datas e intervalo antes de chamar o provedor", () => {
  for (const p of [{ numero_nf: "" }, { numero_nf: "42", cnpj_emitente: emitente }, { chaves_acesso: ["1".repeat(44)] },
    { data_inicio: "2026-02-30" }, { data_inicio: "2026-11-16", data_fim: "2026-09-28" },
    { numero_nf: "42", cnpj_emitente: emitente, data_inicio: "2026-01-01", data_fim: "2026-12-31" }]) assert.throws(() => prepararConsultaSieg(p));
});
test("número, série, emitente e destinatário precisam corresponder", () => {
  const c = prepararConsultaSieg({ numero_nf: "00042", cnpj_emitente: "11.222.333/0001-81", serie: "001", data_inicio: "2026-09-28", data_fim: "2026-09-28" });
  const n = { chave, numero: "42", serie: "1", cnpj_emitente: emitente, cnpj_destinatario: destino };
  assert.equal(correspondeConsultaSieg(n, c, [destino]), true);
  for (const patch of [{ numero: "142" }, { serie: "2" }, { cnpj_emitente: "99888777000166" }, { cnpj_destinatario: "11144477735" }]) assert.equal(correspondeConsultaSieg({ ...n, ...patch }, c, [destino]), false);
  assert.equal(autenticacaoSiegRecusada(new Error("SIEG HTTP 401: API Key inválida.")), true);
  assert.equal(autenticacaoSiegRecusada(new Error("SIEG HTTP 429")), false);
});
test("data final histórica sem início usa uma janela histórica válida", () => {
  const c = prepararConsultaSieg({ data_fim: "2026-09-28" });
  assert.equal(c.inicio, "2026-08-29T00:00:00.000Z"); assert.equal(c.fim, "2026-09-28T23:59:59.999Z");
});
