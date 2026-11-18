import { OperationalGrid } from "../OperationalUI";
import {
  GRUPOS_RESULTADO,
  metrica,
  totaisResultado,
  type ItemResultado,
} from "../../lib/resultados/apuracao";
import {
  BASES_CUSTO,
  GRUPOS_CUSTO,
  somaCustos,
  itensCusto,
  type BaseCusto,
} from "../../lib/resultados/custos";
export type ModoResultado =
  | "dre"
  | "margens"
  | "custoha"
  | "custostotais"
  | "produtividade";
export type UnidadeResultado = "total" | "ha" | "sc" | "percentual";
export type ColunaResultado = {
  id: string;
  nome: string;
  fazenda: string;
  itens: ItemResultado[];
  area: number;
  sacas: number;
  areaColhida: number;
  precoOrcado: number | null;
  produtividadeOrcada: number | null;
};
type Linha = {
  id: string;
  label: string;
  destaque?: boolean;
  unidade?: string;
  valor: (
    c: ColunaResultado,
    u: UnidadeResultado,
    base?: BaseCusto,
  ) => number | null;
  itens?: (c: ColunaResultado, base?: BaseCusto) => ItemResultado[];
};
export const relatorioDeCustos = (modo: ModoResultado) =>
  modo === "custostotais" || modo === "custoha";
