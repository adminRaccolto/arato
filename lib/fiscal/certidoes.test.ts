import test from "node:test";
import assert from "node:assert/strict";
import { certidoesVigentes, diasAteData, ehSubstituida, montarAvisos, semCndFederal, situacaoVenc, textoDias, type Certidao } from "./certidoes.ts";

const c = (o: Partial<Certidao>): Certidao => ({ id: Math.random().toString(36), conta_id: "k", produtor_id: "p1", tipo: "federal", data_validade: "2027-01-07", ...o });

test("dias e situação de vencimento", () => {
  assert.equal(diasAteData("2026-11-25", "2026-11-24"), 1);
  assert.equal(diasAteData("2026-11-20", "2026-11-24"), -4);
  assert.equal(situacaoVenc("2026-11-23", "2026-11-24"), "vencida");
  assert.equal(situacaoVenc("2026-11-24", "2026-11-24"), "vence_15");
  assert.equal(situacaoVenc("2026-12-09", "2026-11-24"), "vence_15");
  assert.equal(situacaoVenc("2026-12-24", "2026-11-24"), "vence_30");
  assert.equal(situacaoVenc("2026-12-25", "2026-11-24"), "em_dia");
  assert.equal(textoDias(-1), "venceu há 1 dia");
  assert.equal(textoDias(0), "vence hoje");
});

test("renovação: vale a certidão de validade mais longa do produtor e tipo", () => {
  const velha = c({ data_validade: "2026-10-01" }), nova = c({ data_validade: "2027-04-01" }), est = c({ tipo: "estadual", data_validade: "2026-11-30" });
  const vig = certidoesVigentes([velha, nova, est]);
  assert.equal(vig.length, 2);
  assert.ok(vig.includes(nova) && vig.includes(est));
  assert.equal(ehSubstituida(velha, [velha, nova, est]), true);
  assert.equal(ehSubstituida(nova, [velha, nova, est]), false);
});

test("avisos: só vencidas e até 30 dias, mais urgente primeiro; certificado A1 por produtor sem repetir", () => {
  const nomes: Record<string, string> = { p1: "Cleber", p2: "Odir" };
  const { avisos, emDia } = montarAvisos(
    [c({ data_validade: "2026-10-01" }), c({ data_validade: "2027-04-01" }), c({ produtor_id: "p2", tipo: "trabalhista", data_validade: "2026-12-01" })],
    [{ produtor_id: "p1", data_vencimento: "2026-11-20T23:59:59" }, { produtor_id: "p1", data_vencimento: "2026-11-20" }, { produtor_id: "p2", data_vencimento: "2027-08-01" }],
    id => nomes[id] ?? "", "2026-11-24",
  );
  assert.deepEqual(avisos.map(a => [a.produtor, a.titulo, a.dias]), [["Cleber", "Certificado digital A1", -4], ["Odir", "CNDT (Trabalhista)", 7]]);
  assert.equal(emDia, 2);
});

test("produtores sem CND Federal", () => {
  assert.deepEqual(semCndFederal(["p1", "p2", "p3"], [c({}), c({ produtor_id: "p2", tipo: "estadual" })]), ["p2", "p3"]);
});
