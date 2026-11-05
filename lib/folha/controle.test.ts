import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assinaturaConferencia,
  conferenciaAtual,
  financeirosControle,
  liquidoGravado,
  statusFinanceiro,
  type ControleDados,
} from "./controle.ts";

function dados(): ControleDados {
  return {
    folhas: [
      {
        id: "folha",
        fazenda_id: "faz",
        competencia: "2026-11",
        status: "fechado",
        empresa_id: "emp",
      },
    ],
    linhas: [
      {
        id: "linha",
        folha_id: "folha",
        funcionario_id: "func",
        nome_funcionario: "Funcionário",
        salario_bruto: 3000,
        cp_lancamento_id: "sal",
      },
    ],
    funcionarios: [
      { id: "func", fazenda_id: "faz", nome: "Funcionário", ativo: false },
    ],
    adiantamentos: [
      {
        id: "adi",
        fazenda_id: "faz",
        funcionario_id: "func",
        competencia_ref: "2026-11",
        data: "2026-11-03",
        valor: 300,
        tipo: "gratificacao",
        status: "pendente",
        descontado_gratificacao_cp: 300,
        lancamento_id: "adi-cp",
      },
    ],
    premios: [
      {
        id: "prem",
        fazenda_id: "faz",
        funcionario_id: "func",
        mes_referencia: "2026-11",
        valor: 1000,
        descricao: "Gratificação",
        lancamento_id: "prem-cp",
      },
    ],
    titulos: [
      { id: "sal", fazenda_id: "faz", valor: 3000, status: "em_aberto" },
      { id: "prem-cp", fazenda_id: "faz", valor: 700, status: "em_aberto" },
      {
        id: "adi-cp",
        fazenda_id: "faz",
        valor: 300,
        status: "baixado",
        valor_pago: 300,
      },
    ],
    vinculos: [
      {
        titulo_id: "sal",
        folha_id: "folha",
        funcionario_id: "func",
        competencia: "2026-11",
        grupo: "salario",
        descricao: "Salário",
      },
      {
        titulo_id: "prem-cp",
        funcionario_id: "func",
        competencia: "2026-11",
        grupo: "gratificacao",
        descricao: "Gratificação",
      },
      {
        titulo_id: "adi-cp",
        funcionario_id: "func",
        competencia: "2026-11",
        grupo: "adiantamento",
        descricao: "Adiantamento",
      },
    ],
    conferencias: [],
    historico: [],
    avisos: [],
    conferenciaDisponivel: true,
  };
}

test("gratificação separada e adiantamento já pago não são contados novamente no salário", () => {
  const d = dados(),
    ts = financeirosControle(d);
  assert.equal(liquidoGravado(d.linhas[0]), 3000);
  assert.equal(
    ts.reduce((s, t) => s + t.valor, 0),
    4000,
  );
  assert.equal(
    ts.reduce((s, t) => s + t.pago, 0),
    300,
  );
  assert.equal(
    ts.reduce((s, t) => s + t.saldo, 0),
    3700,
  );
});
test("baixas parciais e vínculos repetidos são consolidados uma vez", () => {
  const d = dados();
  d.titulos[0].valor = 2000;
  d.titulos.push({
    id: "parte",
    titulo_origem_id: "sal",
    fazenda_id: "faz",
    valor: 1000,
    valor_pago: 1000,
    status: "baixado",
  });
  d.vinculos.push({ ...d.vinculos[0] });
  const salario = financeirosControle(d).find((t) => t.titulo_id === "sal")!;
  assert.equal(salario.valor, 3000);
  assert.equal(salario.pago, 1000);
  assert.equal(salario.saldo, 2000);
  assert.equal(salario.protegido, true);
  assert.equal(financeirosControle(d).length, 3);
});
test("baixa com desconto quita o título, sem saldo fictício", () => {
  const d = dados();
  d.titulos[0] = { ...d.titulos[0], status: "baixado", valor_pago: 2700 };
  const t = financeirosControle(d)[0];
  assert.equal(t.saldo, 0);
  assert.equal(t.pago, 2700);
  assert.equal(statusFinanceiro([t]), "Pago / compensado");
});
test("revisão é preservada no pagamento parcial, mas invalidada quando salário, gratificação ou competência mudam", () => {
  const d = dados(),
    l = d.linhas[0],
    assinatura = assinaturaConferencia(l, d);
  d.conferencias.push({
    id: "conf",
    linha_id: l.id,
    folha_id: l.folha_id,
    assinatura,
    usuario_nome: "Ana",
    created_at: "2026-11-05",
  });
  assert.ok(conferenciaAtual(l, d));
  d.titulos[0].valor = 2000;
  d.titulos.push({
    id: "parte",
    titulo_origem_id: "sal",
    fazenda_id: "faz",
    valor: 1000,
    valor_pago: 1000,
    status: "baixado",
  });
  assert.ok(conferenciaAtual(l, d));
  d.premios[0].valor = 1200;
  assert.equal(conferenciaAtual(l, d), undefined);
  d.premios[0].valor = 1000;
  d.titulos[1].valor = 800;
  assert.equal(conferenciaAtual(l, d), undefined);
  d.titulos[1].valor = 700;
  d.folhas[0].competencia = "2026-12";
  assert.equal(conferenciaAtual(l, d), undefined);
});
test("histórico de desligados e títulos ausentes não são escondidos por uma situação de pago", () => {
  const d = dados();
  assert.equal(d.funcionarios[0].ativo, false);
  d.titulos = [];
  assert.equal(statusFinanceiro(financeirosControle(d)), "Vínculo pendente");
});
test("gratificação totalmente adiantada tem saldo compensado, e título cancelado comum não é pago", () => {
  const d = dados();
  d.titulos[1] = { ...d.titulos[1], valor: 0, status: "cancelado" };
  const fs = financeirosControle(d);
  assert.equal(statusFinanceiro([fs[1]]), "Compensado por adiantamento");
  d.titulos[0].status = "cancelado";
  assert.equal(
    statusFinanceiro([financeirosControle(d)[0]]),
    "Sem título ativo",
  );
});

test("permissões distinguem visualização, conferência e o padrão de grupo não configurado", async () => {
  const { podeUsarControleFolha } = await import("./controle.ts");
  assert.equal(podeUsarControleFolha("cliente", ["visualizar"]), true);
  assert.equal(podeUsarControleFolha("cliente", ["visualizar"], true), false);
  assert.equal(
    podeUsarControleFolha("cliente", ["visualizar", "editar"], true),
    true,
  );
  assert.equal(podeUsarControleFolha("cliente", "nenhum"), false);
  assert.equal(podeUsarControleFolha("cliente", "leitura", true), false);
  assert.equal(podeUsarControleFolha("cliente", undefined, true), true);
  assert.equal(podeUsarControleFolha("raccotlo", "nenhum", true), true);
});
