"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import CascadeSelector, { type CascadeValues } from "../../../components/CascadeSelector";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarTalhoes, listarInsumos, listarTodosCiclos, listarFazendas,
  listarAplicacoesAereasDaConta, criarAplicacaoAerea, atualizarAplicacaoAerea,
  excluirAplicacaoAerea, listarAplicacaoAereaTalhoes, salvarAplicacaoAereaTalhoes,
  listarAplicacaoAereaItens, salvarAplicacaoAereaItens,
  listarEmpresasAplicadoras, salvarEmpresaAplicadora, excluirEmpresaAplicadora,
} from "../../../lib/db";
import type {
  Talhao, Insumo, Ciclo, Fazenda,
  AplicacaoAerea, AplicacaoAereaItem, AplicacaoAereaTalhao,
  EmpresaAplicadora, TipoAeronave, TipoAplicacaoAerea,
} from "../../../lib/supabase";

// ─── Estilos ─────────────────────────────────────────────────────────────────

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", fontWeight: 600 };
const secTit: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, marginTop: 20, paddingBottom: 5, borderBottom: "0.5px solid var(--border-table)" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid var(--border-table)", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text-2)" };
const btnS: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid var(--border-table)", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" };
const btnX: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #E24B4A50", borderRadius: 6, background: "#FCEBEB", cursor: "pointer", fontSize: 11, color: "#791F1F" };
const card: React.CSSProperties = { background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "16px 20px" };
const gridG = (cols: string): React.CSSProperties => ({ display: "grid", gridTemplateColumns: cols, gap: 12 });

const fmtBRL = (v?: number | null) => v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtN   = (v?: number | null, d = 1) => v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const fmtDate = (s?: string) => s ? s.split("-").reverse().join("/") : "—";

// ─── Configs ─────────────────────────────────────────────────────────────────

const TIPO_AERONAVE: Partial<Record<TipoAeronave, { label: string; icon: string; bg: string; cor: string }>> = {
  aviao: { label: "Avião Agrícola", icon: "✈️", bg: "#E6F1FB", cor: "#0B2D50" },
  drone: { label: "Drone / RPAS",   icon: "🚁", bg: "#F0FDF4", cor: "#14532D" },
};

const TIPO_APLIC: Record<TipoAplicacaoAerea, { label: string; bg: string; cor: string }> = {
  fungicida:          { label: "Fungicida",             bg: "#E6F1FB", cor: "#0C447C" },
  inseticida:         { label: "Inseticida",            bg: "#FBF0D8", cor: "#7A5A12" },
  herbicida:          { label: "Herbicida",             bg: "#FAEEDA", cor: "#633806" },
  fertilizante_foliar:{ label: "Fertilizante Foliar",   bg: "#D5E8F5", cor: "#0B2D50" },
  dessecacao:         { label: "Dessecação",            bg: "#F8EBE0", cor: "#7A2E00" },
  bactericida:        { label: "Bactericida",           bg: "#EDE9FE", cor: "#4C1D95" },
  outros:             { label: "Outros",                bg: "#F3F4F6", cor: "#374151" },
};

const DIRECOES = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
const ESTADIOS = ["VE","V1","V2","V3","V4","V5","V6","R1","R2","R3","R4","R5","R6","R7","R8","Pré-emergência","Pós-emergência","B1","B2","B3","F1","F2","F3","F4","F5","F6","F7","F8"];
const UNIDADES = ["L/ha","mL/ha","kg/ha","g/ha","L","kg"];

// Limites legais (ANAC / MAPA)
const VENTO_MAX: Record<string, number> = { aviao: 3, drone: 5 }; // m/s
const VENTO_MAX_KMH: Record<string, number> = { aviao: 10.8, drone: 18 };

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type ItemForm = { insumo_id: string; nome_produto: string; dose_ha: string; unidade: string; valor_unitario: string };
type TalhaoSel = { talhao_id: string; area_ha: number };

const itemVazio = (): ItemForm => ({ insumo_id: "", nome_produto: "", dose_ha: "", unidade: "L/ha", valor_unitario: "" });

const formVazio = () => ({
  ciclo_id: "",
  empresa_aplicadora_id: "",
  empresa_nome: "",
  tipo_aeronave: "aviao" as TipoAeronave,
  aeronave_prefixo: "",
  piloto: "",
  tipo: "fungicida" as TipoAplicacaoAerea,
  estadio_fenologico: "",
  data_aplicacao: new Date().toISOString().split("T")[0],
  volume_calda_l_ha: "",
  altura_voo_m: "",
  velocidade_vento_kmh: "",
  temperatura_c: "",
  umidade_rel_pct: "",
  direcao_vento: "",
  art_numero: "",
  cloa_numero: "",
  custo_ha: "",
  observacao: "",
  fiscal: false,
});

