"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { listarAnosSafra } from "../../../lib/db";
import type { AnoSafra, Ciclo } from "../../../lib/supabase";

// ── tipos locais ──────────────────────────────────────────
type Prioridade   = "urgente" | "normal" | "baixa";
type StatusTarefa = "pendente" | "em_andamento" | "concluida" | "cancelada";
type TipoTarefa   = "plantio" | "pulverizacao" | "adubacao" | "correcao_solo" | "colheita" | "visita_tecnica" | "compra_insumo" | "manutencao" | "outro";
type TipoRec      = "fungicida" | "herbicida" | "inseticida" | "adubacao" | "correcao_solo" | "irrigacao" | "outro";
type StatusRec    = "pendente" | "aplicada" | "ignorada";

type CatOrc = "sementes" | "fertilizantes" | "defensivos" | "correcao_solo" | "operacoes" | "arrendamento" | "outros";

interface Tarefa {
  id: string; fazenda_id: string; ciclo_id?: string | null;
  titulo: string; descricao?: string | null; tipo: TipoTarefa;
  data_prevista?: string | null; data_conclusao?: string | null;
  responsavel?: string | null; prioridade: Prioridade;
  status: StatusTarefa; observacoes?: string | null; created_at?: string;
}
interface Recomendacao {
  id: string; fazenda_id: string; ciclo_id?: string | null;
  titulo: string; descricao?: string | null; tipo: TipoRec;
  estadio_fenologico?: string | null; data_recomendacao?: string | null;
  responsavel_tecnico?: string | null; prioridade: Prioridade;
  status: StatusRec; created_at?: string;
}
interface Orcamento {
  id: string; fazenda_id: string; ciclo_id: string;
  nome: string; status: "rascunho" | "aprovado" | "encerrado";
  area_ha?: number | null; produtividade_esperada?: number | null;
  preco_esperado_sc?: number | null; created_at?: string;
}
interface OrcamentoItem {
  id: string; orcamento_id: string; fazenda_id: string;
  categoria: CatOrc; subcategoria?: string | null;
  descricao: string; insumo_id?: string | null;
  quantidade?: number | null; unidade?: string | null;
  valor_unitario?: number | null; valor_total?: number | null;
  created_at?: string;
}

// ── helpers ───────────────────────────────────────────────
const fmtData = (s?: string | null) => s ? s.split("-").reverse().join("/") : "—";
const fmtR = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtN = (v: number, dec = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const hoje = () => new Date().toISOString().slice(0, 10);
const diasAte = (iso?: string | null) => {
  if (!iso) return null;
  return Math.round((new Date(iso + "T12:00:00").getTime() - new Date().getTime()) / 86400000);
};

// ── estilos ───────────────────────────────────────────────
const inp: React.CSSProperties  = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties  = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };
const btnE: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#666" };

const PRIORIDADE: Record<Prioridade, { label: string; bg: string; color: string }> = {
  urgente: { label: "Urgente", bg: "#FCEBEB",  color: "#791F1F" },
  normal:  { label: "Normal",  bg: "#EBF3FC",  color: "#0C447C" },
  baixa:   { label: "Baixa",   bg: "#F4F6FA",  color: "#555"    },
};
const STATUS_TAREFA: Record<StatusTarefa, { label: string; bg: string; color: string }> = {
  pendente:     { label: "Pendente",     bg: "#FBF3E0", color: "#7A5A12" },
  em_andamento: { label: "Em andamento", bg: "#EBF3FC", color: "#0C447C" },
  concluida:    { label: "Concluída",    bg: "#ECFDF5", color: "#14532D" },
  cancelada:    { label: "Cancelada",    bg: "#F4F6FA", color: "#888"    },
};
const STATUS_REC: Record<StatusRec, { label: string; bg: string; color: string }> = {
  pendente: { label: "Pendente", bg: "#FBF3E0", color: "#7A5A12" },
  aplicada: { label: "Aplicada", bg: "#ECFDF5", color: "#14532D" },
  ignorada: { label: "Ignorada", bg: "#F4F6FA", color: "#888"    },
};
const CAT_ORC: { value: CatOrc; label: string; cor: string }[] = [
  { value: "sementes",      label: "Sementes",             cor: "#14532D" },
  { value: "fertilizantes", label: "Fertilizantes",        cor: "#1A5C38" },
  { value: "defensivos",    label: "Defensivos",           cor: "#0C447C" },
  { value: "correcao_solo", label: "Correção de Solo",     cor: "#7C5F2A" },
  { value: "operacoes",     label: "Operações / Máquinas", cor: "#555"    },
  { value: "arrendamento",  label: "Arrendamento",         cor: "#6B3FAD" },
  { value: "outros",        label: "Outros",               cor: "#888"    },
];
const TIPOS_TAREFA: { value: TipoTarefa; label: string }[] = [
  { value: "correcao_solo",  label: "Correção de Solo"  },
  { value: "adubacao",       label: "Adubação"          },
  { value: "plantio",        label: "Plantio"           },
  { value: "pulverizacao",   label: "Pulverização"      },
  { value: "colheita",       label: "Colheita"          },
  { value: "visita_tecnica", label: "Visita Técnica"    },
  { value: "compra_insumo",  label: "Compra de Insumo"  },
  { value: "manutencao",     label: "Manutenção"        },
  { value: "outro",          label: "Outro"             },
];
const TIPOS_TAREFA_ICON: Record<TipoTarefa, string> = {
  correcao_solo: "◑", adubacao: "◍", plantio: "◉", pulverizacao: "◎",
  colheita: "◈", visita_tecnica: "◇", compra_insumo: "◻", manutencao: "◆", outro: "○",
};
const TIPOS_TAREFA_COLOR: Record<TipoTarefa, string> = {
  correcao_solo: "#7C5F2A", adubacao: "#1A5C38", plantio: "#14532D", pulverizacao: "#0C447C",
  colheita: "#C9921B", visita_tecnica: "#6B3FAD", compra_insumo: "#555", manutencao: "#C0392B", outro: "#888",
};
const TIPOS_REC: { value: TipoRec; label: string }[] = [
  { value: "fungicida",     label: "Fungicida"       },
  { value: "herbicida",     label: "Herbicida"       },
  { value: "inseticida",    label: "Inseticida"      },
  { value: "adubacao",      label: "Adubação"        },
  { value: "correcao_solo", label: "Correção de Solo"},
  { value: "irrigacao",     label: "Irrigação"       },
  { value: "outro",         label: "Outro"           },
];

