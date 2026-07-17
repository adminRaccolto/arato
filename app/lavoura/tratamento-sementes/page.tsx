"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import {
  listarTratamentos,
  criarTratamento,
  atualizarTratamento,
  excluirTratamento,
  salvarItensTratamento,
  listarReceitas,
  salvarReceita,
  atualizarReceita,
  excluirReceita,
  listarInsumos,
  listarAnosSafra,
  listarTodosCiclos,
  listarDepositos,
} from "../../../lib/db";
import { useAuth } from "../../../components/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";
import type {
  TratamentoSemente,
  TratamentoSementeItem,
  TratamentoReceita,
  TratamentoReceitaItem,
  Insumo,
  AnoSafra,
  Ciclo,
  Deposito,
} from "../../../lib/supabase";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Estilos base ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE",
  borderRadius: 8, fontSize: 13, background: "#fff", boxSizing: "border-box",
  outline: "none", color: "#1a1a1a",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btn = (bg = "#1A4870", color = "#fff"): React.CSSProperties => ({
  padding: "8px 18px", background: bg, color, border: "none", borderRadius: 8,
  fontWeight: 600, cursor: "pointer", fontSize: 13,
});
const btnSm = (bg = "#1A4870", color = "#fff"): React.CSSProperties => ({
  padding: "5px 12px", background: bg, color, border: "none", borderRadius: 6,
  fontWeight: 600, cursor: "pointer", fontSize: 12,
});
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", padding: "20px 24px",
};

// ─── Constantes ───────────────────────────────────────────────────────────────
const CULTURAS: Record<string, string> = {
  soja: "Soja", milho1: "Milho 1ª", milho2: "Milho 2ª (Safrinha)",
  algodao: "Algodão", trigo: "Trigo", sorgo: "Sorgo", outro: "Outro",
};

const CATEGORIAS_PRODUTO: { id: string; label: string; cor: string }[] = [
  { id: "fungicida",     label: "Fungicida",      cor: "#9B59B6" },
  { id: "inseticida",    label: "Inseticida",      cor: "#E74C3C" },
  { id: "inoculante",    label: "Inoculante",      cor: "#27AE60" },
  { id: "micronutriente",label: "Micronutriente",  cor: "#F39C12" },
  { id: "polimero",      label: "Polímero",        cor: "#2980B9" },
  { id: "outro",         label: "Outro",           cor: "#7F8C8D" },
];

const UNIDADES = ["mL", "L", "g", "kg", "doses"];

const STATUS_INFO: Record<string, { label: string; bg: string; color: string }> = {
  planejada:     { label: "Planejada",      bg: "#EFF0F5", color: "#555"     },
  em_tratamento: { label: "Em Tratamento",  bg: "#FBF3E0", color: "#C9921B"  },
  concluida:     { label: "Concluída",      bg: "#DCFCE7", color: "#15803D"  },
  cancelada:     { label: "Cancelada",      bg: "#FEECEC", color: "#B91C1C"  },
};

const fmtData  = (s?: string | null) => s ? s.split("T")[0].split("-").reverse().join("/") : "—";
const fmtN     = (v?: number | null, d = 1) =>
  v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

// ─── Tipos locais ─────────────────────────────────────────────────────────────
type ItemLocal = {
  _key: string;
  insumo_id: string;
  produto_nome: string;
  categoria: string;
  dose_100kg: string;
  unidade: string;
};

function novoItem(): ItemLocal {
  return {
    _key: Math.random().toString(36).slice(2),
    insumo_id: "", produto_nome: "", categoria: "fungicida",
    dose_100kg: "", unidade: "mL",
  };
}

type FormOrdem = {
  ciclo_id: string;
  cultura: string;
  cultivar: string;
  lote_semente: string;
  insumo_id: string;
  deposito_origem_id: string;
  deposito_destino_id: string;
  quantidade_sc: string;
  volume_calda_ml_100kg: string;
  data_planejada: string;
  operador: string;
  equipamento: string;
  observacao: string;
};

type FormConcluir = {
  quantidade_sc: string;
  operador: string;
  equipamento: string;
  data_inicio: string;
  data_conclusao: string;
  germinacao_pct: string;
  vigor_pct: string;
  umidade_pct: string;
  baixar_estoque: boolean;
};

