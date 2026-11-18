"use client";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import TopNav from "../TopNav";
import SelectField from "../SelectField";
import InputData from "../InputData";
import {
  OperationalButton,
  OperationalFilters,
  OperationalHeading,
} from "../OperationalUI";
import { supabase } from "../../lib/supabase";
import { hojeLocal } from "../../lib/data-local";
import { exibirData } from "../../lib/input-data";
import {
  carregarReferenciasResultados,
  type ReferenciasResultado,
} from "../../lib/resultados/carregar";
import { carregarCustosCaixa } from "../../lib/resultados/carregar-custos-caixa";
import {
  categoriaCaixa,
  resumirCustosCaixa,
  totalCustosCaixa,
  type CustosCaixa,
} from "../../lib/resultados/custos-caixa";
import { abrirPreviewImpressao, nomeRelatorio } from "../../lib/print";
import {
  linhasPagamentosCaixa,
  nomeCicloCaixa,
  PainelCustosCaixa,
} from "./PainelCustosCaixa";

const VAZIO: ReferenciasResultado = { fazendas: [], anos: [], ciclos: [] };
export default function RelatorioCustosCaixa() {
  const { fazendaId, fazendaIds, contaId, contaNome } = useAuth();
  const escopo = JSON.stringify([
    contaId,
    [...(fazendaIds.length ? fazendaIds : fazendaId ? [fazendaId] : [])].sort(),
  ]);
  const [referencias, setReferencias] = useState<{
    escopo: string;
    ref: ReferenciasResultado;
  } | null>(null);
  const ref = referencias?.escopo === escopo ? referencias.ref : VAZIO;
  const [fazenda, setFazenda] = useState("");
  const [inicio, setInicio] = useState(() => hojeLocal().slice(0, 7) + "-01");
  const [fim, setFim] = useState(() => hojeLocal());
  const [ano, setAno] = useState("");
  const [visao, setVisao] = useState<"total" | "ciclos">("total");
  const [formato, setFormato] = useState<"sintetico" | "detalhado">(
    "sintetico",
  );
  const [ciclo, setCiclo] = useState("");
  const [grupo, setGrupo] = useState("");
  const [pagina, setPagina] = useState(0);
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    chave: string;
    cliente: string;
    fazenda: string;
    inicio: string;
    fim: string;
    ref: ReferenciasResultado;
    dados: CustosCaixa;
  } | null>(null);
  const sequencia = useRef(0),
    atual = useRef("");
  const areaImpressao = useRef<HTMLDivElement>(null);
  const chave = JSON.stringify([escopo, fazenda, inicio, fim]);
  useEffect(() => {
    atual.current = chave;
  }, [chave]);
  useEffect(() => {
    let ativo = true;
    const seq = sequencia;
    seq.current++;
    setGerando(false);
    setSnapshot(null);
    setErro("");
    setFazenda("");
    setAno("");
    setCiclo("");
    setGrupo("");
    const [conta, ids] = JSON.parse(escopo) as [string | null, string[]];
    carregarReferenciasResultados(supabase, ids, conta)
      .then((ref) => {
        if (ativo) setReferencias({ escopo, ref });
      })
      .catch((e) => {
        if (ativo)
          setErro(
            e instanceof Error
              ? e.message
              : "Não foi possível carregar os filtros.",
          );
      });
    return () => {
      ativo = false;
      seq.current++;
    };
  }, [escopo]);
  const valido = snapshot?.chave === chave && referencias?.escopo === escopo;
  async function gerar() {
    const id = ++sequencia.current,
      captura = chave;
    setGerando(true);
    setErro("");
    setSnapshot(null);
    setCiclo("");
    setGrupo("");
    setPagina(0);
    try {
      const dados = await carregarCustosCaixa(supabase, {
        inicio,
        fim,
        fazendaIds: fazenda ? [fazenda] : ref.fazendas.map((f) => f.id),
      });
      if (id !== sequencia.current || atual.current !== captura) return;
      setSnapshot({
        chave: captura,
        cliente: contaNome ?? "",
        fazenda: fazenda
          ? (ref.fazendas.find((f) => f.id === fazenda)?.nome ?? "")
          : "Todas as fazendas",
        inicio,
        fim,
        ref,
        dados,
      });
    } catch (e) {
      if (id === sequencia.current && atual.current === captura)
        setErro(
          e instanceof Error
            ? e.message
            : "Não foi possível gerar o relatório.",
        );
    } finally {
      if (id === sequencia.current) setGerando(false);
    }
  }
  function selecionarSafra(descricao: string) {
    setAno(descricao);
    const anos = ref.anos.filter(
      (a) => a.descricao === descricao && a.data_inicio && a.data_fim,
    );
    if (anos.length) {
      setInicio(anos.map((a) => a.data_inicio!).sort()[0]);
      setFim(
        anos
          .map((a) => a.data_fim!)
          .sort()
          .at(-1)!,
      );
    }
  }
  const filtrosExportacao = snapshot
    ? [
        {
          rotulo: "Data da baixa",
          valor: `${exibirData(snapshot.inicio)} a ${exibirData(snapshot.fim)}`,
        },
        { rotulo: "Fazendas", valor: snapshot.fazenda },
        {
          rotulo: "Formato",
          valor:
            formato === "detalhado"
              ? "Detalhado — com relação de pagamentos"
              : "Sintético — resumo dos custos",
        },
        {
          rotulo: "Ciclo",
          valor:
            visao === "ciclos" && ciclo
              ? nomeCicloCaixa(ciclo, snapshot.ref)
              : "Todos, incluindo sem ciclo",
        },
        ...(formato === "detalhado"
          ? [
              {
                rotulo: "Detalhe dos pagamentos",
                valor: grupo
                  ? categoriaCaixa(grupo)
                  : "Todas as categorias operacionais",
              },
            ]
          : []),
        {
          rotulo: "Regime",
          valor:
            "Caixa — custos e despesas operacionais pagos, líquidos de descontos e sem juros/multa",
        },
      ]
    : [];
  async function excel() {
    if (!snapshot || !valido) return;
    const s = snapshot,
      filtros = filtrosExportacao;
    const selecionados = s.dados.pagamentos.filter(
      (p) =>
        visao === "total" || !ciclo || (p.cicloId ?? "__sem_ciclo__") === ciclo,
    );
    const itens = selecionados.filter((p) => !grupo || p.grupo === grupo);
    try {
      const XLSX = await import("xlsx");
      if (atual.current !== s.chave) return;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Custos Totais — caixa operacional"],
          ["Cliente", s.cliente],
          ...filtros.map((f) => [f.rotulo, f.valor]),
          [],
          ["Categoria", "Desembolso operacional (R$)"],
          ...resumirCustosCaixa(selecionados, "grupo").map((c) => [
            categoriaCaixa(c.id),
            c.valor,
          ]),
          ["Total", totalCustosCaixa(selecionados)],
          [],
          ["Ciclo", "Desembolso operacional (R$)"],
          ...resumirCustosCaixa(selecionados, "cicloId").map((c) => [
            nomeCicloCaixa(c.id, s.ref),
            c.valor,
          ]),
          [],
          [
            "Pagamentos a conferir — fora do total operacional",
            s.dados.pendencias.length,
          ],
          ["Pagamentos fora do escopo operacional", s.dados.excluidos.length],
        ]),
        "Resumo",
      );
      if (formato === "detalhado") {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(linhasPagamentosCaixa(itens, s.ref)),
          "Pagamentos",
        );
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet([
            ...s.dados.pendencias.map((p) => ({
              Situação: "A conferir — fora do total",
              Descrição: p.descricao,
              Motivo: p.motivo,
              "Valor pago conhecido (R$)": p.valor,
            })),
            ...s.dados.excluidos.map((p) => ({
              Situação: "Fora do escopo operacional",
              Descrição: p.descricao,
              Motivo: p.motivo,
              "Valor pago conhecido (R$)": p.valor,
            })),
          ]),
          "Conferência do período",
        );
      }
      XLSX.writeFile(
        wb,
        nomeRelatorio("Custos Totais", s.cliente, s.inicio, s.fim) + ".xlsx",
      );
    } catch {
      setErro("Não foi possível exportar o Excel. Tente novamente.");
    }
  }
  function imprimir() {
    if (!snapshot || !valido || !areaImpressao.current) return;
    abrirPreviewImpressao(
      "Custos Totais — caixa operacional",
      areaImpressao.current.innerHTML,
      {
        orientation: "landscape",
        fazenda: snapshot.cliente,
        filtros: filtrosExportacao,
        nomeArquivo: nomeRelatorio(
          "Custos Totais",
          snapshot.cliente,
          snapshot.inicio,
          snapshot.fim,
        ),
      },
    );
  }
  const input = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 7,
    color: "var(--text-1)",
    background: "var(--bg-card)",
  };
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-page)",
        color: "var(--text-1)",
      }}
    >
      <TopNav />
      <main
        style={{
          maxWidth: 1800,
          margin: "0 auto",
          padding: "24px clamp(12px,3vw,40px)",
        }}
      >
        <OperationalHeading>
          <div>
            <h1>Custos Totais</h1>
            <p>Quanto saiu do caixa para operar a fazenda e a empresa.</p>
          </div>
        </OperationalHeading>
        <OperationalFilters
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,210px),1fr))",
            gap: 12,
            padding: 16,
            marginBottom: 16,
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          <label>
            Fazenda
            <SelectField
              value={fazenda}
              onChange={(e) => setFazenda(e.target.value)}
              style={input}
            >
              <option value="">Todas as fazendas</option>
              {ref.fazendas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </SelectField>
          </label>
          <label>
            Preencher período pela safra
            <SelectField
              value={ano}
              onChange={(e) => selecionarSafra(e.target.value)}
              style={input}
            >
              <option value="">Período personalizado</option>
              {[
                ...new Set(
                  ref.anos
                    .filter((a) => a.data_inicio && a.data_fim)
                    .map((a) => a.descricao),
                ),
              ]
                .sort()
                .reverse()
                .map((a) => (
                  <option key={a}>{a}</option>
                ))}
            </SelectField>
          </label>
          <label>
            Baixa de
            <InputData
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value);
                setAno("");
              }}
              style={input}
            />
          </label>
          <label>
            Baixa até
            <InputData
              value={fim}
              onChange={(e) => {
                setFim(e.target.value);
                setAno("");
              }}
              style={input}
            />
          </label>
          <div style={{ alignSelf: "end" }}>
            <OperationalButton
              onClick={gerar}
              disabled={
                gerando ||
                referencias?.escopo !== escopo ||
                !ref.fazendas.length
              }
            >
              {gerando ? "Consultando pagamentos…" : "Gerar relatório"}
            </OperationalButton>
          </div>
        </OperationalFilters>
        <p style={{ fontSize: 13, color: "var(--text-2)", margin: "0 0 20px" }}>
          Período pela data da baixa. A safra apenas preenche as datas. Inclui
          os pagamentos operacionais sem ciclo. Depreciação, investimentos,
          principal de empréstimos e despesas financeiras ficam fora.
        </p>
        {erro && (
          <p
            role="alert"
            style={{
              padding: 14,
              border: "1px solid rgb(201, 103, 103)",
              borderRadius: 8,
            }}
          >
            {erro}
          </p>
        )}
        {snapshot && !valido && (
          <p role="status">
            Os filtros mudaram. Gere novamente para consultar e exportar os
            valores deste período.
          </p>
        )}
        {valido && snapshot && (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 18,
              }}
            >
              <div
                role="group"
                aria-label="Visualização dos custos"
                style={{ display: "flex", gap: 8 }}
              >
                {(
                  [
                    ["total", "Total geral"],
                    ["ciclos", "Por ciclo"],
                  ] as const
                ).map(([v, titulo]) => (
                  <OperationalButton
                    key={v}
                    aria-pressed={visao === v}
                    onClick={() => {
                      setVisao(v);
                      setCiclo("");
                      setGrupo("");
                      setPagina(0);
                    }}
                    style={{
                      border: `1px solid ${visao === v ? "var(--accent, rgb(34, 120, 107))" : "var(--border)"}`,
                      background:
                        visao === v
                          ? "var(--accent, rgb(34, 120, 107))"
                          : "var(--bg-card)",
                      color: visao === v ? "white" : "var(--text-1)",
                    }}
                  >
                    {titulo}
                  </OperationalButton>
                ))}
              </div>
              <span style={{ fontSize: 13 }}>
                {exibirData(snapshot.inicio)} a {exibirData(snapshot.fim)} ·{" "}
                {snapshot.fazenda}
              </span>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "end",
                  gap: 8,
                }}
              >
                <label>
                  Formato do relatório
                  <SelectField
                    value={formato}
                    onChange={(e) =>
                      setFormato(e.target.value as "sintetico" | "detalhado")
                    }
                    style={input}
                  >
                    <option value="sintetico">
                      Sintético — somente resumo
                    </option>
                    <option value="detalhado">
                      Detalhado — com pagamentos
                    </option>
                  </SelectField>
                </label>
                <OperationalButton onClick={imprimir}>
                  PDF / Imprimir
                </OperationalButton>
                <OperationalButton onClick={excel}>Excel</OperationalButton>
              </div>
            </div>
            <PainelCustosCaixa
              dados={snapshot.dados}
              referencias={snapshot.ref}
              visao={visao}
              ciclo={ciclo}
              grupo={grupo}
              pagina={pagina}
              selecionarCiclo={(id) => {
                setCiclo(id);
                setGrupo("");
                setPagina(0);
              }}
              selecionarGrupo={(id) => {
                setGrupo(id);
                setPagina(0);
              }}
              mudarPagina={setPagina}
            />
            <div style={{ display: "none" }} aria-hidden="true">
              <div ref={areaImpressao}>
                <PainelCustosCaixa
                  dados={snapshot.dados}
                  referencias={snapshot.ref}
                  visao={visao}
                  ciclo={ciclo}
                  grupo={grupo}
                  formato={formato}
                  impressao
                />
              </div>
            </div>
          </>
        )}
        {!snapshot && !gerando && !erro && (
          <p>Escolha o período dos pagamentos e clique em Gerar relatório.</p>
        )}
      </main>
    </div>
  );
}
