import { test } from "node:test";
import assert from "node:assert/strict";
import { calcINSS, calcIRRF } from "../folha-calculo.ts";
import { decimoJaPago, impostosRescisao, linhasAutomaticas, multaFgts, totaisRescisao, valorComplemento, type Verba } from "./rescisao.ts";

const base: Verba[] = [
  { codigo: "saldo", descricao: "Saldo", valor: 2000, tipo: "provento" },
  { codigo: "aviso", descricao: "Aviso", valor: 3000, tipo: "provento" },
  { codigo: "13", descricao: "13º", valor: 2500, tipo: "provento" },
  { codigo: "fp", descricao: "Férias", valor: 4000, tipo: "provento" },
];

test("INSS e IRRF só sobre saldo e 13º, em separado; aviso e férias indenizadas fora", () => {
  const i = impostosRescisao(base);
  assert.equal(i.inssSaldo, calcINSS(2000));
  assert.equal(i.irrfSaldo, calcIRRF(2000, calcINSS(2000)));
  assert.equal(i.inss13, calcINSS(2500));
  assert.equal(i.irrf13, calcIRRF(2500, calcINSS(2500)));
  assert.equal(i.baseFgts, 7500);   // saldo + aviso + 13º (férias indenizadas fora)
  assert.equal(i.fgtsMes, 600);
});

test("complemento entra só como valor pago, sem impostos; descontos automáticos", () => {
  const compl = valorComplemento([{ codigo: "saldo", descricao: "", valor: 400, tipo: "provento" }, { codigo: "aviso_desc", descricao: "", valor: 100, tipo: "desconto" }]);
  assert.equal(compl, 400);
  const linhas = linhasAutomaticas({ complemento: compl, impostos: impostosRescisao(base), adiantamentos: 300, decimoPago: 1250 });
  assert.deepEqual(linhas.map(l => l.codigo), ["complemento", "inss_saldo", "inss_13", "13_pago", "adiantamentos"]);
  assert.equal(linhas.find(l => l.codigo === "complemento")!.tipo, "provento");
  const t = totaisRescisao([...base, ...linhas]);
  assert.equal(t.proventos, 11900);
  assert.equal(t.liquido, Math.round((11900 - t.descontos) * 100) / 100);
});

test("13º já pago soma só as parcelas lançadas; multa sobre saldo do FGTS + FGTS do mês", () => {
  assert.equal(decimoJaPago({ parcela1_valor: 1000, parcela1_lancamento_id: "x", parcela2_valor: 800, parcela2_lancamento_id: null }), 1000);
  assert.equal(decimoJaPago(null), 0);
  assert.equal(multaFgts(10000, 600, 0.4), 4240);
  assert.equal(multaFgts(10000, 600, 0), 0);
});
