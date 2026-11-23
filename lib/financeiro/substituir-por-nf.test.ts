import test from "node:test";
import assert from "node:assert/strict";
import { motivoSubstituirPorNf, observacaoSubstituido, type TituloManual } from "./substituir-por-nf.ts";

const t = (o: Partial<TituloManual> = {}): TituloManual => ({
  tipo: "pagar", status: "em_aberto", valor_pago: 0, lote_id: null, conciliado: false, fatura_cartao_id: null,
  nf_entrada_id: null, origem_lancamento: "manual", ...o,
});
const ok = { pagamentosFilhos: [], statusNf: "processada", mesmoCliente: true, titulosDaNf: 1 };

test("troca o título manual em aberto pelo da NF processada", () => {
  assert.equal(motivoSubstituirPorNf({ ...ok, titulo: t() }), null);
  assert.equal(motivoSubstituirPorNf({ ...ok, titulo: t({ origem_lancamento: null, status: "vencido" }) }), null);
});

test("recusa título pago, em borderô, conciliado, em cartão ou vindo de documento", () => {
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t({ valor_pago: 10 }) })!, /pagamento/);
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t(), pagamentosFilhos: [0, 5] })!, /pagamento/);
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t({ lote_id: "x" }) })!, /borderô/);
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t({ conciliado: true }) })!, /conciliado/);
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t({ fatura_cartao_id: "c" }) })!, /cartão/);
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t({ origem_lancamento: "nf_entrada" }) })!, /documento/);
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t({ status: "baixado" }) })!, /em aberto/);
});

test("recusa NF não processada, de outro cliente ou sem título gerado", () => {
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t(), statusNf: "pendente" })!, /não foi processada/);
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t(), mesmoCliente: false })!, /outro cliente/);
  assert.match(motivoSubstituirPorNf({ ...ok, titulo: t(), titulosDaNf: 0 })!, /sem gerar título/);
});

test("observação guarda a anterior e a referência da NF", () => {
  const o = observacaoSubstituido("pagar até sexta", "nf", "59423");
  assert.match(o, /^pagar até sexta\nSubstituído pelo título da NF 59423/);
  assert.match(observacaoSubstituido(null, "nfse", ""), /^Substituído pelo título da NFS-e \(sem número\)/);
});
