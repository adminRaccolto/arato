"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

type Talhao  = { id: string; nome: string; area_ha?: number };
type Ciclo   = { id: string; cultura: string; ano_safra?: { ano: string } };
type Insumo  = { id: string; nome: string; unidade_medida?: string; custo_medio?: number };
type Empresa = { id: string; razao_social: string; cloa_numero?: string };

type Produto = { insumo_id: string; nome: string; dose: string; unidade: string };

const TIPO_AERONAVE = [
  { v: "aviao",       label: "Avião",      icon: "✈️" },
  { v: "drone",       label: "Drone",      icon: "🚁" },
  { v: "helicoptero", label: "Helicóptero", icon: "🚁" },
];
const TIPO_APLIC = [
  { v: "fungicida",           label: "Fungicida",     icon: "🍂" },
  { v: "inseticida",          label: "Inseticida",    icon: "🐛" },
  { v: "herbicida",           label: "Herbicida",     icon: "🌿" },
  { v: "fertilizante_foliar", label: "Foliar",        icon: "🧪" },
  { v: "dessecacao",          label: "Dessecação",    icon: "☀️" },
  { v: "bactericida",         label: "Bactericida",   icon: "🦠" },
  { v: "outros",              label: "Outros",        icon: "🔬" },
];
const DIRECOES = ["N","NE","E","SE","S","SO","O","NO"];
const UNIDADES = ["L/ha","mL/ha","kg/ha","g/ha"];

// Limite legal de vento por tipo de aeronave (km/h)
const VENTO_MAX: Record<string, number> = { aviao: 10.8, drone: 18, helicoptero: 10.8 };

const inp: React.CSSProperties = {
  width: "100%", padding: "13px 14px", border: "0.5px solid var(--border-table)",
  borderRadius: 10, fontSize: 15, color: "var(--text-1)", background: "var(--bg-card)",
  boxSizing: "border-box", WebkitAppearance: "none", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-2)", display: "block", marginBottom: 6 };
const secTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, paddingBottom: 6, borderBottom: "0.5px solid var(--border-table)" };
const pill = (ativo: boolean, cor = "#1A4870"): React.CSSProperties => ({
  padding: "10px 14px", borderRadius: 10,
  border: `2px solid ${ativo ? cor : "var(--border-table)"}`,
  background: ativo ? "#EFF4FA" : "var(--bg-card)",
  cursor: "pointer", fontSize: 13, fontWeight: ativo ? 700 : 400,
  color: ativo ? cor : "var(--text-2)", transition: "all 0.1s",
});

