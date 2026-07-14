"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import InputNumerico from "../../../components/InputNumerico";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Monitoramento = {
  id: string;
  fazenda_id: string;
  ciclo_id: string | null;
  talhao_id: string | null;
  talhao_nome?: string;
  ciclo_nome?: string;
  data_monitoramento: string | null;
  data: string;               // coluna real no DB
  tipo: "praga" | "doenca" | "planta_daninha";
  nome: string;
  nivel: 1 | 2 | 3 | 4;
  percentual_plantas: number | null;
  estagio_cultura: string | null;  // alias col no DB
  estagio: string | null;          // coluna real
  acao_recomendada: string | null;
  observacoes: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
  foto_url: string | null;
  foto_url_2: string | null;
  foto_url_3: string | null;
  recomendacao_id: string | null;
  created_at: string;
};

type Talhao  = { id: string; nome: string; area_ha?: number };
type Ciclo   = { id: string; cultura: string; ano_safra?: { ano: string } };
type Recomendacao = { id: string; tipo: string; agronomo_nome?: string; data_recomendacao: string };

// ─── Catálogo pragas / doenças / invasoras ────────────────────────────────────
const CATALOGO: Record<string, string[]> = {
  praga: [
    "Lagarta-da-soja (Anticarsia gemmatalis)",
    "Lagarta-falsa-medideira (Chrysodeixis includens)",
    "Helicoverpa armigera",
    "Percevejo-marrom (Euschistus heros)",
    "Percevejo-verde (Nezara viridula)",
    "Percevejo-pequeno (Piezodorus guildinii)",
    "Mosca-branca (Bemisia tabaci)",
    "Pulgão (Aphis glycines)",
    "Trips (Frankliniella schultzei)",
    "Ácaro-rajado (Tetranychus urticae)",
    "Ácaro-branco (Polyphagotarsonemus latus)",
    "Tamanduá-da-soja (Sternechus subsignatus)",
    "Lagarta-do-cartucho (Spodoptera frugiperda)",
    "Cigarrinha-do-milho (Dalbulus maidis)",
    "Outra praga",
  ],
  doenca: [
    "Ferrugem-asiática (Phakopsora pachyrhizi)",
    "Mofo-branco (Sclerotinia sclerotiorum)",
    "Mancha-alvo (Corynespora cassiicola)",
    "Antracnose (Colletotrichum truncatum)",
    "Oídio (Erysiphe diffusa)",
    "Mancha-parda (Septoria glycines)",
    "Mancha-olho-de-rã (Cercospora sojina)",
    "Podridão-radicular (Fusarium spp.)",
    "Mosaico-comum (BYMV / SMV)",
    "Nematoide-de-cisto (Heterodera glycines)",
    "Nematoide-de-galha (Meloidogyne spp.)",
    "Enfezamento (Spiroplasma / Phytoplasma) — milho",
    "Cercosporiose (Cercospora zeae-maydis) — milho",
    "Outra doença",
  ],
  planta_daninha: [
    "Buva (Conyza spp.) — resistente",
    "Capim-amargoso (Digitaria insularis) — resistente",
    "Corda-de-viola (Ipomoea spp.)",
    "Picão-preto (Bidens pilosa)",
    "Trapoeraba (Commelina benghalensis)",
    "Leiteiro (Euphorbia heterophylla)",
    "Capim-colchão (Digitaria horizontalis)",
    "Brachiaria (Urochloa spp.)",
    "Papuã (Urochloa plantaginea)",
    "Caruru (Amaranthus spp.)",
    "Fedegoso (Senna obtusifolia)",
    "Outra planta daninha",
  ],
};

const NIVEL_META: Record<number, { label: string; cor: string; bg: string; border: string }> = {
  1: { label: "Baixo",    cor: "#166534", bg: "#DCFCE7", border: "#86EFAC" },
  2: { label: "Médio",    cor: "#92400E", bg: "#FEF3C7", border: "#FCD34D" },
  3: { label: "Alto",     cor: "#9A3412", bg: "#FFEDD5", border: "#FCA5A5" },
  4: { label: "Crítico",  cor: "#fff",    bg: "#DC2626", border: "#DC2626" },
};

