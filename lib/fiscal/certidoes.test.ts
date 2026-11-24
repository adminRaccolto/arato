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

test("NF-e: CND válida na data, texto no formato da nota antiga e retirada do diferimento", async () => {
  const { cndFederalValida, textoCndNfe, removerTextoDiferido } = await import("./certidoes.ts");
  const certs = [c({ numero: "0065302145", codigo_autenticacao: "TAUBBLB2UA2TU29U", data_validade: "2026-12-06" }),
    c({ id: "nova", numero: "0065753233", data_validade: "2027-01-07" }), { ...c({ produtor_id: null as unknown as string, data_validade: "2026-12-20" }), pessoa_id: "pe1" }];
  assert.equal(cndFederalValida(certs, { produtorIds: ["p1"] }, "2026-11-24")?.id, "nova");
  assert.equal(cndFederalValida(certs, { pessoaIds: ["pe1"] }, "2026-12-21"), null);
  assert.equal(cndFederalValida(certs, { pessoaIds: ["pe1"] }, "2026-12-01")?.data_validade, "2026-12-20");
  assert.equal(textoCndNfe(certs[0], "REMETENTE"), "CND REMETENTE Nº 0065302145/NUMERO DE AUTENTICAÇÃO: TAUBBLB2UA2TU29U;VENC:06/12/2026.");
  assert.equal(removerTextoDiferido("ICMS diferido conforme art. 572 do RICMS/MT, Decreto nº 2.212/2014. Funrural retido na fonte pelo adquirente conforme art. 25 da Lei 8.212/1991."),
    "Funrural retido na fonte pelo adquirente conforme art. 25 da Lei 8.212/1991.");
  assert.equal(removerTextoDiferido("Venda de resíduo.\nICMS diferido nos termos do Decreto MT n. 4.540/2004."), "Venda de resíduo.");
});
