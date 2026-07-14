"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

type Talhao = { id: string; nome: string; area_ha?: number };
type Ciclo   = { id: string; cultura: string; ano_safra?: { ano: string } };
type Deposito = { id: string; nome: string };

const CULTURA_PRODUTO: Record<string, string> = {
  soja: "soja", milho1: "milho", milho2: "milho", algodao: "algodao", trigo: "trigo", sorgo: "sorgo",
};

const inp: React.CSSProperties = {
  width: "100%", padding: "13px 14px", border: "0.5px solid var(--border-table)",
  borderRadius: 10, fontSize: 15, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", WebkitAppearance: "none",
};

export default function CampoColheitaPage() {
  const { fazendaId } = useAuth();
  const [etapa, setEtapa]     = useState<"form" | "ok">("form");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]       = useState("");

  const [talhoes,  setTalhoes]  = useState<Talhao[]>([]);
  const [ciclos,   setCiclos]   = useState<Ciclo[]>([]);
  const [depositos, setDepositos] = useState<Deposito[]>([]);

  const [fTalhao,     setFTalhao]     = useState("");
  const [fCiclo,      setFCiclo]      = useState("");
  const [fData,       setFData]       = useState(() => new Date().toISOString().split("T")[0]);
  const [fArea,       setFArea]       = useState("");
  const [fProdutiv,   setFProdutiv]   = useState("");
  const [fUmidade,    setFUmidade]    = useState("");
  const [fImpureza,   setFImpureza]   = useState("");
  const [fDeposito,   setFDeposito]   = useState("");
  const [fObs,        setFObs]        = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: tal }, { data: cic }, { data: dep }] = await Promise.all([
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("ciclos").select("id, cultura, anos_safra(ano)").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
      supabase.from("depositos").select("id, nome").eq("fazenda_id", fazendaId).order("nome"),
    ]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setDepositos((dep ?? []) as Deposito[]);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function handleTalhao(id: string) {
    setFTalhao(id);
    const t = talhoes.find(t => t.id === id);
    if (t?.area_ha) setFArea(String(t.area_ha));
  }

  // Totais calculados
  const area = parseFloat(fArea) || 0;
  const produtiv = parseFloat(fProdutiv) || 0;
  const totalSacas = area * produtiv;
  const totalKg = totalSacas * 60;

  async function salvar() {
    if (!fazendaId || !fTalhao || !fCiclo || !fData) {
      setErro("Preencha talhão, ciclo e data."); return;
    }
    if (!fArea || !fProdutiv) {
      setErro("Preencha área e produtividade."); return;
    }
    setErro(""); setSalvando(true);
    try {
      const cicloSel = ciclos.find(c => c.id === fCiclo);
      const produto  = cicloSel ? (CULTURA_PRODUTO[cicloSel.cultura.toLowerCase().replace(/\s+/g,"").replace("1ª","1").replace("2ª","2")] ?? cicloSel.cultura.toLowerCase()) : "soja";

      const { error } = await supabase.from("colheitas").insert({
        fazenda_id:            fazendaId,
        ciclo_id:              fCiclo,
        talhao_id:             fTalhao || null,
        data_colheita:         fData,
        produto,
        area_ha:               area,
        total_kg_bruto:        totalKg,
        total_kg_classificado: totalKg,
        total_sacas:           totalSacas,
        produtividade_sc_ha:   produtiv,
        umidade_media:         fUmidade ? parseFloat(fUmidade) : null,
        impureza_media:        fImpureza ? parseFloat(fImpureza) : null,
        deposito_id:           fDeposito || null,
        observacao:            fObs.trim() || null,
      });
      if (error) throw new Error(error.message);
      setEtapa("ok");
    } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  }

  function novoRegistro() {
    setFTalhao(""); setFCiclo(""); setFData(new Date().toISOString().split("T")[0]);
    setFArea(""); setFProdutiv(""); setFUmidade(""); setFImpureza("");
    setFDeposito(""); setFObs(""); setErro(""); setSalvando(false); setEtapa("form");
  }

  const talhaoSel = talhoes.find(t => t.id === fTalhao);
  const cicloSel  = ciclos.find(c => c.id === fCiclo);

  if (etapa === "ok") return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 60 }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#166534", textAlign: "center" }}>Colheita registrada!</div>
      <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 12, padding: "16px 18px", width: "100%", fontSize: 13, color: "#166534", lineHeight: 1.8 }}>
        <strong>{talhaoSel?.nome}</strong> · {cicloSel?.cultura ?? "—"}<br />
        {fData.split("-").reverse().join("/")} · {fArea} ha<br />
        <strong>{totalSacas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} sc</strong> · {fProdutiv} sc/ha
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <button onClick={novoRegistro} style={{ padding: "14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          + Nova Colheita
        </button>
        <a href="/lavoura/colheita" style={{ padding: "14px", background: "var(--bg-card)", color: "#1A4870", border: "0.5px solid #1A4870", borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>
          Ver todas as colheitas
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>🌾 Registrar Colheita</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Produtividade e resultado do talhão</div>
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
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Data da Colheita *</label>
        <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
      </div>

      {/* Área + Produtividade */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Área colhida (ha) *</label>
          <input type="number" inputMode="decimal" placeholder="Ex: 80" value={fArea} onChange={e => setFArea(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Produtividade (sc/ha) *</label>
          <input type="number" inputMode="decimal" placeholder="Ex: 62" value={fProdutiv} onChange={e => setFProdutiv(e.target.value)} style={inp} />
        </div>
      </div>

      {/* Totais calculados */}
      {totalSacas > 0 && (
        <div style={{ background: "#EFF4FA", border: "0.5px solid #97C3E0", borderRadius: 12, padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1A4870" }}>{totalSacas.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>sacas totais</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1A4870" }}>{(totalKg / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} t</div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>toneladas</div>
          </div>
        </div>
      )}

      {/* Classificação */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Umidade (%)</label>
          <input type="number" inputMode="decimal" placeholder="Ex: 13,5" value={fUmidade} onChange={e => setFUmidade(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Impureza (%)</label>
          <input type="number" inputMode="decimal" placeholder="Ex: 1,0" value={fImpureza} onChange={e => setFImpureza(e.target.value)} style={inp} />
        </div>
      </div>

      {/* Depósito */}
      {depositos.length > 0 && (
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Destino / Armazém</label>
          <select value={fDeposito} onChange={e => setFDeposito(e.target.value)} style={inp}>
            <option value="">Sem armazém (direto)</option>
            {depositos.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
          </select>
        </div>
      )}

      {/* Observações */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Observações</label>
        <textarea rows={2} placeholder="Condições de clima, máquina, peneira..." value={fObs} onChange={e => setFObs(e.target.value)}
          style={{ ...inp, resize: "none", fontFamily: "inherit", fontSize: 14 }} />
      </div>

      {erro && <div style={{ padding: "12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 10, fontSize: 13 }}>{erro}</div>}

      <button onClick={salvar} disabled={salvando}
        style={{ padding: "16px", background: salvando ? "var(--text-muted)" : "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
        {salvando ? "Salvando..." : "✓ Registrar Colheita"}
      </button>
    </div>
  );
}