type FormReceita = {
  nome: string;
  cultura: string;
  descricao: string;
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function TratamentoSementesPage() {
  const { fazendaId } = useAuth();

  // dados
  const [tratamentos, setTratamentos]     = useState<TratamentoSemente[]>([]);
  const [receitas, setReceitas]           = useState<TratamentoReceita[]>([]);
  const [insumosSemente, setInsumosSemente] = useState<Insumo[]>([]);
  const [insumosProduto, setInsumosProduto] = useState<Insumo[]>([]);
  const [anosSafra, setAnosSafra]         = useState<AnoSafra[]>([]);
  const [ciclos, setCiclos]               = useState<Ciclo[]>([]);
  const [depositos, setDepositos]         = useState<Deposito[]>([]);

  // UI
  const [aba, setAba]           = useState<"ordens" | "receitas">("ordens");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca]       = useState("");
  const [anoSafraFiltro, setAnoSafraFiltro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState<string | null>(null);

  // Modais
  const [modalOrdem, setModalOrdem]         = useState(false);
  const [modalConcluir, setModalConcluir]   = useState(false);
  const [modalReceita, setModalReceita]     = useState(false);
  const [modalDetalhe, setModalDetalhe]     = useState(false);
  const [editando, setEditando]             = useState<TratamentoSemente | null>(null);
  const [concluindo, setConcluindo]         = useState<TratamentoSemente | null>(null);
  const [detalhe, setDetalhe]               = useState<TratamentoSemente | null>(null);
  const [editandoReceita, setEditandoReceita] = useState<TratamentoReceita | null>(null);

  // Forms
  const formVazio: FormOrdem = {
    ciclo_id: "", cultura: "soja", cultivar: "", lote_semente: "",
    insumo_id: "", deposito_origem_id: "", deposito_destino_id: "",
    quantidade_sc: "", volume_calda_ml_100kg: "500",
    data_planejada: new Date().toISOString().split("T")[0],
    operador: "", equipamento: "", observacao: "",
  };
  const [form, setForm]         = useState<FormOrdem>(formVazio);
  const [itens, setItens]       = useState<ItemLocal[]>([novoItem()]);
  const [anoSafraSel, setAnoSafraSel] = useState("");
  const [receitaSel, setReceitaSel]   = useState("");

  const [formConcluir, setFormConcluir] = useState<FormConcluir>({
    quantidade_sc: "", operador: "", equipamento: "",
    data_inicio: new Date().toISOString().slice(0, 16),
    data_conclusao: new Date().toISOString().slice(0, 16),
    germinacao_pct: "", vigor_pct: "", umidade_pct: "",
    baixar_estoque: true,
  });
  const [itensConcluir, setItensConcluir] = useState<{ produto_nome: string; dose_total: number; consumo_real: string; unidade: string }[]>([]);

  const [formReceita, setFormReceita]   = useState<FormReceita>({ nome: "", cultura: "soja", descricao: "" });
  const [itensReceita, setItensReceita] = useState<ItemLocal[]>([novoItem()]);

  // ── Carregamento ─────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [ts, rec, ins, anos, ciclosAll, deps] = await Promise.all([
      listarTratamentos(fazendaId),
      listarReceitas(fazendaId),
      listarInsumos(fazendaId),
      listarAnosSafra(fazendaId),
      listarTodosCiclos(fazendaId),
      listarDepositos(fazendaId),
    ]);
    setTratamentos(ts);
    setReceitas(rec);
    setInsumosSemente(ins.filter(i => i.categoria === "semente"));
    setInsumosProduto(ins.filter(i => ["defensivo", "biologico", "inoculante"].includes(i.categoria ?? "")));
    setAnosSafra(anos);
    setCiclos(ciclosAll);
    setDepositos(deps);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Ciclos filtrados por ano safra (no form)
  const ciclosFiltrados = anoSafraSel
    ? ciclos.filter(c => c.ano_safra_id === anoSafraSel)
    : ciclos;

  // Ciclos filtrados para filtro de lista
  const ciclosDoAno = anoSafraFiltro
    ? ciclos.filter(c => c.ano_safra_id === anoSafraFiltro)
    : ciclos;

  // ── Cálculos ─────────────────────────────────────────────────────────────────
  const qtdKg = (sc: string | number) => (Number(sc) || 0) * 60;

  function calcDoseTotal(item: ItemLocal, qtdSc: string): number {
    const kg = qtdKg(qtdSc);
    return ((Number(item.dose_100kg) || 0) * kg) / 100;
  }

  const qtdKgStr = form.quantidade_sc ? fmtN(qtdKg(form.quantidade_sc), 0) : "—";

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const kpiPlanejadas    = tratamentos.filter(t => t.status === "planejada").length;
  const kpiEmTratamento  = tratamentos.filter(t => t.status === "em_tratamento").length;
  const kpiConcluidas    = tratamentos.filter(t => t.status === "concluida").length;
  const kpiTotalSc       = tratamentos.filter(t => t.status !== "cancelada")
    .reduce((s, t) => s + (t.quantidade_sc ?? 0), 0);

  // ── Filtros de lista ──────────────────────────────────────────────────────────
  const listaFiltrada = tratamentos.filter(t => {
    if (filtroStatus !== "todos" && t.status !== filtroStatus) return false;
    if (anoSafraFiltro) {
      const ciclo = ciclos.find(c => c.id === t.ciclo_id);
      if (!ciclo || ciclo.ano_safra_id !== anoSafraFiltro) return false;
    }
    if (busca) {
      const q = busca.toLowerCase();
      const ciclo = ciclos.find(c => c.id === t.ciclo_id);
      if (
        !t.cultivar?.toLowerCase().includes(q) &&
        !t.lote_semente?.toLowerCase().includes(q) &&
        !CULTURAS[t.cultura ?? ""]?.toLowerCase().includes(q) &&
        !ciclo?.descricao?.toLowerCase().includes(q) &&
        !String(t.numero ?? "").includes(q)
      ) return false;
    }
    return true;
  });

  // ── Salvar Ordem ─────────────────────────────────────────────────────────────
  async function salvarOrdem() {
    if (!fazendaId) return;
    setSalvando(true);
    setErro(null);
    try {
      const kg = qtdKg(form.quantidade_sc);
      const dados = {
        ciclo_id:             form.ciclo_id || null,
        status:               "planejada" as const,
        cultura:              form.cultura || null,
        cultivar:             form.cultivar || null,
        lote_semente:         form.lote_semente || null,
        insumo_id:            form.insumo_id || null,
        deposito_origem_id:   form.deposito_origem_id || null,
        deposito_destino_id:  form.deposito_destino_id || null,
        quantidade_sc:        Number(form.quantidade_sc) || null,
        quantidade_kg:        kg || null,
        volume_calda_ml_100kg: Number(form.volume_calda_ml_100kg) || 500,
        data_planejada:       form.data_planejada || null,
        operador:             form.operador || null,
        equipamento:          form.equipamento || null,
        observacao:           form.observacao || null,
      };

      let tratamento: TratamentoSemente;
      if (editando) {
        await atualizarTratamento(editando.id, dados);
        tratamento = { ...editando, ...dados };
      } else {
        tratamento = await criarTratamento(fazendaId, dados);
      }

      // Salva itens
      const itensSalvar = itens
        .filter(it => it.produto_nome || it.insumo_id)
        .map(it => ({
          insumo_id:    it.insumo_id || null,
          produto_nome: it.produto_nome || null,
          categoria:    it.categoria || null,
          dose_100kg:   Number(it.dose_100kg) || null,
          unidade:      it.unidade || "mL",
          dose_total:   calcDoseTotal(it, form.quantidade_sc),
          consumo_real: null,
        }));
      await salvarItensTratamento(tratamento.id, itensSalvar);

      setModalOrdem(false);
      setEditando(null);
      setForm(formVazio);
      setItens([novoItem()]);
      setAnoSafraSel("");
      await carregar();
    } catch (e) {
      setErro((e as { message?: string })?.message ?? "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  // ── Iniciar Tratamento ────────────────────────────────────────────────────────
  async function iniciarTratamento(t: TratamentoSemente) {
    if (!confirm(`Iniciar tratamento da ordem #${t.numero}?`)) return;
    await atualizarTratamento(t.id, {
      status: "em_tratamento",
      data_inicio: new Date().toISOString(),
    });
    await carregar();
  }

  // ── Abrir Modal Concluir ──────────────────────────────────────────────────────
  function abrirConcluir(t: TratamentoSemente) {
    setConcluindo(t);
    setFormConcluir({
      quantidade_sc:   String(t.quantidade_sc ?? ""),
      operador:        t.operador ?? "",
      equipamento:     t.equipamento ?? "",
      data_inicio:     t.data_inicio ? t.data_inicio.slice(0, 16) : new Date().toISOString().slice(0, 16),
      data_conclusao:  new Date().toISOString().slice(0, 16),
      germinacao_pct:  "",
      vigor_pct:       "",
      umidade_pct:     "",
      baixar_estoque:  true,
    });
    setItensConcluir(
      (t.tratamento_sementes_itens ?? []).map(it => ({
        produto_nome: it.produto_nome ?? it.insumo_id ?? "—",
        dose_total:   it.dose_total ?? 0,
        consumo_real: String(it.dose_total ?? ""),
        unidade:      it.unidade ?? "mL",
      }))
    );
    setModalConcluir(true);
  }

  // ── Confirmar Conclusão ───────────────────────────────────────────────────────
  async function confirmarConclusao() {
    if (!concluindo || !fazendaId) return;
    setSalvando(true);
    setErro(null);
    try {
      const qtdSc = Number(formConcluir.quantidade_sc) || (concluindo.quantidade_sc ?? 0);
      await atualizarTratamento(concluindo.id, {
        status:          "concluida",
        quantidade_sc:   qtdSc,
        quantidade_kg:   qtdSc * 60,
        operador:        formConcluir.operador || null,
        equipamento:     formConcluir.equipamento || null,
        data_inicio:     formConcluir.data_inicio ? new Date(formConcluir.data_inicio).toISOString() : null,
        data_conclusao:  formConcluir.data_conclusao ? new Date(formConcluir.data_conclusao).toISOString() : null,
        germinacao_pct:  Number(formConcluir.germinacao_pct) || null,
        vigor_pct:       Number(formConcluir.vigor_pct) || null,
        umidade_pct:     Number(formConcluir.umidade_pct) || null,
      });

      // Atualiza consumo real nos itens
      const itensDb = concluindo.tratamento_sementes_itens ?? [];
      if (itensDb.length > 0) {
        const itensAtualizados = itensDb.map((it, i) => ({
          insumo_id:    it.insumo_id ?? null,
          produto_nome: it.produto_nome ?? null,
          categoria:    it.categoria ?? null,
          dose_100kg:   it.dose_100kg ?? null,
          unidade:      it.unidade ?? "mL",
          dose_total:   it.dose_total ?? null,
          consumo_real: Number(itensConcluir[i]?.consumo_real) || (it.dose_total ?? null),
        }));
        await salvarItensTratamento(concluindo.id, itensAtualizados);
      }

      // Baixar estoque dos produtos utilizados
      if (formConcluir.baixar_estoque) {
        for (let i = 0; i < itensDb.length; i++) {
          const it = itensDb[i];
          if (!it.insumo_id) continue;
          const consumido = Number(itensConcluir[i]?.consumo_real) || (it.dose_total ?? 0);
          if (consumido <= 0) continue;
          await supabase.from("movimentacoes_estoque").insert({
            fazenda_id:  fazendaId,
            insumo_id:   it.insumo_id,
            tipo:        "saida",
            motivo:      `Tratamento de Sementes #${concluindo.numero}`,
            quantidade:  consumido,
            data:        formConcluir.data_conclusao?.split("T")[0] ?? new Date().toISOString().split("T")[0],
            deposito_id: concluindo.deposito_origem_id ?? null,
            auto:        true,
            observacao:  `${CULTURAS[concluindo.cultura ?? ""] ?? concluindo.cultura} — ${concluindo.cultivar ?? ""} — Lote: ${concluindo.lote_semente ?? "sem lote"}`,
          });
        }
      }

      setModalConcluir(false);
      setConcluindo(null);
      await carregar();
    } catch (e) {
      setErro((e as { message?: string })?.message ?? "Erro ao concluir");
    } finally {
      setSalvando(false);
    }
  }

  // ── Cancelar Ordem ────────────────────────────────────────────────────────────
  async function cancelarOrdem(t: TratamentoSemente) {
    if (!confirm(`Cancelar ordem #${t.numero}?`)) return;
    await atualizarTratamento(t.id, { status: "cancelada" });
    await carregar();
  }

  // ── Excluir Ordem ─────────────────────────────────────────────────────────────
  async function excluirOrdem(t: TratamentoSemente) {
    if (!confirm(`Excluir ordem #${t.numero}? Esta ação não pode ser desfeita.`)) return;
    await excluirTratamento(t.id);
    await carregar();
  }

  // ── Abrir Edição ──────────────────────────────────────────────────────────────
  async function abrirEditar(t: TratamentoSemente) {
    // Busca ciclo para saber o ano safra
    const ciclo = ciclos.find(c => c.id === t.ciclo_id);
    setAnoSafraSel(ciclo?.ano_safra_id ?? "");
    setForm({
      ciclo_id:              t.ciclo_id ?? "",
      cultura:               t.cultura ?? "soja",
      cultivar:              t.cultivar ?? "",
      lote_semente:          t.lote_semente ?? "",
      insumo_id:             t.insumo_id ?? "",
      deposito_origem_id:    t.deposito_origem_id ?? "",
      deposito_destino_id:   t.deposito_destino_id ?? "",
      quantidade_sc:         String(t.quantidade_sc ?? ""),
      volume_calda_ml_100kg: String(t.volume_calda_ml_100kg ?? 500),
      data_planejada:        t.data_planejada ?? "",
      operador:              t.operador ?? "",
      equipamento:           t.equipamento ?? "",
      observacao:            t.observacao ?? "",
    });
    setItens(
      (t.tratamento_sementes_itens ?? []).length > 0
        ? (t.tratamento_sementes_itens ?? []).map(it => ({
            _key:         Math.random().toString(36).slice(2),
            insumo_id:    it.insumo_id ?? "",
            produto_nome: it.produto_nome ?? "",
            categoria:    it.categoria ?? "fungicida",
            dose_100kg:   String(it.dose_100kg ?? ""),
            unidade:      it.unidade ?? "mL",
          }))
        : [novoItem()]
    );
    setEditando(t);
    setModalOrdem(true);
  }

  // ── Carregar Receita no Form ──────────────────────────────────────────────────
  function carregarReceita(receitaId: string) {
    const rec = receitas.find(r => r.id === receitaId);
    if (!rec) return;
    setItens(
      (rec.tratamento_receitas_itens ?? []).map(it => ({
        _key:         Math.random().toString(36).slice(2),
        insumo_id:    it.insumo_id ?? "",
        produto_nome: it.produto_nome ?? "",
        categoria:    it.categoria ?? "fungicida",
        dose_100kg:   String(it.dose_100kg ?? ""),
        unidade:      it.unidade ?? "mL",
      }))
    );
    setReceitaSel("");
  }

  // ── Salvar Receita ────────────────────────────────────────────────────────────
  async function salvarReceitaHandler() {
    if (!fazendaId || !formReceita.nome.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const itensSalvar = itensReceita
        .filter(it => it.produto_nome || it.insumo_id)
        .map(it => ({
          insumo_id:    it.insumo_id || null,
          produto_nome: it.produto_nome || null,
          categoria:    it.categoria || null,
          dose_100kg:   Number(it.dose_100kg) || null,
          unidade:      it.unidade || "mL",
          ordem:        0,
        }));

      if (editandoReceita) {
        await atualizarReceita(editandoReceita.id, formReceita, itensSalvar);
      } else {
        await salvarReceita(fazendaId, formReceita, itensSalvar);
      }
      setModalReceita(false);
      setEditandoReceita(null);
      setFormReceita({ nome: "", cultura: "soja", descricao: "" });
      setItensReceita([novoItem()]);
      await carregar();
    } catch (e) {
      setErro((e as { message?: string })?.message ?? "Erro ao salvar receita");
    } finally {
      setSalvando(false);
    }
  }

  // ── Helpers de item ──────────────────────────────────────────────────────────
  function setItem(key: string, field: keyof ItemLocal, val: string, lista: ItemLocal[], setLista: (v: ItemLocal[]) => void) {
    setLista(lista.map(it => it._key === key ? { ...it, [field]: val } : it));
    // Se insumo selecionado, preenche nome automaticamente
    if (field === "insumo_id" && val) {
      const ins = insumosProduto.find(i => i.id === val);
      if (ins) {
        setLista(lista.map(it => it._key === key ? { ...it, insumo_id: val, produto_nome: ins.nome } : it));
      }
    }
  }

  function addItem(lista: ItemLocal[], setLista: (v: ItemLocal[]) => void) {
    setLista([...lista, novoItem()]);
  }

  function removeItem(key: string, lista: ItemLocal[], setLista: (v: ItemLocal[]) => void) {
    setLista(lista.filter(it => it._key !== key));
  }

  // ─── Badge status ─────────────────────────────────────────────────────────────
  function StatusBadge({ status }: { status: string }) {
    const s = STATUS_INFO[status] ?? { label: status, bg: "#EFF0F5", color: "#555" };
    return (
      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: s.bg, color: s.color }}>
        {s.label}
      </span>
    );
  }

  // ─── Tabela de produtos (usada em 3 modais) ───────────────────────────────────
  function TabelaProdutos({
    lista, setLista, qtdSc, readOnly = false,
  }: { lista: ItemLocal[]; setLista: (v: ItemLocal[]) => void; qtdSc: string; readOnly?: boolean }) {
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 120px 80px 70px 28px", gap: 4, marginBottom: 4 }}>
          {["Categoria", "Produto / Insumo", "Dose/100kg", "Unidade", "Total", ""].map(h => (
            <div key={h} style={{ fontSize: 10, color: "#888", fontWeight: 600 }}>{h}</div>
          ))}
        </div>
        {lista.map(it => {
          const total = calcDoseTotal(it, qtdSc);
          return (
            <div key={it._key} style={{ display: "grid", gridTemplateColumns: "120px 1fr 120px 80px 70px 28px", gap: 4, marginBottom: 6, alignItems: "center" }}>
              {/* Categoria */}
              <select
                value={it.categoria}
                onChange={e => setItem(it._key, "categoria", e.target.value, lista, setLista)}
                style={{ ...inp, padding: "6px 8px", fontSize: 12 }}
                disabled={readOnly}
              >
                {CATEGORIAS_PRODUTO.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>

              {/* Produto — insumo do estoque ou nome livre */}
              <div>
                {insumosProduto.length > 0 ? (
                  <select
                    value={it.insumo_id}
                    onChange={e => setItem(it._key, "insumo_id", e.target.value, lista, setLista)}
                    style={{ ...inp, padding: "6px 8px", fontSize: 12, width: "100%" }}
                    disabled={readOnly}
                  >
                    <option value="">— nome livre —</option>
                    {insumosProduto.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                  </select>
                ) : null}
                {!it.insumo_id && (
                  <input
                    value={it.produto_nome}
                    onChange={e => setItem(it._key, "produto_nome", e.target.value, lista, setLista)}
                    placeholder="Nome do produto"
                    style={{ ...inp, padding: "6px 8px", fontSize: 12, marginTop: insumosProduto.length > 0 ? 4 : 0 }}
                    disabled={readOnly}
                  />
                )}
              </div>

              {/* Dose */}
              <input
                type="number" min="0" step="0.01"
                value={it.dose_100kg}
                onChange={e => setItem(it._key, "dose_100kg", e.target.value, lista, setLista)}
                placeholder="ex: 200"
                style={{ ...inp, padding: "6px 8px", fontSize: 12 }}
                disabled={readOnly}
              />

              {/* Unidade */}
              <select
                value={it.unidade}
                onChange={e => setItem(it._key, "unidade", e.target.value, lista, setLista)}
                style={{ ...inp, padding: "6px 8px", fontSize: 12 }}
                disabled={readOnly}
              >
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>

              {/* Total */}
              <div style={{ fontSize: 12, color: "#555", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {qtdSc ? `${fmtN(total, 1)} ${it.unidade}` : "—"}
              </div>

              {/* Remover */}
              {!readOnly && (
                <button
                  onClick={() => removeItem(it._key, lista, setLista)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#B91C1C", fontSize: 16, padding: 0 }}
                  title="Remover"
                >×</button>
              )}
            </div>
          );
        })}
        {!readOnly && (
          <button
            onClick={() => addItem(lista, setLista)}
            style={{ ...btnSm("#F4F6FA", "#1A4870"), border: "0.5px dashed #1A4870", marginTop: 4 }}
          >
            + Produto
          </button>
        )}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "28px 24px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Tratamento de Sementes</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              Controle de ordens de tratamento, consumo de produtos e qualidade das sementes
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {aba === "ordens" && (
              <button onClick={() => { setEditando(null); setForm(formVazio); setItens([novoItem()]); setAnoSafraSel(""); setModalOrdem(true); }} style={btn()}>
                + Nova Ordem
              </button>
            )}
            {aba === "receitas" && (
              <button onClick={() => { setEditandoReceita(null); setFormReceita({ nome: "", cultura: "soja", descricao: "" }); setItensReceita([novoItem()]); setModalReceita(true); }} style={btn()}>
                + Nova Receita
              </button>
            )}
          </div>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[
            { id: "ordens",   label: "Ordens de Tratamento" },
            { id: "receitas", label: "Receitas Salvas" },
          ].map(a => (
            <button key={a.id} onClick={() => setAba(a.id as typeof aba)} style={{
              padding: "8px 18px", border: "none", borderRadius: 8, cursor: "pointer",
              background: aba === a.id ? "#1A4870" : "#fff",
              color:      aba === a.id ? "#fff"    : "#555",
              fontWeight: aba === a.id ? 600        : 400,
              fontSize: 13, boxShadow: "0 1px 3px #0001",
            }}>{a.label}</button>
          ))}
        </div>

        {/* ── ABA ORDENS ────────────────────────────────────────────────────── */}
        {aba === "ordens" && (
          <>
            {/* KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
              {[
                { label: "Planejadas",    valor: kpiPlanejadas,   cor: "#555",    bg: "#EFF0F5" },
                { label: "Em Tratamento", valor: kpiEmTratamento, cor: "#C9921B", bg: "#FBF3E0" },
                { label: "Concluídas",    valor: kpiConcluidas,   cor: "#15803D", bg: "#DCFCE7" },
                { label: "Total (sc)",    valor: fmtN(kpiTotalSc, 0), cor: "#1A4870", bg: "#D5E8F5" },
              ].map(k => (
                <div key={k.label} style={{ ...card, padding: "16px 20px" }}>
                  <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: k.cor }}>{k.valor}</div>
                </div>
              ))}
            </div>

            {/* Filtros */}
            <div style={{ ...card, padding: "14px 20px", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                {/* Status */}
                <div style={{ display: "flex", gap: 4 }}>
                  {[
                    { id: "todos",         label: "Todos" },
                    { id: "planejada",     label: "Planejadas" },
                    { id: "em_tratamento", label: "Em Tratamento" },
                    { id: "concluida",     label: "Concluídas" },
                    { id: "cancelada",     label: "Canceladas" },
                  ].map(s => (
                    <button key={s.id} onClick={() => setFiltroStatus(s.id)} style={{
                      padding: "5px 12px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12,
                      background: filtroStatus === s.id ? "#1A4870" : "#F4F6FA",
                      color:      filtroStatus === s.id ? "#fff"    : "#555",
                    }}>{s.label}</button>
                  ))}
                </div>

                {/* Ano Safra */}
                <select
                  value={anoSafraFiltro}
                  onChange={e => setAnoSafraFiltro(e.target.value)}
                  style={{ ...inp, width: 160, padding: "6px 10px" }}
                >
                  <option value="">Todos os anos</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>

                {/* Busca */}
                <input
                  value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por cultivar, lote, cultura..."
                  style={{ ...inp, width: 240, padding: "6px 10px" }}
                />

                <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>
                  {listaFiltrada.length} ordem{listaFiltrada.length !== 1 ? "ns" : ""}
                </span>
              </div>
            </div>

            {/* Tabela */}
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE" }}>
                    {["Nº", "Safra / Ciclo", "Cultura / Cultivar", "Lote", "Qtd. (sc)", "Produtos", "Data Prev.", "Status", ""].map(h => (
                      <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: "#555", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listaFiltrada.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
                      Nenhuma ordem encontrada. Clique em "+ Nova Ordem" para começar.
                    </td></tr>
                  )}
                  {listaFiltrada.map((t, idx) => {
                    const ciclo = ciclos.find(c => c.id === t.ciclo_id);
                    const ano   = anosSafra.find(a => a.id === ciclo?.ano_safra_id);
                    const nProd = (t.tratamento_sementes_itens ?? []).length;
                    return (
                      <tr key={t.id} style={{ borderBottom: "0.5px solid #DDE2EE", background: idx % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                        <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#1A4870" }}>
                          #{String(t.numero ?? "—").padStart(3, "0")}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>
                          {ano ? <div style={{ fontSize: 11, color: "#888" }}>{ano.descricao}</div> : null}
                          {ciclo?.descricao ?? "—"}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 13 }}>
                          <div style={{ fontWeight: 600 }}>{CULTURAS[t.cultura ?? ""] ?? t.cultura ?? "—"}</div>
                          {t.cultivar && <div style={{ fontSize: 11, color: "#666" }}>{t.cultivar}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{t.lote_semente ?? "—"}</td>
                        <td style={{ padding: "10px 14px", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                          {t.quantidade_sc != null ? fmtN(t.quantidade_sc, 0) : "—"}
                          {t.quantidade_kg != null && (
                            <div style={{ fontSize: 11, color: "#888" }}>{fmtN(t.quantidade_kg, 0)} kg</div>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12 }}>
                          {nProd > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                              {(t.tratamento_sementes_itens ?? []).slice(0, 3).map((it, i) => {
                                const cat = CATEGORIAS_PRODUTO.find(c => c.id === it.categoria);
                                return (
                                  <span key={i} style={{
                                    fontSize: 10, padding: "2px 7px", borderRadius: 10,
                                    background: (cat?.cor ?? "#888") + "20",
                                    color: cat?.cor ?? "#555", fontWeight: 600,
                                  }}>
                                    {cat?.label ?? it.categoria ?? "—"}
                                  </span>
                                );
                              })}
                              {nProd > 3 && <span style={{ fontSize: 10, color: "#888" }}>+{nProd - 3}</span>}
                            </div>
                          ) : <span style={{ color: "#ccc" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{fmtData(t.data_planejada)}</td>
                        <td style={{ padding: "10px 14px" }}><StatusBadge status={t.status} /></td>
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            {/* Detalhe */}
                            <button
                              onClick={() => { setDetalhe(t); setModalDetalhe(true); }}
                              style={btnSm("#F4F6FA", "#1A4870")}
                              title="Ver detalhe"
                            >Detalhe</button>

                            {/* Iniciar */}
                            {t.status === "planejada" && (
                              <button onClick={() => iniciarTratamento(t)} style={btnSm("#FBF3E0", "#C9921B")}>Iniciar</button>
                            )}

                            {/* Concluir */}
                            {t.status === "em_tratamento" && (
                              <button onClick={() => abrirConcluir(t)} style={btnSm("#DCFCE7", "#15803D")}>Concluir</button>
                            )}

                            {/* Editar */}
                            {(t.status === "planejada") && (
                              <button onClick={() => abrirEditar(t)} style={btnSm("#F4F6FA", "#1A4870")}>Editar</button>
                            )}

                            {/* Cancelar */}
                            {["planejada", "em_tratamento"].includes(t.status) && (
                              <button onClick={() => cancelarOrdem(t)} style={btnSm("#FEECEC", "#B91C1C")}>Cancelar</button>
                            )}

                            {/* Excluir */}
                            {t.status === "cancelada" && (
                              <button onClick={() => excluirOrdem(t)} style={btnSm("#FEECEC", "#B91C1C")}>Excluir</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── ABA RECEITAS ──────────────────────────────────────────────────── */}
        {aba === "receitas" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 16 }}>
            {receitas.length === 0 && (
              <div style={{ ...card, textAlign: "center", padding: 40, gridColumn: "1/-1" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🧪</div>
                <div style={{ color: "#888", fontSize: 14 }}>Nenhuma receita salva.</div>
                <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>Crie receitas para reutilizar rapidamente nos tratamentos.</div>
              </div>
            )}
            {receitas.map(r => (
              <div key={r.id} style={{ ...card }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.nome}</div>
                    {r.cultura && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{CULTURAS[r.cultura] ?? r.cultura}</div>}
                    {r.descricao && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{r.descricao}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => {
                        setEditandoReceita(r);
                        setFormReceita({ nome: r.nome, cultura: r.cultura ?? "soja", descricao: r.descricao ?? "" });
                        setItensReceita(
                          (r.tratamento_receitas_itens ?? []).map(it => ({
                            _key:         Math.random().toString(36).slice(2),
                            insumo_id:    it.insumo_id ?? "",
                            produto_nome: it.produto_nome ?? "",
                            categoria:    it.categoria ?? "fungicida",
                            dose_100kg:   String(it.dose_100kg ?? ""),
                            unidade:      it.unidade ?? "mL",
                          }))
                        );
                        setModalReceita(true);
                      }}
                      style={btnSm("#F4F6FA", "#1A4870")}
                    >Editar</button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Excluir receita "${r.nome}"?`)) return;
                        await excluirReceita(r.id);
                        await carregar();
                      }}
                      style={btnSm("#FEECEC", "#B91C1C")}
                    >Excluir</button>
                  </div>
                </div>

                {/* Produtos da receita */}
                <div style={{ borderTop: "0.5px solid #DDE2EE", paddingTop: 10 }}>
                  {(r.tratamento_receitas_itens ?? []).length === 0
                    ? <div style={{ color: "#ccc", fontSize: 12 }}>Sem produtos cadastrados</div>
                    : (r.tratamento_receitas_itens ?? []).map((it, i) => {
                        const cat = CATEGORIAS_PRODUTO.find(c => c.id === it.categoria);
                        const ins = insumosProduto.find(p => p.id === it.insumo_id);
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{
                                fontSize: 10, padding: "2px 7px", borderRadius: 10,
                                background: (cat?.cor ?? "#888") + "20", color: cat?.cor ?? "#555", fontWeight: 600,
                              }}>{cat?.label ?? it.categoria}</span>
                              <span style={{ fontSize: 12 }}>{ins?.nome ?? it.produto_nome ?? "—"}</span>
                            </div>
                            <span style={{ fontSize: 12, color: "#555", fontVariantNumeric: "tabular-nums" }}>
                              {it.dose_100kg} {it.unidade}/100kg
                            </span>
                          </div>
                        );
                      })
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL — NOVA / EDITAR ORDEM
      ═══════════════════════════════════════════════════════════════════════ */}
      {modalOrdem && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 800, maxHeight: "92vh", overflow: "auto", padding: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {editando ? `Editar Ordem #${String(editando.numero ?? "").padStart(3, "0")}` : "Nova Ordem de Tratamento"}
              </h2>
              <button onClick={() => { setModalOrdem(false); setEditando(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#555" }}>×</button>
            </div>

            {erro && <div style={{ background: "#FEECEC", border: "0.5px solid #F4B3B3", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#B91C1C" }}>{erro}</div>}

            {/* Seção 1: Identificação */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, borderBottom: "0.5px solid #DDE2EE", paddingBottom: 6 }}>
                IDENTIFICAÇÃO
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Ano Safra</label>
                  <select value={anoSafraSel} onChange={e => { setAnoSafraSel(e.target.value); setForm(f => ({ ...f, ciclo_id: "" })); }} style={inp}>
                    <option value="">Selecione...</option>
                    {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Ciclo</label>
                  <select value={form.ciclo_id} onChange={e => setForm(f => ({ ...f, ciclo_id: e.target.value }))} style={inp}>
                    <option value="">Selecione...</option>
                    {ciclosFiltrados.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Data Prevista</label>
                  <input type="date" value={form.data_planejada} onChange={e => setForm(f => ({ ...f, data_planejada: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Cultura *</label>
                  <select value={form.cultura} onChange={e => setForm(f => ({ ...f, cultura: e.target.value }))} style={inp}>
                    {Object.entries(CULTURAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Cultivar / Variedade</label>
                  <input value={form.cultivar} onChange={e => setForm(f => ({ ...f, cultivar: e.target.value }))} placeholder="Ex: TMG7062 IPRO" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Lote da Semente</label>
                  <input value={form.lote_semente} onChange={e => setForm(f => ({ ...f, lote_semente: e.target.value }))} placeholder="Ex: L240815-A" style={inp} />
                </div>
              </div>
            </div>

            {/* Seção 2: Semente */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, borderBottom: "0.5px solid #DDE2EE", paddingBottom: 6 }}>
                SEMENTE
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 130px 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Semente (do estoque)</label>
                  <select value={form.insumo_id} onChange={e => setForm(f => ({ ...f, insumo_id: e.target.value }))} style={inp}>
                    <option value="">— sem vínculo —</option>
                    {insumosSemente.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Depósito de Origem</label>
                  <select value={form.deposito_origem_id} onChange={e => setForm(f => ({ ...f, deposito_origem_id: e.target.value }))} style={inp}>
                    <option value="">—</option>
                    {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Quantidade (sc) *</label>
                  <input
                    type="number" min="0" step="1"
                    value={form.quantidade_sc}
                    onChange={e => setForm(f => ({ ...f, quantidade_sc: e.target.value }))}
                    placeholder="sacas"
                    style={inp}
                  />
                  {form.quantidade_sc && (
                    <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{qtdKgStr} kg</div>
                  )}
                </div>
                <div>
                  <label style={lbl}>Depósito de Destino</label>
                  <select value={form.deposito_destino_id} onChange={e => setForm(f => ({ ...f, deposito_destino_id: e.target.value }))} style={inp}>
                    <option value="">—</option>
                    {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Seção 3: Produtos de Tratamento */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, borderBottom: "0.5px solid #DDE2EE", paddingBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870" }}>PRODUTOS DE TRATAMENTO</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {receitas.length > 0 && (
                    <>
                      <span style={{ fontSize: 12, color: "#888" }}>Carregar receita:</span>
                      <select value={receitaSel} onChange={e => { setReceitaSel(e.target.value); if (e.target.value) carregarReceita(e.target.value); }} style={{ ...inp, width: 200, padding: "5px 8px" }}>
                        <option value="">— selecione —</option>
                        {receitas.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                      </select>
                    </>
                  )}
                  <span style={{ fontSize: 12, color: "#555" }}>Vol. calda:</span>
                  <input
                    type="number" min="0"
                    value={form.volume_calda_ml_100kg}
                    onChange={e => setForm(f => ({ ...f, volume_calda_ml_100kg: e.target.value }))}
                    style={{ ...inp, width: 80, padding: "5px 8px" }}
                  />
                  <span style={{ fontSize: 12, color: "#888" }}>mL/100kg</span>
                </div>
              </div>
              <TabelaProdutos lista={itens} setLista={setItens} qtdSc={form.quantidade_sc} />
            </div>

            {/* Seção 4: Responsável */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, borderBottom: "0.5px solid #DDE2EE", paddingBottom: 6 }}>
                RESPONSÁVEL / EQUIPAMENTO
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Operador</label>
                  <input value={form.operador} onChange={e => setForm(f => ({ ...f, operador: e.target.value }))} placeholder="Nome do operador" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Equipamento / Tratadora</label>
                  <input value={form.equipamento} onChange={e => setForm(f => ({ ...f, equipamento: e.target.value }))} placeholder="Ex: Tratadora Móbil M100" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Observação</label>
                  <input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Observações gerais" style={inp} />
                </div>
              </div>
            </div>

            {/* Botões */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => { setModalOrdem(false); setEditando(null); }} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>Cancelar</button>
              <button onClick={salvarOrdem} disabled={salvando} style={btn()}>
                {salvando ? "Salvando..." : editando ? "Salvar Alterações" : "Criar Ordem"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL — CONCLUIR TRATAMENTO
      ═══════════════════════════════════════════════════════════════════════ */}
      {modalConcluir && concluindo && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "92vh", overflow: "auto", padding: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                Concluir Ordem #{String(concluindo.numero ?? "").padStart(3, "0")}
              </h2>
              <button onClick={() => { setModalConcluir(false); setConcluindo(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#555" }}>×</button>
            </div>

            <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13 }}>
              <b>{CULTURAS[concluindo.cultura ?? ""] ?? concluindo.cultura}</b>
              {concluindo.cultivar ? ` — ${concluindo.cultivar}` : ""}
              {concluindo.lote_semente ? ` | Lote: ${concluindo.lote_semente}` : ""}
            </div>

            {erro && <div style={{ background: "#FEECEC", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#B91C1C" }}>{erro}</div>}

            {/* Dados de execução */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, borderBottom: "0.5px solid #DDE2EE", paddingBottom: 6 }}>EXECUÇÃO</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>Qtd. Tratada (sc) *</label>
                  <input type="number" min="0" value={formConcluir.quantidade_sc} onChange={e => setFormConcluir(f => ({ ...f, quantidade_sc: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Operador</label>
                  <input value={formConcluir.operador} onChange={e => setFormConcluir(f => ({ ...f, operador: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Equipamento</label>
                  <input value={formConcluir.equipamento} onChange={e => setFormConcluir(f => ({ ...f, equipamento: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Data / Hora Início</label>
                  <input type="datetime-local" value={formConcluir.data_inicio} onChange={e => setFormConcluir(f => ({ ...f, data_inicio: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Data / Hora Conclusão</label>
                  <input type="datetime-local" value={formConcluir.data_conclusao} onChange={e => setFormConcluir(f => ({ ...f, data_conclusao: e.target.value }))} style={inp} />
                </div>
              </div>
            </div>

            {/* Qualidade */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, borderBottom: "0.5px solid #DDE2EE", paddingBottom: 6 }}>RESULTADO DE QUALIDADE</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Germinação (%)</label>
                  <input type="number" min="0" max="100" step="0.1" value={formConcluir.germinacao_pct} onChange={e => setFormConcluir(f => ({ ...f, germinacao_pct: e.target.value }))} placeholder="Ex: 92" style={inp} />
                  {Number(formConcluir.germinacao_pct) > 0 && (
                    <div style={{ fontSize: 11, marginTop: 3, color: Number(formConcluir.germinacao_pct) >= 80 ? "#15803D" : "#B91C1C", fontWeight: 600 }}>
                      {Number(formConcluir.germinacao_pct) >= 80 ? "✓ Acima do mínimo legal (80%)" : "⚠ Abaixo do mínimo legal (80%)"}
                    </div>
                  )}
                </div>
                <div>
                  <label style={lbl}>Vigor (%)</label>
                  <input type="number" min="0" max="100" step="0.1" value={formConcluir.vigor_pct} onChange={e => setFormConcluir(f => ({ ...f, vigor_pct: e.target.value }))} placeholder="Ex: 88" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Umidade (%)</label>
                  <input type="number" min="0" max="100" step="0.1" value={formConcluir.umidade_pct} onChange={e => setFormConcluir(f => ({ ...f, umidade_pct: e.target.value }))} placeholder="Ex: 12" style={inp} />
                  {Number(formConcluir.umidade_pct) > 0 && (
                    <div style={{ fontSize: 11, marginTop: 3, color: Number(formConcluir.umidade_pct) <= 13 ? "#15803D" : "#EF9F27", fontWeight: 600 }}>
                      {Number(formConcluir.umidade_pct) <= 13 ? "✓ Adequada para armazenagem" : "⚠ Umidade elevada — risco de fungos"}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Consumo por produto */}
            {itensConcluir.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, borderBottom: "0.5px solid #DDE2EE", paddingBottom: 6 }}>
                  CONSUMO REAL DOS PRODUTOS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px", gap: 8, marginBottom: 6 }}>
                  {["Produto", "Calculado", "Real"].map(h => (
                    <div key={h} style={{ fontSize: 10, color: "#888", fontWeight: 600 }}>{h}</div>
                  ))}
                </div>
                {itensConcluir.map((it, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13 }}>{it.produto_nome}</div>
                    <div style={{ fontSize: 12, color: "#888", fontVariantNumeric: "tabular-nums" }}>
                      {fmtN(it.dose_total, 1)} {it.unidade}
                    </div>
                    <input
                      type="number" min="0" step="0.01"
                      value={it.consumo_real}
                      onChange={e => setItensConcluir(prev => prev.map((x, j) => j === i ? { ...x, consumo_real: e.target.value } : x))}
                      style={{ ...inp, padding: "5px 8px", fontSize: 12 }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Baixar estoque */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={formConcluir.baixar_estoque}
                  onChange={e => setFormConcluir(f => ({ ...f, baixar_estoque: e.target.checked }))}
                />
                Baixar automaticamente o consumo dos produtos do estoque
              </label>
              {formConcluir.baixar_estoque && itensConcluir.some(it => !concluindo.tratamento_sementes_itens?.find((_, i2) => i2 === itensConcluir.indexOf(it))?.insumo_id) && (
                <div style={{ fontSize: 11, color: "#EF9F27", marginTop: 4 }}>
                  ⚠ Produtos sem vínculo com estoque não serão baixados automaticamente.
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => { setModalConcluir(false); setConcluindo(null); }} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>Cancelar</button>
              <button onClick={confirmarConclusao} disabled={salvando} style={btn("#15803D")}>
                {salvando ? "Salvando..." : "Confirmar Conclusão"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL — DETALHE
      ═══════════════════════════════════════════════════════════════════════ */}
      {modalDetalhe && detalhe && (() => {
        const ciclo = ciclos.find(c => c.id === detalhe.ciclo_id);
        const ano   = anosSafra.find(a => a.id === ciclo?.ano_safra_id);
        const depOri = depositos.find(d => d.id === detalhe.deposito_origem_id);
        const depDes = depositos.find(d => d.id === detalhe.deposito_destino_id);
        return (
          <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "92vh", overflow: "auto", padding: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                    Ordem #{String(detalhe.numero ?? "").padStart(3, "0")}
                  </h2>
                  <div style={{ marginTop: 4 }}><StatusBadge status={detalhe.status} /></div>
                </div>
                <button onClick={() => { setModalDetalhe(false); setDetalhe(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#555" }}>×</button>
              </div>

              {/* Info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                {[
                  { label: "Cultura",        valor: CULTURAS[detalhe.cultura ?? ""] ?? detalhe.cultura ?? "—" },
                  { label: "Cultivar",       valor: detalhe.cultivar ?? "—" },
                  { label: "Lote",           valor: detalhe.lote_semente ?? "—" },
                  { label: "Ano Safra",      valor: ano?.descricao ?? "—" },
                  { label: "Ciclo",          valor: ciclo?.descricao ?? "—" },
                  { label: "Data Prevista",  valor: fmtData(detalhe.data_planejada) },
                  { label: "Quantidade",     valor: detalhe.quantidade_sc ? `${fmtN(detalhe.quantidade_sc, 0)} sc (${fmtN(detalhe.quantidade_kg, 0)} kg)` : "—" },
                  { label: "Vol. Calda",     valor: detalhe.volume_calda_ml_100kg ? `${detalhe.volume_calda_ml_100kg} mL/100kg` : "—" },
                  { label: "Depósito Origem",  valor: depOri?.nome ?? "—" },
                  { label: "Depósito Destino", valor: depDes?.nome ?? "—" },
                  { label: "Operador",       valor: detalhe.operador ?? "—" },
                  { label: "Equipamento",    valor: detalhe.equipamento ?? "—" },
                ].map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: 11, color: "#888" }}>{f.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{f.valor}</div>
                  </div>
                ))}
              </div>

              {/* Qualidade (se concluída) */}
              {detalhe.status === "concluida" && (
                <div style={{ background: "#F4F6FA", borderRadius: 10, padding: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10 }}>RESULTADO DE QUALIDADE</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {[
                      { label: "Germinação", valor: detalhe.germinacao_pct, sufixo: "%", alerta: (v: number) => v < 80 },
                      { label: "Vigor",      valor: detalhe.vigor_pct,      sufixo: "%", alerta: () => false },
                      { label: "Umidade",    valor: detalhe.umidade_pct,    sufixo: "%", alerta: (v: number) => v > 13 },
                    ].map(q => (
                      <div key={q.label} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 11, color: "#888" }}>{q.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: q.valor != null && q.alerta(q.valor) ? "#B91C1C" : "#15803D" }}>
                          {q.valor != null ? fmtN(q.valor, 1) : "—"}{q.sufixo}
                        </div>
                      </div>
                    ))}
                  </div>
                  {detalhe.data_inicio && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 10 }}>
                      Início: {fmtData(detalhe.data_inicio)} | Conclusão: {fmtData(detalhe.data_conclusao)}
                    </div>
                  )}
                </div>
              )}

              {/* Produtos */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 10 }}>PRODUTOS APLICADOS</div>
                {(detalhe.tratamento_sementes_itens ?? []).length === 0
                  ? <div style={{ color: "#aaa", fontSize: 13 }}>Nenhum produto registrado.</div>
                  : (detalhe.tratamento_sementes_itens ?? []).map((it, i) => {
                      const cat = CATEGORIAS_PRODUTO.find(c => c.id === it.categoria);
                      const ins = insumosProduto.find(p => p.id === it.insumo_id);
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid #F0F0F0" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: (cat?.cor ?? "#888") + "20", color: cat?.cor ?? "#555", fontWeight: 600 }}>
                              {cat?.label ?? it.categoria}
                            </span>
                            <span style={{ fontSize: 13 }}>{ins?.nome ?? it.produto_nome ?? "—"}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#555", textAlign: "right" }}>
                            <div>{it.dose_100kg} {it.unidade}/100kg</div>
                            {it.dose_total != null && <div style={{ color: "#888" }}>Total: {fmtN(it.dose_total, 1)} {it.unidade}</div>}
                            {it.consumo_real != null && it.consumo_real !== it.dose_total && (
                              <div style={{ color: "#C9921B" }}>Real: {fmtN(it.consumo_real, 1)} {it.unidade}</div>
                            )}
                          </div>
                        </div>
                      );
                    })
                }
              </div>

              {detalhe.observacao && (
                <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#555" }}>
                  <b>Obs:</b> {detalhe.observacao}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
                <button onClick={() => { setModalDetalhe(false); setDetalhe(null); }} style={btn()}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL — NOVA / EDITAR RECEITA
      ═══════════════════════════════════════════════════════════════════════ */}
      {modalReceita && (
        <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "92vh", overflow: "auto", padding: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {editandoReceita ? "Editar Receita" : "Nova Receita de Tratamento"}
              </h2>
              <button onClick={() => { setModalReceita(false); setEditandoReceita(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#555" }}>×</button>
            </div>

            {erro && <div style={{ background: "#FEECEC", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#B91C1C" }}>{erro}</div>}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 14, marginBottom: 20 }}>
              <div>
                <label style={lbl}>Nome da Receita *</label>
                <input value={formReceita.nome} onChange={e => setFormReceita(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Padrão Soja BT" style={inp} />
              </div>
              <div>
                <label style={lbl}>Cultura</label>
                <select value={formReceita.cultura} onChange={e => setFormReceita(f => ({ ...f, cultura: e.target.value }))} style={inp}>
                  {Object.entries(CULTURAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Descrição</label>
                <input value={formReceita.descricao} onChange={e => setFormReceita(f => ({ ...f, descricao: e.target.value }))} placeholder="Observação ou finalidade" style={inp} />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, borderBottom: "0.5px solid #DDE2EE", paddingBottom: 6 }}>
                PRODUTOS (doses por 100 kg de semente)
              </div>
              <TabelaProdutos lista={itensReceita} setLista={setItensReceita} qtdSc="100" />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => { setModalReceita(false); setEditandoReceita(null); }} style={{ ...btn("#F4F6FA", "#555"), border: "0.5px solid #DDE2EE" }}>Cancelar</button>
              <button onClick={salvarReceitaHandler} disabled={salvando || !formReceita.nome.trim()} style={btn()}>
                {salvando ? "Salvando..." : editandoReceita ? "Salvar Alterações" : "Criar Receita"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
