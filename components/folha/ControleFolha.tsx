"use client";

import Link from "next/link";
import InputData from "../InputData";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  OperationalButton as Button,
  OperationalGrid as Grid,
  OperationalFilters,
  OperationalHeading,
} from "../OperationalUI";
import { useOperationalPresentation } from "../arato-layout/presentation-mode";
import { supabase } from "../../lib/supabase";
import {
  assinaturaConferencia,
  conferenciaAtual,
  financeirosControle,
  liquidoGravado,
  statusFinanceiro,
  type ControleDados,
  type FolhaControle,
  type LinhaControle,
  type PessoaControle,
  type FinanceiroControle,
} from "../../lib/folha/controle";
import { mesAnterior } from "../../lib/folha/empregador";
import { agruparPorEmpregador } from "../../lib/folha/por-empregador";
import s from "./ControleFolha.module.css";

export type TipoMovimentoFolha =
  | "gratificacao"
  | "adiantamento_salario"
  | "adiantamento_gratificacao"
  | "horas_extras"
  | "beneficio"
  | "desconto"
  | "ferias"
  | "rescisao"
  | "decimo1"
  | "decimo2";
const tipos: [TipoMovimentoFolha, string][] = [
  ["gratificacao", "Gratificação"],
  ["adiantamento_salario", "Adiantamento de salário"],
  ["adiantamento_gratificacao", "Adiantamento de gratificação"],
  ["horas_extras", "Horas extras / DSR"],
  ["beneficio", "Benefício"],
  ["desconto", "Desconto"],
  ["ferias", "Férias"],
  ["rescisao", "Rescisão"],
  ["decimo1", "13º · 1ª parcela"],
  ["decimo2", "13º · 2ª parcela"],
];
const abas = [
  "Folhas",
  "Movimentos",
  "Conferência",
  "Pagamentos",
  "Histórico",
  "13º salário",
] as const;
type Aba = (typeof abas)[number];
type Empregador = { empresa_id?: string | null; produtor_id?: string | null };
type LinhaVista = {
  id: string;
  pessoa: PessoaControle | undefined;
  linha?: LinhaControle;
  folha?: FolhaControle;
  competencia: string;
  nome: string;
  empregador: string;
  chave: string;
};
type Props = {
  fazendaIds: string[];
  contaId?: string | null;
  de: string;
  ate: string;
  versao: number;
  carregando: boolean;
  salvando: boolean;
  podeConferir: boolean;
  abaLegada: "processamento" | "adiantamentos" | "gratificacoes" | "decimo";
  children: ReactNode;
  onPeriodo: (de: string, ate: string) => void;
  onAbaLegada: (a: Props["abaLegada"]) => void;
  empregador: (v: Empregador) => { chave: string; nome: string };
  onGerar: (empregador?: string, competencia?: string) => void;
  onPreparar: (folhaId: string, incluir: string[]) => void;
  onAbrir: (folhaId: string, funcionarioId?: string) => void;
  onCriar: (funcionarioId: string, competencia: string) => void;
  onFechar: (ids: string[]) => void;
  onReplicar: (id: string) => void;
  onMovimento: (
    tipo: TipoMovimentoFolha,
    funcionarioId: string,
    competencia: string,
  ) => void;
};
const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (v?: string | null) =>
  !v
    ? "—"
    : v.includes("T")
      ? new Date(v).toLocaleString("pt-BR", {
          timeZone: "America/Cuiaba",
          dateStyle: "short",
          timeStyle: "short",
        })
      : v.slice(0, 10).split("-").reverse().join("/");
const mes = (v: string) =>
  new Date(`${v}-15T12:00:00`).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
