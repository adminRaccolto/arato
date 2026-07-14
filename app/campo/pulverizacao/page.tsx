"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

type Talhao = { id: string; nome: string; area_ha?: number };
type Ciclo   = { id: string; cultura: string; ano_safra?: { ano: string } };
type Insumo  = { id: string; nome: string; unidade_medida?: string; valor_unitario?: number; custo_medio?: number };

const TIPO_OPTS = [
  { v: "herbicida",          label: "Herbicida",    icon: "🌿" },
  { v: "fungicida",          label: "Fungicida",    icon: "🍂" },
  { v: "inseticida",         label: "Inseticida",   icon: "🐛" },
  { v: "fertilizante_foliar",label: "Foliar",       icon: "🧪" },
  { v: "dessecacao",         label: "Dessecação",   icon: "☀️" },
  { v: "regulador",          label: "Regulador",    icon: "📐" },
  { v: "outros",             label: "Outros",       icon: "🔬" },
];

const inp: React.CSSProperties = {
  width: "100%", padding: "13px 14px", border: "0.5px solid var(--border-table)",
  borderRadius: 10, fontSize: 15, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", WebkitAppearance: "none",
};

type Produto = { insumo_id: string; nome: string; dose: string; unidade: string };

export default function CampoPulverizacaoPage() {
  const { fazendaId } = useAuth();
  const [etapa, setEtapa]     = useState<"form" | "ok">("form");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]       = useState("");

  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [ciclos,  setCiclos]  = useState<Ciclo[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);

  const [fTalhao, setFTalhao] = useState("");
  const [fCiclo,  setFCiclo]  = useState("");
  const [fTipo,   setFTipo]   = useState("herbicida");
  const [fData,   setFData]   = useState(() => new Date().toISOString().split("T")[0]);
  const [fArea,   setFArea]   = useState("");
  const [fCalda,  setFCalda]  = useState("");
  const [fEstagio,setFEstagio]= useState("");
  const [fObs,    setFObs]    = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([
    { insumo_id: "", nome: "", dose: "", unidade: "L/ha" },
  ]);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: tal }, { data: cic }, { data: ins }] = await Promise.all([
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("ciclos").select("id, cultura, anos_safra(ano)").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
      supabase.from("insumos").select("id, nome, unidade_medida, valor_unitario, custo_medio")
        .eq("fazenda_id", fazendaId)
        .in("categoria", ["defensivo", "fertilizante", "adjuvante"])
        .order("nome"),
    ]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setInsumos((ins ?? []) as Insumo[]);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function handleTalhao(id: string) {
    setFTalhao(id);
    const t = talhoes.find(t => t.id === id);
    if (t?.area_ha) setFArea(String(t.area_ha));
  }

  function setProduto(i: number, field: keyof Produto, val: string) {
    setProdutos(prev => {
      const next = [...prev];
      if (field === "insumo_id") {
        const ins = insumos.find(x => x.id === val);
        next[i] = { ...next[i], insumo_id: val, nome: ins?.nome ?? "", unidade: ins?.unidade_medida ?? "L/ha" };
      } else {
        next[i] = { ...next[i], [field]: val };
      }
      return next;
    });
  }

  function addProduto() {
    setProdutos(prev => [...prev, { insumo_id: "", nome: "", dose: "", unidade: "L/ha" }]);
  }

  function removeProduto(i: number) {
    setProdutos(prev => prev.filter((_, j) => j !== i));
  }

  async function salvar() {
    if (!fazendaId || !fTalhao || !fCiclo || !fData) {
      setErro("Preencha talhão, ciclo e data."); return;
    }
    const produtosValidos = produtos.filter(p => p.nome.trim() && p.dose);
    if (produtosValidos.length === 0) {
      setErro("Adicione pelo menos um produto com dose."); return;
    }
    setErro(""); setSalvando(true);
    try {
      const area = parseFloat(fArea) || 0;
      const calda = parseFloat(fCalda) || null;

      const { data: pulv, error: e1 } = await supabase.from("pulverizacoes").insert({
        fazenda_id:         fazendaId,
        ciclo_id:           fCiclo,
        talhao_id:          fTalhao || null,
        tipo:               fTipo,
        data_inicio:        fData,
        area_ha:            area,
        vazao_l_ha:         calda,
        estadio_fenologico: fEstagio.trim() || null,
        observacao:         fObs.trim() || null,
        fiscal:             false,
      }).select("id").single();
      if (e1) throw new Error(e1.message);

      const pulvId = pulv.id;
      const itens = produtosValidos.map(p => {
        const dose = parseFloat(p.dose) || 0;
        const insumo = insumos.find(i => i.id === p.insumo_id);
        const vu = insumo?.custo_medio ?? insumo?.valor_unitario ?? 0;
        return {
          pulverizacao_id: pulvId,
          fazenda_id:      fazendaId,
          insumo_id:       p.insumo_id || pulvId,
          nome_produto:    p.nome.trim(),
          dose_ha:         dose,
          unidade:         p.unidade,
          total_consumido: dose * area,
          valor_unitario:  vu,
          custo_ha:        vu * dose,
          custo_total:     vu * dose * area,
        };
      });
      const { error: e2 } = await supabase.from("pulverizacao_itens").insert(itens);
      if (e2) throw new Error(e2.message);

      setEtapa("ok");
    } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  }

  function novoRegistro() {
    setFTalhao(""); setFCiclo(""); setFTipo("herbicida");
    setFData(new Date().toISOString().split("T")[0]);
    setFArea(""); setFCalda(""); setFEstagio(""); setFObs("");
    setProdutos([{ insumo_id: "", nome: "", dose: "", unidade: "L/ha" }]);
    setErro(""); setSalvando(false); setEtapa("form");
  }

  const talhaoSel = talhoes.find(t => t.id === fTalhao);
  const cicloSel  = ciclos.find(c => c.id === fCiclo);

  if (etapa === "ok") return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 60 }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#166534", textAlign: "center" }}>Pulverização registrada!</div>
      <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 12, padding: "14px 18px", width: "100%", fontSize: 13, color: "#166534", lineHeight: 1.6 }}>
        <strong>{talhaoSel?.nome}</strong> · {cicloSel?.cultura ?? "—"}<br />
        {fData.split("-").reverse().join("/")} · {TIPO_OPTS.find(t => t.v === fTipo)?.label ?? fTipo}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <button onClick={novoRegistro} style={{ padding: "14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          + Nova Pulverização
        </button>
        <a href="/lavoura/pulverizacao" style={{ padding: "14px", background: "var(--bg-card)", color: "#1A4870", border: "0.5px solid #1A4870", borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>
          Ver todas as pulverizações
        </a>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>

      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>💧 Registrar Pulverização</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 2 }}>Aplicação de defensivos e foliares</div>
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

      {/* Tipo de aplicação */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 8 }}>Tipo de Aplicação *</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TIPO_OPTS.map(t => (
            <button key={t.v} type="button" onClick={() => setFTipo(t.v)}
              style={{ padding: "10px 14px", borderRadius: 10, border: `2px solid ${fTipo === t.v ? "#1A4870" : "var(--border)"}`, background: fTipo === t.v ? "#EFF4FA" : "var(--bg-card)", cursor: "pointer", fontSize: 13, fontWeight: fTipo === t.v ? 700 : 400, color: fTipo === t.v ? "#1A4870" : "var(--text-2)" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Data + Estádio */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Data *</label>
          <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Estádio</label>
          <input placeholder="Ex: R1, V5" value={fEstagio} onChange={e => setFEstagio(e.target.value)} style={inp} />
        </div>
      </div>

      {/* Área + Calda */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Área (ha)</label>
          <input type="number" inputMode="decimal" placeholder="Ex: 80" value={fArea} onChange={e => setFArea(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Volume de calda (L/ha)</label>
          <input type="number" inputMode="decimal" placeholder="Ex: 120" value={fCalda} onChange={e => setFCalda(e.target.value)} style={inp} />
        </div>
      </div>

      {/* Produtos */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 8 }}>Produtos Aplicados *</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {produtos.map((p, i) => (
            <div key={i} style={{ background: "var(--bg-page)", border: "0.5px solid var(--border)", borderRadius: 12, padding: 14, position: "relative" }}>
              {produtos.length > 1 && (
                <button onClick={() => removeProduto(i)} style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: "50%", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Produto {i + 1}</div>

              {/* Select insumo ou nome livre */}
              {insumos.length > 0 ? (
                <select value={p.insumo_id} onChange={e => setProduto(i, "insumo_id", e.target.value)} style={{ ...inp, marginBottom: 8 }}>
                  <option value="">Produto do estoque... (ou preencha nome abaixo)</option>
                  {insumos.map(ins => <option key={ins.id} value={ins.id}>{ins.nome}</option>)}
                </select>
              ) : null}

              {(!p.insumo_id || p.nome) && (
                <input placeholder="Nome do produto" value={p.nome} onChange={e => setProduto(i, "nome", e.target.value)} style={{ ...inp, marginBottom: 8 }} />
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, display: "block" }}>Dose</label>
                  <input type="number" inputMode="decimal" placeholder="0,0" value={p.dose} onChange={e => setProduto(i, "dose", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4, display: "block" }}>Unidade</label>
                  <select value={p.unidade} onChange={e => setProduto(i, "unidade", e.target.value)} style={inp}>
                    {["L/ha","mL/ha","kg/ha","g/ha","cc/ha"].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              {p.dose && fArea && (
                <div style={{ fontSize: 11, color: "#166534", marginTop: 6 }}>
                  ≈ {(parseFloat(p.dose) * parseFloat(fArea)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} {p.unidade.replace("/ha","")} total
                </div>
              )}
            </div>
          ))}
        </div>

        <button type="button" onClick={addProduto}
          style={{ marginTop: 10, width: "100%", padding: "11px", background: "var(--bg-card)", color: "#1A4870", border: "1px dashed #1A4870", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          + Adicionar Produto
        </button>
      </div>

      {/* Observações */}
      <div>
        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 }}>Observações</label>
        <textarea rows={2} placeholder="Condições climáticas, equipamento, pressão..." value={fObs} onChange={e => setFObs(e.target.value)}
          style={{ ...inp, resize: "none", fontFamily: "inherit", fontSize: 14 }} />
      </div>

      {erro && <div style={{ padding: "12px", background: "#FEE2E2", color: "#991B1B", borderRadius: 10, fontSize: 13 }}>{erro}</div>}

      <button onClick={salvar} disabled={salvando}
        style={{ padding: "16px", background: salvando ? "var(--text-muted)" : "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: salvando ? "wait" : "pointer" }}>
        {salvando ? "Salvando..." : "✓ Registrar Pulverização"}
      </button>
    </div>
  );
}
