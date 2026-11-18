"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import TopNav from "./TopNav";
import SelectField from "./SelectField";
import {
  OperationalButton,
  OperationalFilters,
  OperationalGrid,
  OperationalHeading,
} from "./OperationalUI";
import { supabase } from "../lib/supabase";
import { abrirPreviewImpressao, nomeRelatorio } from "../lib/print";
import {
  carregarReferenciasResultados,
  carregarResultadoAgricola,
  type BaseReceita,
  type ReferenciasResultado,
  type ResultadoAgricola,
} from "../lib/resultados/carregar";
import {
  GRUPOS_RESULTADO,
  totaisResultado,
  type ItemResultado,
} from "../lib/resultados/apuracao";
import {
  TabelaResultados,
  linhasVisiveis,
  type ColunaResultado,
  type ModoResultado,
  type UnidadeResultado,
} from "./resultados/TabelaResultados";

const FONTES: Record<string, string> = {
  lancamentos: "CP/CR do produtor",
  empresa_lancamentos: "CP/CR da empresa",
  folha_funcionarios: "Folha de pagamento",
  plantios: "Plantio",
  pulverizacoes: "Pulverização",
  adubacoes_base: "Adubação",
  correcoes_solo: "Correção do solo",
  movimentacoes_estoque: "Consumo de estoque",
  abastecimentos: "Abastecimento",
  historico_manutencao: "Manutenção",
  contratos: "Contrato de venda",
  arrendamento_pagamentos: "Arrendamento",
  apoio_lancamentos: "Apoio financeiro",
  estimativa: "Estimativa do orçamento",
};
const fonteRelatorio = (fonte: string) => FONTES[fonte] ?? fonte;
const DINHEIRO = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const TITULOS: Record<ModoResultado, string> = {
  dre: "DRE por Safra e Ciclo",
  margens: "Margens por Safra",
  custoha: "Custo por Hectare",
  custostotais: "Custos Totais",
  produtividade: "Produtividade",
};
const RECEITAS: Record<BaseReceita, string> = {
  financeiro: "Títulos reais do CR",
  contratada: "Contratos de venda confirmados",
  estimada: "Estimativa: colheita × preço do orçamento",
};
const SEM_CICLO = "__sem_ciclo__";
const REF_VAZIA: ReferenciasResultado = { fazendas: [], anos: [], ciclos: [] };
export default function RelatorioResultados({
  modo = "dre",
}: {
  modo?: ModoResultado;
}) {
  const { fazendaId, fazendaIds, contaId, contaNome } = useAuth();
  const escopo = JSON.stringify([
    contaId,
    [...(fazendaIds.length ? fazendaIds : fazendaId ? [fazendaId] : [])].sort(),
  ]);
  const [ref, setRef] = useState<ReferenciasResultado>(REF_VAZIA);
  const [metaEscopo, setMetaEscopo] = useState("");
  const [erro, setErro] = useState("");
  const [carregandoRef, setCarregandoRef] = useState(false);
  const [fazenda, setFazenda] = useState("");
  const [ano, setAno] = useState("");
  const [selecionados, setSelecionados] = useState<string[] | null>(null);
  const [receita, setReceita] = useState<BaseReceita>("financeiro");
  const [visao, setVisao] = useState<"colunas" | "consolidado" | "individual">(
    "colunas",
  );
  const [unidade, setUnidade] = useState<UnidadeResultado>(
    modo === "custoha" ? "ha" : "total",
  );
  const [ocultarZeradas, setOcultarZeradas] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    chave: string;
    cliente: string;
    safra: string;
    receita: string;
    fazendas: string;
    dados: ResultadoAgricola;
    ids: string[];
  } | null>(null);
  const [detalhe, setDetalhe] = useState<{
    titulo: string;
    itens: ItemResultado[];
  } | null>(null);
  const req = useRef(0),
    conteudo = useRef<HTMLDivElement>(null);
  const chaveAtualRef = useRef("");
  const referenciasAtuais = metaEscopo === escopo;
  const anos = [...new Set(ref.anos.map((a) => a.descricao))].sort().reverse();
  const anoEfetivo = anos.includes(ano) ? ano : (anos[0] ?? "");
  const anoIds = ref.anos
    .filter((a) => a.descricao === anoEfetivo)
    .map((a) => a.id);
  const ciclosDisponiveis = ref.ciclos.filter(
    (c) =>
      !c.is_auxiliar &&
      anoIds.includes(c.ano_safra_id) &&
      (!fazenda || c.fazenda_id === fazenda),
  );
  const ids = ciclosDisponiveis
    .filter((c) => selecionados === null || selecionados.includes(c.id))
    .map((c) => c.id);
  const chave = JSON.stringify([
    escopo,
    fazenda,
    anoEfetivo,
    receita,
    [...ids].sort(),
  ]);
  useEffect(() => {
    chaveAtualRef.current = chave;
  }, [chave]);
  useEffect(() => {
    let ativo = true;
    const requisicoes = req;
    const [conta, fids] = JSON.parse(escopo) as [string | null, string[]];
    setGerando(false);
    setCarregandoRef(true);
    setErro("");
    setSnapshot(null);
    setDetalhe(null);
    setSelecionados(null);
    setFazenda("");
    setAno("");
    carregarReferenciasResultados(supabase, fids, conta)
      .then((r) => {
        if (ativo) {
          setRef(r);
          setMetaEscopo(escopo);
        }
      })
      .catch((e) => {
        if (ativo) setErro(e.message);
      })
      .finally(() => {
        if (ativo) setCarregandoRef(false);
      });
    return () => {
      ativo = false;
      // A requisição pertence ao contexto desmontado.
      requisicoes.current++;
    };
  }, [escopo]);
  useEffect(() => {
    setUnidade(modo === "custoha" ? "ha" : "total");
    setDetalhe(null);
  }, [modo]);
  useEffect(() => {
    if (!detalhe) return;
    const anterior = document.activeElement as HTMLElement | null;
    const fechar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetalhe(null);
    };
    document.addEventListener("keydown", fechar);
    return () => {
      document.removeEventListener("keydown", fechar);
      anterior?.focus();
    };
  }, [detalhe]);
  const desatualizado = !!snapshot && snapshot.chave !== chave;
  async function gerar() {
    if (!ids.length || !referenciasAtuais) return;
    const atual = ++req.current;
    setGerando(true);
    setErro("");
    setDetalhe(null);
    setSnapshot(null);
    const capturada = chave;
    try {
      const dados = await carregarResultadoAgricola(supabase, {
        referencias: ref,
        fazendaIds: fazenda ? [fazenda] : ref.fazendas.map((f) => f.id),
        contaId,
        anoLabel: anoEfetivo,
        receita,
      });
      if (atual !== req.current || capturada !== chaveAtualRef.current) return;
      setSnapshot({
        chave: capturada,
        cliente: contaNome || "",
        safra: anoEfetivo,
        receita: RECEITAS[receita],
        fazendas: fazenda
          ? (ref.fazendas.find((f) => f.id === fazenda)?.nome ?? "")
          : "Todas as fazendas",
        dados,
        ids,
      });
    } catch (e) {
      if (atual === req.current)
        setErro(
          e instanceof Error
            ? e.message
            : "Não foi possível gerar o relatório.",
        );
    } finally {
      if (atual === req.current) setGerando(false);
    }
  }
  const colunas = useMemo((): ColunaResultado[] => {
    if (!snapshot || desatualizado) return [];
    const { dados } = snapshot;
    const fazendasVisiveis = fazenda
      ? [fazenda]
      : ref.fazendas.map((f) => f.id);
    const itens = dados.itens.filter((i) =>
      i.ciclo_id
        ? snapshot.ids.includes(i.ciclo_id)
        : fazendasVisiveis.includes(i.fazenda_id),
    );
    const ciclos = dados.ciclos.filter((c) => snapshot.ids.includes(c.id));
    const cols: ColunaResultado[] = ciclos.map((c) => ({
      id: c.id,
      nome: c.descricao || c.cultura || "Ciclo",
      fazenda:
        ref.fazendas.find((f) => f.id === c.fazenda_id)?.nome ?? "Fazenda",
      itens: itens.filter((i) => i.ciclo_id === c.id),
      ...dados.producao[c.id],
    }));
    const pendentes = itens.filter((i) => !i.ciclo_id);
    if (pendentes.length)
      cols.push({
        id: SEM_CICLO,
        nome: "Sem ciclo / rateio pendente",
        fazenda: snapshot.fazendas,
        itens: pendentes,
        area: 0,
        sacas: 0,
        areaColhida: 0,
        precoOrcado: null,
        produtividadeOrcada: null,
      });
    cols.push({
      id: "__total__",
      nome: "Total consolidado",
      fazenda: snapshot.fazendas,
      itens,
      area: cols.reduce((s, c) => s + c.area, 0),
      sacas: cols.reduce((s, c) => s + c.sacas, 0),
      areaColhida: cols.reduce((s, c) => s + c.areaColhida, 0),
      precoOrcado: null,
      produtividadeOrcada: null,
    });
    return cols;
  }, [snapshot, desatualizado, fazenda, ref]);
  const total = colunas.at(-1),
    totais = total ? totaisResultado(total.itens) : null;
  const filtrosPrint = snapshot
    ? [
        { rotulo: "Safra", valor: snapshot.safra },
        { rotulo: "Fazendas", valor: snapshot.fazendas },
        { rotulo: "Receita", valor: snapshot.receita },
        {
          rotulo: "Apuração",
          valor: "Competência gerencial; previsões separadas",
        },
        { rotulo: "Unidade", valor: unidade },
      ]
    : [];
  function imprimir() {
    if (!snapshot || desatualizado || !conteudo.current) return;
    abrirPreviewImpressao(TITULOS[modo], conteudo.current.innerHTML, {
      orientation: "landscape",
      fazenda: snapshot.cliente,
      filtros: filtrosPrint,
      nomeArquivo: nomeRelatorio(
        TITULOS[modo],
        snapshot.cliente,
        snapshot.dados.inicio,
        snapshot.dados.fim,
      ),
    });
  }
  async function excel() {
    if (!snapshot || desatualizado) return;
    const XLSX = await import("xlsx");
    const linhas = linhasVisiveis(modo, colunas, unidade, ocultarZeradas);
    const cabecalho = [
      "Demonstrativo",
      ...colunas.map((c) => `${c.fazenda} · ${c.nome}`),
    ];
    const dados = linhas.map((l) => [
      l.label,
      ...colunas.map((c) => l.valor(c, unidade)),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ...[
          ["Cliente", snapshot.cliente],
          ...filtrosPrint.map((f) => [f.rotulo, f.valor]),
        ],
        [],
        cabecalho,
        ...dados,
      ]),
      "Resultados",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        total?.itens.map((i) => ({
          origem: fonteRelatorio(i.fonte),
          registro: i.origem_id,
          descricao:
            i.descricao === i.fonte ? fonteRelatorio(i.fonte) : i.descricao,
          fazenda:
            ref.fazendas.find((f) => f.id === i.fazenda_id)?.nome ??
            i.fazenda_id,
          ciclo:
            ref.ciclos.find((c) => c.id === i.ciclo_id)?.descricao ??
            "Sem ciclo",
          grupo: i.grupo,
          valor_brl: i.valor,
          previsao: i.previsto ? "Sim" : "Não",
          rateio: i.rateio ?? "Direto",
        })) ?? [],
      ),
      "Composição",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        snapshot.dados.avisos.map((a) => ({
          descricao: a.descricao,
          origem: a.fonte ? fonteRelatorio(a.fonte) : "",
          registro: a.id,
          valor: a.valor,
        })),
      ),
      "Pendências",
    );
    XLSX.writeFile(
      wb,
      nomeRelatorio(
        TITULOS[modo],
        snapshot.cliente,
        snapshot.dados.inicio,
        snapshot.dados.fim,
      ) + ".xlsx",
    );
  }
  const inp = {
    padding: "8px 10px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    width: "100%",
    background: "var(--bg-card)",
    color: "var(--text-1)",
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
          padding: "24px clamp(12px, 3vw, 40px)",
          maxWidth: 1800,
          margin: "0 auto",
        }}
      >
        <OperationalHeading>
          <div>
            <h1>{TITULOS[modo]}</h1>
            <p>
              Compare os ciclos das fazendas e confira a composição de cada
              valor.
            </p>
          </div>
        </OperationalHeading>
        <OperationalFilters
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
            gap: 12,
            padding: 16,
            border: "1px solid var(--border)",
            borderRadius: 10,
            background: "var(--bg-card)",
          }}
        >
          <label>
            Fazenda
            <SelectField
              style={inp}
              value={fazenda}
              onChange={(e) => {
                setFazenda(e.target.value);
                setSelecionados(null);
              }}
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
            Ano safra
            <SelectField
              style={inp}
              value={anoEfetivo}
              onChange={(e) => {
                setAno(e.target.value);
                setSelecionados(null);
              }}
            >
              <option value="" disabled>
                Selecione
              </option>
              {anos.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </SelectField>
          </label>
          <label>
            Base da receita
            <SelectField
              style={inp}
              value={receita}
              onChange={(e) => setReceita(e.target.value as BaseReceita)}
            >
              {Object.entries(RECEITAS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </SelectField>
          </label>
          <OperationalButton
            onClick={gerar}
            disabled={
              gerando || carregandoRef || !referenciasAtuais || !ids.length
            }
            style={{ alignSelf: "end" }}
          >
            {gerando
              ? "Apurando…"
              : carregandoRef
                ? "Carregando filtros…"
                : "Gerar relatório"}
          </OperationalButton>
          <fieldset
            style={{
              gridColumn: "1/-1",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: 10,
            }}
          >
            <legend>Ciclos ({ids.length} selecionados)</legend>
            <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
              <button onClick={() => setSelecionados(null)}>Todos</button>
              <button onClick={() => setSelecionados([])}>Nenhum</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
              {ciclosDisponiveis.map((c) => (
                <label
                  key={c.id}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <input
                    type="checkbox"
                    checked={ids.includes(c.id)}
                    onChange={(e) =>
                      setSelecionados(
                        e.target.checked
                          ? [...ids, c.id]
                          : ids.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {ref.fazendas.find((f) => f.id === c.fazenda_id)?.nome} ·{" "}
                  {c.descricao || c.cultura}
                </label>
              ))}
              {!ciclosDisponiveis.length && (
                <span>Nenhum ciclo cadastrado para este filtro.</span>
              )}
            </div>
          </fieldset>
        </OperationalFilters>
        {erro && (
          <p role="alert" style={{ color: "#b42318" }}>
            {erro} O relatório não foi gerado com dados parciais.
          </p>
        )}
        {desatualizado && (
          <p
            role="status"
            style={{ padding: 12, background: "#fff3cd", color: "#754c00" }}
          >
            Os filtros foram alterados. Gere novamente para atualizar os valores
            e liberar as exportações.
          </p>
        )}
        {snapshot && !desatualizado && total && totais && (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "end",
                margin: "20px 0",
              }}
            >
              <label>
                Visualização
                <SelectField
                  style={inp}
                  value={visao}
                  onChange={(e) => setVisao(e.target.value as typeof visao)}
                >
                  <option value="colunas">Ciclos em colunas</option>
                  <option value="consolidado">Consolidado</option>
                  <option value="individual">Uma DRE por ciclo</option>
                </SelectField>
              </label>
              <label>
                Valores
                <SelectField
                  style={inp}
                  value={unidade}
                  onChange={(e) =>
                    setUnidade(e.target.value as UnidadeResultado)
                  }
                >
                  <option value="total">R$ total</option>
                  <option value="ha">R$ por hectare</option>
                  <option value="sc">R$ por saca</option>
                  <option value="percentual">% da receita</option>
                </SelectField>
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  alignSelf: "center",
                }}
              >
                <input
                  type="checkbox"
                  checked={ocultarZeradas}
                  onChange={(e) => setOcultarZeradas(e.target.checked)}
                />
                Ocultar linhas zeradas
              </label>
              <OperationalButton onClick={imprimir}>
                Imprimir / PDF
              </OperationalButton>
              <OperationalButton onClick={excel}>Excel</OperationalButton>
            </div>
            <div ref={conteudo}>
              <p>
                <b>
                  {snapshot.safra} · {snapshot.fazendas}
                </b>{" "}
                · Receita: {snapshot.receita}
              </p>
              <p style={{ fontSize: 13 }}>
                Apuração por competência gerencial. Compras de estoque entram
                pelo consumo; folha fechada pelo bruto, complemento e encargos.
                Previsões ficam separadas. Tributos são os lançados e
                classificados; não há estimativa automática de alíquotas.
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 20,
                  marginBottom: 16,
                }}
              >
                <strong>Receita {DINHEIRO(totais.receitas)}</strong>
                <strong>Custo {DINHEIRO(totais.custo)}</strong>
                <strong
                  style={{
                    color: totais.resultado < 0 ? "#b42318" : "#087443",
                  }}
                >
                  Resultado {DINHEIRO(totais.resultado)}
                </strong>
                <span>Previsões {DINHEIRO(totais.previsto)}</span>
              </div>
              {visao === "individual" ? (
                colunas
                  .filter((c) => c.id !== "__total__")
                  .map((c) => (
                    <section key={c.id} style={{ marginBottom: 24 }}>
                      <h2>
                        {c.fazenda} · {c.nome}
                      </h2>
                      <TabelaResultados
                        colunas={[c]}
                        modo={modo}
                        unidade={unidade}
                        ocultarZeradas={ocultarZeradas}
                        onDetalhe={(titulo, itens) =>
                          setDetalhe({ titulo, itens })
                        }
                      />
                    </section>
                  ))
              ) : (
                <TabelaResultados
                  colunas={visao === "consolidado" ? [total] : colunas}
                  modo={modo}
                  unidade={unidade}
                  ocultarZeradas={ocultarZeradas}
                  onDetalhe={(titulo, itens) => setDetalhe({ titulo, itens })}
                />
              )}
              <p style={{ fontSize: 12 }}>
                “—” indica base ausente para o indicador. O total por hectare,
                saca e percentual é recalculado com as bases consolidadas.
                Custos sem ciclo permanecem no total, sem serem atribuídos
                artificialmente aos ciclos. Receitas financeiras e não
                operacionais não compõem o EBITDA.
              </p>
              <details open={snapshot.dados.avisos.length > 0}>
                <summary>
                  Pendências do ano safra no cliente (
                  {snapshot.dados.avisos.length})
                </summary>
                {!snapshot.dados.avisos.length ? (
                  <p>Nenhuma pendência identificada nas fontes consultadas.</p>
                ) : (
                  <>
                    <p>
                      Existem dados que exigem conferência. Valores sem custo ou
                      cotação histórica não foram estimados; o resultado pode
                      estar incompleto.
                    </p>
                    <ul>
                      {snapshot.dados.avisos.map((a, i) => (
                        <li key={i}>
                          {a.descricao}
                          {a.valor !== undefined
                            ? ` · ${DINHEIRO(a.valor)}`
                            : ""}
                          {a.fonte && ` · ${fonteRelatorio(a.fonte)}`}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </details>
            </div>
            <p style={{ fontSize: 12 }}>
              Clique no valor de uma linha para conferir os registros que o
              compõem.
            </p>
          </>
        )}
        {detalhe && !desatualizado && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={detalhe.titulo}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10000,
              background: "#0008",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
            onClick={() => setDetalhe(null)}
          >
            <section
              style={{
                background: "var(--bg-card)",
                borderRadius: 12,
                padding: 20,
                width: "min(1200px,100%)",
                maxHeight: "85vh",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <h2>{detalhe.titulo}</h2>
                <OperationalButton onClick={() => setDetalhe(null)}>
                  Fechar
                </OperationalButton>
              </div>
              <p>
                Composição em R$. Despesas são subtraídas no demonstrativo;
                descontos são acrescentados.
              </p>
              <OperationalGrid>
                <thead>
                  <tr>
                    {["Origem", "Descrição", "Grupo", "Rateio", "Valor"].map(
                      (l) => (
                        <th key={l}>{l}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {detalhe.itens.map((i, n) => (
                    <tr key={`${i.id}:${n}`}>
                      <td title={i.origem_id}>{fonteRelatorio(i.fonte)}</td>
                      <td>
                        {i.descricao === i.fonte
                          ? fonteRelatorio(i.fonte)
                          : i.descricao}
                      </td>
                      <td>
                        {GRUPOS_RESULTADO.find(([g]) => g === i.grupo)?.[1] ??
                          i.grupo}
                      </td>
                      <td>{i.rateio ?? "Direto"}</td>
                      <td style={{ textAlign: "right" }}>
                        {DINHEIRO(i.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </OperationalGrid>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