const empresaVazia = (): Omit<EmpresaAplicadora, "id" | "created_at"> => ({
  razao_social: "", cnpj: "", cloa_numero: "", cloa_vencimento: "",
  responsavel_tecnico: "", crea: "", telefone: "", email: "", observacao: "", ativo: true,
});

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AplicacaoAereaPage() {
  const { fazendaId, contaId } = useAuth();
  const [cascade, setCascade] = useState<Partial<CascadeValues>>({});
  const fid = cascade.fazendaId ?? fazendaId ?? "";

  const [aba, setAba] = useState<"operacoes" | "empresas">("operacoes");
  const [modal, setModal] = useState(false);
  const [modalEmpresa, setModalEmpresa] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [editandoEmpresa, setEditandoEmpresa] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [detalheItens, setDetalheItens] = useState<AplicacaoAereaItem[]>([]);
  const [detalheTalhoes, setDetalheTalhoes] = useState<AplicacaoAereaTalhao[]>([]);

  // Dados
  const [aplicacoes, setAplicacoes]   = useState<AplicacaoAerea[]>([]);
  const [empresas, setEmpresas]       = useState<EmpresaAplicadora[]>([]);
  const [talhoes, setTalhoes]         = useState<Talhao[]>([]);
  const [insumos, setInsumos]         = useState<Insumo[]>([]);
  const [ciclos, setCiclos]           = useState<Ciclo[]>([]);
  const [fazendas, setFazendas]       = useState<Fazenda[]>([]);

  // Filtros
  const [filtroCiclo, setFiltroCiclo]   = useState("");
  const [filtroTipo, setFiltroTipo]     = useState("");
  const [filtroBusca, setFiltroBusca]   = useState("");

  // Form
  const [form, setForm]               = useState(formVazio());
  const [talhoesSelec, setTalhoesSelec] = useState<TalhaoSel[]>([]);
  const [itens, setItens]             = useState<ItemForm[]>([itemVazio()]);
  const [formEmpresa, setFormEmpresa] = useState(empresaVazia());
  const sf = (k: keyof ReturnType<typeof formVazio>, v: unknown) => setForm(p => ({ ...p, [k]: v }));

  // Carregamento
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [apls, tals, ins, cics, faz, emps] = await Promise.all([
      listarAplicacoesAereasDaConta(fazendaId),
      listarTalhoes(fid || fazendaId),
      listarInsumos(fazendaId),
      listarTodosCiclos(fid || fazendaId),
      listarFazendas(fazendaId),
      contaId ? listarEmpresasAplicadoras(contaId) : Promise.resolve([]),
    ]);
    setAplicacoes(apls);
    setTalhoes(tals);
    setInsumos(ins.filter(i => i.tipo === "insumo"));
    setCiclos(cics);
    setFazendas(faz);
    setEmpresas(emps);
  }, [fazendaId, fid, contaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Talhões ao trocar fazenda no cascade
  useEffect(() => {
    if (!cascade.fazendaId) return;
    listarTalhoes(cascade.fazendaId).then(setTalhoes);
    listarTodosCiclos(cascade.fazendaId).then(setCiclos);
  }, [cascade.fazendaId]);

  // ─── Detalhe expandido ───────────────────────────────────────────────────
  async function abrirDetalhe(id: string) {
    if (expandido === id) { setExpandido(null); return; }
    setExpandido(id);
    const [its, tals] = await Promise.all([
      listarAplicacaoAereaItens(id),
      listarAplicacaoAereaTalhoes(id),
    ]);
    setDetalheItens(its);
    setDetalheTalhoes(tals);
  }

  // ─── Abrir modal edição ───────────────────────────────────────────────────
  async function abrirEditar(a: AplicacaoAerea) {
    const [its, tals] = await Promise.all([
      listarAplicacaoAereaItens(a.id),
      listarAplicacaoAereaTalhoes(a.id),
    ]);
    setForm({
      ciclo_id: a.ciclo_id,
      empresa_aplicadora_id: a.empresa_aplicadora_id ?? "",
      empresa_nome: a.empresa_nome ?? "",
      tipo_aeronave: a.tipo_aeronave,
      aeronave_prefixo: a.aeronave_prefixo ?? "",
      piloto: a.piloto ?? "",
      tipo: a.tipo,
      estadio_fenologico: a.estadio_fenologico ?? "",
      data_aplicacao: a.data_aplicacao,
      volume_calda_l_ha: a.volume_calda_l_ha?.toString() ?? "",
      altura_voo_m: a.altura_voo_m?.toString() ?? "",
      velocidade_vento_kmh: a.velocidade_vento_kmh?.toString() ?? "",
      temperatura_c: a.temperatura_c?.toString() ?? "",
      umidade_rel_pct: a.umidade_rel_pct?.toString() ?? "",
      direcao_vento: a.direcao_vento ?? "",
      art_numero: a.art_numero ?? "",
      cloa_numero: a.cloa_numero ?? "",
      custo_ha: a.custo_ha?.toString() ?? "",
      observacao: a.observacao ?? "",
      fiscal: a.fiscal ?? false,
    });
    setTalhoesSelec(tals.map(t => ({ talhao_id: t.talhao_id, area_ha: t.area_ha ?? t.talhao?.area_ha ?? 0 })));
    setItens(its.length ? its.map(i => ({ insumo_id: i.insumo_id ?? "", nome_produto: i.nome_produto, dose_ha: i.dose_ha.toString(), unidade: i.unidade, valor_unitario: i.valor_unitario?.toString() ?? "" })) : [itemVazio()]);
    setEditando(a.id);
    setModal(true);
  }

  function abrirNovo() {
    setForm(formVazio());
    setTalhoesSelec([]);
    setItens([itemVazio()]);
    setEditando(null);
    setModal(true);
  }

  // ─── Talhão toggle ───────────────────────────────────────────────────────
  function toggleTalhao(t: Talhao) {
    setTalhoesSelec(prev => {
      const ja = prev.find(x => x.talhao_id === t.id);
      if (ja) return prev.filter(x => x.talhao_id !== t.id);
      return [...prev, { talhao_id: t.id, area_ha: t.area_ha ?? 0 }];
    });
  }

  const areaTotal = talhoesSelec.reduce((s, t) => s + t.area_ha, 0);

  // ─── Cálculos ────────────────────────────────────────────────────────────
  const custoHa = parseFloat(form.custo_ha) || 0;
  const custoTotal = custoHa * areaTotal;

  function calcItens(): AplicacaoAereaItem[] {
    return itens.filter(i => i.nome_produto).map(i => {
      const doseHa = parseFloat(i.dose_ha) || 0;
      const vu = parseFloat(i.valor_unitario) || 0;
      const totalConsumido = doseHa * areaTotal;
      const custoHaItem = vu * doseHa;
      const custoTotalItem = custoHaItem * areaTotal;
      return {
        insumo_id: i.insumo_id || null,
        nome_produto: i.nome_produto,
        dose_ha: doseHa,
        unidade: i.unidade,
        total_consumido: totalConsumido,
        valor_unitario: vu,
        custo_ha: custoHaItem,
        custo_total: custoTotalItem,
      } as AplicacaoAereaItem;
    });
  }

  // ─── Alerta vento ────────────────────────────────────────────────────────
  const ventoKmh = parseFloat(form.velocidade_vento_kmh) || 0;
  const ventoAlerta = ventoKmh > 0 && ventoKmh > VENTO_MAX_KMH[form.tipo_aeronave];

  // ─── Salvar operação ─────────────────────────────────────────────────────
  async function salvar() {
    if (!form.ciclo_id || !form.data_aplicacao || talhoesSelec.length === 0) {
      alert("Preencha: Ciclo, Data e selecione ao menos 1 talhão.");
      return;
    }
    setSalvando(true);
    try {
      const fazId = cascade.fazendaId ?? fazendaId ?? "";
      const payload = {
        fazenda_id: fazId,
        ciclo_id: form.ciclo_id,
        empresa_aplicadora_id: form.empresa_aplicadora_id || null,
        empresa_nome: form.empresa_nome || null,
        tipo_aeronave: form.tipo_aeronave,
        aeronave_prefixo: form.aeronave_prefixo || null,
        piloto: form.piloto || null,
        tipo: form.tipo,
        estadio_fenologico: form.estadio_fenologico || null,
        data_aplicacao: form.data_aplicacao,
        area_ha: areaTotal,
        volume_calda_l_ha: parseFloat(form.volume_calda_l_ha) || null,
        altura_voo_m: parseFloat(form.altura_voo_m) || null,
        velocidade_vento_kmh: parseFloat(form.velocidade_vento_kmh) || null,
        temperatura_c: parseFloat(form.temperatura_c) || null,
        umidade_rel_pct: parseFloat(form.umidade_rel_pct) || null,
        direcao_vento: form.direcao_vento || null,
        art_numero: form.art_numero || null,
        cloa_numero: form.cloa_numero || null,
        custo_ha: custoHa || null,
        custo_total: custoTotal || null,
        observacao: form.observacao || null,
        fiscal: form.fiscal,
      };

      let id = editando;
      if (id) {
        await atualizarAplicacaoAerea(id, payload);
      } else {
        const criado = await criarAplicacaoAerea(payload);
        id = criado.id;
      }

      await salvarAplicacaoAereaTalhoes(id!, talhoesSelec);
      await salvarAplicacaoAereaItens(id!, fazId, calcItens());

      setModal(false);
      await carregar();
    } catch (e) {
      alert("Erro ao salvar: " + String(e));
    } finally {
      setSalvando(false);
    }
  }

  // ─── Excluir operação ────────────────────────────────────────────────────
  async function excluir(id: string) {
    if (!confirm("Excluir esta aplicação aérea?")) return;
    await excluirAplicacaoAerea(id);
    setExpandido(null);
    await carregar();
  }

  // ─── Salvar empresa ──────────────────────────────────────────────────────
  async function salvarEmpresa() {
    if (!formEmpresa.razao_social) { alert("Informe a Razão Social."); return; }
    setSalvando(true);
    try {
      await salvarEmpresaAplicadora({
        ...(editandoEmpresa ? { id: editandoEmpresa } : {}),
        ...formEmpresa,
        conta_id: contaId ?? null,
        fazenda_id: fazendaId ?? null,
      });
      setModalEmpresa(false);
      if (contaId) setEmpresas(await listarEmpresasAplicadoras(contaId));
    } catch (e) {
      alert("Erro: " + String(e));
    } finally {
      setSalvando(false);
    }
  }

  // ─── Filtros ─────────────────────────────────────────────────────────────
  const aplicacoesFiltradas = aplicacoes.filter(a => {
    if (filtroCiclo && a.ciclo_id !== filtroCiclo) return false;
    if (filtroTipo && a.tipo !== filtroTipo) return false;
    if (filtroBusca) {
      const q = filtroBusca.toLowerCase();
      const match = (a.empresa_nome ?? "").toLowerCase().includes(q) ||
        (a.empresa_aplicadora?.razao_social ?? "").toLowerCase().includes(q) ||
        (a.aeronave_prefixo ?? "").toLowerCase().includes(q) ||
        (a.piloto ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // ─── KPIs ────────────────────────────────────────────────────────────────
  const haTotal    = aplicacoesFiltradas.reduce((s, a) => s + a.area_ha, 0);
  const custoTotalGeral = aplicacoesFiltradas.reduce((s, a) => s + (a.custo_total ?? 0), 0);
  const mediaHa    = haTotal > 0 && custoTotalGeral > 0 ? custoTotalGeral / haTotal : 0;

  // ─── Ciclos para filtro ──────────────────────────────────────────────────
  const ciclosFiltro = [...new Map(ciclos.map(c => [c.id, c])).values()];

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <TopNav />
      <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Aplicação Aérea</h1>
            <p style={{ fontSize: 13, color: "var(--text-3)", margin: "4px 0 0" }}>Avião agrícola · Drone/RPAS</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <CascadeSelector contaId={contaId ?? null} fazendaIdFallback={fazendaId} values={cascade} onChange={setCascade} levels={["fazenda"]} />
            <button onClick={abrirNovo} style={{ ...btnV, display: "flex", alignItems: "center", gap: 6 }}>
              + Nova Aplicação
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Aplicações no período", valor: aplicacoesFiltradas.length.toString(), unit: "", cor: "#1A4870" },
            { label: "Área total aplicada",   valor: fmtN(haTotal, 1),  unit: "ha",     cor: "#1A4870" },
            { label: "Custo total",           valor: fmtBRL(custoTotalGeral), unit: "", cor: "#C9921B" },
            { label: "Custo médio",           valor: fmtBRL(mediaHa),   unit: "/ha",    cor: "#C9921B" },
          ].map(k => (
            <div key={k.label} style={{ ...card, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.cor }}>{k.valor}<span style={{ fontSize: 13, fontWeight: 400 }}>{k.unit}</span></div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, borderBottom: "0.5px solid var(--border-table)", marginBottom: 20 }}>
          {(["operacoes", "empresas"] as const).map(t => (
            <button key={t} onClick={() => setAba(t)} style={{
              padding: "10px 20px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: aba === t ? 700 : 400,
              color: aba === t ? "#1A4870" : "var(--text-3)",
              borderBottom: aba === t ? "2px solid #1A4870" : "2px solid transparent", marginBottom: -1,
            }}>
              {t === "operacoes" ? `Operações (${aplicacoes.length})` : `Empresas Aplicadoras (${empresas.length})`}
            </button>
          ))}
        </div>

        {/* ─── ABA OPERAÇÕES ─────────────────────────────────────────────── */}
        {aba === "operacoes" && (
          <>
            {/* Filtros */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <select value={filtroCiclo} onChange={e => setFiltroCiclo(e.target.value)} style={{ ...inp, width: 220 }}>
                <option value="">Todos os ciclos</option>
                {ciclosFiltro.map(c => <option key={c.id} value={c.id}>{c.cultura} {c.descricao ?? ""}</option>)}
              </select>
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inp, width: 180 }}>
                <option value="">Todos os tipos</option>
                {Object.entries(TIPO_APLIC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input placeholder="Buscar empresa, aeronave, piloto…" value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} style={{ ...inp, width: 260 }} />
            </div>

            {/* Lista */}
            {aplicacoesFiltradas.length === 0 ? (
              <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--text-3)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✈️</div>
                <div style={{ fontWeight: 600 }}>Nenhuma aplicação aérea registrada</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Clique em "+ Nova Aplicação" para começar</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {aplicacoesFiltradas.map(a => {
                  const tAplic = TIPO_APLIC[a.tipo] ?? TIPO_APLIC.outros;
                  const tAero  = TIPO_AERONAVE[a.tipo_aeronave] ?? { label: "Avião Agrícola", icon: "✈️", bg: "#E6F1FB", cor: "#0B2D50" };
                  const empresa = a.empresa_aplicadora?.razao_social ?? a.empresa_nome ?? "—";
                  const isExp = expandido === a.id;

                  return (
                    <div key={a.id} style={{ ...card, padding: 0, overflow: "hidden" }}>
                      {/* Linha principal */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", cursor: "pointer" }} onClick={() => abrirDetalhe(a.id)}>
                        {/* Data */}
                        <div style={{ minWidth: 80, textAlign: "center", background: "var(--bg-page)", borderRadius: 8, padding: "6px 10px" }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: "#1A4870" }}>{fmtDate(a.data_aplicacao).slice(0,5)}</div>
                          <div style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtDate(a.data_aplicacao).slice(6)}</div>
                        </div>
                        {/* Tipo aeronave */}
                        <span style={{ fontSize: 22 }}>{tAero.icon}</span>
                        {/* Info central */}
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{empresa}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: tAplic.bg, color: tAplic.cor }}>{tAplic.label}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: tAero.bg, color: tAero.cor }}>{tAero.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
                            {a.aeronave_prefixo && <span style={{ marginRight: 10 }}>✈ {a.aeronave_prefixo}</span>}
                            {a.piloto && <span style={{ marginRight: 10 }}>👨‍✈️ {a.piloto}</span>}
                            {a.estadio_fenologico && <span>🌱 {a.estadio_fenologico}</span>}
                          </div>
                        </div>
                        {/* Métricas */}
                        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: "#1A4870" }}>{fmtN(a.area_ha, 1)}</div>
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>ha</div>
                          </div>
                          {a.custo_ha && (
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "#C9921B" }}>{fmtBRL(a.custo_ha)}</div>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>/ha</div>
                            </div>
                          )}
                          {a.custo_total && (
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>{fmtBRL(a.custo_total)}</div>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>total</div>
                            </div>
                          )}
                          {a.velocidade_vento_kmh && (
                            <div style={{ textAlign: "center" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: a.velocidade_vento_kmh > VENTO_MAX_KMH[a.tipo_aeronave] ? "#E24B4A" : "#16A34A" }}>
                                {fmtN(a.velocidade_vento_kmh, 0)} km/h
                              </div>
                              <div style={{ fontSize: 10, color: "var(--text-3)" }}>vento</div>
                            </div>
                          )}
                        </div>
                        {/* Ações */}
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={e => { e.stopPropagation(); abrirEditar(a); }} style={btnS}>✎ Editar</button>
                          <button onClick={e => { e.stopPropagation(); excluir(a.id); }} style={btnX}>✕</button>
                        </div>
                        <span style={{ color: "var(--text-3)", fontSize: 14 }}>{isExp ? "▲" : "▼"}</span>
                      </div>

                      {/* Detalhe expandido */}
                      {isExp && (
                        <div style={{ borderTop: "0.5px solid var(--border-table)", padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                          {/* Talhões */}
                          <div>
                            <div style={{ ...secTit, marginTop: 0 }}>Talhões aplicados</div>
                            {detalheTalhoes.length === 0 ? (
                              <span style={{ fontSize: 12, color: "var(--text-3)" }}>Não informados</span>
                            ) : (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {detalheTalhoes.map(t => (
                                  <span key={t.id} style={{ fontSize: 12, padding: "3px 10px", background: "#D5E8F5", color: "#0B2D50", borderRadius: 20, fontWeight: 600 }}>
                                    {t.talhao?.nome ?? t.talhao_id} · {fmtN(t.area_ha, 1)} ha
                                  </span>
                                ))}
                              </div>
                            )}
                            {/* Condições meteorológicas */}
                            <div style={{ ...secTit }}>Condições meteorológicas</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                              {[
                                { label: "Temperatura", valor: a.temperatura_c != null ? `${fmtN(a.temperatura_c, 1)} °C` : null },
                                { label: "Umidade Relativa", valor: a.umidade_rel_pct != null ? `${fmtN(a.umidade_rel_pct, 0)} %` : null },
                                { label: "Vento", valor: a.velocidade_vento_kmh != null ? `${fmtN(a.velocidade_vento_kmh, 1)} km/h ${a.direcao_vento ?? ""}` : null },
                                { label: "Altura de Voo", valor: a.altura_voo_m != null ? `${fmtN(a.altura_voo_m, 1)} m` : null },
                                { label: "Volume de Calda", valor: a.volume_calda_l_ha != null ? `${fmtN(a.volume_calda_l_ha, 1)} L/ha` : null },
                              ].filter(x => x.valor).map(x => (
                                <div key={x.label}>
                                  <span style={{ color: "var(--text-3)" }}>{x.label}: </span>
                                  <span style={{ fontWeight: 600 }}>{x.valor}</span>
                                </div>
                              ))}
                            </div>
                            {/* Docs */}
                            {(a.art_numero || a.cloa_numero) && (
                              <>
                                <div style={{ ...secTit }}>Documentação</div>
                                <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                                  {a.art_numero && <span>📋 ART nº {a.art_numero}</span>}
                                  {a.cloa_numero && <span>🛩️ CLOA nº {a.cloa_numero}</span>}
                                </div>
                              </>
                            )}
                          </div>
                          {/* Produtos */}
                          <div>
                            <div style={{ ...secTit, marginTop: 0 }}>Produtos aplicados</div>
                            {detalheItens.length === 0 ? (
                              <span style={{ fontSize: 12, color: "var(--text-3)" }}>Não informados</span>
                            ) : (
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ color: "var(--text-3)" }}>
                                    <th style={{ textAlign: "left", padding: "4px 8px 8px 0", fontWeight: 600 }}>Produto</th>
                                    <th style={{ textAlign: "right", padding: "4px 8px 8px", fontWeight: 600 }}>Dose/ha</th>
                                    <th style={{ textAlign: "right", padding: "4px 0 8px 8px", fontWeight: 600 }}>Total consumido</th>
                                    <th style={{ textAlign: "right", padding: "4px 0 8px 8px", fontWeight: 600 }}>Custo total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detalheItens.map(i => (
                                    <tr key={i.id} style={{ borderTop: "0.5px solid var(--border-table)" }}>
                                      <td style={{ padding: "6px 8px 6px 0", fontWeight: 600, color: "var(--text-1)" }}>{i.nome_produto}</td>
                                      <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--text-2)" }}>{fmtN(i.dose_ha, 2)} {i.unidade}</td>
                                      <td style={{ padding: "6px 0 6px 8px", textAlign: "right", color: "var(--text-2)" }}>{fmtN(i.total_consumido, 2)} {i.unidade.replace("/ha","")}</td>
                                      <td style={{ padding: "6px 0 6px 8px", textAlign: "right", color: "#C9921B", fontWeight: 600 }}>{fmtBRL(i.custo_total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {a.observacao && (
                              <>
                                <div style={{ ...secTit }}>Observações</div>
                                <div style={{ fontSize: 13, color: "var(--text-2)", fontStyle: "italic" }}>{a.observacao}</div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── ABA EMPRESAS ──────────────────────────────────────────────── */}
        {aba === "empresas" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button onClick={() => { setFormEmpresa(empresaVazia()); setEditandoEmpresa(null); setModalEmpresa(true); }} style={btnV}>
                + Cadastrar Empresa
              </button>
            </div>
            {empresas.length === 0 ? (
              <div style={{ ...card, textAlign: "center", padding: 48, color: "var(--text-3)" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                <div style={{ fontWeight: 600 }}>Nenhuma empresa cadastrada</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Cadastre as empresas de aviação agrícola que prestam serviço em suas fazendas.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {empresas.map(e => {
                  const cloaVenc = e.cloa_vencimento ? new Date(e.cloa_vencimento) : null;
                  const cloaDias = cloaVenc ? Math.ceil((cloaVenc.getTime() - Date.now()) / 86400000) : null;
                  return (
                    <div key={e.id} style={card}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)" }}>{e.razao_social}</div>
                          {e.cnpj && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>CNPJ: {e.cnpj}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setFormEmpresa({ razao_social: e.razao_social, cnpj: e.cnpj ?? "", cloa_numero: e.cloa_numero ?? "", cloa_vencimento: e.cloa_vencimento ?? "", responsavel_tecnico: e.responsavel_tecnico ?? "", crea: e.crea ?? "", telefone: e.telefone ?? "", email: e.email ?? "", observacao: e.observacao ?? "", ativo: true }); setEditandoEmpresa(e.id); setModalEmpresa(true); }} style={btnS}>✎</button>
                          <button onClick={async () => { if (confirm("Remover empresa?")) { await excluirEmpresaAplicadora(e.id); if (contaId) setEmpresas(await listarEmpresasAplicadoras(contaId)); } }} style={btnX}>✕</button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12, fontSize: 12 }}>
                        {e.cloa_numero && (
                          <div>
                            <span style={{ color: "var(--text-3)" }}>CLOA: </span>
                            <span style={{ fontWeight: 600 }}>{e.cloa_numero}</span>
                            {cloaDias !== null && (
                              <span style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px", borderRadius: 10, background: cloaDias < 30 ? "#FEF2F2" : "#F0FDF4", color: cloaDias < 30 ? "#E24B4A" : "#16A34A", fontWeight: 600 }}>
                                {cloaDias < 0 ? "VENCIDO" : `${cloaDias}d`}
                              </span>
                            )}
                          </div>
                        )}
                        {e.responsavel_tecnico && <div><span style={{ color: "var(--text-3)" }}>RT: </span><span>{e.responsavel_tecnico}</span></div>}
                        {e.crea && <div><span style={{ color: "var(--text-3)" }}>CREA: </span><span>{e.crea}</span></div>}
                        {e.telefone && <div><span style={{ color: "var(--text-3)" }}>Tel: </span><span>{e.telefone}</span></div>}
                        {e.email && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "var(--text-3)" }}>E-mail: </span><span>{e.email}</span></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>

      {/* ─── MODAL NOVA/EDITAR APLICAÇÃO ─────────────────────────────────── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "#00000070", zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "center", overflowY: "auto", padding: "32px 16px" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, width: 1140, boxShadow: "0 16px 64px #0005", marginBottom: 32 }}>

            {/* Header modal */}
            <div style={{ padding: "20px 28px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>{editando ? "Editar Aplicação Aérea" : "Nova Aplicação Aérea"}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>Avião agrícola · Drone/RPAS</div>
              </div>
              <button onClick={() => setModal(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>

            <div style={{ padding: "24px 28px" }}>

              {/* Tipo de aeronave — full width */}
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Tipo de Aeronave</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {(Object.entries(TIPO_AERONAVE) as [TipoAeronave, typeof TIPO_AERONAVE[TipoAeronave]][]).map(([k, v]) => (
                    <button key={k} onClick={() => sf("tipo_aeronave", k)} style={{
                      flex: 1, padding: "10px 16px", border: `2px solid ${form.tipo_aeronave === k ? "#1A4870" : "var(--border-table)"}`,
                      borderRadius: 10, cursor: "pointer", background: form.tipo_aeronave === k ? "#D5E8F5" : "var(--bg-card)",
                      fontWeight: form.tipo_aeronave === k ? 700 : 400, fontSize: 13, color: form.tipo_aeronave === k ? "#0B2D50" : "var(--text-2)",
                      transition: "all 0.12s",
                    }}>
                      <span style={{ fontSize: 22, display: "block", marginBottom: 4 }}>{k === "aviao" ? "✈️" : "🚁"}</span>
                      {v!.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duas colunas */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" }}>

                {/* ── COLUNA ESQUERDA: identificação + empresa + talhões ── */}
                <div>
                  <div style={secTit}>Identificação</div>
                  <div style={gridG("1fr 1fr")}>
                    <div>
                      <label style={lbl}>Ciclo / Safra *</label>
                      <select value={form.ciclo_id} onChange={e => sf("ciclo_id", e.target.value)} style={inp}>
                        <option value="">— selecione —</option>
                        {ciclos.map(c => <option key={c.id} value={c.id}>{c.cultura} {c.descricao ?? ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Data da Aplicação *</label>
                      <input type="date" value={form.data_aplicacao} onChange={e => sf("data_aplicacao", e.target.value)} style={inp} />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={lbl}>Tipo de Aplicação *</label>
                    <select value={form.tipo} onChange={e => sf("tipo", e.target.value)} style={inp}>
                      {Object.entries(TIPO_APLIC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={lbl}>Empresa Aplicadora</label>
                    <select value={form.empresa_aplicadora_id} onChange={e => { sf("empresa_aplicadora_id", e.target.value); if (e.target.value) sf("empresa_nome", ""); }} style={inp}>
                      <option value="">— selecione ou informe abaixo —</option>
                      {empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social}</option>)}
                    </select>
                  </div>

                  {!form.empresa_aplicadora_id && (
                    <div style={{ marginTop: 8 }}>
                      <label style={lbl}>Nome da Empresa (livre)</label>
                      <input placeholder="Ex: AgroAves Aviação Agrícola" value={form.empresa_nome} onChange={e => sf("empresa_nome", e.target.value)} style={inp} />
                    </div>
                  )}

                  <div style={{ ...gridG("1fr 1fr"), marginTop: 12 }}>
                    <div>
                      <label style={lbl}>{form.tipo_aeronave === "drone" ? "Modelo do Drone" : "Prefixo/Matrícula"}</label>
                      <input placeholder={form.tipo_aeronave === "drone" ? "Ex: DJI Agras T40" : "Ex: PT-MTG"} value={form.aeronave_prefixo} onChange={e => sf("aeronave_prefixo", e.target.value)} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>{form.tipo_aeronave === "drone" ? "Operador" : "Piloto"}</label>
                      <input placeholder="Nome do piloto/operador" value={form.piloto} onChange={e => sf("piloto", e.target.value)} style={inp} />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={lbl}>Estádio Fenológico</label>
                    <select value={form.estadio_fenologico} onChange={e => sf("estadio_fenologico", e.target.value)} style={inp}>
                      <option value="">— selecione —</option>
                      {ESTADIOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  <div style={secTit}>Talhões Aplicados</div>
                  {talhoes.length === 0 ? (
                    <div style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>Nenhum talhão cadastrado para esta fazenda.</div>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                        {talhoes.map(t => {
                          const sel = talhoesSelec.some(x => x.talhao_id === t.id);
                          return (
                            <button key={t.id} onClick={() => toggleTalhao(t)} style={{
                              padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${sel ? "#1A4870" : "var(--border-table)"}`,
                              background: sel ? "#D5E8F5" : "transparent", cursor: "pointer", fontSize: 12,
                              fontWeight: sel ? 700 : 400, color: sel ? "#0B2D50" : "var(--text-2)", transition: "all 0.1s",
                            }}>
                              {t.nome} · {fmtN(t.area_ha, 1)} ha
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 13, color: "#1A4870", fontWeight: 600 }}>
                        {talhoesSelec.length > 0
                          ? `${talhoesSelec.length} talhão(ões) selecionado(s) → Área total: ${fmtN(areaTotal, 2)} ha`
                          : <span style={{ color: "#E24B4A" }}>Selecione ao menos 1 talhão *</span>}
                      </div>
                    </>
                  )}
                </div>

                {/* ── COLUNA DIREITA: produtos + parâmetros + condições + docs ── */}
                <div>
                  <div style={secTit}>Produtos Aplicados</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 10 }}>
                    <thead>
                      <tr style={{ color: "var(--text-3)", fontSize: 11 }}>
                        {["Produto *", "Dose/ha *", "Unid.", "R$/unid", ""].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "4px 6px 8px", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: "4px 6px", width: "38%" }}>
                            <select value={item.insumo_id} onChange={e => {
                              const ins = insumos.find(i => i.id === e.target.value);
                              setItens(prev => prev.map((it, i) => i === idx ? { ...it, insumo_id: e.target.value, nome_produto: ins?.nome ?? it.nome_produto, unidade: ins?.unidade ?? it.unidade, valor_unitario: ins?.custo_medio?.toString() ?? it.valor_unitario } : it));
                            }} style={inp}>
                              <option value="">— cadastro —</option>
                              {insumos.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
                            </select>
                            {!item.insumo_id && (
                              <input placeholder="Nome livre" value={item.nome_produto} onChange={e => setItens(prev => prev.map((it, i) => i === idx ? { ...it, nome_produto: e.target.value } : it))} style={{ ...inp, marginTop: 4 }} />
                            )}
                          </td>
                          <td style={{ padding: "4px 6px", width: "16%" }}>
                            <input type="number" placeholder="0,00" value={item.dose_ha} onChange={e => setItens(prev => prev.map((it, i) => i === idx ? { ...it, dose_ha: e.target.value } : it))} style={inp} min={0} step="0.01" />
                          </td>
                          <td style={{ padding: "4px 6px", width: "16%" }}>
                            <select value={item.unidade} onChange={e => setItens(prev => prev.map((it, i) => i === idx ? { ...it, unidade: e.target.value } : it))} style={inp}>
                              {UNIDADES.map(u => <option key={u}>{u}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "4px 6px", width: "20%" }}>
                            <input type="number" placeholder="R$" value={item.valor_unitario} onChange={e => setItens(prev => prev.map((it, i) => i === idx ? { ...it, valor_unitario: e.target.value } : it))} style={inp} min={0} step="0.01" />
                          </td>
                          <td style={{ padding: "4px 6px" }}>
                            <button onClick={() => setItens(prev => prev.filter((_, i) => i !== idx))} style={btnX}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={() => setItens(prev => [...prev, itemVazio()])} style={{ ...btnR, fontSize: 12, padding: "5px 12px" }}>+ Produto</button>

                  <div style={secTit}>Parâmetros Técnicos</div>
                  <div style={gridG("1fr 1fr")}>
                    <div>
                      <label style={lbl}>Volume de Calda (L/ha)</label>
                      <input type="number" placeholder={form.tipo_aeronave === "drone" ? "5–15" : "15–40"} value={form.volume_calda_l_ha} onChange={e => sf("volume_calda_l_ha", e.target.value)} style={inp} min={0} step="0.5" />
                    </div>
                    <div>
                      <label style={lbl}>Altura de Voo (m)</label>
                      <input type="number" placeholder={form.tipo_aeronave === "drone" ? "2–4" : "2–5"} value={form.altura_voo_m} onChange={e => sf("altura_voo_m", e.target.value)} style={inp} min={0} step="0.5" />
                    </div>
                  </div>
                  <div style={{ ...gridG("1fr 1fr"), marginTop: 12 }}>
                    <div>
                      <label style={lbl}>Custo por Hectare (R$/ha)</label>
                      <input type="number" placeholder="Ex: 55,00" value={form.custo_ha} onChange={e => sf("custo_ha", e.target.value)} style={inp} min={0} step="0.5" />
                    </div>
                    <div>
                      <label style={lbl}>Custo Total</label>
                      <input value={fmtBRL(custoTotal)} readOnly style={{ ...inp, background: "var(--bg-page)", fontWeight: 600, color: "#C9921B" }} />
                    </div>
                  </div>

                  <div style={secTit}>Condições Meteorológicas</div>
                  {ventoAlerta && (
                    <div style={{ background: "#FEF2F2", border: "0.5px solid #E24B4A", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: "#E24B4A", fontWeight: 600 }}>
                      ⚠️ Vento acima do limite legal para {TIPO_AERONAVE[form.tipo_aeronave]!.label}: máx {VENTO_MAX_KMH[form.tipo_aeronave]} km/h ({VENTO_MAX[form.tipo_aeronave]} m/s).
                    </div>
                  )}
                  <div style={gridG("1fr 1fr")}>
                    <div>
                      <label style={lbl}>Temperatura (°C)</label>
                      <input type="number" placeholder="25" value={form.temperatura_c} onChange={e => sf("temperatura_c", e.target.value)} style={inp} step="0.5" />
                    </div>
                    <div>
                      <label style={lbl}>Umidade Relativa (%)</label>
                      <input type="number" placeholder="70" value={form.umidade_rel_pct} onChange={e => sf("umidade_rel_pct", e.target.value)} style={inp} min={0} max={100} step="1" />
                    </div>
                  </div>
                  <div style={{ ...gridG("1fr 1fr"), marginTop: 12 }}>
                    <div>
                      <label style={lbl}>Vel. Vento (km/h)</label>
                      <input type="number" placeholder="8" value={form.velocidade_vento_kmh} onChange={e => sf("velocidade_vento_kmh", e.target.value)} style={{ ...inp, borderColor: ventoAlerta ? "#E24B4A" : undefined }} min={0} step="0.5" />
                    </div>
                    <div>
                      <label style={lbl}>Direção do Vento</label>
                      <select value={form.direcao_vento} onChange={e => sf("direcao_vento", e.target.value)} style={inp}>
                        <option value="">—</option>
                        {DIRECOES.map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={secTit}>Documentação</div>
                  <div style={gridG("1fr 1fr")}>
                    <div>
                      <label style={lbl}>ART nº (Engenheiro Agrônomo)</label>
                      <input placeholder="Número da ART" value={form.art_numero} onChange={e => sf("art_numero", e.target.value)} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>CLOA nº (Empresa de Aviação)</label>
                      <input placeholder="Certificado da empresa" value={form.cloa_numero} onChange={e => sf("cloa_numero", e.target.value)} style={inp} />
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={lbl}>Observações</label>
                    <textarea rows={3} placeholder="Observações gerais, condições especiais, etc." value={form.observacao} onChange={e => sf("observacao", e.target.value)} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
                  </div>
                </div>

              </div>{/* fim duas colunas */}

              {/* Botões — full width */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24, paddingTop: 20, borderTop: "0.5px solid var(--border-table)" }}>
                <button onClick={() => setModal(false)} style={btnR}>Cancelar</button>
                <button onClick={salvar} disabled={salvando} style={{ ...btnV, opacity: salvando ? 0.7 : 1 }}>
                  {salvando ? "Salvando…" : editando ? "Salvar Alterações" : "Registrar Aplicação"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL EMPRESA APLICADORA ────────────────────────────────────── */}
      {modalEmpresa && (
        <div style={{ position: "fixed", inset: 0, background: "#00000070", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, width: 620, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 16px 64px #0005" }}>
            <div style={{ padding: "20px 28px", borderBottom: "0.5px solid var(--border-table)", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>{editandoEmpresa ? "Editar Empresa" : "Nova Empresa Aplicadora"}</div>
              <button onClick={() => setModalEmpresa(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: "24px 28px" }}>
              <div style={gridG("1fr 1fr")}>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Razão Social *</label>
                  <input value={formEmpresa.razao_social} onChange={e => setFormEmpresa(p => ({ ...p, razao_social: e.target.value }))} style={inp} placeholder="Nome da empresa" />
                </div>
                <div>
                  <label style={lbl}>CNPJ</label>
                  <input value={formEmpresa.cnpj ?? ""} onChange={e => setFormEmpresa(p => ({ ...p, cnpj: e.target.value }))} style={inp} placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <label style={lbl}>Telefone</label>
                  <input value={formEmpresa.telefone ?? ""} onChange={e => setFormEmpresa(p => ({ ...p, telefone: e.target.value }))} style={inp} placeholder="(65) 99999-9999" />
                </div>
                <div>
                  <label style={lbl}>E-mail</label>
                  <input type="email" value={formEmpresa.email ?? ""} onChange={e => setFormEmpresa(p => ({ ...p, email: e.target.value }))} style={inp} placeholder="contato@empresa.com.br" />
                </div>
                <div>
                  <label style={lbl}>CLOA nº</label>
                  <input value={formEmpresa.cloa_numero ?? ""} onChange={e => setFormEmpresa(p => ({ ...p, cloa_numero: e.target.value }))} style={inp} placeholder="Certificado de Operador Aéreo Agrícola" />
                </div>
                <div>
                  <label style={lbl}>Vencimento CLOA</label>
                  <input type="date" value={formEmpresa.cloa_vencimento ?? ""} onChange={e => setFormEmpresa(p => ({ ...p, cloa_vencimento: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Responsável Técnico (RT)</label>
                  <input value={formEmpresa.responsavel_tecnico ?? ""} onChange={e => setFormEmpresa(p => ({ ...p, responsavel_tecnico: e.target.value }))} style={inp} placeholder="Nome do Engenheiro Agrônomo" />
                </div>
                <div>
                  <label style={lbl}>CREA do RT</label>
                  <input value={formEmpresa.crea ?? ""} onChange={e => setFormEmpresa(p => ({ ...p, crea: e.target.value }))} style={inp} placeholder="CREA-MT 000000-D" />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={lbl}>Observações</label>
                  <textarea rows={2} value={formEmpresa.observacao ?? ""} onChange={e => setFormEmpresa(p => ({ ...p, observacao: e.target.value }))} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
                <button onClick={() => setModalEmpresa(false)} style={btnR}>Cancelar</button>
                <button onClick={salvarEmpresa} disabled={salvando} style={{ ...btnV, opacity: salvando ? 0.7 : 1 }}>
                  {salvando ? "Salvando…" : "Salvar Empresa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
