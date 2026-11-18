import { entraNoCusto } from "../custos/titulos-custo";
import {
  classificacaoSemResultado,
  emReais,
  grupoCategoria,
  numero,
} from "./apuracao";
export type RegistroEmpresa = Record<string, unknown>;
export function apurarEmpresa(
  titulos: RegistroEmpresa[],
  funcionarios: RegistroEmpresa[],
  ogs: Map<string, string>,
) {
  const r = {
    receitas: 0,
    receitasFinanceiras: 0,
    outrasReceitas: 0,
    cogs: 0,
    salarios: 0,
    inss: 0,
    fgts: 0,
    operacionais: 0,
    financeiras: 0,
    depreciacao: 0,
    deducoes: 0,
    descontos: 0,
  };
  for (const t of titulos) {
    if (
      t.status !== "cancelado" &&
      t.natureza !== "previsao" &&
      t.origem_lancamento !== "tesouraria" &&
      ["pago", "baixado", "parcial"].includes(String(t.status))
    ) {
      if (t.tipo === "receber") {
        r.receitasFinanceiras += numero(t.valor_juros) + numero(t.valor_multa);
        r.deducoes += numero(t.valor_desconto);
      } else if (t.tipo === "pagar") {
        r.financeiras += numero(t.valor_juros) + numero(t.valor_multa);
        r.descontos += numero(t.valor_desconto);
      }
    }
    if (
      !entraNoCusto(t) ||
      t.natureza === "previsao" ||
      ["folha", "pedido_compra", "cartao_fatura"].includes(
        String(t.origem_lancamento ?? t.origem),
      )
    )
      continue;
    if (
      t.tipo === "pagar" &&
      classificacaoSemResultado(ogs.get(String(t.operacao_gerencial_id ?? "")))
    )
      continue;
    const valor = emReais(t);
    if (valor === null)
      throw new Error(
        `Título ${String(t.descricao ?? t.id)} sem valor ou cotação histórica válida.`,
      );
    const categoria = String(t.categoria ?? "");
    const g = grupoCategoria(
      categoria,
      ogs.get(String(t.operacao_gerencial_id ?? "")),
    );
    if (t.tipo === "receber") {
      if (g === "receita_financeira") r.receitasFinanceiras += valor;
      else if (g === "receita_nao_op") r.outrasReceitas += valor;
      else if (
        g === "receita_bruta" ||
        (!ogs.has(String(t.operacao_gerencial_id ?? "")) &&
          !/capta|emprest|adiant|transfer/i.test(categoria))
      )
        r.receitas += valor;
      continue;
    }
    if (t.tipo !== "pagar" || g === "investimentos") continue;
    if (g === "depreciacao") r.depreciacao += valor;
    else if (g === "deducoes") r.deducoes += valor;
    else if (
      g === "juros_custeio" ||
      g === "desp_financeira" ||
      /^(financeiro|juros|encargos)$/.test(categoria)
    )
      r.financeiras += valor;
    else if (g.startsWith("cpv_") && g !== "cpv_rh_faz") r.cogs += valor;
    else r.operacionais += valor;
  }
  for (const f of funcionarios) {
    r.salarios += numero(f.salario_bruto) + numero(f.complemento_salarial);
    r.inss += numero(f.inss_patronal);
    r.fgts += numero(f.fgts);
  }
  return r;
}
