"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import TopNav from "../../../../components/TopNav";
import {
  funcionarios,
  dadosIniciais,
  titulosDoMes,
  salario,
  pendencias,
  rotulos,
  chave,
  proximoMes,
  centavos,
  type Tipo,
  type Movimento,
  type Situacao,
  type Funcionario,
  type Titulo,
} from "./modelo";
import s from "./proposta.module.css";

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mes = (c: string) =>
  new Date(`${c}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
const data = (d: string) => d.split("-").reverse().join("/");
const abas = [
  "Competência",
  "Movimentos",
  "Conferência",
  "Pagamentos",
  "Histórico",
  "13º salário",
] as const;
const abasMovimento = Object.entries(rotulos).filter(
  ([tipo]) => !["ajuste_salario", "diferenca"].includes(tipo),
) as [Tipo, string][];
type Aba = (typeof abas)[number];
type Historico = {
  id: string;
  comp: string;
  funcionario?: string;
  acao: string;
  detalhe: string;
};
type Modal =
  "movimento" | "reprocessar" | "replicar" | "fechar" | "reabrir" | null;

function Janela({
  titulo,
  children,
  fechar,
  lateral = false,
  ampla = false,
}: {
  titulo: string;
  children: ReactNode;
  fechar: () => void;
  lateral?: boolean;
  ampla?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={lateral ? s.drawer : `${s.modal} ${ampla ? s.wideModal : ""}`}
      aria-labelledby="titulo-previa"
      onCancel={fechar}
    >
      <header className={s.dialogHeading}>
        <div>
          <small>PRÉVIA DA ROTINA</small>
          <h2 id="titulo-previa">{titulo}</h2>
        </div>
        <button onClick={fechar} aria-label="Fechar painel">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export default function PropostaFolha() {
  const [comp, setComp] = useState("2026-11");
  const [competencias, setCompetencias] = useState([
    "2026-10",
    "2026-11",
    "2026-12",
  ]);
  const [empregador, setEmpregador] = useState("");
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("Competência");
  const [movimentos, setMovimentos] = useState<Movimento[]>(dadosIniciais);
  const [situacoes, setSituacoes] = useState<Record<string, Situacao>>({});
  const [pagamentos, setPagamentos] = useState<Record<string, number>>({
    "adi-ana": 300,
    "adi-pedro": 600,
  });
  const [revisados, setRevisados] = useState<string[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([
    {
      id: "inicio",
      comp: "2026-11",
      acao: "Cenário preparado",
      detalhe:
        "Gratificação de Ana com R$ 300 adiantados e adiantamento salarial de Pedro.",
    },
  ]);
  const [modal, setModal] = useState<Modal>(null);
  const [pessoa, setPessoa] = useState<Funcionario | null>(null);
  const [toast, setToast] = useState("");
  const [erro, setErro] = useState("");
  const [tipo, setTipo] = useState<Tipo>("gratificacao");
  const [funcId, setFuncId] = useState("ana");
  const [valor, setValor] = useState("1000");
  const [descricao, setDescricao] = useState("");
  const [vencimento, setVencimento] = useState("2026-12-05");
  const [jaPago, setJaPago] = useState(true);
  const [novaComp, setNovaComp] = useState("2027-01");
  const [copiarVariaveis, setCopiarVariaveis] = useState(false);
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [detalhe, setDetalhe] = useState<
    "extrato" | "composicao" | "historico"
  >("extrato");
  const sequencia = useRef(0);
  const novoId = () => `previa-${++sequencia.current}`;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(t);
  }, [toast]);

  const empregadores = [...new Set(funcionarios.map((f) => f.empregador))];
  const filtrados = funcionarios.filter(
    (f) =>
      (!empregador || f.empregador === empregador) &&
      `${f.nome} ${f.cargo}`
        .toLocaleLowerCase("pt-BR")
        .includes(busca.toLocaleLowerCase("pt-BR")),
  );
  const titulos = titulosDoMes(comp, movimentos, situacoes, pagamentos);
  const ids = new Set(filtrados.map((f) => f.id));
  const titulosVisiveis = titulos.filter((t) =>
    t.funcionario
      ? ids.has(t.funcionario)
      : !busca && (!empregador || t.empregador === empregador),
  );
  const movimentosVisiveis = movimentos.filter(
    (m) => m.competencia === comp && ids.has(m.funcionario),
  );
  const total = titulosVisiveis.reduce((v, t) => v + t.valor, 0);
  const totalPago = titulosVisiveis.reduce((v, t) => v + t.pago, 0);
  const comPendencia = filtrados.filter(
    (f) => pendencias(f, movimentos, comp, revisados).length,
  );
  const grupos = empregadores.filter((e) => !empregador || e === empregador);
  const todasFechadas = grupos.every(
    (e) => situacoes[chave(comp, e)] === "fechada",
  );
  const estado = (e: string) => situacoes[chave(comp, e)] ?? "preparacao";
  const nomeEstado = (v: Situacao) =>
    ({
      preparacao: "Em preparação",
      conferida: "Conferida",
      fechada: "Fechada",
    })[v];
  const saldo = (t: Titulo) => Math.max(0, centavos(t.valor - t.pago));
  const registrar = (
    acao: string,
    detalhe: string,
    funcionario?: string,
    competencia = comp,
  ) =>
    setHistorico((h) => [
      { id: novoId(), comp: competencia, funcionario, acao, detalhe },
      ...h,
    ]);
  const abrirModal = (m: Modal) => {
    setErro("");
    setModal(m);
  };
  const abrirMovimento = (f?: Funcionario, t: Tipo = "gratificacao") => {
    setFuncId(f?.id ?? filtrados[0]?.id ?? "ana");
    setTipo(t);
    setJaPago(true);
    setValor("1000");
    setDescricao("");
    setVencimento(`${proximoMes(comp)}-05`);
    abrirModal("movimento");
  };
  const conferir = (f: Funcionario) => {
    const novos = [...new Set([...revisados, `${comp}:${f.id}`])];
    setRevisados(novos);
    if (
      estado(f.empregador) !== "fechada" &&
      funcionarios
        .filter((x) => x.empregador === f.empregador)
        .every((x) => novos.includes(`${comp}:${x.id}`))
    )
      setSituacoes((st) => ({
        ...st,
        [chave(comp, f.empregador)]: "conferida",
      }));
    registrar(
      "Funcionário conferido",
      "Composição e vínculos financeiros revisados na demonstração.",
      f.id,
    );
  };
  const invalidarConferencia = (fid: string) => {
    setRevisados((r) => r.filter((x) => x !== `${comp}:${fid}`));
    const f = funcionarios.find((f) => f.id === fid)!;
    if (estado(f.empregador) === "conferida")
      setSituacoes((st) => ({
        ...st,
        [chave(comp, f.empregador)]: "preparacao",
      }));
  };

  function adicionar(e: FormEvent) {
    e.preventDefault();
    const f = funcionarios.find((f) => f.id === funcId)!;
    const v = Number(valor);
    if (!(v > 0) || !vencimento)
      return setErro("Informe um valor positivo e o vencimento.");
    if (["decimo1", "decimo2"].includes(tipo)) {
      if (
        movimentos.some(
          (m) =>
            m.funcionario === f.id &&
            m.competencia.slice(0, 4) === comp.slice(0, 4) &&
            m.tipo === tipo,
        )
      )
        return setErro(
          "Esta parcela do 13º já foi lançada neste ano da demonstração.",
        );
      if (
        tipo === "decimo2" &&
        !movimentos.some(
          (m) =>
            m.funcionario === f.id &&
            m.competencia.slice(0, 4) === comp.slice(0, 4) &&
            m.tipo === "decimo1",
        )
      )
        return setErro(
          "Lance a primeira parcela antes da segunda na demonstração.",
        );
    }
    const ts = titulos.filter((t) => t.funcionario === f.id);
    const afetaSalario = [
      "horas_extras",
      "beneficio",
      "desconto",
      "adiantamento_salario",
    ].includes(tipo);
    if (afetaSalario && estado(f.empregador) === "fechada")
      return setErro(
        "Esta folha está fechada. Use Reprocessar para visualizar o ajuste antes de confirmar.",
      );
    if (afetaSalario && ts.some((t) => t.grupo === "salario" && t.pago > 0))
      return setErro(
        "O salário já tem pagamento. Use Reprocessar para simular uma diferença separada.",
      );
    if (tipo === "adiantamento_gratificacao") {
      const ms = movimentos.filter(
        (m) => m.funcionario === f.id && m.competencia === comp,
      );
      const disponivel = ms.reduce(
        (n, m) =>
          n +
          (m.tipo === "gratificacao"
            ? m.valor
            : m.tipo === "adiantamento_gratificacao"
              ? -m.valor
              : 0),
        0,
      );
      if (v > disponivel)
        return setErro(
          `Gratificação disponível para adiantamento: ${dinheiro(disponivel)}.`,
        );
      if (ts.some((t) => t.grupo === "gratificacao" && t.pago > 0))
        return setErro(
          "A gratificação já tem pagamento. Estorne a simulação do pagamento antes de alterar os adiantamentos.",
        );
    }
    const id = novoId();
    setMovimentos((ms) => [
      ...ms,
      {
        id,
        funcionario: f.id,
        competencia: comp,
        tipo,
        descricao: descricao.trim() || rotulos[tipo],
        valor: v,
        data: vencimento,
      },
    ]);
    if (tipo.startsWith("adiantamento") && jaPago)
      setPagamentos((p) => ({ ...p, [id]: v }));
    invalidarConferencia(f.id);
    registrar("Movimento incluído", `${rotulos[tipo]} · ${dinheiro(v)}`, f.id);
    setModal(null);
    setToast(
      "Movimento simulado. Confira o extrato e os títulos em Pagamentos.",
    );
  }
  function excluirMovimento(m: Movimento) {
    const f = funcionarios.find((f) => f.id === m.funcionario)!;
    const relacionado = titulos.filter((t) => t.funcionario === f.id);
    if (
      estado(f.empregador) === "fechada" ||
      relacionado.some(
        (t) =>
          t.pago > 0 &&
          (t.id === m.id ||
            (t.grupo === "salario" &&
              [
                "adiantamento_salario",
                "horas_extras",
                "desconto",
                "beneficio",
              ].includes(m.tipo)) ||
            (t.grupo === "gratificacao" &&
              m.tipo === "adiantamento_gratificacao")),
      )
    )
      return setToast(
        "Movimento protegido: reabra a folha ou estorne o pagamento simulado antes de excluir.",
      );
    if (
      m.tipo === "gratificacao" &&
      movimentos.some(
        (x) =>
          x.funcionario === m.funcionario &&
          x.competencia === comp &&
          x.tipo === "adiantamento_gratificacao",
      )
    )
      return setToast(
        "Estorne e exclua os adiantamentos de gratificação antes de excluir a gratificação.",
      );
    setMovimentos((ms) => ms.filter((x) => x.id !== m.id));
    invalidarConferencia(m.funcionario);
    registrar("Movimento excluído", m.descricao, m.funcionario);
  }
  function pagar(t: Titulo, parcial = false) {
    if (t.previsao)
      return setToast(
        "Feche a competência para transformar a previsão em título real na demonstração.",
      );
    if (!saldo(t)) return;
    const valorPago = centavos(t.pago + (parcial ? saldo(t) / 2 : saldo(t)));
    setPagamentos((p) => ({ ...p, [t.id]: valorPago }));
    registrar(
      parcial ? "Pagamento parcial simulado" : "Pagamento simulado",
      `${t.descricao} · ${dinheiro(valorPago - t.pago)}`,
      t.funcionario || undefined,
    );
  }
  const fAjuste = funcionarios.find((f) => f.id === funcId)!;
  const antesAjuste = centavos(
    salario(fAjuste, movimentos, comp) +
      movimentos
        .filter((m) => m.funcionario === funcId && m.reprocessamentoDe === comp)
        .reduce(
          (v, m) =>
            v +
            (m.tipo === "diferenca"
              ? m.valor
              : m.tipo === "desconto" && m.competencia !== comp
                ? -m.valor
                : 0),
          0,
        ),
  );
  const diferenca = centavos(Number(valor) - antesAjuste);
  const salarioPago = (pagamentos[`${comp}:${funcId}:salario`] ?? 0) > 0;
  function reprocessar(e: FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(Number(valor)) || Number(valor) < 0 || !diferenca)
      return setErro("Informe um novo líquido diferente do atual.");
    const id = novoId();
    const destino = salarioPago && diferenca < 0 ? proximoMes(comp) : comp;
    const t: Tipo = salarioPago
      ? diferenca > 0
        ? "diferenca"
        : "desconto"
      : "ajuste_salario";
    setMovimentos((ms) => [
      ...ms,
      {
        id,
        funcionario: funcId,
        competencia: destino,
        tipo: t,
        reprocessamentoDe: comp,
        valor: t === "ajuste_salario" ? diferenca : Math.abs(diferenca),
        descricao: `Reprocessamento de ${mes(comp)}`,
        data: `${proximoMes(destino)}-05`,
      },
    ]);
    setCompetencias((cs) => [...new Set([...cs, destino])].sort());
    invalidarConferencia(funcId);
    registrar(
      "Reprocessamento simulado",
      `${dinheiro(antesAjuste)} → ${dinheiro(Number(valor))}. ${salarioPago ? "Pagamento original preservado; diferença registrada separadamente." : "Título em aberto atualizado."}`,
      funcId,
    );
    setModal(null);
    setToast(
      destino !== comp
        ? `Desconto futuro simulado em ${mes(destino)}.`
        : "Ajuste simulado. Veja a composição e o histórico.",
    );
  }
  function replicar(e: FormEvent) {
    e.preventDefault();
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(novaComp) ||
      competencias.includes(novaComp)
    )
      return setErro("Escolha uma competência nova para a simulação.");
    if (copiarVariaveis)
      setMovimentos((ms) => [
        ...ms,
        ...movimentosVisiveis
          .filter((m) =>
            ["gratificacao", "horas_extras", "beneficio", "desconto"].includes(
              m.tipo,
            ),
          )
          .map((m) => ({
            ...m,
            id: novoId(),
            competencia: novaComp,
            data: `${proximoMes(novaComp)}-05`,
          })),
      ]);
    setCompetencias((cs) => [...cs, novaComp].sort());
    registrar(
      "Competência replicada",
      copiarVariaveis
        ? "Base recorrente e variáveis selecionadas. Adiantamentos e pagamentos não foram copiados."
        : "Base recorrente. Verbas eventuais, adiantamentos e pagamentos não foram copiados.",
      undefined,
      novaComp,
    );
    setComp(novaComp);
    setModal(null);
    setToast("Nova competência de demonstração em preparação.");
  }
  function exportar() {
    const linhas = [
      [
        "Competência",
        "Funcionário",
        "Empregador",
        "Documento",
        "Valor",
        "Pago",
        "Saldo",
        "Situação",
      ],
      ...titulosVisiveis.map((t) => [
        comp,
        t.nome,
        t.empregador,
        t.descricao,
        t.valor.toFixed(2),
        t.pago.toFixed(2),
        saldo(t).toFixed(2),
        t.previsao
          ? "Previsão"
          : saldo(t) === 0
            ? "Pago / compensado"
            : t.pago
              ? "Parcial"
              : "Aberto",
      ]),
    ];
    const csv =
      "\uFEFF" +
      linhas
        .map((l) => l.map((c) => `"${c.replaceAll('"', '""')}"`).join(";"))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `demonstracao-folha-${comp}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const financeiros = (ts: Titulo[]) =>
    ts.every((t) => saldo(t) === 0)
      ? "Pago / compensado"
      : ts.some((t) => t.pago)
        ? "Parcial"
        : "Em aberto";

  return (
    <>
      <TopNav />
      <main className={s.page}>
        <div className={s.demo}>
          <span>
            <strong>DEMONSTRAÇÃO INTERATIVA</strong> Dados fictícios. As ações
            ficam somente nesta tela e são descartadas ao atualizar a página.
          </span>
          <Link href="/financeiro/folha">Voltar à folha atual ↗</Link>
        </div>
        <header className={s.heading}>
          <div>
            <p>FINANCEIRO / PROPOSTA DE CONTROLE</p>
            <h1>Folha de pagamento</h1>
            <span>
              Da competência ao pagamento, com o funcionário no centro.
            </span>
          </div>
          <div className={s.actions}>
            <button onClick={exportar}>Exportar demonstração</button>
            <button className={s.primary} onClick={() => abrirMovimento()}>
              + Novo movimento
            </button>
          </div>
        </header>
        <section className={s.filters} aria-label="Filtros da demonstração">
          <label>
            Competência
            <select value={comp} onChange={(e) => setComp(e.target.value)}>
              {competencias.map((c) => (
                <option key={c} value={c}>
                  {mes(c)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Empregador
            <select
              value={empregador}
              onChange={(e) => setEmpregador(e.target.value)}
            >
              <option value="">Todos os empregadores</option>
              {empregadores.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </label>
          <label>
            Funcionário
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar nome ou cargo"
            />
          </label>
          <div className={s.actions}>
            <button
              onClick={() => {
                setNovaComp(proximoMes(competencias.at(-1)!));
                setCopiarVariaveis(false);
                abrirModal("replicar");
              }}
            >
              Gerar / replicar mês
            </button>
            <button
              onClick={() => {
                setFuncId(filtrados[0]?.id ?? "ana");
                setValor(
                  String(
                    salario(filtrados[0] ?? funcionarios[0], movimentos, comp),
                  ),
                );
                abrirModal("reprocessar");
              }}
            >
              Reprocessar
            </button>
          </div>
        </section>
        <div className={s.summary}>
          <div>
            <small>OBRIGAÇÕES DO PERÍODO</small>
            <strong>{dinheiro(total)}</strong>
            <span>Inclui previsões, encargos e pagamentos separados</span>
          </div>
          <div>
            <small>JÁ PAGO</small>
            <strong>{dinheiro(totalPago)}</strong>
            <span>Adiantamentos incluídos uma única vez</span>
          </div>
          <div>
            <small>SALDO A PAGAR / PREVER</small>
            <strong>{dinheiro(total - totalPago)}</strong>
            <span>Salários e demais obrigações</span>
          </div>
          <div>
            <small>CONFERÊNCIA</small>
            <strong>
              {filtrados.length -
                comPendencia.filter(
                  (f) => !revisados.includes(`${comp}:${f.id}`),
                ).length}{" "}
              / {filtrados.length}
            </strong>
            <span>Funcionários revisados nesta competência</span>
          </div>
        </div>
        <div className={s.process}>
          <div>
            <span className={s.step}>1</span>
            <strong>Preparar</strong>
            <span>→</span>
            <span className={s.step}>2</span>
            <strong>Conferir</strong>
            <span>→</span>
            <span className={s.step}>3</span>
            <strong>Fechar</strong>
            <span className={s.separator}>|</span>
            <span>Pagamento acompanhado por título</span>
          </div>
          <div className={s.actions}>
            <button
              onClick={() => abrirModal(todasFechadas ? "reabrir" : "fechar")}
            >
              {todasFechadas ? "Reabrir competência" : "Conferir fechamento"}
            </button>
          </div>
        </div>
        <nav className={s.tabs} aria-label="Áreas da proposta">
          {abas.map((a) => (
            <button
              key={a}
              aria-current={aba === a ? "page" : undefined}
              onClick={() => setAba(a)}
            >
              {a}
              {a === "Movimentos" && <span>{movimentosVisiveis.length}</span>}
            </button>
          ))}
        </nav>

        {aba === "Competência" && (
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <div>
                <h2>Pessoas e valores de {mes(comp)}</h2>
                <p>
                  Abra um funcionário para ver composição, extrato e documentos.
                </p>
              </div>
              <span className={s.badge}>{filtrados.length} funcionários</span>
            </div>
            <div className={s.tableWrap}>
              <table>
                <thead>
                  <tr>
                    {[
                      "Funcionário / empregador",
                      "Salário líquido",
                      "Gratificação bruta",
                      "Adiantamentos",
                      "Saldo a pagar",
                      "Processamento",
                      "Financeiro",
                      "",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((f) => {
                    const ts = titulos.filter((t) => t.funcionario === f.id);
                    const ms = movimentosVisiveis.filter(
                      (m) => m.funcionario === f.id,
                    );
                    return (
                      <tr key={f.id}>
                        <td>
                          <button
                            className={s.name}
                            onClick={() => {
                              setPessoa(f);
                              setDetalhe("extrato");
                            }}
                          >
                            {f.nome}
                          </button>
                          <small>{f.empregador}</small>
                        </td>
                        <td>{dinheiro(salario(f, movimentos, comp))}</td>
                        <td>
                          {dinheiro(
                            ms
                              .filter((m) => m.tipo === "gratificacao")
                              .reduce((v, m) => v + m.valor, 0),
                          )}
                        </td>
                        <td>
                          {dinheiro(
                            ms
                              .filter((m) => m.tipo.startsWith("adiantamento"))
                              .reduce((v, m) => v + m.valor, 0),
                          )}
                        </td>
                        <td className={s.amount}>
                          {dinheiro(ts.reduce((v, t) => v + saldo(t), 0))}
                        </td>
                        <td>
                          <span
                            className={
                              estado(f.empregador) === "fechada"
                                ? s.good
                                : s.badge
                            }
                          >
                            {nomeEstado(estado(f.empregador))}
                          </span>
                          <small>
                            {revisados.includes(`${comp}:${f.id}`)
                              ? "Revisado"
                              : "A conferir"}
                          </small>
                        </td>
                        <td>{financeiros(ts)}</td>
                        <td>
                          <button
                            onClick={() => {
                              setPessoa(f);
                              setDetalhe("composicao");
                            }}
                          >
                            Abrir →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!filtrados.length && (
              <p className={s.empty}>
                Nenhum funcionário para os filtros selecionados.
              </p>
            )}
            <div className={s.employers}>
              {grupos.map((e) => (
                <div key={e}>
                  <span>{e}</span>
                  <strong>{nomeEstado(estado(e))}</strong>
                  <small>
                    Encargos:{" "}
                    {dinheiro(
                      funcionarios
                        .filter((f) => f.empregador === e)
                        .reduce((v, f) => v + f.encargos, 0),
                    )}{" "}
                    · exemplo
                  </small>
                </div>
              ))}
            </div>
          </section>
        )}

        {aba === "Movimentos" && (
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <div>
                <h2>Movimentos da competência</h2>
                <p>
                  Eventos ligados ao funcionário, com identificação do destino
                  financeiro.
                </p>
              </div>
              <button className={s.primary} onClick={() => abrirMovimento()}>
                + Incluir movimento
              </button>
            </div>
            <div className={s.tableWrap}>
              <table>
                <thead>
                  <tr>
                    {[
                      "Funcionário",
                      "Evento",
                      "Descrição",
                      "Valor",
                      "Destino",
                      "",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movimentosVisiveis.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {funcionarios.find((f) => f.id === m.funcionario)?.nome}
                      </td>
                      <td>{rotulos[m.tipo]}</td>
                      <td>{m.descricao}</td>
                      <td>{dinheiro(m.valor)}</td>
                      <td>
                        {[
                          "gratificacao",
                          "diferenca",
                          "ferias",
                          "rescisao",
                          "decimo1",
                          "decimo2",
                        ].includes(m.tipo)
                          ? "Título separado no CP"
                          : m.tipo.startsWith("adiantamento")
                            ? "CP do adiantamento + compensação"
                            : "Composição do salário"}
                      </td>
                      <td>
                        <button onClick={() => excluirMovimento(m)}>
                          Excluir simulação
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!movimentosVisiveis.length && (
              <p className={s.empty}>
                Competência sem movimentos eventuais. Inclua um movimento para
                experimentar a rotina.
              </p>
            )}
          </section>
        )}

        {aba === "Conferência" && (
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <div>
                <h2>Conferência antes do fechamento</h2>
                <p>
                  Diferenças são destacadas para revisão; valores diferentes
                  podem ser conferidos.
                </p>
              </div>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={somentePendentes}
                  onChange={(e) => setSomentePendentes(e.target.checked)}
                />
                Só não revisados
              </label>
            </div>
            {filtrados
              .filter(
                (f) =>
                  !somentePendentes || !revisados.includes(`${comp}:${f.id}`),
              )
              .map((f) => (
                <div className={s.reviewRow} key={f.id}>
                  <div>
                    <strong>{f.nome}</strong>
                    <small>{f.empregador}</small>
                  </div>
                  <div>
                    <small>Mês anterior · exemplo</small>
                    <strong>{dinheiro(f.anterior)}</strong>
                  </div>
                  <div>
                    <small>Salário líquido atual</small>
                    <strong>{dinheiro(salario(f, movimentos, comp))}</strong>
                  </div>
                  <div>
                    <small>Diferença</small>
                    <strong
                      className={
                        salario(f, movimentos, comp) !== f.anterior
                          ? s.warningText
                          : ""
                      }
                    >
                      {dinheiro(salario(f, movimentos, comp) - f.anterior)}
                    </strong>
                  </div>
                  <button
                    disabled={revisados.includes(`${comp}:${f.id}`)}
                    onClick={() => conferir(f)}
                  >
                    {revisados.includes(`${comp}:${f.id}`)
                      ? "✓ Revisado"
                      : "Marcar revisado"}
                  </button>
                </div>
              ))}
          </section>
        )}

        {aba === "Pagamentos" && (
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <div>
                <h2>Obrigações e pagamentos</h2>
                <p>
                  Fechamento e pagamento têm estados independentes. As baixas
                  abaixo são apenas simulações.
                </p>
              </div>
            </div>
            <div className={s.tableWrap}>
              <table>
                <thead>
                  <tr>
                    {[
                      "Beneficiário",
                      "Documento",
                      "Vencimento",
                      "Valor",
                      "Pago",
                      "Saldo",
                      "Situação",
                      "Ações da prévia",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {titulosVisiveis.map((t) => (
                    <tr key={t.id}>
                      <td>
                        {t.nome}
                        <small>{t.empregador}</small>
                      </td>
                      <td>{t.descricao}</td>
                      <td>{data(t.vencimento)}</td>
                      <td>{dinheiro(t.valor)}</td>
                      <td>{dinheiro(t.pago)}</td>
                      <td className={s.amount}>{dinheiro(saldo(t))}</td>
                      <td>
                        <span
                          className={
                            saldo(t) === 0
                              ? s.good
                              : t.previsao
                                ? s.badge
                                : s.warn
                          }
                        >
                          {t.previsao
                            ? "Previsão"
                            : t.valor === 0
                              ? "Compensado"
                              : saldo(t) === 0
                                ? "Pago"
                                : t.pago
                                  ? "Parcial"
                                  : "Aberto"}
                        </span>
                      </td>
                      <td>
                        <div className={s.actions}>
                          {t.pago > 0 ? (
                            <button
                              onClick={() => {
                                setPagamentos((p) => ({ ...p, [t.id]: 0 }));
                                registrar(
                                  "Estorno simulado",
                                  t.descricao,
                                  t.funcionario || undefined,
                                );
                              }}
                            >
                              Estornar
                            </button>
                          ) : null}
                          {saldo(t) > 0 && (
                            <>
                              <button
                                disabled={t.previsao}
                                onClick={() => pagar(t, true)}
                              >
                                Pagar 50%
                              </button>
                              <button
                                disabled={t.previsao}
                                onClick={() => pagar(t)}
                              >
                                Quitar
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {aba === "Histórico" && (
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <div>
                <h2>Histórico da demonstração</h2>
                <p>
                  Cada alteração explica o movimento e a consequência
                  financeira.
                </p>
              </div>
            </div>
            <ListaHistorico
              lista={historico.filter(
                (h) =>
                  h.comp === comp && (!h.funcionario || ids.has(h.funcionario)),
              )}
            />
          </section>
        )}

        {aba === "13º salário" && (
          <section className={s.card}>
            <div className={s.sectionHeading}>
              <div>
                <h2>13º salário · exemplo anual de {comp.slice(0, 4)}</h2>
                <p>
                  Valores ilustrativos de parcelas. O cálculo legal e os
                  parâmetros atuais serão preservados na implementação
                  definitiva.
                </p>
              </div>
            </div>
            <div className={s.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Funcionário</th>
                    <th>Base ilustrativa</th>
                    <th>1ª parcela · exemplo</th>
                    <th>2ª parcela · exemplo</th>
                    <th>Simular controle</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((f) => (
                    <tr key={f.id}>
                      <td>{f.nome}</td>
                      <td>{dinheiro(f.salario)}</td>
                      <td>{dinheiro(f.salario / 2)}</td>
                      <td>{dinheiro(f.salario / 2 - 120)}</td>
                      <td>
                        <div className={s.actions}>
                          {(["decimo1", "decimo2"] as const).map((t, i) => (
                            <button
                              key={t}
                              disabled={movimentos.some(
                                (m) =>
                                  m.funcionario === f.id &&
                                  m.competencia.slice(0, 4) ===
                                    comp.slice(0, 4) &&
                                  m.tipo === t,
                              )}
                              onClick={() => {
                                setFuncId(f.id);
                                setTipo(t);
                                setValor(String(f.salario / 2 - (i ? 120 : 0)));
                                setDescricao(rotulos[t]);
                                setVencimento(
                                  i
                                    ? `${comp.slice(0, 4)}-12-20`
                                    : `${comp.slice(0, 4)}-11-30`,
                                );
                                abrirModal("movimento");
                              }}
                            >
                              {movimentos.some(
                                (m) =>
                                  m.funcionario === f.id &&
                                  m.tipo === t &&
                                  m.competencia.startsWith(comp.slice(0, 4)),
                              )
                                ? "Já lançada"
                                : `Lançar ${i + 1}ª parcela`}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <details className={s.coverage}>
          <summary>
            Como experimentar a proposta e quais funções serão preservadas
          </summary>
          <p>
            Comece por Ana Ribeiro: veja a gratificação de R$ 1.000, o
            adiantamento já pago de R$ 300 e o título de R$ 700. Confira os
            funcionários, feche a competência e simule uma baixa parcial. Depois
            use Reprocessar para comparar o valor anterior com o novo.
          </p>
          <p>
            O desenho preserva geração por empregador e por período, seleção de
            funcionários, complemento, benefícios, horas extras/DSR, descontos,
            encargos, previsões, fechamento, reabertura, correção de
            adiantamentos, gratificações separadas, 13º, exportação, permissões
            e auditoria. Esta prévia demonstra a navegação e os saldos; os
            cálculos completos, as regras de acesso e a integração com o CP
            continuam na rotina atual. Férias e rescisão aparecem aqui como
            eventos ilustrativos.
          </p>
        </details>
        {toast && (
          <div role="status" className={s.toast}>
            {toast}
            <button onClick={() => setToast("")} aria-label="Dispensar aviso">
              ×
            </button>
          </div>
        )}

        {pessoa && (
          <Janela titulo={pessoa.nome} fechar={() => setPessoa(null)} lateral>
            <div className={s.drawerBody}>
              <p>
                {pessoa.cargo}
                <br />
                {pessoa.empregador}
              </p>
              <div className={s.personTotal}>
                <small>SALDO DO FUNCIONÁRIO · {mes(comp)}</small>
                <strong>
                  {dinheiro(
                    titulos
                      .filter((t) => t.funcionario === pessoa.id)
                      .reduce((v, t) => v + saldo(t), 0),
                  )}
                </strong>
              </div>
              <div className={s.tabs}>
                {(["extrato", "composicao", "historico"] as const).map((d) => (
                  <button
                    key={d}
                    aria-current={detalhe === d ? "page" : undefined}
                    onClick={() => setDetalhe(d)}
                  >
                    {d === "composicao"
                      ? "Composição"
                      : d === "historico"
                        ? "Histórico"
                        : "Extrato"}
                  </button>
                ))}
              </div>
              {detalhe === "extrato" && (
                <>
                  {titulos
                    .filter((t) => t.funcionario === pessoa.id)
                    .map((t) => (
                      <div className={s.statement} key={t.id}>
                        <div>
                          <strong>{t.descricao}</strong>
                          <small>
                            {t.previsao ? "Previsão" : "CP separado"} ·{" "}
                            {data(t.vencimento)}
                          </small>
                        </div>
                        <div>
                          <strong>{dinheiro(t.valor)}</strong>
                          <small>
                            Pago: {dinheiro(t.pago)} · Saldo:{" "}
                            {dinheiro(saldo(t))}
                          </small>
                        </div>
                      </div>
                    ))}
                  <p className={s.note}>
                    O adiantamento aparece como pagamento próprio e reduz apenas
                    o saldo correspondente. Não é somado novamente ao valor a
                    pagar.
                  </p>
                </>
              )}
              {detalhe === "composicao" && (
                <>
                  <div className={s.statement}>
                    <span>Líquido recorrente · exemplo</span>
                    <strong>{dinheiro(pessoa.salario)}</strong>
                  </div>
                  {movimentosVisiveis
                    .filter((m) => m.funcionario === pessoa.id)
                    .map((m) => (
                      <div className={s.statement} key={m.id}>
                        <span>
                          {m.descricao}
                          <small>{rotulos[m.tipo]}</small>
                        </span>
                        <strong>{dinheiro(m.valor)}</strong>
                      </div>
                    ))}
                  <div className={s.statement}>
                    <span>Salário líquido a lançar</span>
                    <strong>
                      {dinheiro(salario(pessoa, movimentos, comp))}
                    </strong>
                  </div>
                  <p className={s.note}>
                    Gratificações, férias, rescisões e 13º são apresentados em
                    documentos próprios. Esta demonstração usa valores prontos,
                    sem recalcular tributos.
                  </p>
                </>
              )}
              {detalhe === "historico" && (
                <ListaHistorico
                  lista={historico.filter(
                    (h) => h.funcionario === pessoa.id && h.comp === comp,
                  )}
                />
              )}
              <div className={s.actions}>
                <button
                  className={s.primary}
                  onClick={() => {
                    const f = pessoa;
                    setPessoa(null);
                    abrirMovimento(f);
                  }}
                >
                  + Movimento
                </button>
                <button
                  onClick={() => {
                    conferir(pessoa);
                    setToast("Funcionário revisado na demonstração.");
                  }}
                >
                  Marcar revisado
                </button>
              </div>
            </div>
          </Janela>
        )}

        {modal === "movimento" && (
          <Janela titulo="Novo movimento" fechar={() => setModal(null)} ampla>
            <form onSubmit={adicionar} className={s.form}>
              <div
                role="tablist"
                aria-label="Tipo de movimento"
                className={s.movementTabs}
              >
                {abasMovimento.map(([t, label], indice) => (
                  <button
                    type="button"
                    role="tab"
                    key={t}
                    id={`movimento-aba-${t}`}
                    aria-selected={tipo === t}
                    aria-controls="movimento-painel"
                    tabIndex={tipo === t ? 0 : -1}
                    onClick={() => {
                      setTipo(t);
                      setErro("");
                    }}
                    onKeyDown={(e) => {
                      const destino =
                        e.key === "ArrowRight"
                          ? (indice + 1) % abasMovimento.length
                          : e.key === "ArrowLeft"
                            ? (indice - 1 + abasMovimento.length) %
                              abasMovimento.length
                            : e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? abasMovimento.length - 1
                                : -1;
                      if (destino < 0) return;
                      e.preventDefault();
                      const proximo = abasMovimento[destino][0];
                      setTipo(proximo);
                      setErro("");
                      document
                        .getElementById(`movimento-aba-${proximo}`)
                        ?.focus();
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <section
                role="tabpanel"
                id="movimento-painel"
                aria-labelledby={`movimento-aba-${tipo}`}
                className={s.formFields}
              >
                <label>
                  Funcionário
                  <select
                    value={funcId}
                    onChange={(e) => setFuncId(e.target.value)}
                  >
                    {filtrados.map((f) => (
                      <option value={f.id} key={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <div className={s.formRow}>
                  <label>
                    Valor ilustrativo (R$)
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                    />
                  </label>
                  <label>
                    Vencimento do documento
                    <input
                      required
                      type="date"
                      value={vencimento}
                      onChange={(e) => setVencimento(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  Descrição
                  <input
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder={rotulos[tipo]}
                  />
                </label>
                {tipo.startsWith("adiantamento") && (
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={jaPago}
                      onChange={(e) => setJaPago(e.target.checked)}
                    />
                    Simular adiantamento já pago
                  </label>
                )}
                <p className={s.note}>
                  {tipo === "gratificacao"
                    ? "Gera um título separado no CP simulado. O salário permanece independente."
                    : tipo.startsWith("adiantamento")
                      ? "O documento do adiantamento será vinculado ao saldo do salário ou da gratificação."
                      : "O evento será identificado na composição e no extrato do funcionário."}
                </p>
                {erro && (
                  <p role="alert" className={s.error}>
                    {erro}
                  </p>
                )}
                <footer className={s.actions}>
                  <button type="button" onClick={() => setModal(null)}>
                    Cancelar
                  </button>
                  <button className={s.primary}>Incluir na demonstração</button>
                </footer>
              </section>
            </form>
          </Janela>
        )}

        {modal === "reprocessar" && (
          <Janela
            titulo="Prévia do reprocessamento"
            fechar={() => setModal(null)}
          >
            <form onSubmit={reprocessar} className={s.form}>
              <label>
                Funcionário
                <select
                  value={funcId}
                  onChange={(e) => {
                    setFuncId(e.target.value);
                    const f = funcionarios.find(
                      (f) => f.id === e.target.value,
                    )!;
                    setValor(String(salario(f, movimentos, comp)));
                  }}
                >
                  {filtrados.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Novo salário líquido ilustrativo
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              </label>
              <div className={s.comparison}>
                <div>
                  <small>ANTES</small>
                  <strong>{dinheiro(antesAjuste)}</strong>
                </div>
                <span>→</span>
                <div>
                  <small>DEPOIS</small>
                  <strong>{dinheiro(Number(valor) || 0)}</strong>
                </div>
              </div>
              <p className={s.note}>
                {!diferenca
                  ? "Altere o valor para ver a consequência financeira."
                  : salarioPago
                    ? diferenca > 0
                      ? `Salário com pagamento: o título original será preservado. Será criado um documento separado de ${dinheiro(diferenca)}.`
                      : `Salário com pagamento: o título original será preservado. Será criado um desconto de ${dinheiro(-diferenca)} em ${mes(proximoMes(comp))}.`
                    : "Salário ainda sem pagamento: o valor do título / previsão será atualizado."}
              </p>
              {erro && (
                <p role="alert" className={s.error}>
                  {erro}
                </p>
              )}
              <footer className={s.actions}>
                <button type="button" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button className={s.primary}>Confirmar simulação</button>
              </footer>
            </form>
          </Janela>
        )}

        {modal === "replicar" && (
          <Janela
            titulo="Gerar próxima competência"
            fechar={() => setModal(null)}
          >
            <form onSubmit={replicar} className={s.form}>
              <label>
                Nova competência
                <input
                  required
                  type="month"
                  value={novaComp}
                  onChange={(e) => setNovaComp(e.target.value)}
                />
              </label>
              <p>
                Os cinco funcionários e os valores recorrentes estarão
                disponíveis na nova competência. O filtro de empregador continua
                disponível para a conferência.
              </p>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={copiarVariaveis}
                  onChange={(e) => setCopiarVariaveis(e.target.checked)}
                />
                Copiar também gratificações, horas extras, benefícios eventuais
                e descontos da lista filtrada
              </label>
              <p className={s.note}>
                Adiantamentos, pagamentos, férias, rescisões e parcelas do 13º
                não são repetidos.
              </p>
              {erro && (
                <p role="alert" className={s.error}>
                  {erro}
                </p>
              )}
              <footer className={s.actions}>
                <button type="button" onClick={() => setModal(null)}>
                  Cancelar
                </button>
                <button className={s.primary}>Gerar demonstração</button>
              </footer>
            </form>
          </Janela>
        )}

        {modal === "fechar" && (
          <Janela
            titulo="Conferir e fechar competência"
            fechar={() => setModal(null)}
          >
            <div className={s.form}>
              <p>
                Confira os empregadores de {mes(comp)}. O fechamento transforma
                as previsões de salários e encargos em documentos simulados em
                aberto.
              </p>
              {grupos.map((g) => {
                const fs = funcionarios.filter((f) => f.empregador === g);
                return (
                  <div className={s.statement} key={g}>
                    <strong>{g}</strong>
                    <span>
                      {
                        fs.filter((f) => revisados.includes(`${comp}:${f.id}`))
                          .length
                      }{" "}
                      / {fs.length} revisados
                    </span>
                  </div>
                );
              })}
              <p className={s.note}>
                A busca por funcionário não limita o fechamento: a competência é
                fechada por empregador.
              </p>
              {erro && (
                <p role="alert" className={s.error}>
                  {erro}
                </p>
              )}
              <footer className={s.actions}>
                <button
                  onClick={() => {
                    setAba("Conferência");
                    setModal(null);
                  }}
                >
                  Ir para conferência
                </button>
                <button
                  className={s.primary}
                  onClick={() => {
                    if (
                      funcionarios
                        .filter((f) => grupos.includes(f.empregador))
                        .some((f) => !revisados.includes(`${comp}:${f.id}`))
                    )
                      return setErro(
                        "Revise todos os funcionários dos empregadores antes de fechar a demonstração.",
                      );
                    setSituacoes((st) => ({
                      ...st,
                      ...Object.fromEntries(
                        grupos.map((g) => [
                          chave(comp, g),
                          "fechada" as Situacao,
                        ]),
                      ),
                    }));
                    registrar(
                      "Competência fechada",
                      `${grupos.length} empregador(es). Previsões efetivadas; pagamentos continuam independentes.`,
                    );
                    setModal(null);
                    setToast(
                      "Fechamento simulado. Vá a Pagamentos para experimentar as baixas.",
                    );
                  }}
                >
                  Fechar demonstração
                </button>
              </footer>
            </div>
          </Janela>
        )}

        {modal === "reabrir" && (
          <Janela titulo="Reabrir competência" fechar={() => setModal(null)}>
            <div className={s.form}>
              <p>
                Salários e encargos sem pagamentos voltarão a ser previsões.
                Gratificações e adiantamentos continuam em documentos próprios.
              </p>
              {erro && (
                <p role="alert" className={s.error}>
                  {erro}
                </p>
              )}
              <footer className={s.actions}>
                <button onClick={() => setModal(null)}>Cancelar</button>
                <button
                  className={s.primary}
                  onClick={() => {
                    if (
                      titulos.some(
                        (t) =>
                          grupos.includes(t.empregador) &&
                          ["salario", "encargo"].includes(t.grupo) &&
                          t.pago > 0,
                      )
                    )
                      return setErro(
                        "Há salários ou encargos pagos. Estorne o pagamento simulado ou use Reprocessar para preservar o título original.",
                      );
                    setSituacoes((st) => ({
                      ...st,
                      ...Object.fromEntries(
                        grupos.map((g) => [
                          chave(comp, g),
                          "preparacao" as Situacao,
                        ]),
                      ),
                    }));
                    setRevisados((r) =>
                      r.filter(
                        (k) =>
                          !funcionarios.some(
                            (f) =>
                              grupos.includes(f.empregador) &&
                              k === `${comp}:${f.id}`,
                          ),
                      ),
                    );
                    registrar(
                      "Competência reaberta",
                      "Salários e encargos retornaram a previsão.",
                    );
                    setModal(null);
                  }}
                >
                  Reabrir demonstração
                </button>
              </footer>
            </div>
          </Janela>
        )}
      </main>
    </>
  );
}

function ListaHistorico({ lista }: { lista: Historico[] }) {
  return lista.length ? (
    <div className={s.history}>
      {lista.map((h) => (
        <div key={h.id}>
          <span className={s.historyDot} />
          <div>
            <strong>{h.acao}</strong>
            <small>
              {h.funcionario
                ? funcionarios.find((f) => f.id === h.funcionario)?.nome
                : "Competência"}{" "}
              · {mes(h.comp)} · Usuário da demonstração
            </small>
            <p>{h.detalhe}</p>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className={s.empty}>As ações que você simular aparecerão aqui.</p>
  );
}
