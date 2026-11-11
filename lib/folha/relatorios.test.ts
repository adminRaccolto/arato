import { test } from "node:test";
import assert from "node:assert/strict";
import { competencias, dividirHorasExtras, montarLista, montarQuadro, movimentosDaFolha, movimentosDaRescisao, movimentosDo13, type Pessoa } from "./relatorios.ts";

const joao: Pessoa = { funcionario_id: "f1", nome: "JOAO", cargo: "Tratorista", empregador: "PRODUTOR A", fazenda: "SANTA RITA", area: "operacional" };
const ana: Pessoa = { ...joao, funcionario_id: "f2", nome: "ANA", cargo: "Administrativo", area: "administrativo" };

test("horas extras: valor dividido entre 50% e 100% pelo peso das horas", () => {
  assert.deepEqual(dividirHorasExtras(350, 10, 10), { he50: 150, he100: 200 });
  assert.deepEqual(dividirHorasExtras(100, 0, 0), { he50: 100, he100: 0 });
  assert.deepEqual(dividirHorasExtras(0, 5, 5), { he50: 0, he100: 0 });
});

test("linha da folha vira movimentos; descontos negativos; salário sem gratificação, HE e DSR", () => {
  const ms = movimentosDaFolha({ salario_bruto: 3850, gratificacao: 300, he_valor: 350, he_dsr: 200, he_50_horas: 10, he_100_horas: 10, inss_trabalhador: 320, outros_descontos: 50, desc_outros_descontos: "Falta", fgts: 308 }, "2026-09", "Fechada", joao);
  const v = (id: string) => ms.find(m => m.modalidade === id)?.valor;
  assert.equal(v("salario"), 3000);
  assert.equal(v("he50"), 150);
  assert.equal(ms.find(m => m.modalidade === "he100")?.horas, 10);
  assert.equal(v("inss"), -320);
  assert.equal(ms.find(m => m.modalidade === "outros_descontos")?.descricao, "Falta");
  assert.equal(v("irrf"), undefined);                         // zero não vira movimento
});

test("13º: só parcelas lançadas; 2ª bruta + INSS/IRRF negativos somam o líquido pago", () => {
  const d = { ano: 2026, avos: 12, parcela1_lancamento_id: "a", parcela1_valor: 1500, parcela1_vencimento: "2026-11-30", parcela2_lancamento_id: "b", parcela2_valor: 1260, parcela2_vencimento: "2026-12-20", inss: 240, irrf: 0 };
  const ms = movimentosDo13(d, "Pago", "Aberto", joao);
  assert.equal(ms.filter(m => m.modalidade === "decimo").reduce((t, m) => t + m.valor, 0), 3000);
  assert.equal(ms.reduce((t, m) => t + m.valor, 0), 2760);
  assert.equal(movimentosDo13({ ...d, parcela2_lancamento_id: null }, "Pago", "", joao).length, 1);
});

test("rescisão: verbas nas modalidades certas; estornada fica de fora", () => {
  const r = { data_desligamento: "2026-10-15", status: "lancada", fgts_mes: 80, multa_fgts: 400, verbas: [
    { codigo: "saldo", descricao: "Saldo de salário", valor: 1000, tipo: "provento" }, { codigo: "inss_saldo", descricao: "INSS", valor: 75, tipo: "desconto" },
    { codigo: "13_pago", descricao: "13º já pago", valor: 500, tipo: "desconto" }] };
  const ms = movimentosDaRescisao(r, joao);
  assert.deepEqual(ms.map(m => [m.modalidade, m.valor]), [["verbas_rescisao", 1000], ["inss", -75], ["outros_descontos", -500], ["fgts", 80], ["multa_fgts", 400]]);
  assert.equal(movimentosDaRescisao({ ...r, status: "estornada" }, joao).length, 0);
});

test("lista com agrupamento e quadro por modalidade e por mês", () => {
  const ms = [
    ...movimentosDaFolha({ salario_bruto: 1000, inss_trabalhador: 75 }, "2026-09", "Fechada", joao),
    ...movimentosDaFolha({ salario_bruto: 1200 }, "2026-10", "Fechada", joao),
    ...movimentosDaFolha({ salario_bruto: 2000 }, "2026-09", "Fechada", ana),
  ];
  const l = montarLista(ms, ["funcionario", "modalidade", "valor"], ["funcionario"]);
  assert.equal(l.linhas[0].cels[0], "ANA");                       // grupos em ordem alfabética
  assert.equal(l.linhas.at(-1)!.cels[2], 4125);                    // total geral com o INSS negativo
  const q = montarQuadro(ms, ["funcionario"], "modalidade", []);
  assert.deepEqual(q.colunas.map(c => c.rot), ["Funcionário", "Salário (carteira)", "INSS do funcionário", "Total"]);
  assert.deepEqual(q.linhas.find(x => x.cels[0] === "JOAO")!.cels, ["JOAO", 2200, -75, 2125]);
  const qm = montarQuadro(ms, ["modalidade"], "competencia", competencias("2026-09", "2026-11"));
  assert.deepEqual(qm.colunas.map(c => c.rot), ["Modalidade", "Set/2026", "Out/2026", "Nov/2026", "Total"]);
  assert.deepEqual(qm.linhas.find(x => x.cels[0] === "Salário (carteira)")!.cels, ["Salário (carteira)", 3000, 1200, 0, 4200]);
  const q2 = montarQuadro(ms, ["funcionario", "competencia"], "modalidade", []);
  assert.ok(q2.linhas.some(x => x.tipo === "subtotal" && x.cels[0] === "Subtotal JOAO" && x.cels.at(-1) === 2125));
});

test("competências do período", () => {
  assert.deepEqual(competencias("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(competencias("2026-05", "2026-04"), []);
});
