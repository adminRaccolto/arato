"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Monitoramento = {
  id: string;
  fazenda_id: string;
  ciclo_id: string | null;
  talhao_id: string | null;
  talhao_nome?: string;
  ciclo_nome?: string;
  data_monitoramento: string;
  tipo: "praga" | "doenca" | "planta_daninha";
  nome: string;
  nivel: 1 | 2 | 3 | 4;
  percentual_plantas: number | null;
  estagio_cultura: string | null;
  acao_recomendada: string | null;
  observacoes: string | null;
  created_at: string;
};

type Talhao  = { id: string; nome: string; area_ha?: number };
type Ciclo   = { id: string; cultura: string; ano_safra?: { ano: string } };

// ─── Catálogo de pragas / doenças / invasoras (MT / soja-milho) ───────────────
const CATALOGO: Record<string, { tipo: Monitoramento["tipo"]; label: string; nc?: string }[]> = {
  praga: [
    { tipo: "praga", label: "Lagarta-da-soja (Anticarsia gemmatalis)" },
    { tipo: "praga", label: "Lagarta-falsa-medideira (Chrysodeixis includens)" },
    { tipo: "praga", label: "Helicoverpa armigera" },
    { tipo: "praga", label: "Percevejo-marrom (Euschistus heros)" },
    { tipo: "praga", label: "Percevejo-verde (Nezara viridula)" },
    { tipo: "praga", label: "Percevejo-pequeno (Piezodorus guildinii)" },
    { tipo: "praga", label: "Mosca-branca (Bemisia tabaci)" },
    { tipo: "praga", label: "Pulgão (Aphis glycines)" },
    { tipo: "praga", label: "Trips (Frankliniella schultzei)" },
    { tipo: "praga", label: "Ácaro-rajado (Tetranychus urticae)" },
    { tipo: "praga", label: "Ácaro-branco (Polyphagotarsonemus latus)" },
    { tipo: "praga", label: "Tamanduá-da-soja (Sternechus subsignatus)" },
    { tipo: "praga", label: "Broca-das-axilas (Crocidosema aporema)" },
    { tipo: "praga", label: "Lagarta-do-cartucho (Spodoptera frugiperda)" },
    { tipo: "praga", label: "Cigarrinha-do-milho (Dalbulus maidis)" },
    { tipo: "praga", label: "Outra praga" },
  ],
  doenca: [
    { tipo: "doenca", label: "Ferrugem-asiática (Phakopsora pachyrhizi)" },
    { tipo: "doenca", label: "Mofo-branco (Sclerotinia sclerotiorum)" },
    { tipo: "doenca", label: "Mancha-alvo (Corynespora cassiicola)" },
    { tipo: "doenca", label: "Antracnose (Colletotrichum truncatum)" },
    { tipo: "doenca", label: "Oídio (Erysiphe diffusa)" },
    { tipo: "doenca", label: "Mancha-parda (Septoria glycines)" },
    { tipo: "doenca", label: "Mancha-olho-de-rã (Cercospora sojina)" },
    { tipo: "doenca", label: "Podridão-radicular (Fusarium spp.)" },
    { tipo: "doenca", label: "Mosaico-comum (BYMV / SMV)" },
    { tipo: "doenca", label: "Nematoide-de-cisto (Heterodera glycines)" },
    { tipo: "doenca", label: "Nematoide-de-galha (Meloidogyne spp.)" },
    { tipo: "doenca", label: "Enfezamento (Spiroplasma / Phytoplasma) — milho" },
    { tipo: "doenca", label: "Cercosporiose (Cercospora zeae-maydis) — milho" },
    { tipo: "doenca", label: "Outra doença" },
  ],
  planta_daninha: [
    { tipo: "planta_daninha", label: "Buva (Conyza spp.) — resistente" },
    { tipo: "planta_daninha", label: "Capim-amargoso (Digitaria insularis) — resistente" },
    { tipo: "planta_daninha", label: "Corda-de-viola (Ipomoea spp.)" },
    { tipo: "planta_daninha", label: "Picão-preto (Bidens pilosa)" },
    { tipo: "planta_daninha", label: "Trapoeraba (Commelina benghalensis)" },
    { tipo: "planta_daninha", label: "Leiteiro (Euphorbia heterophylla)" },
    { tipo: "planta_daninha", label: "Capim-colchão (Digitaria horizontalis)" },
    { tipo: "planta_daninha", label: "Brachiaria (Urochloa spp.)" },
    { tipo: "planta_daninha", label: "Papuã (Urochloa plantaginea)" },
    { tipo: "planta_daninha", label: "Caruru (Amaranthus spp.)" },
    { tipo: "planta_daninha", label: "Apaga-fogo (Alternanthera tenella)" },
    { tipo: "planta_daninha", label: "Fedegoso (Senna obtusifolia)" },
    { tipo: "planta_daninha", label: "Outra planta daninha" },
  ],
};

