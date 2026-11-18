import { OperationalButton, OperationalGrid } from "../OperationalUI";
import {
  categoriaCaixa,
  resumirCustosCaixa,
  totalCustosCaixa,
  type CustosCaixa,
  type PagamentoCusto,
} from "../../lib/resultados/custos-caixa";
import type { ReferenciasResultado } from "../../lib/resultados/carregar";
import { exibirData } from "../../lib/input-data";

export const dinheiroCaixa = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function nomeCicloCaixa(id: string | null, ref: ReferenciasResultado) {
  if (!id || id === "__sem_ciclo__") return "Sem ciclo";
  const c = ref.ciclos.find((c) => c.id === id);
  if (!c) return "Ciclo não localizado";
  const fazenda =
    ref.fazendas.find((f) => f.id === c.fazenda_id)?.nome ?? "Fazenda";
  return `${c.descricao || c.cultura || "Ciclo"} · ${fazenda}`;
}
export function linhasPagamentosCaixa(
  pagamentos: PagamentoCusto[],
  ref: ReferenciasResultado,
) {
  return pagamentos.map((p) => ({
    "Data da baixa": exibirData(p.data),
    Documento: p.documento,
    Descrição: p.descricao,
    Fazenda:
      ref.fazendas.find((f) => f.id === p.fazendaId)?.nome ??
      "Fazenda não localizada",
    Ciclo: nomeCicloCaixa(p.cicloId, ref),
    Categoria: p.categoria,
    "Operação gerencial": p.operacao,
    "Desembolso operacional (R$)": p.valor,
    "Pagamento total (R$)": p.pago,
    "Juros e multa excluídos (R$)": p.encargos,
    Origem: p.origem === "lancamentos" ? "CP do produtor" : "CP da empresa",
  }));
}

