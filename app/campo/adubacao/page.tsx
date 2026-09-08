"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { adicionarNaFila, salvarCache, lerCache } from "../../../lib/offline-store";

type Talhao = { id: string; nome: string; area_ha?: number };
type Ciclo   = { id: string; cultura: string; ano_safra?: { descricao: string } };
type Insumo  = { id: string; nome: string; unidade?: string };
type ProdutoRow = { insumo_id: string; dose_kg_ha: string };

const MODALIDADES = [
  { value: "convencional",  label: "Convencional"   },
  { value: "sulco",         label: "No Sulco"       },
  { value: "broadcast",     label: "Broadcast"      },
  { value: "foliar",        label: "Foliar"         },
  { value: "fertirrigacao", label: "Fertirrigação"  },
];

const inp: React.CSSProperties = {
  width: "100%", padding: "13px 14px", border: "0.5px solid var(--border-table)",
  borderRadius: 10, fontSize: 15, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", WebkitAppearance: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 6, display: "block", textTransform: "uppercase", letterSpacing: "0.05em" };
const sec: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-1)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid var(--border-table)" };

export default function CampoAdubacaoPage() {
  const { fazendaId, fazendaIds } = useAuth();
  const [etapa,    setEtapa]    = useState<"form" | "ok">("form");
  const [salvando, setSalvando] = useState(false);
  const [erro,     setErro]     = useState("");

  const [talhoes, setTalhoes] = useState<Talhao[]>([]);
  const [ciclos,  setCiclos]  = useState<Ciclo[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);

  const [fTalhao,     setFTalhao]     = useState("");
  const [fCiclo,      setFCiclo]      = useState("");
  const [fModalidade, setFModalidade] = useState("convencional");
  const [fData,       setFData]       = useState(() => new Date().toISOString().split("T")[0]);
  const [fArea,       setFArea]       = useState("");
  const [fObs,        setFObs]        = useState("");
  const [produtos, setProdutos] = useState<ProdutoRow[]>([{ insumo_id: "", dose_kg_ha: "" }]);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;

    if (!navigator.onLine) {
      const talCache = lerCache<Talhao[]>(`talhoes_${fazendaId}`);
      const cicCache = lerCache<Ciclo[]>(`ciclos_${fazendaId}`);
      const insCache = lerCache<Insumo[]>(`insumos_adub_${fazendaId}`);
      if (talCache) setTalhoes(talCache);
      if (cicCache) setCiclos(cicCache);
      if (insCache) setInsumos(insCache);
      return;
    }

    const fids = fazendaIds.length > 0 ? fazendaIds : [fazendaId];
    const [{ data: tal }, { data: cic }, { data: ins }] = await Promise.all([
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("ciclos").select("id, cultura, anos_safra(descricao)").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
      supabase.from("insumos").select("id, nome, unidade")
        .in("fazenda_id", fids)
        .in("categoria", ["fertilizante", "micronutriente", "corretivo", "organico"])
        .order("nome"),
    ]);
    const talRes = (tal ?? []) as Talhao[];
    const cicRes = (cic ?? []) as Ciclo[];
    const insRes = (ins ?? []) as Insumo[];
    setTalhoes(talRes); setCiclos(cicRes); setInsumos(insRes);
    salvarCache(`talhoes_${fazendaId}`, talRes);
    salvarCache(`ciclos_${fazendaId}`, cicRes);
    salvarCache(`insumos_adub_${fazendaId}`, insRes);
  }, [fazendaId, fazendaIds]);

  useEffect(() => { carregar(); }, [carregar]);

  function handleTalhao(id: string) {
    setFTalhao(id);
    const t = talhoes.find(t => t.id === id);
    if (t?.area_ha) setFArea(String(t.area_ha));
  }

  function setProduto(i: number, field: keyof ProdutoRow, val: string) {
    setProdutos(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  }

  async function salvar() {
    if (!fazendaId || !fTalhao || !fCiclo || !fData) {
      setErro("Preencha Talhão, Ciclo e Data."); return;
    }
    const itensValidos = produtos.filter(p => p.insumo_id && p.dose_kg_ha);
    if (itensValidos.length === 0) {
      setErro("Adicione ao menos um produto com dose."); return;
    }
    setErro(""); setSalvando(true);

    const areaHa = parseFloat(fArea) || 0;
    const payload = {
      fazenda_id:     fazendaId,
      ciclo_id:       fCiclo,
      talhao_id:      fTalhao || null,
      modalidade:     fModalidade,
      area_ha:        areaHa,
      data_aplicacao: fData,
      observacao:     fObs || null,
    };
    const itens = itensValidos.map(p => ({
      fazenda_id:   fazendaId,
      insumo_id:    p.insumo_id,
      dose_kg_ha:   parseFloat(p.dose_kg_ha) || 0,
      quantidade_kg: areaHa > 0 ? (parseFloat(p.dose_kg_ha) || 0) * areaHa : null,
    }));

    if (!navigator.onLine) {
      adicionarNaFila({ tipo: "adubacao", fazenda_id: fazendaId, payload, itens });
      setEtapa("ok"); setSalvando(false); return;
    }

    const { data: adub, error: e1 } = await supabase.from("adubacoes_base").insert(payload).select("id").single();
    if (e1 || !adub) {
      adicionarNaFila({ tipo: "adubacao", fazenda_id: fazendaId, payload, itens });
      setEtapa("ok"); setSalvando(false); return;
    }
    const itensComId = itens.map(it => ({ ...it, adubacao_id: adub.id }));
    await supabase.from("adubacoes_base_itens").insert(itensComId);

    setEtapa("ok"); setSalvando(false);
  }

  function resetar() {
    setFTalhao(""); setFCiclo(""); setFModalidade("convencional");
    setFData(new Date().toISOString().split("T")[0]);
    setFArea(""); setFObs("");
    setProdutos([{ insumo_id: "", dose_kg_ha: "" }]);
    setErro(""); setEtapa("form");
  }

  if (etapa === "ok") {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>Adubação registrada!</div>
        <div style={{ fontSize: 14, color: "var(--text-2)", marginBottom: 32 }}>
          {!navigator.onLine && "Salvo localmente · será enviado quando houver conexão"}
        </div>
        <button onClick={resetar} style={{ padding: "14px 32px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer", width: "100%" }}>
          Registrar nova adubação
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px 40px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Registrar Adubação</div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>Fertilizantes, micronutrientes e corretivos</div>
      </div>

      {/* Talhão */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Talhão *</label>
        <select value={fTalhao} onChange={e => handleTalhao(e.target.value)} style={inp}>
          <option value="">— Selecionar talhão —</option>
          {talhoes.map(t => <option key={t.id} value={t.id}>{t.nome}{t.area_ha ? ` (${t.area_ha} ha)` : ""}</option>)}
        </select>
      </div>

      {/* Ciclo */}
      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>Ciclo / Safra *</label>
        <select value={fCiclo} onChange={e => setFCiclo(e.target.value)} style={inp}>
          <option value="">— Selecionar ciclo —</option>
          {ciclos.map(c => {
            const ano = (c.ano_safra as unknown as { descricao: string } | null)?.descricao ?? "";
            return <option key={c.id} value={c.id}>{c.cultura}{ano ? ` — ${ano}` : ""}</option>;
          })}
        </select>
      </div>

      {/* Data e Modalidade */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div>
          <label style={lbl}>Data *</label>
          <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={lbl}>Modalidade</label>
          <select value={fModalidade} onChange={e => setFModalidade(e.target.value)} style={inp}>
            {MODALIDADES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>

      {/* Área */}
      <div style={{ marginBottom: 20 }}>
        <label style={lbl}>Área (ha)</label>
        <input type="number" inputMode="decimal" placeholder="Ex: 150" value={fArea} onChange={e => setFArea(e.target.value)} style={inp} />
      </div>

      {/* Produtos */}
      <div style={{ marginBottom: 20 }}>
        <div style={sec}>Fertilizantes / Insumos</div>
        {produtos.map((p, i) => (
          <div key={i} style={{ background: "var(--bg-page)", borderRadius: 10, padding: "12px", marginBottom: 10, border: "0.5px solid var(--border-table)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)" }}>Produto {i + 1}</span>
              {produtos.length > 1 && (
                <button onClick={() => setProdutos(prev => prev.filter((_, idx) => idx !== i))}
                  style={{ fontSize: 11, color: "#E24B4A", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                  ✕ Remover
                </button>
              )}
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={lbl}>Produto</label>
              <select value={p.insumo_id} onChange={e => setProduto(i, "insumo_id", e.target.value)} style={inp}>
                <option value="">— Selecionar —</option>
                {insumos.map(ins => <option key={ins.id} value={ins.id}>{ins.nome}</option>)}
              </select>
              {insumos.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                  (cadastre fertilizantes/micronutrientes para selecionar)
                </div>
              )}
            </div>
            <div>
              <label style={lbl}>Dose (kg/ha ou L/ha)</label>
              <input type="number" inputMode="decimal" placeholder="Ex: 300" value={p.dose_kg_ha} onChange={e => setProduto(i, "dose_kg_ha", e.target.value)} style={inp} />
            </div>
          </div>
        ))}
        <button onClick={() => setProdutos(prev => [...prev, { insumo_id: "", dose_kg_ha: "" }])}
          style={{ width: "100%", padding: "12px", background: "none", border: "0.5px dashed var(--border-table)", borderRadius: 10, fontSize: 14, color: "var(--text-2)", cursor: "pointer" }}>
          + Adicionar produto
        </button>
      </div>

      {/* Observação */}
      <div style={{ marginBottom: 24 }}>
        <label style={lbl}>Observações</label>
        <textarea value={fObs} onChange={e => setFObs(e.target.value)} rows={2} placeholder="Condições, estágio, equipamento..." style={{ ...inp, resize: "none" }} />
      </div>

      {erro && <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A40", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F", marginBottom: 16 }}>{erro}</div>}

      <button onClick={salvar} disabled={salvando}
        style={{ width: "100%", padding: "16px", background: salvando ? "#888" : "#1A5C38", color: "#fff", border: "none", borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: salvando ? "default" : "pointer" }}>
        {salvando ? "Salvando…" : "⊕ Registrar adubação"}
      </button>
    </div>
  );
}