function descreverAlteracoes(valor: unknown): string {
  const lista = Array.isArray(valor)
    ? valor
    : valor && typeof valor === "object"
      ? [valor]
      : [];
  return (
    lista
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const r = item as Record<string, unknown>;
        const nome = String(
          r.nome || r.campo || r.motivo || "Alteração da folha",
        );
        return `${nome}${typeof r.antes === "number" && typeof r.depois === "number" ? `: ${moeda(r.antes)} → ${moeda(r.depois)}` : ""}`;
      })
      .filter(Boolean)
      .join("\n") || "Registro mantido no histórico da rotina."
  );
}
function meses(de: string, ate: string) {
  const r: string[] = [];
  let atual = de;
  while (atual <= ate) {
    r.push(atual);
    const [a, m] = atual.split("-").map(Number);
    atual = `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  }
  return r;
}
function Painel({
  titulo,
  fechar,
  children,
  amplo = false,
}: {
  titulo: string;
  fechar: () => void;
  children: ReactNode;
  amplo?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      className={amplo ? s.modal : s.drawer}
      ref={ref}
      aria-labelledby={id}
      onCancel={fechar}
    >
      <header className={s.dialogHeading}>
        <h2 id={id}>{titulo}</h2>
        <Button onClick={fechar} aria-label="Fechar painel">
          ×
        </Button>
      </header>
      {children}
    </dialog>
  );
}

export default function ControleFolha(p: Props) {
  const novoLayout = useOperationalPresentation();
  const [aba, setAba] = useState<Aba>(
    p.abaLegada === "decimo" ? "13º salário" : "Folhas",
  );
  const [emp, setEmp] = useState("");
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState<ControleDados | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [gravando, setGravando] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<
    "extrato" | "composicao" | "historico"
  >("extrato");
  const [novo, setNovo] = useState(false);
  const [tipo, setTipo] = useState<TipoMovimentoFolha>("gratificacao");
  const [funcId, setFuncId] = useState("");
  const [compMov, setCompMov] = useState(p.de);
  const [soPendentes, setSoPendentes] = useState(false);
  const [gestao, setGestao] = useState(false);
  const [revisaoIndividual, setRevisaoIndividual] = useState(false);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [gruposSelecionados, setGruposSelecionados] = useState<string[]>([]);
  const token = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token)
      throw new Error(
        "Sua sessão expirou. Entre novamente para acessar a folha.",
      );
    return session.access_token;
  };
  const api = async (body: object) => {
    const res = await fetch("/api/folha/salvar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await token()}`,
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok)
      throw new Error(
        json.error || "Não foi possível carregar o controle da folha.",
      );
    return json;
  };
  const identidade = `${p.contaId ?? ""}|${p.fazendaIds.join(",")}`;
  useEffect(() => {
    setEmp("");
    setBusca("");
    setAberto(null);
    setNovo(false);
    setAviso("");
    setGrupoAberto(null);
    setGruposSelecionados([]);
  }, [identidade]);
  useEffect(() => {
    let atual = true;
    setDados(null);
    setErro("");
    if (!p.fazendaIds.length) return;
    setLoading(true);
    (async () => {
      try {
        const res = await api({
          operacao: "listar_controle",
          fazenda_ids: p.fazendaIds,
          competencia_de: p.de,
          competencia_ate: p.ate,
        });
        if (atual) setDados(res.data as ControleDados);
      } catch (e) {
        if (atual) setErro(e instanceof Error ? e.message : String(e));
      } finally {
        if (atual) setLoading(false);
      }
    })();
    return () => {
      atual = false;
    };
    // O escopo muda junto com a conta/fazendas; respostas de uma seleção anterior são descartadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identidade, p.de, p.ate, p.versao, refresh]);
  useEffect(() => {
    if (p.abaLegada === "decimo") setAba("13º salário");
  }, [p.abaLegada]);
  const fin = dados ? financeirosControle(dados) : [];
  const porFolha = new Map(dados?.folhas.map((f) => [f.id, f]));
  const porPessoa = new Map(dados?.funcionarios.map((f) => [f.id, f]));
  const todasLinhas: LinhaVista[] = (dados?.linhas ?? [])
    .filter((l) => {
      const f = porFolha.get(l.folha_id);
      return f && f.competencia >= p.de && f.competencia <= p.ate;
    })
    .map((l) => {
      const f = porFolha.get(l.folha_id)!;
      const pessoa = l.funcionario_id
        ? porPessoa.get(l.funcionario_id)
        : undefined;
      const e = p.empregador(f);
      return {
        id: l.id,
        linha: l,
        folha: f,
        pessoa,
        competencia: f.competencia,
        nome: l.nome_funcionario,
        empregador: e.nome,
        chave: e.chave,
      };
    });
  // Funcionários ativos sem folha aparecem como pendência; históricos de desligados continuam visíveis nas linhas gravadas.
  if (dados)
    for (const comp of meses(p.de, p.ate))
      for (const f of dados.funcionarios) {
        if (
          f.ativo === false ||
          (f.data_admissao && f.data_admissao > `${comp}-31`) ||
          (f.data_demissao && f.data_demissao < `${comp}-01`)
        )
          continue;
        if (
          todasLinhas.some(
            (l) => l.competencia === comp && l.pessoa?.id === f.id,
          )
        )
          continue;
        const e = p.empregador(f);
        todasLinhas.push({
          id: `sem:${comp}:${f.id}`,
          pessoa: f,
          competencia: comp,
          nome: f.nome,
          empregador: e.nome,
          chave: e.chave,
        });
      }
  function dono(t: FinanceiroControle) {
    const folha = t.folha_id ? porFolha.get(t.folha_id) : undefined;
    const pessoa = t.funcionario_id
      ? porPessoa.get(t.funcionario_id)
      : undefined;
    return p.empregador(
      t.empresa_id || t.produtor_id ? t : (folha ?? pessoa ?? {}),
    );
  }
  const linhas = todasLinhas
    .filter(
      (l) =>
        (!emp || l.chave === emp) &&
        `${l.nome} ${l.pessoa?.funcao ?? l.linha?.cargo ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(busca.toLocaleLowerCase("pt-BR")),
    )
    .sort(
      (a, b) =>
        b.competencia.localeCompare(a.competencia) ||
        a.nome.localeCompare(b.nome),
    );
  const titulos = fin.filter(
    (t) =>
      t.competencia >= p.de &&
      t.competencia <= p.ate &&
      (!emp || dono(t).chave === emp) &&
      (!busca ||
        (!!t.funcionario_id &&
          `${porPessoa.get(t.funcionario_id)?.nome ?? ""} ${porPessoa.get(t.funcionario_id)?.funcao ?? ""}`
            .toLocaleLowerCase("pt-BR")
            .includes(busca.toLocaleLowerCase("pt-BR")))),
  );
  const dadosEmp = [
    ...new Map([
      ...todasLinhas.map((l) => [l.chave, l.empregador] as const),
      ...fin
        .filter((t) => t.competencia >= p.de && t.competencia <= p.ate)
        .map((t) => {
          const e = dono(t);
          return [e.chave, e.nome] as const;
        }),
    ]).entries(),
  ];
  const documentos = (l: LinhaVista) =>
    titulos.filter(
      (t) =>
        t.competencia === l.competencia &&
        (t.folha_id
          ? t.folha_id === l.folha?.id &&
            t.funcionario_id === l.linha?.funcionario_id
          : t.funcionario_id === l.pessoa?.id && dono(t).chave === l.chave),
    );
  const linhasRevisadas = new Set(dados?.conferencias.map(c => c.linha_id));
  const revisoes = new Map<string, ReturnType<typeof conferenciaAtual>>();
  const revisaoAtual = (l: LinhaControle) => {
    if (!dados || !linhasRevisadas.has(l.id)) return undefined;
    if (!revisoes.has(l.id)) revisoes.set(l.id, conferenciaAtual(l, dados, fin));
    return revisoes.get(l.id);
  };
  const conferida = (l: LinhaVista) => l.linha ? revisaoAtual(l.linha) : undefined;
  const folhaStatus = (f: FolhaControle) =>
    f.status !== "rascunho"
      ? "Fechada"
      : dados?.linhas.filter((l) => l.folha_id === f.id).length &&
          dados.linhas
            .filter((l) => l.folha_id === f.id)
            .every((l) => revisaoAtual(l))
        ? "Conferida"
        : "Em preparação";
  const titulosResumo = fin.filter(t => t.competencia >= p.de && t.competencia <= p.ate && (!emp || dono(t).chave === emp));
  const total = titulosResumo.reduce((v, t) => v + t.valor, 0),
    pago = titulosResumo.reduce((v, t) => v + t.pago, 0),
    saldo = titulosResumo.reduce((v, t) => v + t.saldo, 0);
  const folhasPeriodo = (dados?.folhas ?? []).filter(
    (f) =>
      f.competencia >= p.de &&
      f.competencia <= p.ate &&
      (!emp || p.empregador(f).chave === emp),
  );
  const selecionada = todasLinhas.find((l) => l.id === aberto);
  // A busca pode localizar um funcionário, mas nunca reduz os totais nem o processamento do empregador.
  const grupos = agruparPorEmpregador(
    todasLinhas.filter(l => !emp || l.chave === emp), folhasPeriodo, p.empregador,
  ).filter(g => !busca || `${g.nome} ${g.funcionarios.map(l => l.nome).join(" ")}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  const grupoDetalhado = grupos.find(g => g.id === grupoAberto);
  const folhasSelecionadas = grupos.filter(g => gruposSelecionados.includes(g.id)).flatMap(g => g.folhas);
  const marcarGrupo = (id: string) => setGruposSelecionados(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  function prepararGrupo(g: (typeof grupos)[number]) {
    if (!g.folhas.length) { p.onGerar(g.chave, g.competencia); return; }
    const faltantes = g.funcionarios.filter(l => !l.linha && l.pessoa).map(l => l.pessoa!.id);
    p.onPreparar(g.folhas[0].id, faltantes);
  }
  async function conferirGrupo(g: (typeof grupos)[number]) {
    if (!dados) return;
    setGravando(true);
    setAviso("");
    try {
      await api({
        operacao: "conferir_folhas",
        fazenda_ids: p.fazendaIds,
        folha_ids: g.folhas.map(f => f.id),
        assinaturas: g.funcionarios.filter(l => l.linha).map(l => ({ linha_id: l.linha!.id, assinatura: assinaturaConferencia(l.linha!, dados, fin) })),
      });
      setRefresh(v => v + 1);
      setAviso(`${g.nome}: folha conferida em conjunto (${g.gerados} funcionários).`);
    } catch (e) { setAviso(e instanceof Error ? e.message : String(e)); }
    finally { setGravando(false); }
  }
  async function conferir(l: LinhaVista) {
    if (!l.linha || !dados) return;
    setGravando(true);
    setAviso("");
    try {
      await api({
        operacao: "conferir_funcionario",
        fazenda_ids: p.fazendaIds,
        folha_id: l.folha!.id,
        linha_id: l.linha.id,
        assinatura: assinaturaConferencia(l.linha, dados, fin),
      });
      setRefresh((v) => v + 1);
      setAviso(`${l.nome}: conferência registrada.`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
    }
  }
  function abrir(l: LinhaVista) {
    setAberto(null);
    if (l.folha) p.onAbrir(l.folha.id, l.pessoa?.id);
    else if (l.pessoa) p.onCriar(l.pessoa.id, l.competencia);
  }
  function novoMovimento(l?: LinhaVista) {
    setTipo("gratificacao");
    setFuncId(l?.pessoa?.id ?? linhas.find((l) => l.pessoa)?.pessoa?.id ?? "");
    setCompMov(l?.competencia ?? p.de);
    setAberto(null);
    setNovo(true);
  }
  function exportar() {
    const rows = [
      [
        "Competência",
        "Funcionário / Encargo",
        "Empregador",
        "Documento",
        "CP",
        "Valor",
        "Pago",
        "Saldo",
        "Situação",
      ],
      ...titulos.map((t) => [
        t.competencia,
        porPessoa.get(t.funcionario_id ?? "")?.nome ?? "Encargo",
        dono(t).nome,
        t.descricao,
        String(t.numero ?? t.titulo_id),
        t.valor.toFixed(2),
        t.pago.toFixed(2),
        t.saldo.toFixed(2),
        statusFinanceiro([t]),
      ]),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((r) =>
          r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `controle-folha-${p.de}-${p.ate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const ir = (a: Aba) => {
    setAba(a);
    setGestao(false);
    if (a === "13º salário") p.onAbaLegada("decimo");
    else if (a === "Folhas") p.onAbaLegada("processamento");
    else if (a === "Movimentos") p.onAbaLegada("adiantamentos");
  };
  const historico = (dados?.historico ?? []).filter((h) => {
    const f = porFolha.get(h.folha_id);
    return (
      f &&
      f.competencia >= p.de &&
      f.competencia <= p.ate &&
      (!emp || p.empregador(f).chave === emp)
    );
  });
  const busy = loading || p.carregando || p.salvando || gravando;

  return (
    <section
      className={`${s.page} ${novoLayout ? s.native : ""}`}
      data-folha-layout={novoLayout ? "novo" : "padrao"}
    >
      <OperationalHeading as="header" className={s.heading}>
        <div>
          <p>FINANCEIRO / CONTROLE POR COMPETÊNCIA</p>
          <h1>Folha de pagamento</h1>
          <span>
            Gere e processe a folha por empregador. Funcionários ficam no detalhamento e nos ajustes.
          </span>
        </div>
        <div className={s.actions}>
          <Button onClick={exportar} disabled={!dados || loading}>
            Exportar controle
          </Button>
          <Button className={s.primary} onClick={() => p.onGerar(emp || undefined)} disabled={p.salvando}>
            Gerar folha por empregador
          </Button>
          <Button
            onClick={() => novoMovimento()}
            disabled={!dados || loading}
          >
            + Movimento individual
          </Button>
        </div>
      </OperationalHeading>
      <OperationalFilters className={s.filters}>
        <label>
          De
          <InputData
            type="month"
            aria-label="Competência inicial"
            value={p.de}
            onChange={(e) => {
              if (e.target.value)
                p.onPeriodo(
                  e.target.value,
                  p.ate < e.target.value ? e.target.value : p.ate,
                );
            }}
          />
        </label>
        <label>
          Até
          <InputData
            type="month"
            aria-label="Competência final"
            value={p.ate}
            min={p.de}
            onChange={(e) => {
              if (e.target.value && e.target.value >= p.de)
                p.onPeriodo(p.de, e.target.value);
            }}
          />
        </label>
        <label>
          Empregador
          <select value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">Todos os empregadores</option>
            {dadosEmp.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome || "Sem vínculo"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Localizar folha ou funcionário
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Empregador ou funcionário"
          />
        </label>
        <Button onClick={() => setRefresh((v) => v + 1)} disabled={busy}>
          Atualizar
        </Button>
      </OperationalFilters>
      {erro && (
        <p role="alert" className={s.error}>
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className={s.notice}>
          {aviso}
          <Button onClick={() => setAviso("")} aria-label="Dispensar aviso">
            ×
          </Button>
        </p>
      )}
      {!!dados?.avisos.length && (
        <details className={s.warnings}>
          <summary>
            Controles que precisam de atualização ({dados.avisos.length})
          </summary>
          {dados.avisos.map((a) => (
            <p key={a}>{a}</p>
          ))}
        </details>
      )}
      {dados && dados.premios.some((pr) => !pr.lancamento_id) && (
        <p className={s.warnings}>
          Há gratificações sem título separado no período. Algumas podem estar
          incluídas no salário; confira os vínculos em Movimentos antes de
          lançá-las no CP.
        </p>
      )}
      {dados && linhas.some((l) => l.linha && !l.linha.cp_lancamento_id) && (
        <p className={s.warnings}>
          Há salários gravados sem vínculo com um título do CP. Abra a folha
          para conferir ou reprocessar. Esses valores não são tratados como
          pagamentos realizados.
        </p>
      )}
      <div className={s.summary}>
        <div>
          <small>TÍTULOS VINCULADOS NO PERÍODO</small>
          <strong>{dados ? moeda(total) : "—"}</strong>
          <span>Salários, encargos e documentos separados vinculados</span>
        </div>
        <div>
          <small>JÁ PAGO</small>
          <strong>{dados ? moeda(pago) : "—"}</strong>
          <span>Inclui as partes de pagamentos parciais</span>
        </div>
        <div>
          <small>SALDO A PAGAR / PREVER</small>
          <strong>{dados ? moeda(saldo) : "—"}</strong>
          <span>Valores reais dos títulos do CP</span>
        </div>
        <div>
          <small>FOLHAS POR EMPREGADOR</small>
          <strong>
            {dados
              ? `${grupos.filter(g => g.folhas.length && g.folhas.every(f => f.status !== "rascunho")).length} / ${grupos.length}`
              : "—"}
          </strong>
          <span>Fechadas / empregadores e competências</span>
        </div>
      </div>
      <div className={s.process}>
        <span>Empregador e competência → Preparação em conjunto → Fechamento da folha → Pagamento no CP</span>
        <Button disabled={busy || !folhasSelecionadas.some(f => f.status === "rascunho")}
          onClick={() => p.onFechar(folhasSelecionadas.filter(f => f.status === "rascunho").map(f => f.id))}>
          Fechar folhas selecionadas
        </Button>
      </div>
      <nav className={s.tabs} aria-label="Áreas do controle da folha">
        {abas.map((a) => (
          <Button
            key={a}
            aria-current={aba === a ? "page" : undefined}
            onClick={() => ir(a)}
          >
            {a}
          </Button>
        ))}
      </nav>
      {loading && (
        <p role="status" className={s.empty}>
          Carregando linhas, vínculos financeiros e conferências…
        </p>
      )}
      {dados && !loading && (aba === "Folhas" || aba === "Conferência") && (
        <section className={s.card}>
          <div className={s.sectionHeading}>
            <div>
              <h2>{aba === "Conferência" ? "Conferência das folhas por empregador" : "Folhas por empregador e competência"}</h2>
              <p>Uma linha por empregador e competência. A preparação e o fechamento abrangem todos os funcionários da folha.</p>
            </div>
            <span className={s.badge}>{grupos.length} folhas</span>
          </div>
          {aba === "Conferência" && <p className={s.note}>A conferência registrada é opcional. Você pode conferir a folha inteira em um clique; não é necessário marcar cada funcionário.</p>}
          <div className={s.tableWrap}>
            <Grid data-op-title="Folhas por empregador">
              <thead><tr>
                <th><input type="checkbox" aria-label="Selecionar todas as folhas" checked={grupos.length > 0 && grupos.every(g => gruposSelecionados.includes(g.id))}
                  onChange={e => setGruposSelecionados(e.target.checked ? grupos.map(g => g.id) : [])} /></th>
                {["Empregador", "Competência", "Funcionários", "Bruto", "Complemento", "Descontos", "Líquido", "Encargos", "Situação", "Ações"].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>{grupos.map(g => {
                const revisados = g.funcionarios.filter(l => l.linha && conferida(l)).length;
                const fechadas = g.folhas.length > 0 && g.folhas.every(f => f.status !== "rascunho");
                return <tr key={g.id}>
                  <td><input type="checkbox" aria-label={`Selecionar ${g.nome} — ${mes(g.competencia)}`} checked={gruposSelecionados.includes(g.id)} onChange={() => marcarGrupo(g.id)} /></td>
                  <td><Button className={s.name} onClick={() => setGrupoAberto(g.id)}>{g.nome || "Sem empregador"}</Button></td>
                  <td>{mes(g.competencia)}</td>
                  <td>{g.gerados}<small>{g.faltantes ? `${g.faltantes} fora da folha` : "Todos incluídos"}</small></td>
                  <td>{moeda(g.bruto)}</td><td>{moeda(g.complemento)}</td><td>{moeda(g.descontos)}</td>
                  <td className={s.amount}>{moeda(g.liquido)}</td><td>{moeda(g.encargos)}</td>
                  <td><span className={fechadas ? s.good : s.badge}>{!g.folhas.length ? "Não gerada" : fechadas ? "Fechada" : "Em preparação"}</span>
                    <small>{g.gerados && revisados === g.gerados ? "Folha conferida" : "Conferência opcional"}</small></td>
                  <td><div className={`${s.actions} ${s.groupActions}`}>
                    <Button disabled={busy} onClick={() => prepararGrupo(g)}>{g.folhas.length ? fechadas ? "Abrir folha" : "Preparar folha" : "Gerar folha"}</Button>
                    <Button onClick={() => setGrupoAberto(g.id)}>Conferir totais e funcionários</Button>
                    {!!g.gerados && <Button disabled={busy || !p.podeConferir || !dados.conferenciaDisponivel || g.faltantes > 0 || revisados === g.gerados} onClick={() => conferirGrupo(g)}>{revisados === g.gerados ? "✓ Folha conferida" : "Marcar folha conferida"}</Button>}
                    {g.folhas.some(f => f.status === "rascunho") && <Button disabled={busy} onClick={() => p.onFechar(g.folhas.filter(f => f.status === "rascunho").map(f => f.id))}>Fechar folha</Button>}
                    {g.folhas.length === 1 && <Button disabled={busy} onClick={() => p.onReplicar(g.folhas[0].id)}>Replicar</Button>}
                  </div></td>
                </tr>;
              })}</tbody>
            </Grid>
          </div>
          {!grupos.length && <p className={s.empty}>Nenhuma folha encontrada. Ajuste o período e o empregador ou gere uma nova folha.</p>}
        </section>
      )}
      {dados && !loading && grupoDetalhado && (aba === "Folhas" || aba === "Conferência") && (
        <section className={s.card}>
          <div className={s.sectionHeading}>
            <div><h2>{grupoDetalhado.nome} · {mes(grupoDetalhado.competencia)}</h2><p>Detalhamento da folha. Edite a grade de preparação para ajustar os funcionários sem abrir um formulário por pessoa.</p></div>
            <div className={s.actions}><Button onClick={() => prepararGrupo(grupoDetalhado)}>Abrir preparação de todos</Button><Button onClick={() => setGrupoAberto(null)}>Fechar detalhamento</Button></div>
          </div>
          {!!grupoDetalhado.faltantes && <p className={s.notice}>{grupoDetalhado.faltantes} funcionário(s) fora da folha. “Abrir preparação de todos” inclui os faltantes para você salvar ou reprocessar em conjunto.</p>}
          {grupoDetalhado.folhas.length > 1 && <div className={s.actions}>{grupoDetalhado.folhas.map(f => <Button key={f.id} onClick={() => p.onAbrir(f.id)}>Abrir registro {f.id.slice(0, 8)}</Button>)}</div>}
          <div className={s.tableWrap}>
            <Grid data-op-title="Pessoas e valores da folha">
              <thead>
                <tr>
                  {[
                    "Funcionário / empregador",
                    "Competência",
                    "Salário líquido",
                    "Gratificação separada",
                    "Adiantamentos",
                    "Saldo no CP",
                    "Processamento",
                    "Financeiro",
                    "",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grupoDetalhado.funcionarios.map((l) => {
                  const ts = documentos(l);
                  const ps = dados.premios.filter(
                    (x) =>
                      x.funcionario_id === l.pessoa?.id &&
                      x.mes_referencia === l.competencia,
                  );
                  const ads = dados.adiantamentos.filter(
                    (x) =>
                      x.funcionario_id === l.pessoa?.id &&
                      x.status !== "cancelado" &&
                      (x.competencia_ref === l.competencia ||
                        (!x.competencia_ref && x.status === "pendente")),
                  );
                  return (
                    <tr key={l.id}>
                      <td>
                        <Button
                          className={s.name}
                          onClick={() => {
                            setAberto(l.id);
                            setDetalhe("extrato");
                          }}
                        >
                          {l.nome}
                        </Button>
                        <small>{l.empregador || "Sem empregador"}</small>
                      </td>
                      <td>{mes(l.competencia)}</td>
                      <td>
                        {l.linha ? moeda(liquidoGravado(l.linha)) : "Sem folha"}
                      </td>
                      <td>
                        {moeda(
                          ps
                            .filter((p) => p.lancamento_id)
                            .reduce((s, p) => s + Number(p.valor), 0),
                        )}
                        {ps.some((p) => !p.lancamento_id) && (
                          <small>Há gratificação sem título separado</small>
                        )}
                      </td>
                      <td>
                        {moeda(ads.reduce((s, a) => s + Number(a.valor), 0))}
                      </td>
                      <td className={s.amount}>
                        {ts.length
                          ? moeda(ts.reduce((v, t) => v + t.saldo, 0))
                          : "Sem vínculo"}
                      </td>
                      <td>
                        <span
                          className={
                            l.folha?.status !== "rascunho" && l.folha
                              ? s.good
                              : s.badge
                          }
                        >
                          {l.folha ? folhaStatus(l.folha) : "Sem folha"}
                        </span>
                        <small>
                          {conferida(l) ? "Revisado" : "A conferir"}
                        </small>
                      </td>
                      <td>{statusFinanceiro(ts)}</td>
                      <td>
                        <Button onClick={() => abrir(l)}>
                          {l.folha ? "Abrir folha" : "Incluir na folha"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Grid>
          </div>
        </section>
      )}
      {dados && !loading && aba === "Conferência" && (
        <details className={s.card} onToggle={e => setRevisaoIndividual(e.currentTarget.open)}><summary>Comparar e revisar funcionários individualmente (opcional)</summary>
          {revisaoIndividual && <>
          <div className={s.sectionHeading}>
            <div>
              <h2>Conferência por funcionário</h2>
              <p>
                Revisões ficam vinculadas aos valores conferidos. Uma alteração
                exige nova revisão.
              </p>
            </div>
            <label className={s.check}>
              <input
                type="checkbox"
                checked={soPendentes}
                onChange={(e) => setSoPendentes(e.target.checked)}
              />
              Só não revisados
            </label>
          </div>
          {linhas
            .filter((l) => !soPendentes || !conferida(l))
            .map((l) => {
              const anterior = dados.linhas.find(
                (x) =>
                  x.funcionario_id === l.pessoa?.id &&
                  porFolha.get(x.folha_id)?.competencia ===
                    mesAnterior(l.competencia),
              );
              const c = conferida(l);
              return (
                <div className={s.reviewRow} key={l.id}>
                  <div>
                    <Button
                      className={s.name}
                      onClick={() => {
                        setAberto(l.id);
                        setDetalhe("composicao");
                      }}
                    >
                      {l.nome}
                    </Button>
                    <small>
                      {l.empregador} · {mes(l.competencia)}
                    </small>
                  </div>
                  <div>
                    <small>Mês anterior</small>
                    <strong>
                      {anterior
                        ? moeda(liquidoGravado(anterior))
                        : "Sem registro"}
                    </strong>
                  </div>
                  <div>
                    <small>Líquido atual</small>
                    <strong>
                      {l.linha ? moeda(liquidoGravado(l.linha)) : "Sem folha"}
                    </strong>
                  </div>
                  <div>
                    <small>Diferença</small>
                    <strong>
                      {anterior && l.linha
                        ? moeda(
                            liquidoGravado(l.linha) - liquidoGravado(anterior),
                          )
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <Button
                      disabled={
                        busy ||
                        !l.linha ||
                        !p.podeConferir ||
                        !dados.conferenciaDisponivel ||
                        !!c
                      }
                      onClick={() => conferir(l)}
                    >
                      {c ? "✓ Revisado" : "Marcar revisado"}
                    </Button>
                    {c && (
                      <small>
                        {c.usuario_nome} · {data(c.created_at)}
                      </small>
                    )}
                  </div>
                </div>
              );
            })}
          {!linhas.length && (
            <p className={s.empty}>
              Gere a folha ou ajuste o período para iniciar a conferência.
            </p>
          )}
          </>}
        </details>
      )}
      {dados && !loading && aba === "Pagamentos" && (
        <section className={s.card}>
          <div className={s.sectionHeading}>
            <div>
              <h2>Obrigações e pagamentos vinculados</h2>
              <p>
                Baixas, borderôs, reprogramação e estornos continuam no Contas a
                Pagar.
              </p>
            </div>
            <Link href="/financeiro/pagar">Abrir Contas a Pagar ↗</Link>
          </div>
          <div className={s.tableWrap}>
            <Grid data-op-title="Pagamentos da folha">
              <thead>
                <tr>
                  {[
                    "Beneficiário / empregador",
                    "Documento",
                    "CP",
                    "Vencimento",
                    "Valor",
                    "Pago",
                    "Saldo",
                    "Situação",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {titulos.map((t) => (
                  <tr key={t.titulo_id}>
                    <td>
                      {porPessoa.get(t.funcionario_id ?? "")?.nome ??
                        "Encargo do empregador"}
                      <small>{dono(t).nome}</small>
                    </td>
                    <td>{t.descricao}</td>
                    <td>{t.numero ?? "—"}</td>
                    <td>{data(t.vencimento)}</td>
                    <td>{moeda(t.valor)}</td>
                    <td>{moeda(t.pago)}</td>
                    <td className={s.amount}>{moeda(t.saldo)}</td>
                    <td>
                      <span
                        className={
                          t.saldo <= 0.005 && !t.ausente ? s.good : s.badge
                        }
                      >
                        {statusFinanceiro([t])}
                      </span>
                      {t.protegido && (
                        <small>
                          Pagamento / borderô / conciliação protegido
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Grid>
          </div>
          {!titulos.length && (
            <p className={s.empty}>
              Nenhum título vinculado ao período selecionado. Nenhum pagamento é
              criado ao consultar esta tela.
            </p>
          )}
        </section>
      )}
      {dados && !loading && aba === "Movimentos" && (
        <section className={s.card}>
          <div className={s.sectionHeading}>
            <div>
              <h2>Movimentos e documentos do funcionário</h2>
              <p>
                Gratificações e adiantamentos mantêm seus lançamentos e vínculos
                próprios.
              </p>
            </div>
            <Button className={s.primary} onClick={() => novoMovimento()}>
              + Movimento individual
            </Button>
          </div>
          <div className={s.tableWrap}>
            <Grid data-op-title="Movimentos da folha">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Competência</th>
                  <th>Movimento</th>
                  <th>Valor</th>
                  <th>Destino</th>
                </tr>
              </thead>
              <tbody>
                {linhas.flatMap((l) =>
                  l.linha
                    ? [
                        {
                          nome: "Horas extras / DSR",
                          valor:
                            Number(l.linha.he_valor ?? 0) +
                            Number(l.linha.he_dsr ?? 0),
                        },
                        {
                          nome: "Complemento salarial",
                          valor: Number(l.linha.complemento_salarial ?? 0),
                        },
                        {
                          nome: "Benefícios",
                          valor:
                            Number(l.linha.vale_transporte ?? 0) +
                            Number(l.linha.vale_refeicao ?? 0) +
                            Number(l.linha.outros_beneficios ?? 0),
                        },
                        {
                          nome: `Outros descontos${l.linha.desc_outros_descontos ? ` · ${l.linha.desc_outros_descontos}` : ""}`,
                          valor: Number(l.linha.outros_descontos ?? 0),
                        },
                        {
                          nome: "Gratificação incluída no salário (histórico)",
                          valor: Number(l.linha.gratificacao ?? 0),
                        },
                      ]
                        .filter((m) => m.valor)
                        .map((m) => (
                          <tr key={`${l.id}:${m.nome}`}>
                            <td>{l.nome}</td>
                            <td>{mes(l.competencia)}</td>
                            <td>{m.nome}</td>
                            <td>{moeda(m.valor)}</td>
                            <td>Composição do salário</td>
                          </tr>
                        ))
                    : [],
                )}
                {titulos
                  .filter((t) => !["salario", "encargo"].includes(t.grupo))
                  .map((t) => (
                    <tr key={t.titulo_id}>
                      <td>
                        {porPessoa.get(t.funcionario_id ?? "")?.nome ??
                          "Funcionário"}
                      </td>
                      <td>{mes(t.competencia)}</td>
                      <td>{t.descricao}</td>
                      <td>{moeda(t.valor)}</td>
                      <td>
                        CP nº {t.numero ?? "—"} · {statusFinanceiro([t])}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </Grid>
          </div>
          <div className={s.note}>
            Os detalhes e as ações de correção, edição, cancelamento e
            lançamento dos registros antigos estão nas rotinas abaixo.
          </div>
        </section>
      )}
      {dados && !loading && aba === "Histórico" && (
        <section className={s.card}>
          <div className={s.sectionHeading}>
            <div>
              <h2>Histórico e responsáveis</h2>
              <p>Reprocessamentos, correções e versões conferidas da folha.</p>
            </div>
          </div>
          <div className={s.history}>
            {[
              ...historico.map((h) => ({
                id: h.id,
                nome: h.acao,
                usuario: h.usuario_nome,
                quando: h.created_at,
                folha: h.folha_id,
                detalhe: descreverAlteracoes(h.alteracoes),
              })),
              ...dados.conferencias
                .filter((c) => {
                  const f = porFolha.get(c.folha_id);
                  return (
                    f &&
                    f.competencia >= p.de &&
                    f.competencia <= p.ate &&
                    (!emp || p.empregador(f).chave === emp)
                  );
                })
                .map((c) => ({
                  id: c.id,
                  nome: `Conferência · ${porPessoa.get(c.funcionario_id ?? "")?.nome ?? "funcionário"}`,
                  usuario: c.usuario_nome,
                  quando: c.created_at,
                  folha: c.folha_id,
                  detalhe: "Versão dos valores revisada e registrada.",
                })),
            ]
              .sort((a, b) =>
                String(b.quando ?? "").localeCompare(String(a.quando ?? "")),
              )
              .map((h) => (
                <div key={h.id}>
                  <span className={s.historyDot} />
                  <div>
                    <strong>{h.nome}</strong>
                    <small>
                      {h.usuario || "Usuário não informado"} · {data(h.quando)}{" "}
                      · {mes(porFolha.get(h.folha)?.competencia ?? p.de)}
                    </small>
                    <details>
                      <summary>Detalhes do registro</summary>
                      <pre>{h.detalhe}</pre>
                    </details>
                  </div>
                </div>
              ))}
            {!historico.length && !dados.conferencias.length && (
              <p className={s.empty}>
                Ainda não há reprocessamentos ou conferências registrados neste
                período.
              </p>
            )}
          </div>
        </section>
      )}
      {aba === "13º salário" && (
        <p className={s.note}>
          O 13º é um controle anual. Selecione o ano na rotina abaixo; o resumo
          superior continua considerando o período da folha informado nos
          filtros.
        </p>
      )}
      {aba === "Folhas" && <details className={s.existing} onToggle={e => setGestao(e.currentTarget.open)}><summary>Outras ações da folha: excluir, reabrir e manutenção</summary>{gestao && p.children}</details>}
      {(aba === "Movimentos" || aba === "13º salário" || !!erro) && (
        <section className={s.existing}>
          <div className={s.actions}>
            {aba === "Movimentos" && (
              <>
                <Button
                  aria-pressed={p.abaLegada === "adiantamentos"}
                  onClick={() => p.onAbaLegada("adiantamentos")}
                >
                  Gerenciar adiantamentos
                </Button>
                <Button
                  aria-pressed={p.abaLegada === "gratificacoes"}
                  onClick={() => p.onAbaLegada("gratificacoes")}
                >
                  Gerenciar gratificações
                </Button>
              </>
            )}
          </div>
          {p.children}
        </section>
      )}
      {selecionada && (
        <Painel titulo={selecionada.nome} fechar={() => setAberto(null)}>
          <div className={s.drawerBody}>
            <p>
              {selecionada.empregador} · {mes(selecionada.competencia)}
            </p>
            <div className={s.personTotal}>
              <small>SALDO VINCULADO AO FUNCIONÁRIO</small>
              <strong>
                {moeda(
                  documentos(selecionada).reduce((v, t) => v + t.saldo, 0),
                )}
              </strong>
            </div>
            <nav className={s.tabs}>
              {(["extrato", "composicao", "historico"] as const).map((a) => (
                <Button
                  key={a}
                  aria-current={detalhe === a ? "page" : undefined}
                  onClick={() => setDetalhe(a)}
                >
                  {a === "composicao"
                    ? "Composição"
                    : a === "historico"
                      ? "Histórico"
                      : "Extrato"}
                </Button>
              ))}
            </nav>
            {detalhe === "extrato" &&
              documentos(selecionada).map((t) => (
                <div key={t.titulo_id} className={s.statement}>
                  <div>
                    <strong>{t.descricao}</strong>
                    <small>
                      CP nº {t.numero ?? "—"} · {data(t.vencimento)} ·{" "}
                      {statusFinanceiro([t])}
                    </small>
                  </div>
                  <div>
                    <strong>{moeda(t.valor)}</strong>
                    <small>
                      Pago: {moeda(t.pago)} · Saldo: {moeda(t.saldo)}
                    </small>
                  </div>
                </div>
              ))}
            {detalhe === "composicao" &&
              (selecionada.linha ? (
                <>
                  {Object.entries({
                    "Salário bruto": selecionada.linha.salario_bruto,
                    Complemento: selecionada.linha.complemento_salarial,
                    "INSS trabalhador": selecionada.linha.inss_trabalhador,
                    IRRF: selecionada.linha.irrf,
                    "Adiantamentos descontados no salário":
                      selecionada.linha.adiantamento,
                    "Outros descontos": selecionada.linha.outros_descontos,
                    "Vale transporte": selecionada.linha.vale_transporte,
                    "Vale refeição": selecionada.linha.vale_refeicao,
                    "Outros benefícios": selecionada.linha.outros_beneficios,
                    FGTS: selecionada.linha.fgts,
                    "INSS patronal": selecionada.linha.inss_patronal,
                  }).map(([nome, valor]) => (
                    <div className={s.statement} key={nome}>
                      <span>{nome}</span>
                      <strong>{moeda(Number(valor ?? 0))}</strong>
                    </div>
                  ))}
                  <div className={s.statement}>
                    <strong>Salário líquido gravado</strong>
                    <strong>{moeda(liquidoGravado(selecionada.linha))}</strong>
                  </div>
                  <p className={s.note}>
                    FGTS e INSS patronal são obrigações do empregador.
                    Gratificações em título separado não são somadas novamente
                    ao salário.
                  </p>
                </>
              ) : (
                <p>Funcionário ainda sem folha nesta competência.</p>
              ))}
            {detalhe === "historico" && (
              <>
                {historico
                  .filter((h) => h.folha_id === selecionada.folha?.id)
                  .map((h) => (
                    <div className={s.statement} key={h.id}>
                      <strong>{h.acao}</strong>
                      <span>
                        {h.usuario_nome} · {data(h.created_at)}
                      </span>
                    </div>
                  ))}
                {dados?.conferencias
                  .filter((c) => c.linha_id === selecionada.linha?.id)
                  .map((c) => (
                    <div className={s.statement} key={c.id}>
                      <strong>Conferência registrada</strong>
                      <span>
                        {c.usuario_nome} · {data(c.created_at)}
                      </span>
                    </div>
                  ))}
              </>
            )}
            <div className={s.actions}>
              <Button className={s.primary} onClick={() => abrir(selecionada)}>
                {selecionada.folha
                  ? "Abrir folha / reprocessar"
                  : "Criar folha"}
              </Button>
              <Button onClick={() => novoMovimento(selecionada)}>
                + Movimento
              </Button>
              <Link href="/financeiro/pagar">Ir ao CP ↗</Link>
            </div>
          </div>
        </Painel>
      )}
      {novo && (
        <Painel titulo="Novo movimento" fechar={() => setNovo(false)} amplo>
          <div className={s.form}>
            <div
              className={s.movementTabs}
              role="tablist"
              aria-label="Tipo de movimento"
            >
              {tipos.map(([t, label]) => (
                <Button
                  role="tab"
                  type="button"
                  key={t}
                  aria-selected={tipo === t}
                  tabIndex={tipo === t ? 0 : -1}
                  onKeyDown={(e) => {
                    const indice = tipos.findIndex((v) => v[0] === t);
                    const destino =
                      e.key === "ArrowRight"
                        ? (indice + 1) % tipos.length
                        : e.key === "ArrowLeft"
                          ? (indice - 1 + tipos.length) % tipos.length
                          : e.key === "Home"
                            ? 0
                            : e.key === "End"
                              ? tipos.length - 1
                              : -1;
                    if (destino < 0) return;
                    e.preventDefault();
                    const proximo = tipos[destino][0];
                    setTipo(proximo);
                    document
                      .getElementById(`movimento-real-${proximo}`)
                      ?.focus();
                  }}
                  aria-controls="movimento-real-painel"
                  id={`movimento-real-${t}`}
                  onClick={() => setTipo(t)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div
              role="tabpanel"
              id="movimento-real-painel"
              aria-labelledby={`movimento-real-${tipo}`}
              className={s.formFields}
            >
              <label>
                Funcionário
                <select
                  value={funcId}
                  onChange={(e) => setFuncId(e.target.value)}
                >
                  <option value="">Selecionar funcionário</option>
                  {dados?.funcionarios
                    .filter((f) => f.ativo !== false)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                        {f.ativo === false ? " · desligado" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Competência
                <input
                  type="month"
                  value={compMov}
                  onChange={(e) => setCompMov(e.target.value)}
                />
              </label>
              <p className={s.note}>
                {tipo === "gratificacao"
                  ? "A gratificação será lançada no formulário real, com título separado no CP e seus adiantamentos próprios."
                  : tipo.startsWith("adiantamento")
                    ? "Informe os dados e a conta bancária na rotina de adiantamento. O desconto e a baixa seguem as regras existentes."
                    : ["ferias", "rescisao", "beneficio"].includes(tipo)
                      ? "Esta rotina usa o cadastro do funcionário, mantendo os cálculos, períodos e regras atuais."
                      : tipo.startsWith("decimo")
                        ? "O controle anual mantém avos, base, parcelas e proteção dos pagamentos já realizados."
                        : "Horas extras e descontos podem ser ajustados na grade de todos os funcionários do empregador. Folhas fechadas seguem pela prévia de reprocessamento e títulos já pagos permanecem protegidos."}
              </p>
              <footer className={s.actions}>
                <Button onClick={() => setNovo(false)}>Cancelar</Button>
                {["ferias", "rescisao", "beneficio"].includes(tipo) ? (
                  <Link
                    className={s.primaryLink}
                    href="/cadastros?tab=funcionarios"
                  >
                    Abrir cadastro de funcionários ↗
                  </Link>
                ) : (
                  <Button
                    disabled={
                      !funcId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(compMov)
                    }
                    className={s.primary}
                    onClick={() => {
                      setNovo(false);
                      if (tipo.startsWith("decimo")) {
                        setAba("13º salário");
                        p.onAbaLegada("decimo");
                      } else p.onMovimento(tipo, funcId, compMov);
                    }}
                  >
                    Continuar para {tipos.find((t) => t[0] === tipo)?.[1]}
                  </Button>
                )}
              </footer>
            </div>
          </div>
        </Painel>
      )}
    </section>
  );
}
