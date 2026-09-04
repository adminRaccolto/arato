"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { adicionarNaFila, salvarCache, lerCache } from "../../../lib/offline-store";

type Talhao = { id: string; nome: string; area_ha?: number };
type Ciclo   = { id: string; cultura: string; ano_safra?: { descricao: string } };
type Insumo  = { id: string; nome: string; unidade_medida?: string };

const inp: React.CSSProperties = {
  width: "100%", padding: "13px 14px", border: "0.5px solid var(--border-table)",
  borderRadius: 10, fontSize: 15, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", WebkitAppearance: "none",
};

export default function CampoPlantioPage() {
  const { fazendaId } = useAuth();
  const [etapa, setEtapa]     = useState<"form" | "ok">("form");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]       = useState("");

  const [talhoes,  setTalhoes]  = useState<Talhao[]>([]);
  const [ciclos,   setCiclos]   = useState<Ciclo[]>([]);
  const [sementes, setSementes] = useState<Insumo[]>([]);

  const [fTalhao,   setFTalhao]   = useState("");
  const [fCiclo,    setFCiclo]    = useState("");
  const [fSemente,  setFSemente]  = useState("");   // insumo_id da semente
  const [fData,     setFData]     = useState(() => new Date().toISOString().split("T")[0]);
  const [fVaridade, setFVaridade] = useState("");
  const [fArea,     setFArea]     = useState("");
  const [fDose,     setFDose]     = useState("");
  const [fObs,      setFObs]      = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;

    if (!navigator.onLine) {
      const talCache = lerCache<Talhao[]>(`talhoes_${fazendaId}`);
      const cicCache = lerCache<Ciclo[]>(`ciclos_${fazendaId}`);
      const semCache = lerCache<Insumo[]>(`sementes_${fazendaId}`);
      if (talCache) setTalhoes(talCache);
      if (cicCache) setCiclos(cicCache);
      if (semCache) setSementes(semCache);
      return;
    }

    const [{ data: tal }, { data: cic }, { data: sem }] = await Promise.all([
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("ciclos").select("id, cultura, anos_safra(descricao)").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
      supabase.from("insumos").select("id, nome, unidade_medida").eq("fazenda_id", fazendaId).in("categoria", ["semente", "inoculante"]).order("nome"),
    ]);
    const talRes = (tal ?? []) as Talhao[];
    const cicRes = (cic ?? []) as Ciclo[];
    const semRes = (sem ?? []) as Insumo[];
    setTalhoes(talRes);
    setCiclos(cicRes);
    setSementes(semRes);
    salvarCache(`talhoes_${fazendaId}`, talRes);
    salvarCache(`ciclos_${fazendaId}`, cicRes);
    salvarCache(`sementes_${fazendaId}`, semRes);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function handleTalhao(id: string) {
    setFTalhao(id);
    const t = talhoes.find(t => t.id === id);
    if (t?.area_ha) setFArea(String(t.area_ha));
  }

  function handleSemente(id: string) {
    setFSemente(id);
    if (id) {
      const sem = sementes.find(s => s.id === id);
      if (sem) setFVaridade(sem.nome);
    }
  }

  async function salvar() {
    if (!fazendaId || !fTalhao || !fCiclo || !fData) {
      setErro("Preencha talhão, ciclo e data."); return;
    }
    setErro(""); setSalvando(true);
    try {
      const area = parseFloat(fArea) || 0;
      const dose = parseFloat(fDose) || 0;
      const payload = {
        fazenda_id:    fazendaId,
        ciclo_id:      fCiclo,
        talhao_id:     fTalhao,
        data_plantio:  fData,
        insumo_id:     fSemente || null,
        variedade:     fVaridade.trim() || null,
        area_ha:       area,
        dose_kg_ha:    dose || null,
        quantidade_kg: (dose && area) ? dose * area : null,
        observacao:    fObs.trim() || null,
      };

      if (!navigator.onLine) {
        adicionarNaFila({ tipo: "plantio", fazenda_id: fazendaId, payload });
        setEtapa("ok");
        setSalvando(false);
        return;
      }

      const { error } = await supabase.from("plantios").insert(payload);
      if (error) {
        adicionarNaFila({ tipo: "plantio", fazenda_id: fazendaId, payload });
        setEtapa("ok");
        setSalvando(false);
        return;
      }
      setEtapa("ok");
    } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  }

  function novoRegistro() {
    setFTalhao(""); setFCiclo(""); setFSemente("");
    setFData(new Date().toISOString().split("T")[0]);
    setFVaridade(""); setFArea(""); setFDose(""); setFObs("");
    setErro(""); setSalvando(false); setEtapa("form");
  }

  const talhaoSel = talhoes.find(t => t.id === fTalhao);
  const cicloSel  = ciclos.find(c => c.id === fCiclo);
  const foiOffline = typeof window !== "undefined" && !navigator.onLine;

  if (etapa === "ok") return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 60 }}>
      <div style={{ fontSize: 64 }}>{foiOffline ? "📥" : "✅"}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: foiOffline ? "#92400E" : "#166534", textAlign: "center" }}>
        {foiOffline ? "Salvo localmente!" : "Plantio registrado!"}
      </div>
      {foiOffline && (
        <div style={{ background: "#FEF3C7", border: "0.5px solid #FCD34D", borderRadius: 10, padding: "10px 14px", width: "100%", fontSize: 12, color: "#92400E" }}>
          📡 Sem internet — use o botão <strong>↑ Sincronizar</strong> quando voltar a ter sinal.
        </div>
      )}
      <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 12, padding: "14px 18px", width: "100%", fontSize: 13, color: "#166534", lineHeight: 1.6 }}>
        <strong>{talhaoSel?.nome}</strong> · {cicloSel?.cultura ?? "—"}<br />
        {fData.split("-").reverse().join("/")} · {fArea ? `${fArea} ha` : "—"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <button onClick={novoRegistro} style={{ padding: "14px", background: "#111111", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          + Novo Plantio
        </button>
        <a href="/lavoura/plantio" style={{ padding: "14px", background: "var(--bg-card)", color: "#111111", border: "0.5px solid #111111", borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>
          Ver todos os plantios
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>🌱 Registrar Plantio</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Operação de semeadura</div>
      </div>

      {/* Talhão */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Talhão *</label>
        <select value={fTalhao} onChange={e => handleTalhao(e.target.value)} style={inp}>
          <option value="">Selecione o talhão...</option>
          {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}{t.area_ha ? ` (${t.area_ha} ha)` : ""}</option>)}
        </select>
      </div>

      {/* Ciclo */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Ciclo / Safra *</label>
        <select value={fCiclo} onChange={e => setFCiclo(e.target.value)} style={inp}>
          <option value="">Selecione o ciclo...</option>
          {ciclos.map(c => (
            <option key={c.id} value={c.id}>
              {c.cultura} {(c.ano_safra as unknown as { descricao: string } | null)?.descricao ?? ""}
            </option>
          ))}
        </select>
      </div>

      {/* Data */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Data do Plantio *</label>
        <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
      </div>

      {/* Semente do estoque */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>
          Semente {sementes.length === 0 && <span style={{ fontWeight: 400, color: "var(--text-3)" }}>(cadastre insumos de semente para selecionar)</span>}
        </label>
        <select value={fSemente} onChange={e => handleSemente(e.target.value)} style={inp}>
          <option value="">— Sem vínculo com estoque —</option>
          {sementes.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>

      {/* Variedade + Área */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Variedade / Cultivar</label>
          <input placeholder="Ex: M6410 IPRO" value={fVaridade} onChange={e => setFVaridade(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Área (ha)</label>
          <input type="number" inputMode="decimal" placeholder="Ex: 80" value={fArea} onChange={e => setFArea(e.target.value)} style={inp} />
        </div>
      </div>

      {/* Dose */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Dose de Semente (kg/ha)</label>
        <input type="number" inputMode="decimal" placeholder="Ex: 55" value={fDose} onChange={e => setFDose(e.target.value)} style={inp} />
        {fDose && fArea && (
          <div style={{ fontSize: 11, color: "#166534", marginTop: 5 }}>
            ≈ {(parseFloat(fDose) * parseFloat(fArea)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg total
          </div>
        )}
      </div>

      {/* Observações */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Observações</label>
        <textarea rows={2} placeholder="Condições de plantio, profundidade, solo..." value={fObs} onChange={e => setFObs(e.target.value)}
          style={{ ...inp, resize: "none", fontFamily: "inherit", fontSize: 14 }} />
      </div>

      {erro && <div style={{ padding: "12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 10, fontSize: 13 }}>{erro}</div>}

      <button onClick={salvar} disabled={salvando}
        style={{ padding: "16px", background: salvando ? "var(--text-muted)" : "#111111", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
        {salvando ? "Salvando..." : "✓ Registrar Plantio"}
      </button>
    </div>
  );
}
