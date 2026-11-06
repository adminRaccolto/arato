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

test("folha principal agrupa mil funcionários por empregador e competência sem perder totais", async () => {
  const { agruparPorEmpregador } = await import("./por-empregador.ts");
  const folhas = [{ id: "nov", fazenda_id: "faz", competencia: "2026-11", status: "rascunho", empresa_id: "emp" }, { id: "dez", fazenda_id: "faz", competencia: "2026-12", status: "rascunho", empresa_id: "emp" }];
  const linhas = Array.from({ length: 1000 }, (_, i) => ({ competencia: "2026-11", chave: "cnpj", empregador: "Empresa", linha: { id: `l${i}`, folha_id: "nov", funcionario_id: `p${i}`, nome_funcionario: `Pessoa ${i}`, salario_bruto: 3000, complemento_salarial: 500, inss_trabalhador: 250, irrf: 50, adiantamento: 400, outros_descontos: 100, fgts: 240, inss_patronal: 840 } }));
  const grupos = agruparPorEmpregador(linhas, folhas, () => ({ chave: "cnpj", nome: "Empresa" }));
  assert.equal(grupos.length, 2);
  const novembro = grupos.find(g => g.competencia === "2026-11")!;
  assert.equal(novembro.gerados, 1000);
  assert.equal(novembro.bruto, 3000000);
  assert.equal(novembro.complemento, 500000);
  assert.equal(novembro.descontos, 800000);
  assert.equal(novembro.liquido, 2700000);
  assert.equal(novembro.encargos, 1080000);
});

test("agrupamento preserva registros antigos do mesmo CNPJ, faltantes e empregadores diferentes", async () => {
  const { agruparPorEmpregador } = await import("./por-empregador.ts");
  const d = dados();
  d.folhas.push({ ...d.folhas[0], id: "folha-antiga", empresa_id: null, produtor_id: "pj-mesmo-cnpj" });
  const linhas = [
    { competencia: "2026-11", chave: "cnpj", empregador: "Empresa", linha: d.linhas[0] },
    { competencia: "2026-11", chave: "cnpj", empregador: "Empresa" },
    { competencia: "2026-11", chave: "cpf-outro", empregador: "Produtor" },
  ];
  const grupos = agruparPorEmpregador(linhas, d.folhas, () => ({ chave: "cnpj", nome: "Empresa" }));
  assert.equal(grupos.length, 2);
  const empresa = grupos.find(g => g.chave === "cnpj")!;
  assert.equal(empresa.folhas.length, 2);
  assert.equal(empresa.gerados, 1);
  assert.equal(empresa.faltantes, 1);
  assert.equal(empresa.liquido, 3000);
  assert.equal(grupos.find(g => g.chave === "cpf-outro")?.folhas.length, 0);
});

test("conferência em lote registra todos de uma vez e recusa composição ou valores desatualizados", async () => {
  const { prepararConferenciaEmLote } = await import("./por-empregador.ts");
  const d = dados();
  d.linhas.push({ ...d.linhas[0], id: "linha2", funcionario_id: "func2", nome_funcionario: "Outra pessoa", cp_lancamento_id: null });
  const versoes = d.linhas.map(l => ({ linha_id: l.id, assinatura: assinaturaConferencia(l, d) }));
  assert.equal(prepararConferenciaEmLote(d, ["folha"], versoes).length, 2);
  assert.throws(() => prepararConferenciaEmLote(d, ["folha"], versoes.slice(0, 1)), /composição/);
  assert.throws(() => prepararConferenciaEmLote(d, ["folha"], [versoes[0], versoes[0]]), /inválida/);
  assert.throws(() => prepararConferenciaEmLote(d, ["outra-folha"], versoes), /não encontrados/);
  d.linhas[1].salario_bruto = 3200;
  assert.throws(() => prepararConferenciaEmLote(d, ["folha"], versoes), /valores.*mudaram/);
});

test("conferência de mil funcionários reaproveita a leitura financeira sem alterar as assinaturas", async () => {
  const { prepararConferenciaEmLote } = await import("./por-empregador.ts");
  const d = dados();
  d.linhas = Array.from({ length: 1000 }, (_, i) => ({ id: `linha-${i}`, folha_id: "folha", funcionario_id: `func-${i}`, nome_funcionario: `Pessoa ${i}`, salario_bruto: 3000, cp_lancamento_id: `cp-${i}` }));
  d.titulos = d.linhas.map((l, i) => ({ id: `cp-${i}`, fazenda_id: "faz", valor: 3000, status: "em_aberto" }));
  d.vinculos = d.linhas.map(l => ({ titulo_id: l.cp_lancamento_id!, folha_id: l.folha_id, funcionario_id: l.funcionario_id!, competencia: "2026-11", grupo: "salario", descricao: "Salário" }));
  const financeiros = financeirosControle(d);
  const versoes = d.linhas.map(l => ({ linha_id: l.id, assinatura: assinaturaConferencia(l, d, financeiros) }));
  assert.equal(versoes[0].assinatura, assinaturaConferencia(d.linhas[0], d));
  const registros = prepararConferenciaEmLote(d, ["folha"], versoes);
  assert.equal(registros.length, 1000);
  assert.equal(registros[999].linha_id, "linha-999");
});

test("premiações das duas origens preservam o vínculo e não duplicam o mesmo CP", async () => {
  const { unificarPremiacoes, competenciaDoSalario } = await import("./premiacoes-origem.ts");
  const registros = unificarPremiacoes([{ id: "nova", lancamento_id: "cp" }], [{ id: "antiga", lancamento_id: "cp" }, { id: "pendente", lancamento_id: null }]);
  assert.equal(registros.length, 2);
  assert.equal(registros[0].origem_tabela, "funcionarios_premiacoes");
  assert.equal(registros[1].origem_tabela, "funcionario_premiacoes");
  assert.equal(competenciaDoSalario("Salário Set/2026 — Pessoa"), "2026-09");
  assert.equal(competenciaDoSalario("Adiantamento Set/2026"), null);
  assert.equal(competenciaDoSalario("Salário — Pessoa"), null);
});

test("reprocessamento compara a obrigação inteira e preserva o pagamento parcial", async () => {
  const { titulosParaReprocessamento } = await import("./reprocessamento-titulos.ts");
  const mapa = titulosParaReprocessamento(["raiz"], [
    { id: "raiz", valor: 3000, valor_pago: 3000, status: "baixado", conciliado: true },
    { id: "saldo", titulo_origem_id: "raiz", valor: 2000, status: "em_aberto" },
    { id: "cancelada", titulo_origem_id: "raiz", valor: 2000, status: "cancelado" },
  ]);
  assert.equal(mapa.get("raiz")?.valor, 5000);
  assert.equal(mapa.get("raiz")?.valor_pago, 3000);
  assert.equal(mapa.get("raiz")?.status, "baixado");
  assert.equal(mapa.get("raiz")?.conciliado, true);
  assert.throws(() => titulosParaReprocessamento(["apagada"], [{ id: "saldo", titulo_origem_id: "apagada", valor: 500, status: "em_aberto" }]), /sem o título original/);
});