const TIPO_META: Record<string, { label: string; cor: string; bg: string; icone: string }> = {
  praga:          { label: "Praga",           cor: "#7C2D12", bg: "#FEF2F2", icone: "🐛" },
  doenca:         { label: "Doença",          cor: "#1E3A5F", bg: "#EFF6FF", icone: "🍂" },
  planta_daninha: { label: "Planta Daninha",  cor: "#14532D", bg: "#F0FDF4", icone: "🌿" },
};

const ESTAGIO_SOJA  = ["V1","V2","V3","V4","V5","V6","V7","V8","R1","R2","R3","R4","R5","R6","R7","R8"];
const ESTAGIO_MILHO = ["V1","V2","V3","V4","V5","V6","VT","R1","R2","R3","R4","R5","R6"];

const inp: React.CSSProperties = {
  width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)",
  borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)", boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--text-2)", display: "block", marginBottom: 4,
};

const dataDisplay = (r: Monitoramento) =>
  new Date(((r.data_monitoramento ?? r.data) + "T12:00")).toLocaleDateString("pt-BR");

const estagioDisplay = (r: Monitoramento) => r.estagio_cultura ?? r.estagio ?? "—";

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PragasPage() {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<"lista"|"mapa"|"relatorio">("lista");

  const [registros,  setRegistros]  = useState<Monitoramento[]>([]);
  const [talhoes,    setTalhoes]    = useState<Talhao[]>([]);
  const [ciclos,     setCiclos]     = useState<Ciclo[]>([]);
  const [recs,       setRecs]       = useState<Recomendacao[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Filtros
  const [filtroTipo,   setFiltroTipo]   = useState("");
  const [filtroNivel,  setFiltroNivel]  = useState("");
  const [filtroTalhao, setFiltroTalhao] = useState("");
  const [filtroCiclo,  setFiltroCiclo]  = useState("");

  // Modal
  const [modal,    setModal]    = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  // Campos do formulário
  const [fCiclo,      setFCiclo]      = useState("");
  const [fTalhao,     setFTalhao]     = useState("");
  const [fData,       setFData]       = useState(() => new Date().toISOString().split("T")[0]);
  const [fTipo,       setFTipo]       = useState<Monitoramento["tipo"]>("praga");
  const [fNome,       setFNome]       = useState("");
  const [fNomeCustom, setFNomeCustom] = useState("");
  const [fNivel,      setFNivel]      = useState<1|2|3|4>(1);
  const [fPct,        setFPct]        = useState("");
  const [fEstagio,    setFEstagio]    = useState("");
  const [fAcao,       setFAcao]       = useState("");
  const [fObs,        setFObs]        = useState("");
  const [fRecId,      setFRecId]      = useState("");

  // GPS
  const [gpsLat,      setGpsLat]      = useState<number|null>(null);
  const [gpsLng,      setGpsLng]      = useState<number|null>(null);
  const [gpsAcc,      setGpsAcc]      = useState<number|null>(null);
  const [gpsBusy,     setGpsBusy]     = useState(false);
  const [gpsErro,     setGpsErro]     = useState("");

  // Fotos
  const [fotos,       setFotos]       = useState<string[]>([]); // até 3 URLs
  const [fotoLoading, setFotoLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Carga ──────────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const [{ data: regs }, { data: tal }, { data: cic }, { data: recsData }] = await Promise.all([
      supabase.from("monitoramento_pragas")
        .select("*, talhoes(nome), ciclos(cultura, anos_safra(ano))")
        .eq("fazenda_id", fazendaId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("ciclos").select("id, cultura, anos_safra(ano)").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
      supabase.from("recomendacoes").select("id, tipo, agronomo_nome, data_recomendacao").eq("fazenda_id", fazendaId).order("data_recomendacao", { ascending: false }).limit(50),
    ]);

    const normalizado: Monitoramento[] = (regs ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      talhao_nome: (r.talhoes as { nome: string } | null)?.nome,
      ciclo_nome:  r.ciclos
        ? `${(r.ciclos as Record<string, unknown>).cultura} ${((r.ciclos as Record<string, unknown>).anos_safra as { ano: string } | null)?.ano ?? ""}`
        : undefined,
    })) as Monitoramento[];

    setRegistros(normalizado);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setRecs((recsData ?? []) as Recomendacao[]);
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── GPS ────────────────────────────────────────────────────────────────────
  function capturarGPS() {
    if (!navigator.geolocation) { setGpsErro("Geolocalização não suportada neste dispositivo."); return; }
    setGpsBusy(true);
    setGpsErro("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLng(pos.coords.longitude);
        setGpsAcc(pos.coords.accuracy);
        setGpsBusy(false);
      },
      (err) => { setGpsErro(`GPS: ${err.message}`); setGpsBusy(false); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  // ─── Upload de foto ──────────────────────────────────────────────────────────
  async function uploadFoto(file: File) {
    if (fotos.length >= 3) return;
    setFotoLoading(true);
    try {
      const ext  = file.name.split(".").pop() ?? "jpg";
      const path = `monitoramento/${fazendaId}/${Date.now()}.${ext}`;
      const { data: up, error: upErr } = await supabase.storage.from("arquivos").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("arquivos").getPublicUrl(up.path);
      setFotos(prev => [...prev, publicUrl]);
    } catch (e) {
      setErro(`Erro upload: ${(e as Error).message}`);
    }
    setFotoLoading(false);
  }

  // ─── Salvar ──────────────────────────────────────────────────────────────────
  async function salvar() {
    if (!fazendaId) return;
    setErro("");
    const nomeFinal = fNome.startsWith("Outra") || fNome.startsWith("Outro") ? fNomeCustom.trim() : fNome;
    if (!fTalhao)   return setErro("Selecione o talhão.");
    if (!nomeFinal) return setErro("Informe o nome da ocorrência.");

    setSalvando(true);
    try {
      const { error } = await supabase.from("monitoramento_pragas").insert({
        fazenda_id:        fazendaId,
        ciclo_id:          fCiclo || null,
        talhao_id:         fTalhao,
        data:              fData,
        data_monitoramento: fData,
        tipo:              fTipo,
        nome:              nomeFinal,
        nivel:             fNivel,
        percentual_plantas: fPct ? parseFloat(fPct) : null,
        estagio:           fEstagio || null,
        estagio_cultura:   fEstagio || null,
        acao_recomendada:  fAcao  || null,
        observacoes:       fObs   || null,
        gps_lat:           gpsLat,
        gps_lng:           gpsLng,
        gps_accuracy_m:    gpsAcc,
        foto_url:          fotos[0] ?? null,
        foto_url_2:        fotos[1] ?? null,
        foto_url_3:        fotos[2] ?? null,
        recomendacao_id:   fRecId || null,
        usuario_id:        null,
      });
      if (error) throw new Error(error.message);
      fecharModal();
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
    setSalvando(false);
  }

  function abrirModal() {
    setFCiclo(""); setFTalhao(""); setFData(new Date().toISOString().split("T")[0]);
    setFTipo("praga"); setFNome(""); setFNomeCustom(""); setFNivel(1);
    setFPct(""); setFEstagio(""); setFAcao(""); setFObs(""); setFRecId("");
    setGpsLat(null); setGpsLng(null); setGpsAcc(null); setGpsErro(""); setFotos([]);
    setErro(""); setModal(true);
  }
  function fecharModal() { setModal(false); setSalvando(false); }

  // ─── Filtros ─────────────────────────────────────────────────────────────────
  const filtrados = registros.filter(r =>
    (!filtroTipo   || r.tipo     === filtroTipo) &&
    (!filtroNivel  || r.nivel    === Number(filtroNivel)) &&
    (!filtroTalhao || r.talhao_id === filtroTalhao) &&
    (!filtroCiclo  || r.ciclo_id  === filtroCiclo)
  );

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  const criticos = registros.filter(r => r.nivel === 4).length;
  const altos    = registros.filter(r => r.nivel === 3).length;
  const talhoesAfetados = new Set(registros.filter(r => r.nivel >= 3).map(r => r.talhao_id)).size;
  const comGPS   = registros.filter(r => r.gps_lat !== null).length;

  const cicloSelecionado = ciclos.find(c => c.id === fCiclo);
  const estagios = cicloSelecionado?.cultura?.toLowerCase().includes("milho") ? ESTAGIO_MILHO : ESTAGIO_SOJA;
  const nomeEhCustom = fNome.startsWith("Outra") || fNome.startsWith("Outro");

  // ─── Relatório de incidência ──────────────────────────────────────────────────
  const relatorio = talhoes.map(t => {
    const regsT = registros.filter(r => r.talhao_id === t.id);
    return {
      talhao: t,
      total: regsT.length,
      criticos: regsT.filter(r => r.nivel === 4).length,
      altos:    regsT.filter(r => r.nivel === 3).length,
      ultimos:  regsT.slice(0, 3),
    };
  }).filter(r => r.total > 0).sort((a, b) => b.criticos - a.criticos || b.altos - a.altos);

  return (
    <>
      <TopNav />
      <div style={{ fontFamily: "system-ui, sans-serif", padding: "28px 32px", background: "var(--bg-page)", minHeight: "100vh" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Monitoramento de Pragas & Doenças</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>Scouting por talhão · GPS georreferenciado · Fotos de campo</p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <a href="/campo/monitoramento" style={{ padding: "8px 14px", background: "#FBF3E0", color: "#C9921B", border: "0.5px solid #C9921B", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
              📱 App Campo
            </a>
            <button onClick={abrirModal} style={{ padding: "9px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
              + Novo Registro
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
          {[
            { label: "Total de Registros", valor: registros.length, sub: "todos os ciclos", cor: "#1A4870", destaque: false },
            { label: "Nível Crítico",      valor: criticos, sub: criticos > 0 ? "⚠ ação imediata" : "nenhum", cor: criticos > 0 ? "#DC2626" : "var(--text-3)", destaque: criticos > 0 },
            { label: "Nível Alto",         valor: altos, sub: altos > 0 ? "monitorar de perto" : "nenhum",  cor: altos > 0 ? "#92400E" : "var(--text-3)", destaque: altos > 0 },
            { label: "Com Coordenadas GPS",valor: comGPS, sub: `de ${registros.length} registros`, cor: "#16A34A", destaque: false },
          ].map(kpi => (
            <div key={kpi.label} style={{ background: kpi.destaque ? (kpi.cor === "#DC2626" ? "#FEF2F2" : "#FFFBEB") : "#fff", borderRadius: 12, padding: "16px 20px", border: `0.5px solid ${kpi.destaque ? "#FCA5A5" : "var(--border)"}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{kpi.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: kpi.cor }}>{kpi.valor}</div>
              <div style={{ fontSize: 11, color: kpi.cor === "var(--text-3)" ? "var(--text-3)" : kpi.cor, marginTop: 2 }}>{kpi.sub}</div>
            </div>
          ))}
        </div>

        {/* Alertas críticos */}
        {registros.filter(r => r.nivel === 4).slice(0, 3).map(r => (
          <div key={r.id} style={{ background: "#FEF2F2", border: "0.5px solid #FCA5A5", borderRadius: 10, padding: "12px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>🚨</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, color: "#991B1B", fontSize: 13 }}>Crítico — {r.talhao_nome ?? "Talhão"}</span>
              <span style={{ color: "#991B1B", fontSize: 13 }}> · {r.nome}</span>
              {r.acao_recomendada && <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 2 }}>Ação: {r.acao_recomendada}</div>}
              {r.gps_lat && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>📍 {r.gps_lat.toFixed(6)}, {r.gps_lng?.toFixed(6)}</div>}
            </div>
            <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{dataDisplay(r)}</span>
          </div>
        ))}

        {/* Abas */}
        <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "0.5px solid var(--border)" }}>
          {(["lista", "mapa", "relatorio"] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} style={{
              padding: "10px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13,
              fontWeight: aba === a ? 700 : 400, color: aba === a ? "#1A4870" : "#666",
              borderBottom: aba === a ? "2.5px solid #1A4870" : "2.5px solid transparent",
            }}>
              {a === "lista" ? "📋 Lista" : a === "mapa" ? "📍 Mapa / Pontos GPS" : "📊 Relatório de Incidência"}
            </button>
          ))}
        </div>

        {/* ── ABA LISTA ── */}
        {aba === "lista" && (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inp, width: 160 }}>
                <option value="">Todos os tipos</option>
                <option value="praga">🐛 Pragas</option>
                <option value="doenca">🍂 Doenças</option>
                <option value="planta_daninha">🌿 Plantas daninhas</option>
              </select>
              <select value={filtroNivel} onChange={e => setFiltroNivel(e.target.value)} style={{ ...inp, width: 140 }}>
                <option value="">Todos os níveis</option>
                <option value="1">Baixo</option>
                <option value="2">Médio</option>
                <option value="3">Alto</option>
                <option value="4">Crítico</option>
              </select>
              <select value={filtroTalhao} onChange={e => setFiltroTalhao(e.target.value)} style={{ ...inp, width: 180 }}>
                <option value="">Todos os talhões</option>
                {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
              <select value={filtroCiclo} onChange={e => setFiltroCiclo(e.target.value)} style={{ ...inp, width: 180 }}>
                <option value="">Todos os ciclos</option>
                {ciclos.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.cultura} {(c.ano_safra as unknown as { ano: string } | null)?.ano ?? ""}
                  </option>
                ))}
              </select>
              <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)", alignSelf: "center" }}>
                {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""}
              </div>
            </div>

            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", overflow: "hidden" }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>Carregando...</div>
              ) : filtrados.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
                  Nenhum registro. Use "+ Novo Registro" para iniciar o monitoramento.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8FAFB", borderBottom: "0.5px solid var(--border)" }}>
                      {["Data","Talhão","Ciclo","Tipo","Ocorrência","Nível","% Pl.","Estágio","GPS","Foto","Ação Recomendada"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((r, idx) => {
                      const nm = NIVEL_META[r.nivel];
                      const tm = TIPO_META[r.tipo];
                      return (
                        <tr key={r.id} style={{ borderBottom: "0.5px solid var(--bg-tag)", background: r.nivel === 4 ? "#FFF8F8" : idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                          <td style={{ padding: "9px 12px", fontSize: 13, color: "#444", whiteSpace: "nowrap" }}>{dataDisplay(r)}</td>
                          <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{r.talhao_nome ?? "—"}</td>
                          <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-2)" }}>{r.ciclo_nome ?? "—"}</td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{ fontSize: 12, padding: "2px 7px", borderRadius: 20, background: tm.bg, color: tm.cor, fontWeight: 600, whiteSpace: "nowrap" }}>{tm.icone} {tm.label}</span>
                          </td>
                          <td style={{ padding: "9px 12px", fontSize: 13, color: "var(--text-1)", maxWidth: 220 }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</div>
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{ fontSize: 12, padding: "2px 9px", borderRadius: 20, fontWeight: 700, background: nm.bg, color: nm.cor, border: `0.5px solid ${nm.border}`, whiteSpace: "nowrap" }}>{nm.label}</span>
                          </td>
                          <td style={{ padding: "9px 12px", fontSize: 13, color: "var(--text-2)", textAlign: "center" }}>{r.percentual_plantas != null ? `${r.percentual_plantas}%` : "—"}</td>
                          <td style={{ padding: "9px 12px", fontSize: 13, color: "var(--text-2)", textAlign: "center" }}>{estagioDisplay(r)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "center" }}>
                            {r.gps_lat ? (
                              <a href={`https://maps.google.com/?q=${r.gps_lat},${r.gps_lng}`} target="_blank" rel="noreferrer" title={`${r.gps_lat?.toFixed(5)}, ${r.gps_lng?.toFixed(5)}`} style={{ fontSize: 16 }}>📍</a>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "center" }}>
                            {r.foto_url ? (
                              <a href={r.foto_url} target="_blank" rel="noreferrer">
                                <img src={r.foto_url} alt="foto" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: "0.5px solid var(--border)" }} />
                              </a>
                            ) : "—"}
                          </td>
                          <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-2)", maxWidth: 220 }}>
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.acao_recomendada ?? "—"}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── ABA MAPA / PONTOS GPS ── */}
        {aba === "mapa" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 12 }}>Pontos Georreferenciados</div>
              {registros.filter(r => r.gps_lat !== null).length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-3)", fontSize: 13 }}>
                  Nenhum ponto GPS registrado ainda.<br />
                  <span style={{ fontSize: 12 }}>Use "Capturar GPS" no registro para georreferenciar ocorrências.</span>
                </div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginBottom: 16 }}>
                    {registros.filter(r => r.gps_lat !== null).map(r => {
                      const nm = NIVEL_META[r.nivel];
                      const tm = TIPO_META[r.tipo];
                      return (
                        <div key={r.id} style={{ border: `0.5px solid ${nm.border}`, borderRadius: 10, padding: "12px 14px", background: nm.bg }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: nm.cor }}>{r.talhao_nome ?? "Talhão"}</span>
                            <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: "var(--bg-card)", color: nm.cor, fontWeight: 700, border: `0.5px solid ${nm.border}` }}>{nm.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "#444", marginBottom: 4 }}>{tm.icone} {r.nome}</div>
                          <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>📅 {dataDisplay(r)} · {r.ciclo_nome ?? "—"}</div>
                          <div style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "monospace", marginBottom: 8 }}>
                            📍 {r.gps_lat?.toFixed(6)}, {r.gps_lng?.toFixed(6)}
                            {r.gps_accuracy_m ? ` (±${Math.round(r.gps_accuracy_m)}m)` : ""}
                          </div>
                          {r.foto_url && (
                            <img src={r.foto_url} alt="foto" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6 }} />
                          )}
                          <a
                            href={`https://maps.google.com/?q=${r.gps_lat},${r.gps_lng}&z=18`}
                            target="_blank" rel="noreferrer"
                            style={{ display: "block", marginTop: 8, textAlign: "center", fontSize: 12, color: "#1A4870", fontWeight: 600, textDecoration: "none" }}
                          >
                            🗺 Abrir no Maps
                          </a>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ background: "var(--bg-page)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--text-2)" }}>
                    💡 Para visualizar todos os pontos em um mapa: exporte as coordenadas via CSV e importe no Google My Maps ou ArcGIS Online.
                  </div>
                </>
              )}
            </div>

            {/* Exportar CSV */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  const rows = registros.filter(r => r.gps_lat !== null).map(r =>
                    `${r.talhao_nome ?? ""},${dataDisplay(r)},${r.tipo},${r.nome},${r.nivel},${r.gps_lat},${r.gps_lng},${r.gps_accuracy_m ?? ""},${r.percentual_plantas ?? ""},${r.acao_recomendada ?? ""}`
                  );
                  const csv = ["Talhão,Data,Tipo,Ocorrência,Nível,Lat,Lng,Precisão(m),%Plantas,Ação", ...rows].join("\n");
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                  a.download = `monitoramento_gps_${new Date().toISOString().slice(0,10)}.csv`; a.click();
                }}
                style={{ padding: "8px 16px", background: "#16A34A", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                ⬇ Exportar CSV (GPS)
              </button>
            </div>
          </div>
        )}

        {/* ── ABA RELATÓRIO ── */}
        {aba === "relatorio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {(["praga","doenca","planta_daninha"] as const).map(tipo => {
                const regsT = registros.filter(r => r.tipo === tipo);
                const top3  = Object.entries(regsT.reduce((acc, r) => { acc[r.nome] = (acc[r.nome] ?? 0) + 1; return acc; }, {} as Record<string,number>)).sort((a,b) => b[1]-a[1]).slice(0,5);
                const tm    = TIPO_META[tipo];
                return (
                  <div key={tipo} style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tm.cor, marginBottom: 12 }}>{tm.icone} {tm.label}s — Top Ocorrências</div>
                    {top3.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--text-3)" }}>Nenhum registro</div>
                    ) : top3.map(([nome, qtd]) => (
                      <div key={nome} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "0.5px solid var(--bg-tag)" }}>
                        <div style={{ fontSize: 12, color: "var(--text-1)", flex: 1, paddingRight: 8 }}>{nome}</div>
                        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: tm.bg, color: tm.cor, fontWeight: 700 }}>{qtd}×</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div style={{ background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border)", padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 14 }}>Incidência por Talhão</div>
              {relatorio.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--text-3)", fontSize: 13 }}>Nenhum dado ainda.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8FAFB", borderBottom: "0.5px solid var(--border)" }}>
                      {["Talhão","Total","Crítico","Alto","Médio","Baixo","Últimas Ocorrências"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.map(({ talhao, total, criticos: crit, altos: alt, ultimos }) => {
                      const medios = ultimos.filter(r => r.nivel === 2).length + (registros.filter(r => r.talhao_id === talhao.id && r.nivel === 2).length);
                      const baixos = registros.filter(r => r.talhao_id === talhao.id && r.nivel === 1).length;
                      return (
                        <tr key={talhao.id} style={{ borderBottom: "0.5px solid var(--bg-tag)" }}>
                          <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{talhao.nome}</td>
                          <td style={{ padding: "9px 12px", fontSize: 13, color: "#444", textAlign: "center" }}>{total}</td>
                          <td style={{ padding: "9px 12px", textAlign: "center" }}>
                            {crit > 0 ? <span style={{ background: "#DC2626", color: "#fff", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{crit}</span> : <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "center" }}>
                            {alt > 0 ? <span style={{ background: "#FFEDD5", color: "#9A3412", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700 }}>{alt}</span> : <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "center" }}>
                            {medios > 0 ? <span style={{ background: "#FEF3C7", color: "#92400E", padding: "2px 8px", borderRadius: 12, fontSize: 12 }}>{medios}</span> : <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "center" }}>
                            {baixos > 0 ? <span style={{ background: "#DCFCE7", color: "#166534", padding: "2px 8px", borderRadius: 12, fontSize: 12 }}>{baixos}</span> : <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-2)" }}>
                            {ultimos.map(r => r.nome.split("(")[0].trim()).join(", ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal de novo registro ──────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 680, maxHeight: "94vh", overflowY: "auto", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "0.5px solid var(--bg-tag)" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Registrar Monitoramento</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Pragas, doenças ou plantas daninhas · GPS + fotos</div>
              </div>
              <button onClick={fecharModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>×</button>
            </div>

            <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Talhão + Ciclo + Data */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 160px", gap: 12 }}>
                <div>
                  <label style={lbl}>Talhão *</label>
                  <select value={fTalhao} onChange={e => setFTalhao(e.target.value)} style={inp}>
                    <option value="">Selecione...</option>
                    {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}{t.area_ha ? ` (${t.area_ha} ha)` : ""}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Ciclo / Safra</label>
                  <select value={fCiclo} onChange={e => setFCiclo(e.target.value)} style={inp}>
                    <option value="">Sem vínculo</option>
                    {ciclos.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.cultura} {(c.ano_safra as unknown as { ano: string } | null)?.ano ?? ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Data *</label>
                  <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
                </div>
              </div>

              {/* Tipo */}
              <div>
                <label style={lbl}>Tipo de Ocorrência *</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["praga","doenca","planta_daninha"] as const).map(t => {
                    const tm = TIPO_META[t];
                    return (
                      <button key={t} type="button" onClick={() => { setFTipo(t); setFNome(""); setFNomeCustom(""); }}
                        style={{ flex: 1, padding: "8px 6px", borderRadius: 8, border: `0.5px solid ${fTipo === t ? tm.cor : "var(--border-table)"}`, fontSize: 12, cursor: "pointer", fontWeight: fTipo === t ? 700 : 400, background: fTipo === t ? tm.bg : "var(--bg-card)", color: fTipo === t ? tm.cor : "var(--text-2)" }}>
                        {tm.icone} {tm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ocorrência */}
              <div>
                <label style={lbl}>Ocorrência *</label>
                <select value={fNome} onChange={e => setFNome(e.target.value)} style={inp}>
                  <option value="">Selecione...</option>
                  {CATALOGO[fTipo].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {nomeEhCustom && (
                  <input style={{ ...inp, marginTop: 8 }} placeholder="Descreva a ocorrência..." value={fNomeCustom} onChange={e => setFNomeCustom(e.target.value)} />
                )}
              </div>

              {/* Nível */}
              <div>
                <label style={lbl}>Nível de Infestação *</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {([1,2,3,4] as const).map(n => {
                    const nm = NIVEL_META[n]; const sel = fNivel === n;
                    return (
                      <button key={n} type="button" onClick={() => setFNivel(n)}
                        style={{ padding: "10px 6px", borderRadius: 10, border: `1.5px solid ${sel ? nm.border : "var(--border-table)"}`, background: sel ? nm.bg : "var(--bg-card)", cursor: "pointer", textAlign: "center", boxShadow: sel ? `0 0 0 2px ${nm.border}40` : "none" }}>
                        <div style={{ fontSize: 18, marginBottom: 4 }}>{n===1?"🟢":n===2?"🟡":n===3?"🟠":"🔴"}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: nm.cor }}>{nm.label}</div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>{n===1?"Abaixo NE":n===2?"Próx. NE":n===3?"Acima NE":"Emergencial"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* % Plantas + Estágio */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>% de Plantas Afetadas</label>
                  <InputNumerico decimais={0} min="0" max="100" placeholder="Ex: 15" value={fPct} onChange={v => setFPct(v)} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Estágio da Cultura</label>
                  {fCiclo ? (
                    <select value={fEstagio} onChange={e => setFEstagio(e.target.value)} style={inp}>
                      <option value="">Selecione...</option>
                      {estagios.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  ) : (
                    <input placeholder="Ex: R3, V5..." value={fEstagio} onChange={e => setFEstagio(e.target.value)} style={inp} />
                  )}
                </div>
              </div>

              {/* GPS — capturar coordenadas */}
              <div style={{ background: "var(--bg-page)", borderRadius: 10, padding: 14 }}>
                <label style={{ ...lbl, marginBottom: 8 }}>📍 Coordenadas GPS</label>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    {gpsLat !== null ? (
                      <div style={{ background: "var(--bg-card)", border: "0.5px solid #86EFAC", borderRadius: 8, padding: "8px 12px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#166534" }}>✓ Localização capturada</div>
                        <div style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "monospace", marginTop: 4 }}>
                          {gpsLat.toFixed(7)}, {gpsLng?.toFixed(7)}
                        </div>
                        {gpsAcc && <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Precisão: ±{Math.round(gpsAcc)}m</div>}
                        <button type="button" onClick={() => { setGpsLat(null); setGpsLng(null); setGpsAcc(null); }}
                          style={{ marginTop: 6, fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                          Limpar
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text-3)", padding: "6px 0" }}>
                        {gpsBusy ? "🔄 Obtendo localização..." : "Sem coordenadas — clique para capturar a posição atual."}
                      </div>
                    )}
                    {gpsErro && <div style={{ fontSize: 11, color: "#E24B4A", marginTop: 4 }}>{gpsErro}</div>}
                  </div>
                  <button type="button" onClick={capturarGPS} disabled={gpsBusy}
                    style={{ padding: "9px 14px", background: gpsBusy ? "var(--text-muted)" : "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: gpsBusy ? "wait" : "pointer", whiteSpace: "nowrap" }}>
                    {gpsBusy ? "Aguarde..." : "Capturar GPS"}
                  </button>
                </div>
              </div>

              {/* Fotos */}
              <div>
                <label style={lbl}>📷 Fotos de Campo (máx. 3)</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {fotos.map((url, i) => (
                    <div key={i} style={{ position: "relative" }}>
                      <img src={url} alt={`foto ${i+1}`} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "0.5px solid var(--border)" }} />
                      <button type="button" onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))}
                        style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, background: "#E24B4A", color: "#fff", border: "none", borderRadius: "50%", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        ×
                      </button>
                    </div>
                  ))}
                  {fotos.length < 3 && (
                    <button type="button" onClick={() => fileRef.current?.click()} disabled={fotoLoading}
                      style={{ width: 80, height: 80, border: "1.5px dashed var(--border-table)", borderRadius: 8, background: "var(--bg-page)", cursor: "pointer", fontSize: 24, color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
                      {fotoLoading ? <span style={{ fontSize: 11 }}>Enviando</span> : <>+<span style={{ fontSize: 10 }}>foto</span></>}
                    </button>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFoto(f); e.target.value = ""; }} />
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Clique para tirar foto ou selecionar da galeria</div>
              </div>

              {/* Ação + Recomendação vinculada */}
              <div>
                <label style={lbl}>Ação Recomendada</label>
                <input placeholder="Ex: Aplicar inseticida à base de lambdacialotrina, 100 mL/ha..." value={fAcao} onChange={e => setFAcao(e.target.value)} style={inp} />
              </div>

              {recs.length > 0 && (
                <div>
                  <label style={lbl}>Vincular a Recomendação Agronômica</label>
                  <select value={fRecId} onChange={e => setFRecId(e.target.value)} style={inp}>
                    <option value="">Sem vínculo</option>
                    {recs.map(r => (
                      <option key={r.id} value={r.id}>
                        {new Date(r.data_recomendacao + "T12:00").toLocaleDateString("pt-BR")} — {r.tipo}{r.agronomo_nome ? ` (${r.agronomo_nome})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Observações */}
              <div>
                <label style={lbl}>Observações</label>
                <textarea rows={2} placeholder="Localização no talhão, condições do dia, tendência..." value={fObs} onChange={e => setFObs(e.target.value)} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
              </div>

              {erro && (
                <div style={{ padding: "9px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13, border: "0.5px solid #FCA5A5" }}>{erro}</div>
              )}

              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button onClick={fecharModal} style={{ flex: 1, padding: 10, borderRadius: 8, border: "0.5px solid var(--border-table)", background: "var(--bg-card)", fontSize: 13, cursor: "pointer", color: "var(--text-2)" }}>Cancelar</button>
                <button onClick={salvar} disabled={salvando} style={{ flex: 2, padding: 10, borderRadius: 8, border: "none", background: salvando ? "var(--text-muted)" : "#1A4870", color: "#fff", fontSize: 13, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
                  {salvando ? "Salvando..." : "✓ Salvar Registro"}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
