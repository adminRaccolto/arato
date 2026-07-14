"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

type Talhao = { id: string; nome: string; area_ha?: number };
type Ciclo  = { id: string; cultura: string; ano_safra?: { ano: string } };

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

  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [ciclos,  setCiclos]  = useState<Ciclo[]>([]);

  const [fTalhao,   setFTalhao]   = useState("");
  const [fCiclo,    setFCiclo]    = useState("");
  const [fData,     setFData]     = useState(() => new Date().toISOString().split("T")[0]);
  const [fVaridade, setFVaridade] = useState("");
  const [fArea,     setFArea]     = useState("");
  const [fDose,     setFDose]     = useState("");
  const [fObs,      setFObs]      = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: tal }, { data: cic }] = await Promise.all([
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("ciclos").select("id, cultura, anos_safra(ano)").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
    ]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Preenche área automaticamente ao selecionar talhão
  function handleTalhao(id: string) {
    setFTalhao(id);
    const t = talhoes.find(t => t.id === id);
    if (t?.area_ha) setFArea(String(t.area_ha));
  }

  async function salvar() {
    if (!fazendaId || !fTalhao || !fCiclo || !fData) {
      setErro("Preencha talhão, ciclo e data."); return;
    }
    setErro(""); setSalvando(true);
    try {
      const area = parseFloat(fArea) || 0;
      const dose = parseFloat(fDose) || 0;
      const { error } = await supabase.from("plantios").insert({
        fazenda_id:   fazendaId,
        ciclo_id:     fCiclo,
        talhao_id:    fTalhao,
        data_plantio: fData,
        variedade:    fVaridade.trim() || null,
        area_ha:      area,
        dose_kg_ha:   dose || null,
        quantidade_kg: (dose && area) ? dose * area : null,
        observacao:   fObs.trim() || null,
      });
      if (error) throw new Error(error.message);
      setEtapa("ok");
    } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  }

  function novoRegistro() {
    setFTalhao(""); setFCiclo(""); setFData(new Date().toISOString().split("T")[0]);
    setFVaridade(""); setFArea(""); setFDose(""); setFObs("");
    setErro(""); setSalvando(false); setEtapa("form");
  }

  const talhaoSel = talhoes.find(t => t.id === fTalhao);
  const cicloSel  = ciclos.find(c => c.id === fCiclo);

  if (etapa === "ok") return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 60 }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#166534", textAlign: "center" }}>Plantio registrado!</div>
      <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 12, padding: "14px 18px", width: "100%", fontSize: 13, color: "#166534", lineHeight: 1.6 }}>
        <strong>{talhaoSel?.nome}</strong> · {cicloSel?.cultura ?? "—"}<br />
        {fData.split("-").reverse().join("/")} · {fArea ? `${fArea} ha` : "—"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <button onClick={novoRegistro} style={{ padding: "14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          + Novo Plantio
        </button>
        <a href="/lavoura/plantio" style={{ padding: "14px", background: "var(--bg-card)", color: "#1A4870", border: "0.5px solid #1A4870", borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>
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
              {c.cultura} {(c.ano_safra as unknown as { ano: string } | null)?.ano ?? ""}
            </option>
          ))}
        </select>
      </div>

      {/* Data */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Data do Plantio *</label>
        <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
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
        style={{ padding: "16px", background: salvando ? "var(--text-muted)" : "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
        {salvando ? "Salvando..." : "✓ Registrar Plantio"}
      </button>
    </div>
  );
}