export function colunasDemonstrativo(
  modo: ModoResultado,
  colunas: ColunaResultado[],
) {
  return colunas.flatMap((coluna) =>
    relatorioDeCustos(modo)
      ? BASES_CUSTO.map((base) => ({
          key: `${coluna.id}:${base.id}`,
          coluna,
          base: base.id as BaseCusto | undefined,
          titulo: `${coluna.fazenda} · ${coluna.nome} · ${base.label}`,
        }))
      : [
          {
            key: coluna.id,
            coluna,
            base: undefined as BaseCusto | undefined,
            titulo: `${coluna.fazenda} · ${coluna.nome}`,
          },
        ],
  );
}
const moeda = (n: number, u: UnidadeResultado) =>
  u === "percentual"
    ? `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function linhasDemonstrativo(modo: ModoResultado): Linha[] {
  const indicador = (
    id: string,
    label: string,
    unidade: string,
    valor: (c: ColunaResultado) => number | null,
  ): Linha => ({ id, label, unidade, valor });
  const linhas: Linha[] = [
    indicador("area", "Área plantada", "ha", (c) => c.area || null),
    indicador(
      "colhida",
      "Área colhida identificada",
      "ha",
      (c) => c.areaColhida || null,
    ),
    indicador("sacas", "Produção aprovada", "sc", (c) => c.sacas),
    indicador("produtividade", "Produtividade da área colhida", "sc/ha", (c) =>
      c.areaColhida > 0 ? c.sacas / c.areaColhida : null,
    ),
  ];
  if (modo === "produtividade")
    return [
      ...linhas,
      indicador(
        "meta",
        "Produtividade esperada (orçamento)",
        "sc/ha",
        (c) => c.produtividadeOrcada,
      ),
      indicador(
        "preco",
        "Preço esperado (orçamento)",
        "R$/sc",
        (c) => c.precoOrcado,
      ),
    ];
  if (relatorioDeCustos(modo)) {
    const custo = (grupo: string | undefined, label: string): Linha => ({
      id: grupo ?? "custo",
      label,
      destaque: !grupo,
      valor: (c, u, base = "realizado") =>
        metrica(
          somaCustos(c.itens, base, grupo),
          u,
          c.area,
          c.sacas,
          somaCustos(c.itens, base),
        ),
      itens: (c, base = "realizado") => itensCusto(c.itens, base, grupo),
    });
    return [
      ...GRUPOS_CUSTO.map((g) => custo(g.grupo, g.nome)),
      custo(undefined, "TOTAL DE CUSTOS E DESPESAS"),
    ];
  }
  const resumida = (
    id: keyof ReturnType<typeof totaisResultado>,
    label: string,
  ): Linha => ({
    id,
    label,
    destaque: true,
    valor: (c, u) =>
      metrica(
        Number(totaisResultado(c.itens)[id]),
        u,
        c.area,
        c.sacas,
        totaisResultado(c.itens).receitas,
      ),
    itens: (c) =>
      c.itens.filter((i) => {
        if (i.previsto) return false;
        if (id === "custo") return !i.grupo.startsWith("receita");
        if (id === "resultado") return true;
        const financeiras = [
          "receita_financeira",
          "receita_nao_op",
          "juros_custeio",
          "desp_financeira",
          "descontos",
        ];
        if (financeiras.includes(i.grupo)) return false;
        if (id === "ebitda" && i.grupo === "depreciacao") return false;
        if (id === "margemBruta")
          return (
            i.grupo === "receita_bruta" ||
            i.grupo === "deducoes" ||
            [
              "sementes",
              "fertilizantes",
              "defensivos",
              "correcao_solo",
            ].includes(i.grupo) ||
            (i.grupo.startsWith("cpv_") && i.grupo !== "cpv_rh_faz")
          );
        return true;
      }),
  });
  const detalhe = GRUPOS_RESULTADO.map(
    ([g, label]): Linha => ({
      id: g,
      label: `${g.startsWith("receita") || g === "descontos" ? "+" : "−"} ${label}`,
      valor: (c, u) =>
        metrica(
          (g.startsWith("receita") || g === "descontos" ? 1 : -1) *
            (totaisResultado(c.itens).grupos[g] ?? 0),
          u,
          c.area,
          c.sacas,
          totaisResultado(c.itens).receitas,
        ),
      itens: (c) => c.itens.filter((i) => !i.previsto && i.grupo === g),
    }),
  );
  return [
    ...linhas,
    ...detalhe.filter((l) => ["receita_bruta", "deducoes"].includes(l.id)),
    ...detalhe.filter(
      (l) =>
        ["sementes", "fertilizantes", "defensivos", "correcao_solo"].includes(
          l.id,
        ) ||
        (l.id.startsWith("cpv_") && l.id !== "cpv_rh_faz"),
    ),
    resumida("margemBruta", "Margem bruta após os custos de produção"),
    ...detalhe.filter(
      (l) =>
        !l.id.startsWith("receita") &&
        !l.id.startsWith("cpv_") &&
        ![
          "deducoes",
          "sementes",
          "fertilizantes",
          "defensivos",
          "correcao_solo",
          "depreciacao",
          "juros_custeio",
          "desp_financeira",
          "descontos",
        ].includes(l.id),
    ),
    ...detalhe.filter((l) => l.id === "cpv_rh_faz"),
    resumida("ebitda", "EBITDA (antes da depreciação e das financeiras)"),
    ...detalhe.filter((l) => l.id === "depreciacao"),
    resumida("operacional", "Resultado operacional (após depreciação)"),
    ...detalhe.filter((l) =>
      [
        "receita_nao_op",
        "receita_financeira",
        "juros_custeio",
        "desp_financeira",
        "descontos",
      ].includes(l.id),
    ),
    resumida("custo", "Custo total (líquido dos descontos)"),
    resumida("resultado", "Resultado gerencial"),
    {
      id: "previsto",
      label: "Previsões ainda não realizadas (fora do resultado)",
      valor: (c, u) =>
        metrica(
          totaisResultado(c.itens).previsto,
          u,
          c.area,
          c.sacas,
          totaisResultado(c.itens).receitas,
        ),
      itens: (c) => c.itens.filter((i) => i.previsto),
    },
  ];
}
/** Mantém indicadores e linhas com composição mesmo quando a base do indicador está ausente. */
export function linhasVisiveis(
  modo: ModoResultado,
  colunas: ColunaResultado[],
  unidade: UnidadeResultado,
  ocultarZeradas: boolean,
) {
  const bases: (BaseCusto | undefined)[] = relatorioDeCustos(modo)
    ? BASES_CUSTO.map((b) => b.id)
    : [undefined];
  return linhasDemonstrativo(modo).filter(
    (l) =>
      !ocultarZeradas ||
      l.destaque ||
      l.unidade ||
      l.id === "receita_bruta" ||
      colunas.some((c) =>
        bases.some(
          (base) =>
            Math.abs(l.valor(c, unidade, base) ?? 0) > 0.00001 ||
            l.itens?.(c, base).some((i) => Math.abs(i.valor) > 0.00001),
        ),
      ),
  );
}
export function TabelaResultados({
  colunas,
  modo,
  unidade,
  onDetalhe,
  ocultarZeradas = true,
}: {
  colunas: ColunaResultado[];
  modo: ModoResultado;
  unidade: UnidadeResultado;
  onDetalhe?: (titulo: string, itens: ItemResultado[]) => void;
  ocultarZeradas?: boolean;
}) {
  const custos = relatorioDeCustos(modo),
    campos = colunasDemonstrativo(modo, colunas);
  return (
    <div
      style={{
        overflowX: "auto",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <style>{`
        .resultados-comparativo { --rotulo-resultado: 260px; table-layout: fixed; }
        .resultados-comparativo > thead > tr:first-child > th:first-child, .resultados-comparativo > tbody > tr > th { width: var(--rotulo-resultado); overflow-wrap: anywhere; white-space: normal; }
        @media (max-width: 600px) {
          .resultados-comparativo { --rotulo-resultado: 160px; font-size: 12px; }
          .resultados-comparativo > thead > tr:first-child > th:first-child, .resultados-comparativo > tbody > tr > th { font-size: 12px; line-height: 1.35; }
        }
        @media print {
          .resultados-comparativo { table-layout: auto; min-width: 100% !important; font-size: 8pt; }
          .resultados-comparativo > thead > tr:first-child > th:first-child, .resultados-comparativo > tbody > tr > th { position: static !important; width: auto; }
          .resultados-comparativo tr > * { min-width: 0 !important; white-space: normal !important; padding: 5px !important; }
        }
      `}</style>
      <OperationalGrid
        className="resultados-comparativo"
        aria-label={
          custos
            ? "Comparativo de custos por ciclo"
            : "Comparativo de resultados por ciclo"
        }
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: `calc(var(--rotulo-resultado) + ${campos.length * 180}px)`,
        }}
      >
        <thead>
          <tr>
            <th
              rowSpan={custos ? 2 : undefined}
              scope="col"
              style={{
                position: "sticky",
                left: 0,
                zIndex: 2,
                background: "var(--bg-card)",
                padding: 12,
                textAlign: "left",
              }}
            >
              {custos ? "Categoria de custo / despesa" : "Demonstrativo"}
            </th>
            {colunas.map((c) => (
              <th
                key={c.id}
                colSpan={custos ? BASES_CUSTO.length : undefined}
                scope={custos ? "colgroup" : "col"}
                style={{
                  padding: 12,
                  textAlign: "right",
                  minWidth: custos ? 540 : 180,
                  width: custos ? 540 : 180,
                  borderLeft: "1px solid var(--border)",
                }}
              >
                <div>{c.fazenda}</div>
                <div>{c.nome}</div>
              </th>
            ))}
          </tr>
          {custos && (
            <tr>
              {campos.map((campo) => (
                <th
                  key={campo.key}
                  scope="col"
                  style={{
                    textAlign: "right",
                    padding: "8px 12px",
                    width: 180,
                    borderLeft: "1px solid var(--border)",
                  }}
                >
                  {BASES_CUSTO.find((b) => b.id === campo.base)?.label}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {linhasVisiveis(modo, colunas, unidade, ocultarZeradas).map((l) => (
            <tr
              key={l.id}
              style={{
                borderTop: "1px solid var(--border)",
                background: l.destaque ? "var(--bg-hover)" : undefined,
              }}
            >
              <th
                scope="row"
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  background: "var(--bg-card)",
                  padding: "9px 12px",
                  textAlign: "left",
                  fontWeight: l.destaque ? 750 : 450,
                }}
              >
                {l.label}
                {l.unidade && ` (${l.unidade})`}
              </th>
              {campos.map(({ coluna: c, base, key }) => {
                const v = l.valor(c, unidade, base),
                  itens = l.itens?.(c, base);
                const txt =
                  v === null
                    ? "—"
                    : l.unidade
                      ? v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                      : moeda(v, unidade);
                return (
                  <td
                    key={key}
                    style={{
                      textAlign: "right",
                      padding: "9px 12px",
                      whiteSpace: "nowrap",
                      color: v !== null && v < 0 ? "#b42318" : undefined,
                      fontWeight: l.destaque ? 750 : 450,
                      borderLeft: "1px solid var(--border)",
                    }}
                  >
                    {itens?.length && onDetalhe ? (
                      <button
                        style={{
                          color: "inherit",
                          fontWeight: "inherit",
                          background: "transparent",
                          border: 0,
                          padding: 0,
                          cursor: "pointer",
                          textDecoration: "underline",
                          textUnderlineOffset: 3,
                        }}
                        onClick={() =>
                          onDetalhe(
                            `${l.label} · ${c.fazenda} · ${c.nome}${base ? ` · ${BASES_CUSTO.find((b) => b.id === base)?.label}` : ""}`,
                            itens,
                          )
                        }
                      >
                        {txt}
                      </button>
                    ) : (
                      txt
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </OperationalGrid>
    </div>
  );
}