// ─── Configurações visuais ────────────────────────────────────────────────────
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

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 };

// ─── Componente ───────────────────────────────────────────────────────────────
export default function PragasPage() {
  const { fazendaId } = useAuth();

  const [registros,  setRegistros]  = useState<Monitoramento[]>([]);
  const [talhoes,    setTalhoes]    = useState<Talhao[]>([]);
  const [ciclos,     setCiclos]     = useState<Ciclo[]>([]);
  const [loading,    setLoading]    = useState(true);

  // Filtros
  const [filtroTipo,   setFiltroTipo]   = useState<string>("");
  const [filtroNivel,  setFiltroNivel]  = useState<string>("");
  const [filtroTalhao, setFiltroTalhao] = useState<string>("");
  const [filtroCiclo,  setFiltroCiclo]  = useState<string>("");

  // Modal
  const [modal,     setModal]     = useState(false);
  const [salvando,  setSalvando]  = useState(false);
  const [erro,      setErro]      = useState("");

  // Campos do formulário
  const [fCiclo,        setFCiclo]        = useState("");
  const [fTalhao,       setFTalhao]       = useState("");
  const [fData,         setFData]         = useState(() => new Date().toISOString().split("T")[0]);
  const [fTipo,         setFTipo]         = useState<Monitoramento["tipo"]>("praga");
  const [fNome,         setFNome]         = useState("");
  const [fNomeCustom,   setFNomeCustom]   = useState("");
  const [fNivel,        setFNivel]        = useState<1|2|3|4>(1);
  const [fPct,          setFPct]          = useState("");
  const [fEstagio,      setFEstagio]      = useState("");
  const [fAcao,         setFAcao]         = useState("");
  const [fObs,          setFObs]          = useState("");

  // ─── Carga ──────────────────────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);

    const [{ data: regs }, { data: tal }, { data: cic }] = await Promise.all([
      supabase.from("monitoramento_pragas")
        .select("*, talhoes(nome), ciclos(cultura, anos_safra(ano))")
        .eq("fazenda_id", fazendaId)
        .order("data_monitoramento", { ascending: false })
        .limit(200),
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("ciclos").select("id, cultura, anos_safra(ano)").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
    ]);

    const normalizado: Monitoramento[] = (regs ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      talhao_nome: (r.talhoes as Record<string, string> | null)?.nome,
      ciclo_nome:  r.ciclos
        ? `${(r.ciclos as Record<string, unknown>).cultura} ${((r.ciclos as Record<string, unknown>).anos_safra as Record<string, string> | null)?.ano ?? ""}`
        : undefined,
    })) as Monitoramento[];

    setRegistros(normalizado);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Filtros aplicados ───────────────────────────────────────────────────────
  const filtrados = registros.filter(r =>
    (!filtroTipo   || r.tipo   === filtroTipo) &&
    (!filtroNivel  || r.nivel  === Number(filtroNivel)) &&
    (!filtroTalhao || r.talhao_id === filtroTalhao) &&
    (!filtroCiclo  || r.ciclo_id  === filtroCiclo)
  );

  // ─── KPIs ────────────────────────────────────────────────────────────────────
  const criticos  = registros.filter(r => r.nivel === 4).length;
  const altos     = registros.filter(r => r.nivel === 3).length;
  const talhoesAfetados = new Set(registros.filter(r => r.nivel >= 3).map(r => r.talhao_id)).size;
  const ultimoReg = registros[0];

  // ─── Salvar ──────────────────────────────────────────────────────────────────
  async function salvar() {
    if (!fazendaId) return;
    setErro("");
    const nomeFinal = fNome.startsWith("Outra") ? fNomeCustom.trim() : fNome;
    if (!fTalhao)     return setErro("Selecione o talhão.");
    if (!nomeFinal)   return setErro("Informe o nome da ocorrência.");
    if (!fNivel)      return setErro("Selecione o nível de infestação.");

    setSalvando(true);
    try {
      const { error } = await supabase.from("monitoramento_pragas").insert({
        fazenda_id:         fazendaId,
        ciclo_id:           fCiclo  || null,
        talhao_id:          fTalhao || null,
        data_monitoramento: fData,
        tipo:               fTipo,
        nome:               nomeFinal,
        nivel:              fNivel,
        percentual_plantas: fPct ? parseFloat(fPct) : null,
        estagio_cultura:    fEstagio || null,
        acao_recomendada:   fAcao    || null,
        observacoes:        fObs     || null,
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
    setFPct(""); setFEstagio(""); setFAcao(""); setFObs("");
    setErro(""); setModal(true);
  }
  function fecharModal() { setModal(false); setSalvando(false); }

  const cicloSelecionado = ciclos.find(c => c.id === fCiclo);
  const estagios = cicloSelecionado?.cultura?.toLowerCase().includes("milho") ? ESTAGIO_MILHO : ESTAGIO_SOJA;
  const nomeEhCustom = fNome.startsWith("Outra");

  return (
    <>
      <TopNav />
      <div style={{ fontFamily: "system-ui, sans-serif", padding: "28px 32px", background: "#F4F6FA", minHeight: "100vh" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Monitoramento de Pragas & Doenças</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>Registros de scouting — pragas, doenças e plantas daninhas por talhão</p>
          </div>
          <button
            onClick={abrirModal}
            style={{ padding: "9px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
          >
            + Novo Registro
          </button>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", border: "0.5px solid #DDE2EE" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Total de Registros</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#1A4870" }}>{registros.length}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>todos os ciclos</div>
          </div>
          <div style={{ background: criticos > 0 ? "#FEF2F2" : "#fff", borderRadius: 12, padding: "16px 20px", border: `0.5px solid ${criticos > 0 ? "#FCA5A5" : "#DDE2EE"}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Nível Crítico</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: criticos > 0 ? "#DC2626" : "#888" }}>{criticos}</div>
            <div style={{ fontSize: 11, color: criticos > 0 ? "#DC2626" : "#888", marginTop: 2 }}>{criticos > 0 ? "⚠ requerem ação imediata" : "nenhum no momento"}</div>
          </div>
          <div style={{ background: altos > 0 ? "#FFFBEB" : "#fff", borderRadius: 12, padding: "16px 20px", border: `0.5px solid ${altos > 0 ? "#FCD34D" : "#DDE2EE"}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Nível Alto</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: altos > 0 ? "#92400E" : "#888" }}>{altos}</div>
            <div style={{ fontSize: 11, color: altos > 0 ? "#92400E" : "#888", marginTop: 2 }}>{altos > 0 ? "monitorar de perto" : "nenhum no momento"}</div>
          </div>
          <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", border: "0.5px solid #DDE2EE" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Talhões com Alerta</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: talhoesAfetados > 0 ? "#9A3412" : "#166534" }}>{talhoesAfetados}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>nível alto ou crítico</div>
          </div>
        </div>

        {/* Alertas críticos */}
        {registros.filter(r => r.nivel === 4).slice(0, 3).map(r => (
          <div key={r.id} style={{ background: "#FEF2F2", border: "0.5px solid #FCA5A5", borderRadius: 10, padding: "12px 16px", marginBottom: 10, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>🚨</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontWeight: 700, color: "#991B1B", fontSize: 13 }}>Nível Crítico — {r.talhao_nome ?? "Talhão"}</span>
              <span style={{ color: "#991B1B", fontSize: 13 }}> · {r.nome}</span>
              {r.acao_recomendada && <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 2 }}>Ação: {r.acao_recomendada}</div>}
            </div>
            <span style={{ fontSize: 11, color: "#888" }}>{new Date(r.data_monitoramento + "T12:00").toLocaleDateString("pt-BR")}</span>
          </div>
        ))}

        {/* Filtros */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inp, width: 160 }}>
            <option value="">Todos os tipos</option>
            <option value="praga">🐛 Pragas</option>
            <option value="doenca">🍂 Doenças</option>
            <option value="planta_daninha">🌿 Plantas daninhas</option>
          </select>
          <select value={filtroNivel} onChange={e => setFiltroNivel(e.target.value)} style={{ ...inp, width: 150 }}>
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
                {c.cultura} {(c.ano_safra as unknown as Record<string, string> | null)?.ano ?? ""}
              </option>
            ))}
          </select>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "#888", alignSelf: "center" }}>
            {filtrados.length} registro{filtrados.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Tabela */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
              Nenhum registro encontrado. Use o botão acima para registrar o primeiro monitoramento.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFB", borderBottom: "0.5px solid #DDE2EE" }}>
                  {["Data", "Talhão", "Ciclo", "Tipo", "Ocorrência", "Nível", "% Plantas", "Estágio", "Ação Recomendada"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r, idx) => {
                  const nm  = NIVEL_META[r.nivel];
                  const tm  = TIPO_META[r.tipo];
                  return (
                    <tr key={r.id} style={{ borderBottom: "0.5px solid #EEF1F6", background: r.nivel === 4 ? "#FFF8F8" : idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "#444", whiteSpace: "nowrap" }}>
                        {new Date(r.data_monitoramento + "T12:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{r.talhao_nome ?? "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#555" }}>{r.ciclo_nome ?? "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 20, background: tm.bg, color: tm.cor, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {tm.icone} {tm.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "#1a1a1a", maxWidth: 260 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 700, background: nm.bg, color: nm.cor, border: `0.5px solid ${nm.border}`, whiteSpace: "nowrap" }}>
                          {nm.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "#555", textAlign: "center" }}>
                        {r.percentual_plantas != null ? `${r.percentual_plantas}%` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontSize: 13, color: "#555", textAlign: "center" }}>{r.estagio_cultura ?? "—"}</td>
                      <td style={{ padding: "10px 14px", fontSize: 12, color: "#555", maxWidth: 220 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.acao_recomendada ?? "—"}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Modal de novo registro ──────────────────────────────────────────── */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.20)" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "0.5px solid #EEF1F6" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Registrar Monitoramento</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Scouting de pragas, doenças ou plantas daninhas</div>
              </div>
              <button onClick={fecharModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888" }}>×</button>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Linha 1: Talhão + Ciclo + Data */}
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
                        {c.cultura} {(c.ano_safra as unknown as Record<string, string> | null)?.ano ?? ""}
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
                  {(["praga", "doenca", "planta_daninha"] as const).map(t => {
                    const tm = TIPO_META[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setFTipo(t); setFNome(""); setFNomeCustom(""); }}
                        style={{
                          flex: 1, padding: "8px 10px", borderRadius: 8, border: "0.5px solid",
                          fontSize: 12, cursor: "pointer", fontWeight: fTipo === t ? 700 : 400,
                          borderColor: fTipo === t ? tm.cor : "#D4DCE8",
                          background: fTipo === t ? tm.bg : "#fff",
                          color: fTipo === t ? tm.cor : "#555",
                        }}
                      >
                        {tm.icone} {tm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Nome da ocorrência */}
              <div>
                <label style={lbl}>Ocorrência *</label>
                <select value={fNome} onChange={e => setFNome(e.target.value)} style={inp}>
                  <option value="">Selecione...</option>
                  {CATALOGO[fTipo].map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                </select>
                {nomeEhCustom && (
                  <input
                    style={{ ...inp, marginTop: 8 }}
                    placeholder="Descreva a ocorrência..."
                    value={fNomeCustom}
                    onChange={e => setFNomeCustom(e.target.value)}
                  />
                )}
              </div>

              {/* Nível de infestação */}
              <div>
                <label style={lbl}>Nível de Infestação *</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {([1, 2, 3, 4] as const).map(n => {
                    const nm = NIVEL_META[n];
                    const sel = fNivel === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setFNivel(n)}
                        style={{
                          padding: "10px 6px", borderRadius: 10, border: `1.5px solid ${sel ? nm.border : "#D4DCE8"}`,
                          background: sel ? nm.bg : "#fff", cursor: "pointer", textAlign: "center",
                          boxShadow: sel ? `0 0 0 2px ${nm.border}40` : "none",
                          transition: "all 0.12s",
                        }}
                      >
                        <div style={{ fontSize: 18, marginBottom: 4 }}>
                          {n === 1 ? "🟢" : n === 2 ? "🟡" : n === 3 ? "🟠" : "🔴"}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: nm.cor }}>{nm.label}</div>
                        <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                          {n === 1 ? "Abaixo do NE" : n === 2 ? "Próximo ao NE" : n === 3 ? "Acima do NE" : "Emergencial"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Percentual + Estágio */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>% de Plantas Afetadas</label>
                  <input
                    type="number" min="0" max="100" step="1" placeholder="Ex: 15"
                    value={fPct} onChange={e => setFPct(e.target.value)} style={inp}
                  />
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

              {/* Ação recomendada */}
              <div>
                <label style={lbl}>Ação Recomendada</label>
                <input
                  placeholder="Ex: Aplicar inseticida à base de lambdacialotrina, dose 100 mL/ha..."
                  value={fAcao}
                  onChange={e => setFAcao(e.target.value)}
                  style={inp}
                />
              </div>

              {/* Observações */}
              <div>
                <label style={lbl}>Observações</label>
                <textarea
                  rows={2}
                  placeholder="Localização no talhão, condições do dia, tendência de evolução..."
                  value={fObs}
                  onChange={e => setFObs(e.target.value)}
                  style={{ ...inp, resize: "vertical", fontFamily: "inherit" }}
                />
              </div>

              {erro && (
                <div style={{ padding: "9px 12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 8, fontSize: 13, border: "0.5px solid #FCA5A5" }}>
                  {erro}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button onClick={fecharModal} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "0.5px solid #D4DCE8", background: "#fff", fontSize: 13, cursor: "pointer", color: "#555" }}>
                  Cancelar
                </button>
                <button
                  onClick={salvar}
                  disabled={salvando}
                  style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: salvando ? "#aaa" : "#1A4870", color: "#fff", fontSize: 13, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}
                >
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