export function PainelCustosCaixa({
  dados,
  referencias: ref,
  visao,
  ciclo = "",
  grupo = "",
  pagina = 0,
  impressao = false,
  selecionarCiclo,
  selecionarGrupo,
  mudarPagina,
}: {
  dados: CustosCaixa;
  referencias: ReferenciasResultado;
  visao: "total" | "ciclos";
  ciclo?: string;
  grupo?: string;
  pagina?: number;
  impressao?: boolean;
  selecionarCiclo?: (id: string) => void;
  selecionarGrupo?: (id: string) => void;
  mudarPagina?: (n: number) => void;
}) {
  const ciclos = resumirCustosCaixa(dados.pagamentos, "cicloId");
  const selecionados = dados.pagamentos.filter(
    (p) =>
      visao === "total" || !ciclo || (p.cicloId ?? "__sem_ciclo__") === ciclo,
  );
  const categorias = resumirCustosCaixa(selecionados, "grupo");
  const lista = selecionados.filter((p) => !grupo || p.grupo === grupo);
  const total = totalCustosCaixa(selecionados);
  const semCiclo = totalCustosCaixa(selecionados.filter((p) => !p.cicloId));
  const paginas = Math.max(1, Math.ceil(lista.length / 50));
  const paginaAtual = Math.min(pagina, paginas - 1);
  const linhas = impressao
    ? lista
    : lista.slice(paginaAtual * 50, (paginaAtual + 1) * 50);
  const card = {
    padding: 18,
    border: "1px solid var(--border, rgb(213, 223, 227))",
    borderRadius: 12,
    background: "var(--bg-card, rgb(255, 255, 255))",
    minWidth: 0,
  };
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,230px),1fr))",
          gap: 12,
        }}
      >
        {[
          [
            "Desembolso operacional",
            total,
            `${selecionados.length} títulos pagos no período`,
          ],
          [
            "Com ciclo apontado",
            total - semCiclo,
            "Mantém o ciclo registrado no pagamento",
          ],
          ["Sem ciclo", semCiclo, "Incluído no total geral"],
        ].map(([nome, valor, legenda]) => (
          <article key={String(nome)} style={card}>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-2, rgb(84, 101, 117))",
              }}
            >
              {nome}
            </div>
            <strong
              style={{ display: "block", margin: "10px 0", fontSize: 26 }}
            >
              {dinheiroCaixa(Number(valor))}
            </strong>
            <small>{legenda}</small>
          </article>
        ))}
      </div>

      {visao === "ciclos" && (
        <section aria-label="Desembolsos por ciclo" style={card}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>
            Onde os pagamentos foram apontados
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(min(100%,240px),1fr))",
              gap: 10,
            }}
          >
            {[
              {
                id: "",
                valor: totalCustosCaixa(dados.pagamentos),
                quantidade: dados.pagamentos.length,
              },
              ...ciclos,
            ].map((c) => (
              <OperationalButton
                key={c.id}
                type="button"
                aria-pressed={ciclo === c.id}
                aria-label={`Ver pagamentos: ${c.id ? nomeCicloCaixa(c.id, ref) : "Todos os ciclos e sem ciclo"}`}
                onClick={() => selecionarCiclo?.(c.id)}
                style={{
                  display: "grid",
                  gap: 8,
                  textAlign: "left",
                  whiteSpace: "normal",
                  padding: 14,
                  borderRadius: 10,
                  border: `1px solid ${ciclo === c.id ? "var(--accent, rgb(34, 120, 107))" : "var(--border, rgb(213, 223, 227))"}`,
                  background:
                    ciclo === c.id
                      ? "var(--bg-hover, rgb(238, 247, 244))"
                      : "var(--bg-card, rgb(255, 255, 255))",
                  color: "var(--text-1, rgb(32, 56, 74))",
                }}
              >
                <span>
                  {c.id
                    ? nomeCicloCaixa(c.id, ref)
                    : "Todos os ciclos + sem ciclo"}
                </span>
                <strong style={{ fontSize: 20 }}>
                  {dinheiroCaixa(c.valor)}
                </strong>
                <small>{c.quantidade} títulos pagos</small>
              </OperationalButton>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Composição dos custos operacionais" style={card}>
        <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Em que foi gasto</h2>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-2, rgb(84, 101, 117))",
            margin: "0 0 16px",
          }}
        >
          {visao === "ciclos" && ciclo
            ? nomeCicloCaixa(ciclo, ref)
            : "Total do período, incluindo os pagamentos sem ciclo"}
          {!impressao &&
            " · Clique em uma categoria para conferir os pagamentos."}
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))",
            gap: 12,
          }}
        >
          {categorias.map((c) => (
            <OperationalButton
              key={c.id}
              type="button"
              onClick={() => selecionarGrupo?.(grupo === c.id ? "" : c.id)}
              aria-pressed={grupo === c.id}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                whiteSpace: "normal",
                padding: 14,
                border: `1px solid ${grupo === c.id ? "var(--accent, rgb(34, 120, 107))" : "var(--border, rgb(213, 223, 227))"}`,
                borderRadius: 10,
                background: "var(--bg-card, rgb(255, 255, 255))",
                color: "var(--text-1, rgb(32, 56, 74))",
              }}
            >
              <span
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span>{categoriaCaixa(c.id)}</span>
                <strong>{dinheiroCaixa(c.valor)}</strong>
              </span>
              <span
                style={{
                  display: "block",
                  height: 5,
                  background: "var(--bg-tag, rgb(230, 236, 236))",
                  borderRadius: 10,
                  margin: "12px 0 8px",
                }}
              >
                <span
                  style={{
                    display: "block",
                    height: 5,
                    width: `${total ? (c.valor / total) * 100 : 0}%`,
                    background: "var(--accent, rgb(34, 120, 107))",
                    borderRadius: 10,
                  }}
                />
              </span>
              <small>
                {(total ? (c.valor / total) * 100 : 0).toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
                % · {c.quantidade} títulos
              </small>
            </OperationalButton>
          ))}
        </div>
        {!categorias.length && (
          <p>Nenhum desembolso operacional encontrado para esta seleção.</p>
        )}
      </section>

      <section aria-label="Pagamentos que compõem os custos" style={card}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              {grupo ? categoriaCaixa(grupo) : "Pagamentos do período"}
            </h2>
            <p style={{ margin: "6px 0 0", fontSize: 13 }}>
              {lista.length} títulos · {dinheiroCaixa(totalCustosCaixa(lista))}
            </p>
          </div>
          {grupo && !impressao && (
            <OperationalButton onClick={() => selecionarGrupo?.("")}>
              Ver todas as categorias
            </OperationalButton>
          )}
        </div>
        <div style={{ overflowX: "auto" }}>
          <OperationalGrid
            data-op-title={impressao ? undefined : "Desembolsos operacionais"}
            style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}
          >
            <thead>
              <tr>
                {[
                  "Baixa",
                  "Documento / pagamento",
                  "Fazenda",
                  "Ciclo",
                  "Categoria",
                  "Desembolso operacional",
                ].map((c) => (
                  <th
                    key={c}
                    scope="col"
                    style={{
                      textAlign: "left",
                      padding: "10px 8px",
                      borderBottom: "1px solid rgb(213, 223, 227)",
                    }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.id}>
                  <td style={{ padding: 10, whiteSpace: "nowrap" }}>
                    {exibirData(p.data)}
                  </td>
                  <td
                    style={{
                      padding: 10,
                      minWidth: impressao ? undefined : 210,
                    }}
                  >
                    <strong>{p.documento || "Sem nº de documento"}</strong>
                    <div>{p.descricao}</div>
                    <small>
                      {p.origem === "lancamentos"
                        ? "CP do produtor"
                        : "CP da empresa"}
                    </small>
                  </td>
                  <td style={{ padding: 10 }}>
                    {ref.fazendas.find((f) => f.id === p.fazendaId)?.nome ??
                      "Fazenda não localizada"}
                  </td>
                  <td style={{ padding: 10 }}>
                    {nomeCicloCaixa(p.cicloId, ref)}
                  </td>
                  <td style={{ padding: 10 }}>
                    {p.categoria}
                    <div>
                      <small>{p.operacao}</small>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: 10,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <strong>{dinheiroCaixa(p.valor)}</strong>
                    {p.encargos > 0 && (
                      <div style={{ fontSize: 11, whiteSpace: "normal" }}>
                        Pagamento: {dinheiroCaixa(p.pago)} · juros/multa
                        excluídos: {dinheiroCaixa(p.encargos)}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </OperationalGrid>
        </div>
        {!impressao && paginas > 1 && (
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginTop: 14,
            }}
          >
            <OperationalButton
              disabled={paginaAtual === 0}
              onClick={() => mudarPagina?.(paginaAtual - 1)}
            >
              Anterior
            </OperationalButton>
            <span>
              Página {paginaAtual + 1} de {paginas}
            </span>
            <OperationalButton
              disabled={paginaAtual + 1 === paginas}
              onClick={() => mudarPagina?.(paginaAtual + 1)}
            >
              Próxima
            </OperationalButton>
          </div>
        )}
      </section>

      {dados.pendencias.length > 0 && (
        <section
          role="status"
          style={{ ...card, borderColor: "rgb(214, 172, 91)" }}
        >
          <strong>
            {dados.pendencias.length} pagamentos precisam de conferência e estão
            fora do total operacional.
          </strong>
          <p style={{ fontSize: 13 }}>
            Confira a classificação ou os dados de baixa indicados abaixo. Os
            pagamentos sem ciclo com classificação operacional já estão
            incluídos no total.
          </p>
          <details open={impressao}>
            <summary>Ver pagamentos a conferir</summary>
            <ul>
              {dados.pendencias.map((p) => (
                <li key={p.id} style={{ marginTop: 10 }}>
                  {p.descricao}
                  {p.valor !== null && ` · ${dinheiroCaixa(p.valor)}`}
                  <div>{p.motivo}</div>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {dados.excluidos.length > 0 && (
        <details style={card} open={impressao}>
          <summary>
            {dados.excluidos.length} pagamentos fora do escopo operacional
          </summary>
          <ul>
            {dados.excluidos.map((p) => (
              <li key={p.id} style={{ marginTop: 8 }}>
                {p.descricao}
                {p.valor !== null && ` · ${dinheiroCaixa(p.valor)}`} —{" "}
                {p.motivo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