export default function CampoAereaPage() {
  const { fazendaId, contaId } = useAuth();
  const [etapa, setEtapa]       = useState<"form" | "ok">("form");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState("");

  const [talhoes, setTalhoes]   = useState<Talhao[]>([]);
  const [ciclos,  setCiclos]    = useState<Ciclo[]>([]);
  const [insumos, setInsumos]   = useState<Insumo[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  // Campos
  const [fAeronave, setFAeronave]     = useState("aviao");
  const [fEmpresaId, setFEmpresaId]   = useState("");
  const [fEmpresaNome, setFEmpresaNome] = useState("");
  const [fPrefixo, setFPrefixo]       = useState("");
  const [fPiloto, setFPiloto]         = useState("");
  const [fCiclo, setFCiclo]           = useState("");
  const [fTipo, setFTipo]             = useState("fungicida");
  const [fData, setFData]             = useState(() => new Date().toISOString().split("T")[0]);
  const [fEstagio, setFEstagio]       = useState("");
  const [fCalda, setFCalda]           = useState("");
  const [fAltura, setFAltura]         = useState("");
  const [fVento, setFVento]           = useState("");
  const [fDir, setFDir]               = useState("");
  const [fTemp, setFTemp]             = useState("");
  const [fUmidade, setFUmidade]       = useState("");
  const [fART, setFART]               = useState("");
  const [fCLOA, setFCLOA]             = useState("");
  const [fCustoHa, setFCustoHa]       = useState("");
  const [fObs, setFObs]               = useState("");
  const [talhoesSel, setTalhoesSel]   = useState<{ id: string; nome: string; area_ha: number }[]>([]);
  const [produtos, setProdutos]       = useState<Produto[]>([{ insumo_id: "", nome: "", dose: "", unidade: "L/ha" }]);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const [{ data: tal }, { data: cic }, { data: ins }, { data: emp }] = await Promise.all([
      supabase.from("talhoes").select("id, nome, area_ha").eq("fazenda_id", fazendaId).order("nome"),
      supabase.from("ciclos").select("id, cultura, anos_safra(ano)").eq("fazenda_id", fazendaId).order("created_at", { ascending: false }),
      supabase.from("insumos").select("id, nome, unidade_medida, custo_medio")
        .eq("fazenda_id", fazendaId)
        .in("categoria", ["defensivo", "fertilizante", "adjuvante"])
        .order("nome"),
      supabase.from("empresas_aplicadoras").select("id, razao_social, cloa_numero")
        .eq("conta_id", contaId ?? "")
        .eq("ativo", true)
        .order("razao_social"),
    ]);
    setTalhoes((tal ?? []) as Talhao[]);
    setCiclos((cic ?? []) as Ciclo[]);
    setInsumos((ins ?? []) as Insumo[]);
    setEmpresas((emp ?? []) as Empresa[]);
  }, [fazendaId, contaId]);

  useEffect(() => { carregar(); }, [carregar]);

  function toggleTalhao(t: Talhao) {
    setTalhoesSel(prev => {
      const ja = prev.find(x => x.id === t.id);
      if (ja) return prev.filter(x => x.id !== t.id);
      return [...prev, { id: t.id, nome: t.nome, area_ha: t.area_ha ?? 0 }];
    });
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

  const areaTotal = talhoesSel.reduce((s, t) => s + t.area_ha, 0);
  const ventoNum  = parseFloat(fVento) || 0;
  const ventoAlerta = ventoNum > 0 && ventoNum > VENTO_MAX[fAeronave];

  async function salvar() {
    if (!fazendaId || !fCiclo || !fData || talhoesSel.length === 0) {
      setErro("Preencha ciclo, data e selecione pelo menos 1 talhão."); return;
    }
    setErro(""); setSalvando(true);
    try {
      const custoHa = parseFloat(fCustoHa) || null;

      const { data: ap, error: e1 } = await supabase
        .from("aplicacoes_aereas")
        .insert({
          fazenda_id:            fazendaId,
          ciclo_id:              fCiclo,
          empresa_aplicadora_id: fEmpresaId || null,
          empresa_nome:          !fEmpresaId ? (fEmpresaNome.trim() || null) : null,
          tipo_aeronave:         fAeronave,
          aeronave_prefixo:      fPrefixo.trim() || null,
          piloto:                fPiloto.trim() || null,
          tipo:                  fTipo,
          estadio_fenologico:    fEstagio.trim() || null,
          data_aplicacao:        fData,
          area_ha:               areaTotal,
          volume_calda_l_ha:     parseFloat(fCalda) || null,
          altura_voo_m:          parseFloat(fAltura) || null,
          velocidade_vento_kmh:  ventoNum || null,
          temperatura_c:         parseFloat(fTemp) || null,
          umidade_rel_pct:       parseFloat(fUmidade) || null,
          direcao_vento:         fDir || null,
          art_numero:            fART.trim() || null,
          cloa_numero:           fCLOA.trim() || null,
          custo_ha:              custoHa,
          custo_total:           custoHa && areaTotal ? custoHa * areaTotal : null,
          observacao:            fObs.trim() || null,
          fiscal:                false,
        })
        .select("id")
        .single();
      if (e1) throw new Error(e1.message);

      const apId = ap.id;

      // Salva talhões
      const talhoeRows = talhoesSel.map(t => ({ aplicacao_id: apId, talhao_id: t.id, area_ha: t.area_ha }));
      const { error: e2 } = await supabase.from("aplicacoes_aereas_talhoes").insert(talhoeRows);
      if (e2) throw new Error(e2.message);

      // Salva produtos
      const prodValidos = produtos.filter(p => p.nome.trim() && p.dose);
      if (prodValidos.length > 0) {
        const itens = prodValidos.map(p => {
          const dose = parseFloat(p.dose) || 0;
          const ins  = insumos.find(i => i.id === p.insumo_id);
          const vu   = ins?.custo_medio ?? 0;
          return {
            aplicacao_id:   apId,
            fazenda_id:     fazendaId,
            insumo_id:      p.insumo_id || null,
            nome_produto:   p.nome.trim(),
            dose_ha:        dose,
            unidade:        p.unidade,
            total_consumido: dose * areaTotal,
            valor_unitario: vu,
            custo_ha:       vu * dose,
            custo_total:    vu * dose * areaTotal,
          };
        });
        const { error: e3 } = await supabase.from("aplicacoes_aereas_itens").insert(itens);
        if (e3) throw new Error(e3.message);
      }

      setEtapa("ok");
    } catch (e) { setErro((e as Error).message); }
    setSalvando(false);
  }

  function novoRegistro() {
    setFAeronave("aviao"); setFEmpresaId(""); setFEmpresaNome(""); setFPrefixo(""); setFPiloto("");
    setFCiclo(""); setFTipo("fungicida"); setFData(new Date().toISOString().split("T")[0]);
    setFEstagio(""); setFCalda(""); setFAltura(""); setFVento(""); setFDir(""); setFTemp(""); setFUmidade("");
    setFART(""); setFCLOA(""); setFCustoHa(""); setFObs("");
    setTalhoesSel([]); setProdutos([{ insumo_id: "", nome: "", dose: "", unidade: "L/ha" }]);
    setErro(""); setSalvando(false); setEtapa("form");
  }

  const cicloSel = ciclos.find(c => c.id === fCiclo);

  // ─── Tela de sucesso ────────────────────────────────────────────────────────

  if (etapa === "ok") return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20, paddingTop: 60 }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#166534", textAlign: "center" }}>Aplicação Aérea registrada!</div>
      <div style={{ background: "#F0FDF4", border: "0.5px solid #86EFAC", borderRadius: 12, padding: "14px 18px", width: "100%", fontSize: 13, color: "#166534", lineHeight: 1.8 }}>
        <div>{TIPO_AERONAVE.find(x => x.v === fAeronave)?.icon} {TIPO_AERONAVE.find(x => x.v === fAeronave)?.label}</div>
        <div>🌱 {cicloSel?.cultura ?? "—"} · {fData.split("-").reverse().join("/")}</div>
        <div>📐 {areaTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha · {talhoesSel.length} talhão(ões)</div>
        <div>💧 {TIPO_APLIC.find(x => x.v === fTipo)?.label}</div>
        {fVento && <div style={{ color: ventoAlerta ? "#991B1B" : "#166534", fontWeight: 600 }}>💨 Vento: {fVento} km/h {ventoAlerta ? "⚠️ Acima do limite" : "✓ OK"}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
        <button onClick={novoRegistro} style={{ padding: "14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          + Nova Aplicação Aérea
        </button>
        <a href="/lavoura/aerea" style={{ padding: "14px", background: "var(--bg-card)", color: "#1A4870", border: "0.5px solid #1A4870", borderRadius: 12, fontSize: 14, fontWeight: 600, textAlign: "center", textDecoration: "none" }}>
          Ver todas as aplicações
        </a>
        <a href="/campo" style={{ padding: "14px", background: "transparent", color: "var(--text-3)", border: "0.5px solid var(--border-table)", borderRadius: 12, fontSize: 14, textAlign: "center", textDecoration: "none" }}>
          ← Voltar ao início
        </a>
      </div>
    </div>
  );

  // ─── Formulário ─────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>✈️ Aplicação Aérea</div>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Avião agrícola · Drone · Helicóptero</div>
      </div>

      {/* Tipo de aeronave */}
      <div>
        <div style={secTitle}>Tipo de Aeronave</div>
        <div style={{ display: "flex", gap: 8 }}>
          {TIPO_AERONAVE.map(t => (
            <button key={t.v} type="button" onClick={() => setFAeronave(t.v)} style={{ ...pill(fAeronave === t.v), flex: 1, textAlign: "center" as const }}>
              <span style={{ fontSize: 20, display: "block", marginBottom: 4 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Empresa + Aeronave */}
      <div>
        <div style={secTitle}>Empresa e Aeronave</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {empresas.length > 0 ? (
            <div>
              <label style={lbl}>Empresa Aplicadora</label>
              <select value={fEmpresaId} onChange={e => setFEmpresaId(e.target.value)} style={inp}>
                <option value="">— selecione ou informe abaixo —</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social}{e.cloa_numero ? ` · CLOA ${e.cloa_numero}` : ""}</option>)}
              </select>
            </div>
          ) : null}
          {!fEmpresaId && (
            <div>
              <label style={lbl}>Nome da Empresa</label>
              <input placeholder="Ex: AgroAves Aviação Agrícola" value={fEmpresaNome} onChange={e => setFEmpresaNome(e.target.value)} style={inp} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>{fAeronave === "drone" ? "Modelo do Drone" : "Prefixo (PT-XXX)"}</label>
              <input placeholder={fAeronave === "drone" ? "DJI Agras T40" : "PT-MTG"} value={fPrefixo} onChange={e => setFPrefixo(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>{fAeronave === "drone" ? "Operador" : "Piloto"}</label>
              <input placeholder="Nome" value={fPiloto} onChange={e => setFPiloto(e.target.value)} style={inp} />
            </div>
          </div>
        </div>
      </div>

      {/* Identificação */}
      <div>
        <div style={secTitle}>Identificação</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={lbl}>Ciclo / Safra *</label>
            <select value={fCiclo} onChange={e => setFCiclo(e.target.value)} style={inp}>
              <option value="">Selecione o ciclo...</option>
              {ciclos.map(c => (
                <option key={c.id} value={c.id}>
                  {c.cultura} {(c.ano_safra as unknown as { ano: string } | null)?.ano ?? ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>Data *</label>
              <input type="date" value={fData} onChange={e => setFData(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Estádio</label>
              <input placeholder="Ex: R1, V5" value={fEstagio} onChange={e => setFEstagio(e.target.value)} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Tipo de Aplicação *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TIPO_APLIC.map(t => (
                <button key={t.v} type="button" onClick={() => setFTipo(t.v)} style={pill(fTipo === t.v)}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Talhões */}
      <div>
        <div style={secTitle}>
          Talhões *
          {talhoesSel.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#1A4870", background: "#D5E8F5", padding: "2px 8px", borderRadius: 10 }}>
              {talhoesSel.length} · {areaTotal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha
            </span>
          )}
        </div>
        {talhoes.length === 0 ? (
          <div style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>Nenhum talhão cadastrado.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {talhoes.map(t => {
              const sel = talhoesSel.some(x => x.id === t.id);
              return (
                <button key={t.id} type="button" onClick={() => toggleTalhao(t)} style={{
                  padding: "10px 16px", borderRadius: 20,
                  border: `2px solid ${sel ? "#1A4870" : "var(--border-table)"}`,
                  background: sel ? "#D5E8F5" : "var(--bg-card)",
                  cursor: "pointer", fontSize: 14, fontWeight: sel ? 700 : 400,
                  color: sel ? "#0B2D50" : "var(--text-2)",
                }}>
                  {sel ? "✓ " : ""}{t.nome}{t.area_ha ? ` · ${t.area_ha} ha` : ""}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Produtos */}
      <div>
        <div style={secTitle}>Produtos Aplicados</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {produtos.map((p, i) => (
            <div key={i} style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 14, position: "relative" }}>
              {produtos.length > 1 && (
                <button onClick={() => setProdutos(prev => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: 10, right: 10, width: 26, height: 26, background: "#FEE2E2", color: "#991B1B", border: "none", borderRadius: "50%", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              )}
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-3)", marginBottom: 8 }}>Produto {i + 1}</div>
              {insumos.length > 0 ? (
                <select value={p.insumo_id} onChange={e => setProduto(i, "insumo_id", e.target.value)} style={{ ...inp, marginBottom: 8 }}>
                  <option value="">Produto do estoque... (ou preencha abaixo)</option>
                  {insumos.map(ins => <option key={ins.id} value={ins.id}>{ins.nome}</option>)}
                </select>
              ) : null}
              {!p.insumo_id && (
                <input placeholder="Nome do produto" value={p.nome} onChange={e => setProduto(i, "nome", e.target.value)} style={{ ...inp, marginBottom: 8 }} />
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <label style={{ ...lbl, fontSize: 11 }}>Dose</label>
                  <input type="number" inputMode="decimal" placeholder="0,00" value={p.dose} onChange={e => setProduto(i, "dose", e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ ...lbl, fontSize: 11 }}>Unidade</label>
                  <select value={p.unidade} onChange={e => setProduto(i, "unidade", e.target.value)} style={inp}>
                    {UNIDADES.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setProdutos(prev => [...prev, { insumo_id: "", nome: "", dose: "", unidade: "L/ha" }])} style={{ marginTop: 10, width: "100%", padding: "12px", border: "1.5px dashed var(--border-table)", borderRadius: 10, background: "transparent", cursor: "pointer", fontSize: 14, color: "var(--text-3)", fontWeight: 600 }}>
          + Adicionar produto
        </button>
      </div>

      {/* Parâmetros técnicos */}
      <div>
        <div style={secTitle}>Parâmetros Técnicos</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={lbl}>Volume de calda (L/ha)</label>
            <input type="number" inputMode="decimal" placeholder={fAeronave === "drone" ? "5–15" : "15–40"} value={fCalda} onChange={e => setFCalda(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Altura de voo (m)</label>
            <input type="number" inputMode="decimal" placeholder={fAeronave === "drone" ? "2–4" : "2–5"} value={fAltura} onChange={e => setFAltura(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Custo/ha (R$)</label>
            <input type="number" inputMode="decimal" placeholder="Ex: 55,00" value={fCustoHa} onChange={e => setFCustoHa(e.target.value)} style={inp} />
          </div>
          {areaTotal > 0 && parseFloat(fCustoHa) > 0 && (
            <div>
              <label style={lbl}>Custo total</label>
              <div style={{ ...inp, background: "#f4f4f4", fontWeight: 700, color: "#C9921B", display: "flex", alignItems: "center" }}>
                {(parseFloat(fCustoHa) * areaTotal).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Condições meteorológicas */}
      <div>
        <div style={secTitle}>Condições no Momento da Aplicação</div>
        {ventoAlerta && (
          <div style={{ background: "#FEF2F2", border: "0.5px solid #FCA5A5", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#991B1B", fontWeight: 600 }}>
            ⚠️ Vento acima do limite legal para {TIPO_AERONAVE.find(x => x.v === fAeronave)?.label}: máx {VENTO_MAX[fAeronave]} km/h
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={lbl}>💨 Vel. do Vento (km/h)</label>
            <input type="number" inputMode="decimal" placeholder="Ex: 8" value={fVento} onChange={e => setFVento(e.target.value)} style={{ ...inp, borderColor: ventoAlerta ? "#E24B4A" : undefined }} />
          </div>
          <div>
            <label style={lbl}>Direção do Vento</label>
            <select value={fDir} onChange={e => setFDir(e.target.value)} style={inp}>
              <option value="">—</option>
              {DIRECOES.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>🌡 Temperatura (°C)</label>
            <input type="number" inputMode="decimal" placeholder="Ex: 28" value={fTemp} onChange={e => setFTemp(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>💧 Umidade Relativa (%)</label>
            <input type="number" inputMode="decimal" placeholder="Ex: 65" value={fUmidade} onChange={e => setFUmidade(e.target.value)} style={inp} />
          </div>
        </div>
      </div>

      {/* Documentação */}
      <div>
        <div style={secTitle}>Documentação (opcional)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={lbl}>ART nº</label>
            <input placeholder="Nº da ART" value={fART} onChange={e => setFART(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>CLOA nº</label>
            <input placeholder="Certificado da empresa" value={fCLOA} onChange={e => setFCLOA(e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={lbl}>Observações</label>
          <textarea rows={2} placeholder="Observações gerais..." value={fObs} onChange={e => setFObs(e.target.value)} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div style={{ background: "#FEF2F2", border: "0.5px solid #FCA5A5", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#991B1B" }}>
          {erro}
        </div>
      )}

      {/* Botão salvar */}
      <button
        onClick={salvar}
        disabled={salvando || talhoesSel.length === 0 || !fCiclo}
        style={{
          padding: "16px", background: salvando ? "#6B9FC8" : "#1A4870",
          color: "#fff", border: "none", borderRadius: 12, fontSize: 16,
          fontWeight: 700, cursor: salvando ? "not-allowed" : "pointer",
          opacity: (talhoesSel.length === 0 || !fCiclo) ? 0.5 : 1,
        }}
      >
        {salvando ? "Salvando…" : "✈️ Registrar Aplicação Aérea"}
      </button>

      <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
        <a href="/campo" style={{ color: "var(--text-3)", textDecoration: "none" }}>← Voltar ao início</a>
      </div>
    </div>
  );
}