// ── modal genérico ─────────────────────────────────────────
function Modal({ titulo, subtitulo, onClose, width = 640, children }: {
  titulo: string; subtitulo?: string; onClose: () => void; width?: number; children: React.ReactNode;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 14, padding: 26, width, maxWidth: "94vw", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: "#1a1a1a", marginBottom: subtitulo ? 2 : 18 }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: 12, color: "#555", marginBottom: 18 }}>{subtitulo}</div>}
        {children}
      </div>
    </div>
  );
}
function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return <span style={{ background: bg, color, borderRadius: 5, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>;
}
function BadgePrazo({ data }: { data?: string | null }) {
  const d = diasAte(data);
  if (d === null) return null;
  if (d < 0)   return <span style={{ background: "#FCEBEB", color: "#791F1F", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>Atrasada {Math.abs(d)}d</span>;
  if (d === 0) return <span style={{ background: "#FCEBEB", color: "#791F1F", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>Hoje</span>;
  if (d <= 3)  return <span style={{ background: "#FBF3E0", color: "#7A5A12", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>em {d}d</span>;
  return null;
}

// ── DB helpers ─────────────────────────────────────────────
async function listarTarefas(fid: string): Promise<Tarefa[]> {
  const { data, error } = await supabase.from("planejamento_tarefas").select("*").eq("fazenda_id", fid).order("data_prevista");
  if (error) throw error; return data ?? [];
}
async function criarTarefa(t: Omit<Tarefa, "id" | "created_at">): Promise<Tarefa> {
  const { data, error } = await supabase.from("planejamento_tarefas").insert(t).select().single();
  if (error) throw error; return data;
}
async function atualizarTarefa(id: string, patch: Partial<Tarefa>): Promise<void> {
  const { error } = await supabase.from("planejamento_tarefas").update(patch).eq("id", id);
  if (error) throw error;
}
async function excluirTarefa(id: string): Promise<void> {
  const { error } = await supabase.from("planejamento_tarefas").delete().eq("id", id);
  if (error) throw error;
}
async function listarRecomendacoes(fid: string): Promise<Recomendacao[]> {
  const { data, error } = await supabase.from("recomendacoes_tecnicas").select("*").eq("fazenda_id", fid).order("data_recomendacao", { ascending: false });
  if (error) throw error; return data ?? [];
}
async function criarRecomendacao(r: Omit<Recomendacao, "id" | "created_at">): Promise<Recomendacao> {
  const { data, error } = await supabase.from("recomendacoes_tecnicas").insert(r).select().single();
  if (error) throw error; return data;
}
async function atualizarRecomendacao(id: string, patch: Partial<Recomendacao>): Promise<void> {
  const { error } = await supabase.from("recomendacoes_tecnicas").update(patch).eq("id", id);
  if (error) throw error;
}
async function excluirRecomendacao(id: string): Promise<void> {
  const { error } = await supabase.from("recomendacoes_tecnicas").delete().eq("id", id);
  if (error) throw error;
}

// ── componente principal ───────────────────────────────────
type Aba = "orcamento" | "comparativo" | "agenda" | "recomendacoes";

export default function Planejamento() {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<Aba>("orcamento");

  // dados base
  const [tarefas,       setTarefas]       = useState<Tarefa[]>([]);
  const [recomendacoes, setRecomendacoes] = useState<Recomendacao[]>([]);
  const [anosSafra,     setAnosSafra]     = useState<AnoSafra[]>([]);
  const [ciclos,        setCiclos]        = useState<Ciclo[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [salvando,      setSalvando]      = useState(false);
  const [erroInit,      setErroInit]      = useState("");

  // seleção orcamento / comparativo
  const [anoSelOrc, setAnoSelOrc] = useState("");
  const [cicloSelOrc, setCicloSelOrc] = useState("");

  // dados orcamento
  const [orcamento,      setOrcamento]      = useState<Orcamento | null>(null);
  const [orcItens,       setOrcItens]       = useState<OrcamentoItem[]>([]);
  const [loadingOrc,     setLoadingOrc]     = useState(false);

  // comparativo (realizado)
  const [realizado, setRealizado] = useState<Record<CatOrc, number>>({
    sementes: 0, fertilizantes: 0, defensivos: 0, correcao_solo: 0, operacoes: 0, arrendamento: 0, outros: 0,
  });
  const [loadingComp, setLoadingComp] = useState(false);

  // modal orçamento - header
  const [modalOrcHeader, setModalOrcHeader] = useState(false);
  const initOH = () => ({ nome: "Orçamento Safra", area_ha: "", produtividade_esperada: "", preco_esperado_sc: "" });
  const [fOH, setFOH] = useState(initOH());

  // modal item orçamento
  const [modalOrcItem, setModalOrcItem] = useState(false);
  const [editOrcItem,  setEditOrcItem]  = useState<OrcamentoItem | null>(null);
  const initOI = (): { categoria: CatOrc; subcategoria: string; descricao: string; quantidade: string; unidade: string; valor_unitario: string } => ({
    categoria: "sementes", subcategoria: "", descricao: "", quantidade: "", unidade: "kg", valor_unitario: "",
  });
  const [fOI, setFOI] = useState(initOI());

  // filtros agenda
  const [filtroStatus,    setFiltroStatus]    = useState<"todos" | StatusTarefa>("todos");
  const [filtroCicloAg,   setFiltroCicloAg]   = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState<Prioridade | "todos">("todos");

  // modais tarefa / rec
  const [modalTarefa, setModalTarefa] = useState(false);
  const [editTarefa,  setEditTarefa]  = useState<Tarefa | null>(null);
  const initFT = () => ({ titulo: "", descricao: "", tipo: "outro" as TipoTarefa, data_prevista: "", responsavel: "", prioridade: "normal" as Prioridade, status: "pendente" as StatusTarefa, observacoes: "", ciclo_id: "" });
  const [fT, setFT] = useState(initFT());
  const [modalRec, setModalRec] = useState(false);
  const [editRec,  setEditRec]  = useState<Recomendacao | null>(null);
  const initFR = () => ({ titulo: "", descricao: "", tipo: "outro" as TipoRec, estadio_fenologico: "", data_recomendacao: hoje(), responsavel_tecnico: "", prioridade: "normal" as Prioridade, status: "pendente" as StatusRec, ciclo_id: "" });
  const [fR, setFR] = useState(initFR());

  // ── carregar dados base ─────────────────────────────────
  useEffect(() => {
    if (!fazendaId) return;
    setLoading(true);
    Promise.all([
      listarTarefas(fazendaId).catch(() => [] as Tarefa[]),
      listarRecomendacoes(fazendaId).catch(() => [] as Recomendacao[]),
      listarAnosSafra(fazendaId).catch(() => [] as AnoSafra[]),
      supabase.from("ciclos").select("*").eq("fazenda_id", fazendaId).order("created_at").then(r => (r.data ?? []) as Ciclo[]),
    ])
    .then(([t, rec, anos, cic]) => {
      setTarefas(t); setRecomendacoes(rec);
      setAnosSafra(anos); setCiclos(cic);
    })
    .catch(e => setErroInit((e as { message?: string })?.message ?? "Erro ao carregar"))
    .finally(() => setLoading(false));
  }, [fazendaId]);

  // ── ciclos filtrados pelo ano selecionado ───────────────
  const ciclosFiltrados = anoSelOrc ? ciclos.filter(c => c.ano_safra_id === anoSelOrc) : ciclos;

  // ── label ciclo ─────────────────────────────────────────
  function labelCiclo(ciclo_id?: string | null) {
    if (!ciclo_id) return "";
    const c = ciclos.find(x => x.id === ciclo_id);
    if (!c) return ciclo_id;
    const ano = anosSafra.find(a => a.id === c.ano_safra_id);
    return `${c.descricao || c.cultura}${ano ? " · " + ano.descricao : ""}`;
  }

  // ── carregar orçamento ao mudar ciclo ───────────────────
  useEffect(() => {
    if (!cicloSelOrc || !fazendaId) { setOrcamento(null); setOrcItens([]); return; }
    setLoadingOrc(true);
    supabase.from("orcamentos").select("*").eq("fazenda_id", fazendaId).eq("ciclo_id", cicloSelOrc).maybeSingle()
      .then(async ({ data }) => {
        setOrcamento(data as Orcamento | null);
        if (data) {
          const r = await supabase.from("orcamento_itens").select("*").eq("orcamento_id", (data as Orcamento).id).order("categoria").order("created_at");
          setOrcItens((r.data ?? []) as OrcamentoItem[]);
        } else {
          setOrcItens([]);
        }
        setLoadingOrc(false);
      });
  }, [cicloSelOrc, fazendaId]);

  // ── carregar realizado ao mudar ciclo (comparativo) ─────
  useEffect(() => {
    if (!cicloSelOrc || (aba !== "comparativo")) return;
    setLoadingComp(true);
    Promise.all([
      supabase.from("plantios").select("custo_sementes").eq("ciclo_id", cicloSelOrc),
      supabase.from("adubacoes_base").select("custo_total").eq("ciclo_id", cicloSelOrc),
      supabase.from("pulverizacoes").select("custo_total").eq("ciclo_id", cicloSelOrc),
      supabase.from("correcoes_solo").select("custo_total").eq("ciclo_id", cicloSelOrc),
    ]).then(([pR, adR, pulR, csR]) => {
      const sum = (arr: { custo_total?: number | null; custo_sementes?: number | null }[] | null, key: string) =>
        (arr ?? []).reduce((s, x) => s + (Number((x as Record<string,unknown>)[key]) || 0), 0);
      setRealizado({
        sementes:      sum(pR.data, "custo_sementes"),
        fertilizantes: sum(adR.data, "custo_total"),
        defensivos:    sum(pulR.data, "custo_total"),
        correcao_solo: sum(csR.data, "custo_total"),
        operacoes: 0, arrendamento: 0, outros: 0,
      });
    }).finally(() => setLoadingComp(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cicloSelOrc, aba]);

  // ── criar / editar orçamento (header) ──────────────────
  async function salvarOrcamentoHeader() {
    if (!fazendaId || !cicloSelOrc) return;
    setSalvando(true);
    try {
      const ciclo = ciclos.find(c => c.id === cicloSelOrc);
      const payload = {
        fazenda_id: fazendaId, ciclo_id: cicloSelOrc,
        nome: fOH.nome || `Orçamento ${ciclo?.descricao ?? ""}`,
        status: "rascunho" as const,
        area_ha: fOH.area_ha ? parseFloat(fOH.area_ha) : null,
        produtividade_esperada: fOH.produtividade_esperada ? parseFloat(fOH.produtividade_esperada) : null,
        preco_esperado_sc: fOH.preco_esperado_sc ? parseFloat(fOH.preco_esperado_sc) : null,
      };
      if (orcamento) {
        await supabase.from("orcamentos").update(payload).eq("id", orcamento.id);
        setOrcamento(o => o ? { ...o, ...payload } : o);
      } else {
        const { data } = await supabase.from("orcamentos").insert(payload).select().single();
        setOrcamento(data as Orcamento);
      }
      setModalOrcHeader(false);
    } catch (e) { alert((e as { message?: string })?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  // ── salvar item de orçamento ────────────────────────────
  async function salvarOrcItem() {
    if (!orcamento || !fazendaId) return;
    setSalvando(true);
    try {
      const qtd = parseFloat(fOI.quantidade) || null;
      const vUnit = parseFloat(fOI.valor_unitario) || null;
      const total = qtd && vUnit ? parseFloat((qtd * vUnit).toFixed(2)) : null;
      const payload = {
        orcamento_id: orcamento.id, fazenda_id: fazendaId,
        categoria: fOI.categoria,
        subcategoria: fOI.subcategoria || null,
        descricao: fOI.descricao.trim(),
        quantidade: qtd, unidade: fOI.unidade || null,
        valor_unitario: vUnit, valor_total: total,
      };
      if (editOrcItem) {
        const { data } = await supabase.from("orcamento_itens").update(payload).eq("id", editOrcItem.id).select().single();
        setOrcItens(x => x.map(i => i.id === editOrcItem.id ? data as OrcamentoItem : i));
      } else {
        const { data } = await supabase.from("orcamento_itens").insert(payload).select().single();
        setOrcItens(x => [...x, data as OrcamentoItem]);
      }
      setModalOrcItem(false); setEditOrcItem(null); setFOI(initOI());
    } catch (e) { alert((e as { message?: string })?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }

  async function excluirOrcItem(id: string) {
    if (!confirm("Excluir item?")) return;
    await supabase.from("orcamento_itens").delete().eq("id", id);
    setOrcItens(x => x.filter(i => i.id !== id));
  }

  // ── helpers tarefa / recomendação ──────────────────────
  async function salvarTarefa() {
    if (!fazendaId || !fT.titulo.trim()) return;
    setSalvando(true);
    try {
      const payload = { fazenda_id: fazendaId, ciclo_id: fT.ciclo_id || null, titulo: fT.titulo.trim(), descricao: fT.descricao || null, tipo: fT.tipo, data_prevista: fT.data_prevista || null, responsavel: fT.responsavel || null, prioridade: fT.prioridade, status: fT.status, observacoes: fT.observacoes || null, data_conclusao: null as string | null };
      if (editTarefa) {
        await atualizarTarefa(editTarefa.id, payload);
        setTarefas(p => p.map(t => t.id === editTarefa.id ? { ...t, ...payload } : t));
      } else {
        const c = await criarTarefa(payload);
        setTarefas(p => [...p, c].sort((a, b) => (a.data_prevista ?? "9") < (b.data_prevista ?? "9") ? -1 : 1));
      }
      setModalTarefa(false); setEditTarefa(null); setFT(initFT());
    } catch (e) { alert((e as { message?: string })?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }
  async function concluirTarefa(t: Tarefa) {
    await atualizarTarefa(t.id, { status: "concluida", data_conclusao: hoje() });
    setTarefas(p => p.map(x => x.id === t.id ? { ...x, status: "concluida", data_conclusao: hoje() } : x));
  }
  async function removerTarefa(id: string) {
    if (!confirm("Excluir tarefa?")) return;
    await excluirTarefa(id); setTarefas(p => p.filter(t => t.id !== id));
  }
  function abrirEditarTarefa(t: Tarefa) {
    setEditTarefa(t);
    setFT({ titulo: t.titulo, descricao: t.descricao ?? "", tipo: t.tipo, data_prevista: t.data_prevista ?? "", responsavel: t.responsavel ?? "", prioridade: t.prioridade, status: t.status, observacoes: t.observacoes ?? "", ciclo_id: t.ciclo_id ?? "" });
    setModalTarefa(true);
  }
  async function salvarRecomendacao() {
    if (!fazendaId || !fR.titulo.trim()) return;
    setSalvando(true);
    try {
      const payload = { fazenda_id: fazendaId, ciclo_id: fR.ciclo_id || null, titulo: fR.titulo.trim(), descricao: fR.descricao || null, tipo: fR.tipo, estadio_fenologico: fR.estadio_fenologico || null, data_recomendacao: fR.data_recomendacao || null, responsavel_tecnico: fR.responsavel_tecnico || null, prioridade: fR.prioridade, status: fR.status };
      if (editRec) {
        await atualizarRecomendacao(editRec.id, payload);
        setRecomendacoes(p => p.map(r => r.id === editRec.id ? { ...r, ...payload } : r));
      } else {
        const c = await criarRecomendacao(payload);
        setRecomendacoes(p => [c, ...p]);
      }
      setModalRec(false); setEditRec(null); setFR(initFR());
    } catch (e) { alert((e as { message?: string })?.message ?? "Erro"); }
    finally { setSalvando(false); }
  }
  async function aplicarRecomendacao(r: Recomendacao) {
    await atualizarRecomendacao(r.id, { status: "aplicada" });
    setRecomendacoes(p => p.map(x => x.id === r.id ? { ...x, status: "aplicada" } : x));
  }

  // ── stats agenda ─────────────────────────────────────────
  const pendentes  = tarefas.filter(t => t.status === "pendente").length;
  const atrasadas  = tarefas.filter(t => t.status !== "concluida" && t.status !== "cancelada" && (diasAte(t.data_prevista) ?? 1) < 0).length;
  const concluidas = tarefas.filter(t => t.status === "concluida").length;
  const recPend    = recomendacoes.filter(r => r.status === "pendente").length;

  const tarefasFiltradas = tarefas.filter(t => {
    if (filtroStatus !== "todos" && t.status !== filtroStatus) return false;
    if (filtroCicloAg && t.ciclo_id !== filtroCicloAg) return false;
    if (filtroPrioridade !== "todos" && t.prioridade !== filtroPrioridade) return false;
    return true;
  });

  // ── cálculos orçamento ───────────────────────────────────
  const totalOrc = orcItens.reduce((s, i) => s + (i.valor_total ?? 0), 0);
  const areaHa   = orcamento?.area_ha ?? 0;
  const custHa   = areaHa > 0 ? totalOrc / areaHa : 0;
  const prodEsp  = orcamento?.produtividade_esperada ?? 0;
  const precEsp  = orcamento?.preco_esperado_sc ?? 0;
  const recBruta = areaHa > 0 && prodEsp > 0 && precEsp > 0 ? areaHa * prodEsp * precEsp : 0;
  const margem   = recBruta > 0 ? recBruta - totalOrc : 0;

  // ── cálculos comparativo ─────────────────────────────────
  const planejadoPorCat: Record<CatOrc, number> = { sementes: 0, fertilizantes: 0, defensivos: 0, correcao_solo: 0, operacoes: 0, arrendamento: 0, outros: 0 };
  for (const it of orcItens) planejadoPorCat[it.categoria] = (planejadoPorCat[it.categoria] || 0) + (it.valor_total ?? 0);
  const totalPlanejado = Object.values(planejadoPorCat).reduce((s, v) => s + v, 0);
  const totalRealizado = Object.values(realizado).reduce((s, v) => s + v, 0);

  // ── render ─────────────────────────────────────────────
  const ABAS: { key: Aba; label: string }[] = [
    { key: "orcamento",      label: "Orçamento"               },
    { key: "comparativo",    label: "Planejado × Realizado"   },
    { key: "agenda",         label: `Agenda${pendentes > 0 ? ` (${pendentes})` : ""}` },
    { key: "recomendacoes",  label: `Recomendações Técnicas${recPend > 0 ? ` (${recPend})` : ""}` },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ padding: "28px 32px" }}>

        {/* cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Planejamento de Safra</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>Orçamento, comparativo planejado × realizado, agenda e recomendações técnicas</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {aba === "orcamento" && orcamento && (
              <button style={btnV} onClick={() => { setFOI(initOI()); setEditOrcItem(null); setModalOrcItem(true); }}>+ Item</button>
            )}
            {aba === "agenda" && (
              <button style={btnV} onClick={() => { setEditTarefa(null); setFT(initFT()); setModalTarefa(true); }}>+ Nova Tarefa</button>
            )}
            {aba === "recomendacoes" && (
              <button style={{ ...btnV, background: "#6B3FAD" }} onClick={() => { setEditRec(null); setFR(initFR()); setModalRec(true); }}>+ Nova Recomendação</button>
            )}
          </div>
        </div>

        {erroInit && <div style={{ background: "#FCEBEB", color: "#791F1F", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>{erroInit}</div>}

        {/* abas */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "0.5px solid #DDE2EE" }}>
          {ABAS.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)} style={{
              padding: "9px 22px", border: "none", background: "transparent", cursor: "pointer",
              fontSize: 13, fontWeight: aba === a.key ? 700 : 400,
              color: aba === a.key ? "#1A4870" : "#666",
              borderBottom: aba === a.key ? "2px solid #1A4870" : "2px solid transparent",
            }}>{a.label}</button>
          ))}
        </div>

        {/* ═══════════════ ABA ORÇAMENTO ═══════════════ */}
        {aba === "orcamento" && (
          <div>
            {/* seletor de ciclo */}
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "16px 20px", marginBottom: 18, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 180 }}>
                <label style={lbl}>Ano Safra</label>
                <select style={inp} value={anoSelOrc} onChange={e => { setAnoSelOrc(e.target.value); setCicloSelOrc(""); }}>
                  <option value="">— Selecione —</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 240 }}>
                <label style={lbl}>Ciclo / Cultura</label>
                <select style={inp} value={cicloSelOrc} onChange={e => setCicloSelOrc(e.target.value)} disabled={!anoSelOrc}>
                  <option value="">— Selecione —</option>
                  {ciclosFiltrados.map(c => <option key={c.id} value={c.id}>{c.descricao || c.cultura}</option>)}
                </select>
              </div>
            </div>

            {!cicloSelOrc && (
              <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", color: "#888", fontSize: 13 }}>
                Selecione um Ano Safra e um Ciclo para ver ou criar o orçamento
              </div>
            )}

            {cicloSelOrc && loadingOrc && (
              <div style={{ textAlign: "center", padding: 60, color: "#888", fontSize: 13 }}>Carregando...</div>
            )}

            {cicloSelOrc && !loadingOrc && !orcamento && (
              <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE" }}>
                <div style={{ fontSize: 34, marginBottom: 12 }}>◻</div>
                <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Nenhum orçamento para este ciclo</div>
                <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Crie o orçamento informando área, produtividade esperada e preço de referência</div>
                <button style={btnV} onClick={() => { setFOH(initOH()); setModalOrcHeader(true); }}>Criar Orçamento</button>
              </div>
            )}

            {cicloSelOrc && !loadingOrc && orcamento && (() => {
              // agrupa itens por categoria
              const grupos: Record<CatOrc, OrcamentoItem[]> = { sementes: [], fertilizantes: [], defensivos: [], correcao_solo: [], operacoes: [], arrendamento: [], outros: [] };
              for (const it of orcItens) grupos[it.categoria].push(it);

              return (
                <div>
                  {/* cards de resumo */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
                    {[
                      { label: "Custo Total",      valor: fmtR(totalOrc),                     bg: "#FCEBEB", color: "#791F1F"  },
                      { label: "Custo / ha",        valor: areaHa > 0 ? fmtR(custHa) : "—",   bg: "#EBF3FC", color: "#0C447C"  },
                      { label: "Receita Esperada",  valor: recBruta > 0 ? fmtR(recBruta) : "—", bg: "#ECFDF5", color: "#14532D" },
                      { label: "Margem Esperada",   valor: margem > 0 ? fmtR(margem) : margem < 0 ? fmtR(margem) : "—", bg: margem >= 0 ? "#ECFDF5" : "#FCEBEB", color: margem >= 0 ? "#14532D" : "#791F1F" },
                    ].map(k => (
                      <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "0.5px solid #DDE2EE" }}>
                        <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{k.label}</div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: k.color }}>{k.valor}</div>
                      </div>
                    ))}
                  </div>

                  {/* header do orçamento */}
                  <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "12px 18px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{orcamento.nome}</span>
                      <span style={{ fontSize: 11, color: "#888", marginLeft: 10 }}>
                        {areaHa > 0 ? `${fmtN(areaHa)} ha` : ""}
                        {prodEsp > 0 ? ` · ${fmtN(prodEsp)} sc/ha` : ""}
                        {precEsp > 0 ? ` · R$ ${fmtN(precEsp)}/sc` : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={btnE} onClick={() => {
                        setFOH({ nome: orcamento.nome, area_ha: String(orcamento.area_ha ?? ""), produtividade_esperada: String(orcamento.produtividade_esperada ?? ""), preco_esperado_sc: String(orcamento.preco_esperado_sc ?? "") });
                        setModalOrcHeader(true);
                      }}>Editar cabeçalho</button>
                      <button style={btnV} onClick={() => { setFOI(initOI()); setEditOrcItem(null); setModalOrcItem(true); }}>+ Item</button>
                    </div>
                  </div>

                  {/* tabela agrupada por categoria */}
                  <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#F3F6F9" }}>
                          {["Descrição", "Qtd", "Un.", "Valor Unit.", "Total", ""].map((h, i) => (
                            <th key={i} style={{ padding: "8px 14px", textAlign: i === 0 ? "left" : i < 5 ? "right" : "center", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {CAT_ORC.map(cat => {
                          const itens = grupos[cat.value];
                          if (itens.length === 0) return null;
                          const subtotal = itens.reduce((s, i) => s + (i.valor_total ?? 0), 0);
                          return (
                            <>
                              <tr key={cat.value + "_header"} style={{ background: "#F8FAFD" }}>
                                <td colSpan={5} style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, color: cat.cor, borderBottom: "0.5px solid #EEF1F6", borderTop: "0.5px solid #EEF1F6" }}>
                                  {cat.label}
                                </td>
                                <td style={{ padding: "8px 14px", textAlign: "right", fontSize: 12, fontWeight: 700, color: cat.cor, borderBottom: "0.5px solid #EEF1F6", borderTop: "0.5px solid #EEF1F6" }}>
                                  {fmtR(subtotal)}
                                </td>
                              </tr>
                              {itens.map((it, idx) => (
                                <tr key={it.id} style={{ borderBottom: idx < itens.length - 1 ? "0.5px solid #F0F3F8" : "0.5px solid #E4E9F0" }}>
                                  <td style={{ padding: "9px 14px 9px 24px", fontSize: 13, color: "#1a1a1a" }}>
                                    {it.descricao}
                                    {it.subcategoria && <span style={{ fontSize: 11, color: "#888", marginLeft: 6 }}>{it.subcategoria}</span>}
                                  </td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 13, color: "#1a1a1a" }}>{it.quantidade != null ? fmtN(it.quantidade, 4).replace(/,?0+$/, "") : "—"}</td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 13, color: "#666" }}>{it.unidade ?? "—"}</td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 13, color: "#1a1a1a" }}>{it.valor_unitario != null ? fmtR(it.valor_unitario) : "—"}</td>
                                  <td style={{ padding: "9px 14px", textAlign: "right", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{it.valor_total != null ? fmtR(it.valor_total) : "—"}</td>
                                  <td style={{ padding: "9px 10px", textAlign: "center" }}>
                                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                                      <button style={btnE} onClick={() => {
                                        setEditOrcItem(it);
                                        setFOI({ categoria: it.categoria, subcategoria: it.subcategoria ?? "", descricao: it.descricao, quantidade: it.quantidade != null ? String(it.quantidade) : "", unidade: it.unidade ?? "kg", valor_unitario: it.valor_unitario != null ? String(it.valor_unitario) : "" });
                                        setModalOrcItem(true);
                                      }}>Ed</button>
                                      <button style={btnX} onClick={() => excluirOrcItem(it.id)}>✕</button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </>
                          );
                        })}
                        {/* total geral */}
                        <tr style={{ background: "#1A4870" }}>
                          <td colSpan={4} style={{ padding: "10px 14px", fontWeight: 700, fontSize: 13, color: "#fff" }}>TOTAL GERAL</td>
                          <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 14, color: "#fff" }}>{fmtR(totalOrc)}</td>
                          <td></td>
                        </tr>
                        {areaHa > 0 && (
                          <tr style={{ background: "#D5E8F5" }}>
                            <td colSpan={4} style={{ padding: "7px 14px", fontSize: 12, color: "#0B2D50" }}>Custo por hectare ({fmtN(areaHa)} ha)</td>
                            <td style={{ padding: "7px 14px", textAlign: "right", fontWeight: 600, fontSize: 13, color: "#0B2D50" }}>{fmtR(custHa)}</td>
                            <td></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {orcItens.length === 0 && (
                      <div style={{ padding: "40px 24px", textAlign: "center", color: "#888", fontSize: 13 }}>
                        Orçamento criado. Use "+ Item" para adicionar os custos planejados.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══════════════ ABA PLANEJADO × REALIZADO ═══════════════ */}
        {aba === "comparativo" && (
          <div>
            {/* seletor */}
            <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "16px 20px", marginBottom: 18, display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 180 }}>
                <label style={lbl}>Ano Safra</label>
                <select style={inp} value={anoSelOrc} onChange={e => { setAnoSelOrc(e.target.value); setCicloSelOrc(""); }}>
                  <option value="">— Selecione —</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 240 }}>
                <label style={lbl}>Ciclo / Cultura</label>
                <select style={inp} value={cicloSelOrc} onChange={e => setCicloSelOrc(e.target.value)} disabled={!anoSelOrc}>
                  <option value="">— Selecione —</option>
                  {ciclosFiltrados.map(c => <option key={c.id} value={c.id}>{c.descricao || c.cultura}</option>)}
                </select>
              </div>
            </div>

            {!cicloSelOrc ? (
              <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", color: "#888", fontSize: 13 }}>
                Selecione um Ano Safra e um Ciclo para ver o comparativo
              </div>
            ) : loadingOrc || loadingComp ? (
              <div style={{ textAlign: "center", padding: 60, color: "#888", fontSize: 13 }}>Carregando...</div>
            ) : (
              <div>
                {/* KPIs */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
                  {[
                    { label: "Total Planejado",  valor: fmtR(totalPlanejado), bg: "#EBF3FC", color: "#0C447C" },
                    { label: "Total Realizado",  valor: fmtR(totalRealizado), bg: "#FBF3E0", color: "#7A5A12" },
                    { label: "Desvio",           valor: fmtR(totalRealizado - totalPlanejado), bg: totalRealizado > totalPlanejado ? "#FCEBEB" : "#ECFDF5", color: totalRealizado > totalPlanejado ? "#791F1F" : "#14532D" },
                    { label: "Execução",         valor: totalPlanejado > 0 ? `${fmtN(totalRealizado / totalPlanejado * 100, 1)}%` : "—", bg: "#F4F6FA", color: "#555" },
                  ].map(k => (
                    <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "0.5px solid #DDE2EE" }}>
                      <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{k.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: k.color }}>{k.valor}</div>
                    </div>
                  ))}
                </div>

                {/* tabela */}
                <div style={{ background: "#fff", border: "0.5px solid #D4DCE8", borderRadius: 12, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F3F6F9" }}>
                        {["Categoria", "Planejado", "Realizado", "Desvio (R$)", "Desvio (%)", "Execução"].map((h, i) => (
                          <th key={i} style={{ padding: "9px 14px", textAlign: i === 0 ? "left" : "right", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {CAT_ORC.map((cat, idx) => {
                        const plan = planejadoPorCat[cat.value];
                        const real = realizado[cat.value];
                        if (plan === 0 && real === 0) return null;
                        const desv = real - plan;
                        const desvPct = plan > 0 ? desv / plan * 100 : real > 0 ? 100 : 0;
                        const exec = plan > 0 ? real / plan * 100 : 0;
                        const barW = Math.min(exec, 150);
                        return (
                          <tr key={cat.value} style={{ borderBottom: "0.5px solid #EEF1F6" }}>
                            <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13, color: cat.cor }}>{cat.label}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, color: "#1a1a1a" }}>{fmtR(plan)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, color: "#1a1a1a" }}>{fmtR(real)}</td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, fontWeight: 600, color: desv > 0 ? "#E24B4A" : desv < 0 ? "#16A34A" : "#888" }}>
                              {desv > 0 ? "+" : ""}{fmtR(desv)}
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "right", fontSize: 13, color: desvPct > 10 ? "#E24B4A" : desvPct > 0 ? "#EF9F27" : "#16A34A" }}>
                              {desv > 0 ? "+" : ""}{fmtN(desvPct, 1)}%
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "right" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                                <div style={{ width: 80, height: 6, background: "#EEF1F6", borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ width: `${Math.min(barW, 100)}%`, height: "100%", background: exec > 110 ? "#E24B4A" : exec > 90 ? "#EF9F27" : "#16A34A", borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#555", minWidth: 40, textAlign: "right" }}>{fmtN(exec, 1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {/* totais */}
                      <tr style={{ background: "#1A4870" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 700, fontSize: 13, color: "#fff" }}>TOTAL</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 13, color: "#fff" }}>{fmtR(totalPlanejado)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 13, color: "#fff" }}>{fmtR(totalRealizado)}</td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 13, color: totalRealizado > totalPlanejado ? "#FFBBBB" : "#BBFFCC" }}>
                          {totalRealizado - totalPlanejado > 0 ? "+" : ""}{fmtR(totalRealizado - totalPlanejado)}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 13, color: "#D5E8F5" }}>
                          {totalPlanejado > 0 ? `${totalRealizado > totalPlanejado ? "+" : ""}${fmtN((totalRealizado - totalPlanejado) / totalPlanejado * 100, 1)}%` : "—"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 13, color: "#fff" }}>
                          {totalPlanejado > 0 ? `${fmtN(totalRealizado / totalPlanejado * 100, 1)}%` : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {!orcamento && (
                    <div style={{ padding: "20px 24px", background: "#FBF3E0", color: "#7A5A12", fontSize: 12, textAlign: "center" }}>
                      Nenhum orçamento cadastrado para este ciclo — crie o orçamento na aba "Orçamento" para ver o comparativo planejado.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ ABA AGENDA ═══════════════ */}
        {aba === "agenda" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 18 }}>
              {[
                { label: "Pendentes",  valor: pendentes,  bg: "#FBF3E0", color: "#7A5A12" },
                { label: "Atrasadas",  valor: atrasadas,  bg: "#FCEBEB", color: "#791F1F" },
                { label: "Concluídas", valor: concluidas, bg: "#ECFDF5", color: "#14532D" },
                { label: "Rec. Técnicas Pendentes", valor: recPend, bg: "#EDE9F8", color: "#4A2C8A" },
              ].map(k => (
                <div key={k.label} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "0.5px solid #DDE2EE" }}>
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{k.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.valor}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)} style={{ ...inp, width: 160 }}>
                <option value="todos">Todos os status</option>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
              <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value as typeof filtroPrioridade)} style={{ ...inp, width: 160 }}>
                <option value="todos">Todas as prioridades</option>
                <option value="urgente">Urgente</option>
                <option value="normal">Normal</option>
                <option value="baixa">Baixa</option>
              </select>
              <select value={filtroCicloAg} onChange={e => setFiltroCicloAg(e.target.value)} style={{ ...inp, width: 220 }}>
                <option value="">Todos os ciclos</option>
                {ciclos.map(c => <option key={c.id} value={c.id}>{labelCiclo(c.id)}</option>)}
              </select>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 60, color: "#888", fontSize: 13 }}>Carregando...</div>
            ) : tarefasFiltradas.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>◻</div>
                <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Nenhuma tarefa encontrada</div>
                <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Use "+ Nova Tarefa" para criar a agenda do ciclo</div>
                <button style={btnV} onClick={() => { setEditTarefa(null); setFT(initFT()); setModalTarefa(true); }}>+ Nova Tarefa</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tarefasFiltradas.map(t => {
                  const st = STATUS_TAREFA[t.status];
                  const pr = PRIORIDADE[t.prioridade];
                  const concluida = t.status === "concluida";
                  return (
                    <div key={t.id} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: `0.5px solid ${t.prioridade === "urgente" && !concluida ? "#E24B4A50" : "#DDE2EE"}`, display: "flex", alignItems: "flex-start", gap: 14, opacity: concluida ? 0.7 : 1 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: concluida ? "#F4F6FA" : "#EBF3FC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: concluida ? "#888" : TIPOS_TAREFA_COLOR[t.tipo] }}>
                        {TIPOS_TAREFA_ICON[t.tipo]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: concluida ? "#888" : "#1a1a1a", textDecoration: concluida ? "line-through" : "none" }}>{t.titulo}</span>
                          <Badge label={st.label} bg={st.bg} color={st.color} />
                          <Badge label={pr.label} bg={pr.bg} color={pr.color} />
                          {!concluida && <BadgePrazo data={t.data_prevista} />}
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#666" }}>
                          <span>{TIPOS_TAREFA.find(x => x.value === t.tipo)?.label}</span>
                          {t.data_prevista && <span>Previsto: {fmtData(t.data_prevista)}</span>}
                          {t.data_conclusao && <span>Concluído: {fmtData(t.data_conclusao)}</span>}
                          {t.responsavel && <span>Resp.: {t.responsavel}</span>}
                          {t.ciclo_id && <span style={{ color: "#1A4870" }}>{labelCiclo(t.ciclo_id)}</span>}
                        </div>
                        {t.descricao && <div style={{ marginTop: 4, fontSize: 12, color: "#555" }}>{t.descricao}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {t.status !== "concluida" && t.status !== "cancelada" && (
                          <button style={{ ...btnE, background: "#ECFDF5", color: "#14532D", border: "0.5px solid #16A34A40" }} onClick={() => concluirTarefa(t)}>✓ Concluir</button>
                        )}
                        <button style={btnE} onClick={() => abrirEditarTarefa(t)}>Editar</button>
                        <button style={btnX} onClick={() => removerTarefa(t.id)}>Excluir</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ═══════════════ ABA RECOMENDAÇÕES ═══════════════ */}
        {aba === "recomendacoes" && (
          <>
            {loading ? (
              <div style={{ textAlign: "center", padding: 60, color: "#888", fontSize: 13 }}>Carregando...</div>
            ) : recomendacoes.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>◇</div>
                <div style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Nenhuma recomendação técnica</div>
                <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Registre recomendações do agrônomo para cada ciclo</div>
                <button style={{ ...btnV, background: "#6B3FAD" }} onClick={() => { setEditRec(null); setFR(initFR()); setModalRec(true); }}>+ Nova Recomendação</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recomendacoes.map(r => {
                  const st = STATUS_REC[r.status];
                  const pr = PRIORIDADE[r.prioridade];
                  const aplicada = r.status === "aplicada";
                  return (
                    <div key={r.id} style={{ background: "#fff", borderRadius: 10, padding: "14px 18px", border: "0.5px solid #DDE2EE", display: "flex", alignItems: "flex-start", gap: 14, opacity: aplicada ? 0.75 : 1 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: aplicada ? "#F4F6FA" : "#EDE9F8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: aplicada ? "#888" : "#6B3FAD" }}>◇</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: aplicada ? "#888" : "#1a1a1a" }}>{r.titulo}</span>
                          <Badge label={st.label} bg={st.bg} color={st.color} />
                          <Badge label={pr.label} bg={pr.bg} color={pr.color} />
                          <Badge label={TIPOS_REC.find(x => x.value === r.tipo)?.label ?? r.tipo} bg="#EDE9F8" color="#4A2C8A" />
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: "#666" }}>
                          {r.data_recomendacao && <span>Data: {fmtData(r.data_recomendacao)}</span>}
                          {r.estadio_fenologico && <span>Estádio: {r.estadio_fenologico}</span>}
                          {r.responsavel_tecnico && <span>Técnico: {r.responsavel_tecnico}</span>}
                          {r.ciclo_id && <span style={{ color: "#1A4870" }}>{labelCiclo(r.ciclo_id)}</span>}
                        </div>
                        {r.descricao && <div style={{ marginTop: 4, fontSize: 12, color: "#555" }}>{r.descricao}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        {r.status === "pendente" && (
                          <button style={{ ...btnE, background: "#ECFDF5", color: "#14532D", border: "0.5px solid #16A34A40" }} onClick={() => aplicarRecomendacao(r)}>✓ Aplicada</button>
                        )}
                        <button style={btnE} onClick={() => {
                          setEditRec(r);
                          setFR({ titulo: r.titulo, descricao: r.descricao ?? "", tipo: r.tipo, estadio_fenologico: r.estadio_fenologico ?? "", data_recomendacao: r.data_recomendacao ?? hoje(), responsavel_tecnico: r.responsavel_tecnico ?? "", prioridade: r.prioridade, status: r.status, ciclo_id: r.ciclo_id ?? "" });
                          setModalRec(true);
                        }}>Editar</button>
                        <button style={btnX} onClick={() => { if (confirm("Excluir?")) { excluirRecomendacao(r.id); setRecomendacoes(p => p.filter(x => x.id !== r.id)); } }}>Excluir</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════ MODAIS ══════════ */}

      {/* Modal cabeçalho orçamento */}
      {modalOrcHeader && (
        <Modal titulo={orcamento ? "Editar Orçamento" : "Criar Orçamento"} subtitulo="Defina os parâmetros de referência para o ciclo" onClose={() => setModalOrcHeader(false)} width={640}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Nome do Orçamento</label>
              <input style={inp} value={fOH.nome} onChange={e => setFOH(p => ({ ...p, nome: e.target.value }))} placeholder="Ex: Orçamento Soja 25/26" />
            </div>
            <div>
              <label style={lbl}>Área Total (ha)</label>
              <input style={inp} type="number" step="0.01" placeholder="0,00" value={fOH.area_ha} onChange={e => setFOH(p => ({ ...p, area_ha: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Produtividade Esperada (sc/ha)</label>
              <input style={inp} type="number" step="0.1" placeholder="Ex: 60" value={fOH.produtividade_esperada} onChange={e => setFOH(p => ({ ...p, produtividade_esperada: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Preço de Referência (R$/sc)</label>
              <input style={inp} type="number" step="0.01" placeholder="Ex: 130,00" value={fOH.preco_esperado_sc} onChange={e => setFOH(p => ({ ...p, preco_esperado_sc: e.target.value }))} />
            </div>
            {fOH.area_ha && fOH.produtividade_esperada && fOH.preco_esperado_sc && (
              <div style={{ gridColumn: "1/-1", background: "#ECFDF5", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                <span style={{ color: "#555" }}>Receita esperada: </span>
                <span style={{ fontWeight: 700, color: "#14532D" }}>
                  {fmtR(parseFloat(fOH.area_ha) * parseFloat(fOH.produtividade_esperada) * parseFloat(fOH.preco_esperado_sc))}
                </span>
                <span style={{ color: "#555", marginLeft: 16 }}>({fmtN(parseFloat(fOH.area_ha) * parseFloat(fOH.produtividade_esperada))} sc totais)</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalOrcHeader(false)}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fOH.nome.trim() ? 0.5 : 1 }} disabled={salvando || !fOH.nome.trim()} onClick={salvarOrcamentoHeader}>
              {salvando ? "Salvando…" : orcamento ? "Salvar" : "Criar Orçamento"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal item orçamento */}
      {modalOrcItem && (
        <Modal titulo={editOrcItem ? "Editar Item" : "Novo Item de Custo"} onClose={() => { setModalOrcItem(false); setEditOrcItem(null); setFOI(initOI()); }} width={720}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Categoria *</label>
              <select style={inp} value={fOI.categoria} onChange={e => setFOI(p => ({ ...p, categoria: e.target.value as CatOrc }))}>
                {CAT_ORC.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Subcategoria</label>
              <input style={inp} value={fOI.subcategoria} onChange={e => setFOI(p => ({ ...p, subcategoria: e.target.value }))} placeholder="Ex: Herbicida pré-emergente" />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Descrição *</label>
              <input style={inp} value={fOI.descricao} onChange={e => setFOI(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: Semente de soja TMG 7062 — tratada" />
            </div>
            <div>
              <label style={lbl}>Quantidade</label>
              <input style={inp} type="number" step="0.001" placeholder="0" value={fOI.quantidade} onChange={e => setFOI(p => ({ ...p, quantidade: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Unidade</label>
              <select style={inp} value={fOI.unidade} onChange={e => setFOI(p => ({ ...p, unidade: e.target.value }))}>
                {["kg","sc","L","t","ha","un","dose","h"].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Valor Unitário (R$)</label>
              <input style={inp} type="number" step="0.01" placeholder="0,00" value={fOI.valor_unitario} onChange={e => setFOI(p => ({ ...p, valor_unitario: e.target.value }))} />
            </div>
            {fOI.quantidade && fOI.valor_unitario && (
              <div style={{ gridColumn: "1/-1", background: "#EBF3FC", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                <span style={{ color: "#555" }}>Total calculado: </span>
                <span style={{ fontWeight: 700, color: "#0C447C" }}>
                  {fmtR(parseFloat(fOI.quantidade) * parseFloat(fOI.valor_unitario))}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => { setModalOrcItem(false); setEditOrcItem(null); setFOI(initOI()); }}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fOI.descricao.trim() ? 0.5 : 1 }} disabled={salvando || !fOI.descricao.trim()} onClick={salvarOrcItem}>
              {salvando ? "Salvando…" : editOrcItem ? "Salvar" : "Adicionar Item"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal nova/editar tarefa */}
      {modalTarefa && (
        <Modal titulo={editTarefa ? "Editar Tarefa" : "Nova Tarefa"} onClose={() => { setModalTarefa(false); setEditTarefa(null); setFT(initFT()); }} width={680}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Título *</label>
              <input style={inp} value={fT.titulo} onChange={e => setFT(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Aplicar fungicida no estádio R1" />
            </div>
            <div><label style={lbl}>Tipo</label><select style={inp} value={fT.tipo} onChange={e => setFT(p => ({ ...p, tipo: e.target.value as TipoTarefa }))}>{TIPOS_TAREFA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div><label style={lbl}>Ciclo</label><select style={inp} value={fT.ciclo_id} onChange={e => setFT(p => ({ ...p, ciclo_id: e.target.value }))}><option value="">— Nenhum —</option>{ciclos.map(c => <option key={c.id} value={c.id}>{labelCiclo(c.id)}</option>)}</select></div>
            <div><label style={lbl}>Data prevista</label><input style={inp} type="date" value={fT.data_prevista} onChange={e => setFT(p => ({ ...p, data_prevista: e.target.value }))} /></div>
            <div><label style={lbl}>Responsável</label><input style={inp} value={fT.responsavel} onChange={e => setFT(p => ({ ...p, responsavel: e.target.value }))} /></div>
            <div><label style={lbl}>Prioridade</label><select style={inp} value={fT.prioridade} onChange={e => setFT(p => ({ ...p, prioridade: e.target.value as Prioridade }))}><option value="urgente">Urgente</option><option value="normal">Normal</option><option value="baixa">Baixa</option></select></div>
            <div><label style={lbl}>Status</label><select style={inp} value={fT.status} onChange={e => setFT(p => ({ ...p, status: e.target.value as StatusTarefa }))}><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Descrição</label><textarea style={{ ...inp, height: 72, resize: "vertical" }} value={fT.descricao} onChange={e => setFT(p => ({ ...p, descricao: e.target.value }))} placeholder="Produto, dose, observações..." /></div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
            <button style={btnR} onClick={() => { setModalTarefa(false); setEditTarefa(null); setFT(initFT()); }}>Cancelar</button>
            <button style={btnV} onClick={salvarTarefa} disabled={salvando}>{salvando ? "Salvando..." : editTarefa ? "Salvar" : "Criar Tarefa"}</button>
          </div>
        </Modal>
      )}

      {/* Modal nova/editar recomendação */}
      {modalRec && (
        <Modal titulo={editRec ? "Editar Recomendação" : "Nova Recomendação Técnica"} subtitulo="Recomendações do agrônomo vinculadas ao ciclo produtivo" onClose={() => { setModalRec(false); setEditRec(null); setFR(initFR()); }} width={700}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 20px" }}>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Título *</label><input style={inp} value={fR.titulo} onChange={e => setFR(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Aplicação preventiva de fungicida — R1" /></div>
            <div><label style={lbl}>Tipo</label><select style={inp} value={fR.tipo} onChange={e => setFR(p => ({ ...p, tipo: e.target.value as TipoRec }))}>{TIPOS_REC.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            <div><label style={lbl}>Ciclo</label><select style={inp} value={fR.ciclo_id} onChange={e => setFR(p => ({ ...p, ciclo_id: e.target.value }))}><option value="">— Nenhum —</option>{ciclos.map(c => <option key={c.id} value={c.id}>{labelCiclo(c.id)}</option>)}</select></div>
            <div><label style={lbl}>Estádio Fenológico</label><input style={inp} value={fR.estadio_fenologico} onChange={e => setFR(p => ({ ...p, estadio_fenologico: e.target.value }))} placeholder="Ex: R1, V4, pré-emergência" /></div>
            <div><label style={lbl}>Data</label><input style={inp} type="date" value={fR.data_recomendacao} onChange={e => setFR(p => ({ ...p, data_recomendacao: e.target.value }))} /></div>
            <div><label style={lbl}>Técnico Responsável</label><input style={inp} value={fR.responsavel_tecnico} onChange={e => setFR(p => ({ ...p, responsavel_tecnico: e.target.value }))} /></div>
            <div><label style={lbl}>Prioridade</label><select style={inp} value={fR.prioridade} onChange={e => setFR(p => ({ ...p, prioridade: e.target.value as Prioridade }))}><option value="urgente">Urgente</option><option value="normal">Normal</option><option value="baixa">Baixa</option></select></div>
            <div style={{ gridColumn: "1/-1" }}><label style={lbl}>Descrição / Detalhes</label><textarea style={{ ...inp, height: 88, resize: "vertical" }} value={fR.descricao} onChange={e => setFR(p => ({ ...p, descricao: e.target.value }))} placeholder="Produto sugerido, dose, volume de calda, janela de aplicação..." /></div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
            <button style={btnR} onClick={() => { setModalRec(false); setEditRec(null); setFR(initFR()); }}>Cancelar</button>
            <button style={{ ...btnV, background: "#6B3FAD" }} onClick={salvarRecomendacao} disabled={salvando}>{salvando ? "Salvando..." : editRec ? "Salvar" : "Criar Recomendação"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
