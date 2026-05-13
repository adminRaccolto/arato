"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";
import type { Talhao, Insumo, AnoSafra, Ciclo } from "../../../lib/supabase";
import { listarTalhoes, listarInsumos, listarAnosSafra, listarTodosCiclos, processarPulverizacao } from "../../../lib/db";

// ─── Tipos locais ────────────────────────────────────────────────────────────

type TipoOp = "pulverizacao" | "adubacao" | "plantio" | "correcao_solo" | "tratamento_sementes" | "colheita";
type StatusRec = "pendente" | "em_execucao" | "concluida" | "cancelada";

interface Recomendacao {
  id: string;
  fazenda_id: string;
  ciclo_id?: string;
  tipo: TipoOp;
  status: StatusRec;
  codigo?: string;
  agronomo_nome?: string;
  agronomo_crea?: string;
  data_recomendacao: string;
  data_prevista_inicio?: string;
  data_prevista_fim?: string;
  remonte_pct?: number;
  area_total_recomendada_ha?: number;
  vazao_lha?: number;
  cap_tanque_l?: number;
  bico?: string;
  pressao_min?: number;
  pressao_max?: number;
  ph_min?: number;
  ph_max?: number;
  velocidade_min?: number;
  velocidade_max?: number;
  vento_max?: number;
  umidade_min?: number;
  umidade_max?: number;
  temperatura_min?: number;
  temperatura_max?: number;
  observacoes?: string;
  created_at?: string;
}

interface RecTalhao {
  id?: string;
  talhao_id: string;
  talhao_nome: string;
  area_recomendada_ha: number;
  area_executada_ha?: number;
  concluido?: boolean;
  ordem?: number;
}

interface RecProduto {
  id?: string;
  insumo_id?: string;
  produto_nome: string;
  dose_ha: number;
  unidade: string;
  quantidade_total?: number;
  ordem?: number;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const TIPOS_OP: Record<TipoOp, { label: string; cor: string; bg: string }> = {
  pulverizacao:       { label: "Pulverização",         cor: "#0C447C", bg: "#E6F1FB" },
  adubacao:           { label: "Adubação",              cor: "#5A3E00", bg: "#FBF3E0" },
  plantio:            { label: "Plantio",               cor: "#16A34A", bg: "#F0FFF4" },
  correcao_solo:      { label: "Correção de Solo",      cor: "#6B21A8", bg: "#F5F0FF" },
  tratamento_sementes:{ label: "Tratamento de Sementes",cor: "#9A3412", bg: "#FFF1EE" },
  colheita:           { label: "Colheita",              cor: "#B45309", bg: "#FFFBEB" },
};

const STATUS_META: Record<StatusRec, { label: string; cor: string; bg: string }> = {
  pendente:     { label: "Pendente",      cor: "#C9921B", bg: "#FBF3E0" },
  em_execucao:  { label: "Em Execução",   cor: "#1A4870", bg: "#D5E8F5" },
  concluida:    { label: "Concluída",     cor: "#16A34A", bg: "#F0FFF4" },
  cancelada:    { label: "Cancelada",     cor: "#E24B4A", bg: "#FCEBEB" },
};

const UNIDADES = ["L/ha","mL/ha","kg/ha","g/ha","t/ha","sc/ha","dose/ha","un/ha"];
const BICOS = ["TT 110015","TT 11001","TT 11002","TT 11003","TeeJet 8001","TeeJet 8002","Cônico","Leque","Outro"];

const inp: React.CSSProperties = { width:"100%", padding:"8px 10px", border:"0.5px solid #DDE2EE", borderRadius:8, fontSize:13, boxSizing:"border-box", background:"#fff" };
const lbl: React.CSSProperties = { fontSize:11, color:"#888", fontWeight:600, marginBottom:4, display:"block", textTransform:"uppercase" };
const fmtData = (s?: string) => s ? s.split("-").reverse().join("/") : "—";
const fmtN = (v?: number | null, d = 1) => v != null ? v.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d}) : "—";

// ─── Modal Nova Recomendação ─────────────────────────────────────────────────

function ModalNova({
  talhoes, insumos, anosSafra, todosCiclos, onSave, onClose,
  recEdit, talhoesInit, produtosInit,
}: {
  talhoes: Talhao[];
  insumos: Insumo[];
  anosSafra: AnoSafra[];
  todosCiclos: Ciclo[];
  onSave: () => void;
  onClose: () => void;
  recEdit?: Recomendacao;
  talhoesInit?: RecTalhao[];
  produtosInit?: RecProduto[];
}) {
  const { fazendaId } = useAuth();
  const [aba, setAba] = useState<"geral"|"talhoes"|"produtos"|"condicoes">("geral");
  const [saving, setSaving] = useState(false);
  const isEditing = !!recEdit;

  // Encontra ano_safra_id do ciclo quando editando
  const anoSafraDoEdit = recEdit?.ciclo_id
    ? todosCiclos.find(c => c.id === recEdit.ciclo_id)?.ano_safra_id ?? ""
    : "";

  const [f, setF] = useState({
    tipo: (recEdit?.tipo ?? "pulverizacao") as TipoOp,
    ano_safra_id: anoSafraDoEdit,
    ciclo_id: recEdit?.ciclo_id ?? "",
    agronomo_nome: recEdit?.agronomo_nome ?? "",
    agronomo_crea: recEdit?.agronomo_crea ?? "",
    data_recomendacao: recEdit?.data_recomendacao ?? new Date().toISOString().slice(0,10),
    data_prevista_inicio: recEdit?.data_prevista_inicio ?? "",
    data_prevista_fim: recEdit?.data_prevista_fim ?? "",
    remonte_pct: String(recEdit?.remonte_pct ?? "0"),
    vazao_lha: String(recEdit?.vazao_lha ?? "70"),
    cap_tanque_l: String(recEdit?.cap_tanque_l ?? ""),
    bico: recEdit?.bico ?? "",
    pressao_min: String(recEdit?.pressao_min ?? ""), pressao_max: String(recEdit?.pressao_max ?? ""),
    ph_min: String(recEdit?.ph_min ?? ""), ph_max: String(recEdit?.ph_max ?? ""),
    velocidade_min: String(recEdit?.velocidade_min ?? ""), velocidade_max: String(recEdit?.velocidade_max ?? ""),
    vento_max: String(recEdit?.vento_max ?? ""),
    umidade_min: String(recEdit?.umidade_min ?? ""), umidade_max: String(recEdit?.umidade_max ?? ""),
    temperatura_min: String(recEdit?.temperatura_min ?? ""), temperatura_max: String(recEdit?.temperatura_max ?? ""),
    observacoes: recEdit?.observacoes ?? "",
  });

  const [talhoesForm, setTalhoesForm] = useState<{ talhao_id: string; area: string }[]>(
    talhoesInit?.map(t => ({ talhao_id: t.talhao_id, area: String(t.area_recomendada_ha) }))
    ?? [{ talhao_id: "", area: "" }]
  );
  const [produtosForm, setProdutosForm] = useState<{ insumo_id: string; nome: string; dose: string; unidade: string }[]>(
    produtosInit?.map(p => ({ insumo_id: p.insumo_id ?? "", nome: p.produto_nome, dose: String(p.dose_ha), unidade: p.unidade }))
    ?? [{ insumo_id: "", nome: "", dose: "", unidade: "L/ha" }]
  );

  const cicloDoCiclo = todosCiclos.filter(c => !f.ano_safra_id || c.ano_safra_id === f.ano_safra_id);

  const areaTotal = talhoesForm.reduce((s, t) => {
    const base = parseFloat(t.area) || 0;
    return s + base * (1 + (parseFloat(f.remonte_pct) || 0) / 100);
  }, 0);

  function setTf(i: number, k: string, v: string) {
    setTalhoesForm(prev => prev.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  }
  function addTalhao() { setTalhoesForm(prev => [...prev, { talhao_id: "", area: "" }]); }
  function remTalhao(i: number) { setTalhoesForm(prev => prev.filter((_, idx) => idx !== i)); }

  function setPf(i: number, k: string, v: string) {
    setProdutosForm(prev => prev.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  }
  function addProduto() { setProdutosForm(prev => [...prev, { insumo_id: "", nome: "", dose: "", unidade: "L/ha" }]); }
  function remProduto(i: number) { setProdutosForm(prev => prev.filter((_, idx) => idx !== i)); }

  function selecionarTalhao(i: number, id: string) {
    const t = talhoes.find(x => x.id === id);
    setTalhoesForm(prev => prev.map((p, idx) => idx === i
      ? { talhao_id: id, area: t ? String(t.area_ha) : p.area }
      : p
    ));
  }

  function arredondarPorTanque() {
    const cap = parseFloat(f.cap_tanque_l) || 0;
    if (!cap) return;
    setProdutosForm(prev => prev.map(p => {
      const dose = parseFloat(p.dose) || 0;
      if (!dose) return p;
      const totalPorHa = parseFloat(f.vazao_lha) || 70;
      const qtPorTanque = dose * cap / totalPorHa;
      const arredondado = Math.ceil(qtPorTanque / 0.5) * 0.5;
      const novosDose = arredondado * totalPorHa / cap;
      return { ...p, dose: novosDose.toFixed(3) };
    }));
  }

  async function salvar() {
    const tValidos = talhoesForm.filter(t => t.talhao_id && t.area);
    const pValidos = produtosForm.filter(p => p.nome && p.dose);
    if (!f.tipo || !f.data_recomendacao || tValidos.length === 0 || pValidos.length === 0) {
      alert("Preencha: tipo, data, pelo menos 1 talhão e 1 produto.");
      return;
    }
    setSaving(true);
    try {
      const campos = {
        ciclo_id: f.ciclo_id || null,
        tipo: f.tipo,
        agronomo_nome: f.agronomo_nome || null,
        agronomo_crea: f.agronomo_crea || null,
        data_recomendacao: f.data_recomendacao,
        data_prevista_inicio: f.data_prevista_inicio || null,
        data_prevista_fim: f.data_prevista_fim || null,
        remonte_pct: parseFloat(f.remonte_pct) || 0,
        area_total_recomendada_ha: areaTotal || null,
        vazao_lha: parseFloat(f.vazao_lha) || null,
        cap_tanque_l: parseFloat(f.cap_tanque_l) || null,
        bico: f.bico || null,
        pressao_min: parseFloat(f.pressao_min) || null,
        pressao_max: parseFloat(f.pressao_max) || null,
        ph_min: parseFloat(f.ph_min) || null,
        ph_max: parseFloat(f.ph_max) || null,
        velocidade_min: parseFloat(f.velocidade_min) || null,
        velocidade_max: parseFloat(f.velocidade_max) || null,
        vento_max: parseFloat(f.vento_max) || null,
        umidade_min: parseFloat(f.umidade_min) || null,
        umidade_max: parseFloat(f.umidade_max) || null,
        temperatura_min: parseFloat(f.temperatura_min) || null,
        temperatura_max: parseFloat(f.temperatura_max) || null,
        observacoes: f.observacoes || null,
        updated_at: new Date().toISOString(),
      };

      let recId: string;
      if (isEditing) {
        const { error } = await supabase.from("recomendacoes").update(campos).eq("id", recEdit!.id);
        if (error) throw error;
        recId = recEdit!.id;
        // Substitui filhos
        await supabase.from("recomendacao_talhoes").delete().eq("recomendacao_id", recId);
        await supabase.from("recomendacao_produtos").delete().eq("recomendacao_id", recId);
      } else {
        const { data: rec, error } = await supabase.from("recomendacoes").insert({
          fazenda_id: fazendaId, status: "pendente", ...campos,
        }).select("id").single();
        if (error) throw error;
        recId = rec.id;
      }

      await supabase.from("recomendacao_talhoes").insert(
        tValidos.map((t, i) => ({
          recomendacao_id: recId,
          talhao_id: t.talhao_id,
          talhao_nome: talhoes.find(x => x.id === t.talhao_id)?.nome ?? "",
          area_recomendada_ha: parseFloat(t.area),
          ordem: i,
        }))
      );
      await supabase.from("recomendacao_produtos").insert(
        pValidos.map((p, i) => ({
          recomendacao_id: recId,
          insumo_id: p.insumo_id || null,
          produto_nome: p.nome,
          dose_ha: parseFloat(p.dose),
          unidade: p.unidade,
          quantidade_total: parseFloat(p.dose) * areaTotal || null,
          ordem: i,
        }))
      );
      onSave();
    } catch (e) {
      alert("Erro: " + String((e as Error).message));
    }
    setSaving(false);
  }

  const abas = [
    { id: "geral",      label: "1 · Geral" },
    { id: "talhoes",    label: "2 · Talhões" },
    { id: "produtos",   label: "3 · Produtos" },
    { id: "condicoes",  label: "4 · Condições" },
  ] as const;

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:12, width:760, maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div style={{ padding:"20px 28px 0", borderBottom:"0.5px solid #DDE2EE" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div style={{ fontSize:17, fontWeight:700 }}>{isEditing ? "Editar Recomendação" : "Nova Recomendação Agronômica"}</div>
            <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
          </div>
          <div style={{ display:"flex", gap:0 }}>
            {abas.map(a => (
              <button key={a.id} onClick={() => setAba(a.id)}
                style={{ padding:"10px 18px", border:"none", borderBottom: aba === a.id ? "2px solid #1A4870" : "2px solid transparent",
                  background:"none", fontSize:13, fontWeight: aba === a.id ? 700 : 400,
                  color: aba === a.id ? "#1A4870" : "#666", cursor:"pointer" }}>
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding:28, overflowY:"auto", flex:1 }}>

          {/* ABA GERAL */}
          {aba === "geral" && (
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={{ gridColumn:"span 2" }}>
                <label style={lbl}>Tipo de Operação *</label>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {(Object.keys(TIPOS_OP) as TipoOp[]).map(t => (
                    <button key={t} onClick={() => setF(v => ({...v, tipo: t}))}
                      style={{ padding:"7px 14px", borderRadius:20, border:`1.5px solid ${f.tipo === t ? TIPOS_OP[t].cor : "#DDE2EE"}`,
                        background: f.tipo === t ? TIPOS_OP[t].bg : "#fff",
                        color: f.tipo === t ? TIPOS_OP[t].cor : "#555",
                        fontWeight: f.tipo === t ? 700 : 400, fontSize:12, cursor:"pointer" }}>
                      {TIPOS_OP[t].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Ano Safra</label>
                <select value={f.ano_safra_id} onChange={e => setF(v => ({...v, ano_safra_id: e.target.value, ciclo_id:""}))} style={inp}>
                  <option value="">Selecione...</option>
                  {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Ciclo / Empreendimento</label>
                <select value={f.ciclo_id} onChange={e => setF(v => ({...v, ciclo_id: e.target.value}))} style={inp}>
                  <option value="">Selecione...</option>
                  {cicloDoCiclo.map(c => <option key={c.id} value={c.id}>{c.cultura} {c.descricao ?? ""}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Data da Recomendação *</label>
                <input type="date" value={f.data_recomendacao} onChange={e => setF(v => ({...v, data_recomendacao: e.target.value}))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Remonte / Transpasse (%)</label>
                <input type="number" value={f.remonte_pct} onChange={e => setF(v => ({...v, remonte_pct: e.target.value}))} style={inp} min={0} max={50} step={1} />
              </div>
              <div>
                <label style={lbl}>Previsto Início</label>
                <input type="date" value={f.data_prevista_inicio} onChange={e => setF(v => ({...v, data_prevista_inicio: e.target.value}))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Previsto Fim</label>
                <input type="date" value={f.data_prevista_fim} onChange={e => setF(v => ({...v, data_prevista_fim: e.target.value}))} style={inp} />
              </div>
              <div>
                <label style={lbl}>Agrônomo Responsável</label>
                <input placeholder="Nome do agrônomo" value={f.agronomo_nome} onChange={e => setF(v => ({...v, agronomo_nome: e.target.value}))} style={inp} />
              </div>
              <div>
                <label style={lbl}>CREA / ART</label>
                <input placeholder="Número do CREA" value={f.agronomo_crea} onChange={e => setF(v => ({...v, agronomo_crea: e.target.value}))} style={inp} />
              </div>
              <div style={{ gridColumn:"span 2" }}>
                <label style={lbl}>Observações</label>
                <textarea value={f.observacoes} onChange={e => setF(v => ({...v, observacoes: e.target.value}))}
                  style={{ ...inp, height:64, resize:"vertical" }} />
              </div>
            </div>
          )}

          {/* ABA TALHÕES */}
          {aba === "talhoes" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700 }}>Talhões incluídos</div>
                  {areaTotal > 0 && (
                    <div style={{ fontSize:12, color:"#888", marginTop:2 }}>
                      Área total: <strong>{fmtN(areaTotal)} ha</strong>
                      {parseFloat(f.remonte_pct) > 0 && <span style={{ color:"#C9921B" }}> (inclui {f.remonte_pct}% remonte)</span>}
                    </div>
                  )}
                </div>
                <button onClick={addTalhao} style={{ padding:"7px 16px", background:"#1A4870", color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                  + Talhão
                </button>
              </div>
              {talhoesForm.map((t, i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:10, marginBottom:10, alignItems:"end" }}>
                  <div>
                    <label style={lbl}>{i === 0 ? "Talhão" : ""}</label>
                    <select value={t.talhao_id} onChange={e => selecionarTalhao(i, e.target.value)} style={inp}>
                      <option value="">Selecione o talhão...</option>
                      {talhoes.map(tl => <option key={tl.id} value={tl.id}>{tl.nome} ({fmtN(tl.area_ha)} ha)</option>)}
                    </select>
                  </div>
                  <div style={{ width:120 }}>
                    <label style={lbl}>{i === 0 ? "Área (ha)" : ""}</label>
                    <input type="number" value={t.area} onChange={e => setTf(i, "area", e.target.value)} placeholder="ha" style={inp} step={0.01} />
                  </div>
                  <button onClick={() => remTalhao(i)} disabled={talhoesForm.length <= 1}
                    style={{ padding:"8px 12px", background:"#FCEBEB", border:"0.5px solid #E24B4A50", borderRadius:8, fontSize:13, cursor:"pointer", color:"#E24B4A" }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ABA PRODUTOS */}
          {aba === "produtos" && (
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>Produtos / Insumos</div>
                <div style={{ display:"flex", gap:8 }}>
                  {f.tipo === "pulverizacao" && (
                    <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                      <input type="number" placeholder="Cap. tanque (L)" value={f.cap_tanque_l}
                        onChange={e => setF(v => ({...v, cap_tanque_l: e.target.value}))}
                        style={{ ...inp, width:140 }} />
                      <input type="number" placeholder="Vazão (L/ha)" value={f.vazao_lha}
                        onChange={e => setF(v => ({...v, vazao_lha: e.target.value}))}
                        style={{ ...inp, width:120 }} />
                      <button onClick={arredondarPorTanque}
                        style={{ padding:"8px 14px", background:"#1A4870", color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                        Arredondar / tanque
                      </button>
                    </div>
                  )}
                  <button onClick={addProduto} style={{ padding:"7px 16px", background:"#1A4870", color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                    + Produto
                  </button>
                </div>
              </div>
              {produtosForm.map((p, i) => (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 100px 100px auto", gap:10, marginBottom:10, alignItems:"end" }}>
                  <div>
                    {i === 0 && <label style={lbl}>Produto *</label>}
                    <select
                      value={p.insumo_id || "__outro__"}
                      onChange={e => {
                        const id = e.target.value;
                        if (id === "__outro__") {
                          setPf(i, "insumo_id", "");
                          setPf(i, "nome", "");
                        } else {
                          const ins = insumos.find(x => x.id === id);
                          setPf(i, "insumo_id", id);
                          setPf(i, "nome", ins?.nome ?? "");
                        }
                      }}
                      style={{ ...inp, borderColor: p.insumo_id ? "#16A34A" : "#DDE2EE" }}
                    >
                      <option value="__outro__">— Selecione um insumo —</option>
                      {(["defensivo","fertilizante","inoculante","semente","produto_agricola","outros"] as const).map(cat => {
                        const grupo = insumos.filter(x => x.tipo === "insumo" && x.categoria === cat);
                        if (!grupo.length) return null;
                        const label: Record<string, string> = {
                          defensivo: "Defensivos", fertilizante: "Fertilizantes", inoculante: "Inoculantes",
                          semente: "Sementes", produto_agricola: "Produtos Agrícolas", outros: "Outros",
                        };
                        return (
                          <optgroup key={cat} label={label[cat]}>
                            {grupo.map(ins => (
                              <option key={ins.id} value={ins.id}>{ins.nome}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                    {!p.insumo_id && (
                      <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>
                        Selecione um insumo cadastrado para baixar estoque automaticamente
                      </div>
                    )}
                  </div>
                  <div>
                    {i === 0 && <label style={lbl}>Dose *</label>}
                    <input type="number" value={p.dose} onChange={e => setPf(i, "dose", e.target.value)} placeholder="0,0" style={inp} step={0.001} />
                  </div>
                  <div>
                    {i === 0 && <label style={lbl}>Unidade</label>}
                    <select value={p.unidade} onChange={e => setPf(i, "unidade", e.target.value)} style={inp}>
                      {UNIDADES.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div style={{ display:"flex", alignItems: i === 0 ? "flex-end" : "center", paddingBottom: i === 0 ? 0 : 0 }}>
                    {i === 0 && <div style={{ height:18, display:"block" }} />}
                    <button onClick={() => remProduto(i)} disabled={produtosForm.length <= 1}
                      style={{ padding:"8px 12px", background:"#FCEBEB", border:"0.5px solid #E24B4A50", borderRadius:8, fontSize:13, cursor:"pointer", color:"#E24B4A" }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {areaTotal > 0 && produtosForm.some(p => p.dose && p.nome) && (
                <div style={{ marginTop:16, background:"#F4F6FA", borderRadius:8, padding:"12px 16px" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#888", marginBottom:8, textTransform:"uppercase" }}>Totais calculados ({fmtN(areaTotal)} ha)</div>
                  {produtosForm.filter(p => p.nome && p.dose).map((p, i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
                      <span style={{ color:"#555" }}>{p.nome}</span>
                      <strong>{fmtN(parseFloat(p.dose) * areaTotal, 2)} {p.unidade.split("/")[0]}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ABA CONDIÇÕES */}
          {aba === "condicoes" && (
            <div>
              <div style={{ marginBottom:16, fontSize:13, color:"#888" }}>
                Condições mínimas para realização da operação em campo. Exibidas ao operador durante a execução.
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                {f.tipo === "pulverizacao" && (
                  <>
                    <div>
                      <label style={lbl}>Bico recomendado</label>
                      <select value={f.bico} onChange={e => setF(v => ({...v, bico: e.target.value}))} style={inp}>
                        <option value="">Selecione...</option>
                        {BICOS.map(b => <option key={b}>{b}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Vazão (L/ha)</label>
                      <input type="number" value={f.vazao_lha} onChange={e => setF(v => ({...v, vazao_lha: e.target.value}))} style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>Pressão — mín (psi)</label>
                      <input type="number" value={f.pressao_min} onChange={e => setF(v => ({...v, pressao_min: e.target.value}))} style={inp} step={0.5} />
                    </div>
                    <div>
                      <label style={lbl}>Pressão — máx (psi)</label>
                      <input type="number" value={f.pressao_max} onChange={e => setF(v => ({...v, pressao_max: e.target.value}))} style={inp} step={0.5} />
                    </div>
                    <div>
                      <label style={lbl}>pH da água — mín</label>
                      <input type="number" value={f.ph_min} onChange={e => setF(v => ({...v, ph_min: e.target.value}))} style={inp} step={0.1} />
                    </div>
                    <div>
                      <label style={lbl}>pH da água — máx</label>
                      <input type="number" value={f.ph_max} onChange={e => setF(v => ({...v, ph_max: e.target.value}))} style={inp} step={0.1} />
                    </div>
                  </>
                )}
                <div>
                  <label style={lbl}>Velocidade mín (km/h)</label>
                  <input type="number" value={f.velocidade_min} onChange={e => setF(v => ({...v, velocidade_min: e.target.value}))} style={inp} step={0.5} />
                </div>
                <div>
                  <label style={lbl}>Velocidade máx (km/h)</label>
                  <input type="number" value={f.velocidade_max} onChange={e => setF(v => ({...v, velocidade_max: e.target.value}))} style={inp} step={0.5} />
                </div>
                <div>
                  <label style={lbl}>Vento máx (km/h)</label>
                  <input type="number" value={f.vento_max} onChange={e => setF(v => ({...v, vento_max: e.target.value}))} style={inp} step={1} />
                </div>
                <div>
                  <label style={lbl}>Umidade mín (%)</label>
                  <input type="number" value={f.umidade_min} onChange={e => setF(v => ({...v, umidade_min: e.target.value}))} style={inp} step={1} />
                </div>
                <div>
                  <label style={lbl}>Temperatura mín (°C)</label>
                  <input type="number" value={f.temperatura_min} onChange={e => setF(v => ({...v, temperatura_min: e.target.value}))} style={inp} step={1} />
                </div>
                <div>
                  <label style={lbl}>Temperatura máx (°C)</label>
                  <input type="number" value={f.temperatura_max} onChange={e => setF(v => ({...v, temperatura_max: e.target.value}))} style={inp} step={1} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:"16px 28px", borderTop:"0.5px solid #DDE2EE", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:12, color:"#888" }}>
            {talhoesForm.filter(t => t.talhao_id && t.area).length} talhão(ões) ·{" "}
            {produtosForm.filter(p => p.nome && p.dose).length} produto(s)
            {areaTotal > 0 && <> · {fmtN(areaTotal)} ha</>}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={onClose} style={{ padding:"9px 20px", background:"#fff", border:"0.5px solid #DDE2EE", borderRadius:8, fontSize:13, cursor:"pointer" }}>
              Cancelar
            </button>
            <button onClick={salvar} disabled={saving}
              style={{ padding:"9px 24px", background:"#1A4870", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
              {saving ? "Salvando..." : isEditing ? "Salvar Alterações" : "Salvar Recomendação"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Execução ──────────────────────────────────────────────────────────

function ModalExecutar({
  rec, talhoes: recTalhoes, produtos,
  onClose, onConcluir,
}: {
  rec: Recomendacao;
  talhoes: RecTalhao[];
  produtos: RecProduto[];
  onClose: () => void;
  onConcluir: (ajustes: RecTalhao[], operador: string, obs: string) => Promise<void>;
}) {
  const [ajustes, setAjustes] = useState<RecTalhao[]>(
    recTalhoes.map(t => ({ ...t, area_executada_ha: t.area_recomendada_ha, concluido: t.concluido ?? false }))
  );
  const [operador, setOperador] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const tipoMeta = TIPOS_OP[rec.tipo];

  function setAjuste(i: number, k: keyof RecTalhao, v: unknown) {
    setAjustes(prev => prev.map((a, idx) => idx === i ? { ...a, [k]: v } : a));
  }

  const areaExecutada = ajustes.filter(a => a.concluido).reduce((s, a) => s + (Number(a.area_executada_ha) || 0), 0);
  const areaTotalRec  = ajustes.reduce((s, a) => s + a.area_recomendada_ha, 0);
  const todosFeitos   = ajustes.every(a => a.concluido);

  async function confirmar() {
    if (ajustes.filter(a => a.concluido).length === 0) {
      alert("Marque pelo menos um talhão como concluído.");
      return;
    }
    setSaving(true);
    await onConcluir(ajustes, operador, obs);
    setSaving(false);
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:12, width:640, maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(0,0,0,0.2)" }}>
        <div style={{ padding:"20px 28px", borderBottom:"0.5px solid #DDE2EE", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:16, fontWeight:700 }}>Confirmar Execução</div>
            <div style={{ fontSize:12, color:"#888", marginTop:2 }}>
              <span style={{ padding:"2px 8px", background:tipoMeta.bg, color:tipoMeta.cor, borderRadius:20, fontWeight:600, fontSize:11 }}>{tipoMeta.label}</span>
              {rec.agronomo_nome && <span style={{ marginLeft:8 }}>Rec.: {rec.agronomo_nome}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#888" }}>×</button>
        </div>

        <div style={{ padding:24, overflowY:"auto", flex:1 }}>
          {/* Condições */}
          {rec.tipo === "pulverizacao" && (rec.bico || rec.vento_max || rec.ph_min) && (
            <div style={{ background:"#F0F4FF", border:"0.5px solid #7C8FD9", borderRadius:8, padding:"12px 16px", marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#3B5BDB", marginBottom:8, textTransform:"uppercase" }}>Condições de Aplicação</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:16, fontSize:12, color:"#444" }}>
                {rec.bico && <span>Bico: <strong>{rec.bico}</strong></span>}
                {rec.vazao_lha && <span>Vazão: <strong>{rec.vazao_lha} L/ha</strong></span>}
                {(rec.pressao_min || rec.pressao_max) && <span>Pressão: <strong>{rec.pressao_min}–{rec.pressao_max} psi</strong></span>}
                {(rec.ph_min || rec.ph_max) && <span>pH: <strong>{rec.ph_min}–{rec.ph_max}</strong></span>}
                {rec.vento_max && <span>Vento máx: <strong>{rec.vento_max} km/h</strong></span>}
                {(rec.umidade_min) && <span>Umid. mín: <strong>{rec.umidade_min}%</strong></span>}
                {(rec.temperatura_min || rec.temperatura_max) && <span>Temp: <strong>{rec.temperatura_min}–{rec.temperatura_max}°C</strong></span>}
              </div>
            </div>
          )}

          {/* Produtos */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#555", marginBottom:8, textTransform:"uppercase" }}>Produtos</div>
            {produtos.map((p, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:13, padding:"6px 0", borderBottom:"0.5px solid #F0F0F0" }}>
                <span style={{ display:"flex", alignItems:"center", gap:6 }}>
                  {p.insumo_id
                    ? <span title="Vinculado ao estoque" style={{ color:"#16A34A", fontSize:11 }}>●</span>
                    : <span title="Não vinculado — sem baixa de estoque" style={{ color:"#EF9F27", fontSize:11 }}>●</span>
                  }
                  {p.produto_nome}
                  {!p.insumo_id && <span style={{ fontSize:10, color:"#EF9F27", background:"#FBF3E0", padding:"1px 6px", borderRadius:4 }}>sem estoque</span>}
                </span>
                <span style={{ color:"#1A4870", fontWeight:600 }}>{p.dose_ha} {p.unidade}</span>
              </div>
            ))}
            {produtos.some(p => !p.insumo_id) && (
              <div style={{ fontSize:11, color:"#EF9F27", background:"#FBF3E0", padding:"8px 12px", borderRadius:6, marginTop:8 }}>
                ⚠️ Produtos marcados com <b>sem estoque</b> não irão baixar o saldo nem gerar custo. Edite a recomendação e vincule ao insumo cadastrado.
              </div>
            )}
          </div>

          {/* Talhões — confirmação de área */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#555", marginBottom:10, textTransform:"uppercase" }}>
              Confirmação por Talhão
            </div>
            {ajustes.map((a, i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"auto 1fr 120px auto", gap:10, alignItems:"center", marginBottom:10,
                padding:"12px 16px", background: a.concluido ? "#F0FFF4" : "#F9FAFB", borderRadius:8,
                border:`0.5px solid ${a.concluido ? "#86EFAC" : "#DDE2EE"}` }}>
                <input type="checkbox" checked={a.concluido ?? false} onChange={e => setAjuste(i, "concluido", e.target.checked)}
                  style={{ width:18, height:18, cursor:"pointer", accentColor:"#16A34A" }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{a.talhao_nome}</div>
                  <div style={{ fontSize:11, color:"#888" }}>Rec.: {fmtN(a.area_recomendada_ha)} ha</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:"#888", marginBottom:2 }}>Área executada (ha)</div>
                  <input type="number" value={Number(a.area_executada_ha) || ""} step={0.01}
                    onChange={e => setAjuste(i, "area_executada_ha", parseFloat(e.target.value) || 0)}
                    disabled={!a.concluido}
                    style={{ ...inp, width:"100%", opacity: a.concluido ? 1 : 0.5 }} />
                </div>
                <div style={{ fontSize:11, color: Number(a.area_executada_ha) !== a.area_recomendada_ha ? "#C9921B" : "#16A34A" }}>
                  {Number(a.area_executada_ha) !== a.area_recomendada_ha
                    ? `${Number(a.area_executada_ha) > a.area_recomendada_ha ? "+" : ""}${fmtN(Number(a.area_executada_ha) - a.area_recomendada_ha)} ha`
                    : "✓"}
                </div>
              </div>
            ))}
            {areaExecutada > 0 && (
              <div style={{ fontSize:12, color:"#555", textAlign:"right", marginTop:8 }}>
                Executado: <strong>{fmtN(areaExecutada)} ha</strong> de {fmtN(areaTotalRec)} ha recomendados
              </div>
            )}
          </div>

          <div>
            <label style={lbl}>Operador responsável</label>
            <input placeholder="Nome de quem executou" value={operador} onChange={e => setOperador(e.target.value)} style={inp} />
          </div>
          <div style={{ marginTop:12 }}>
            <label style={lbl}>Observações de campo</label>
            <textarea placeholder="Condições encontradas, ajustes realizados..." value={obs}
              onChange={e => setObs(e.target.value)}
              style={{ ...inp, height:64, resize:"vertical", marginTop:0 }} />
          </div>
        </div>

        <div style={{ padding:"16px 28px", borderTop:"0.5px solid #DDE2EE", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:12, color: todosFeitos ? "#16A34A" : "#C9921B" }}>
            {todosFeitos ? "✓ Todos os talhões concluídos" : `${ajustes.filter(a=>a.concluido).length}/${ajustes.length} talhões concluídos`}
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={onClose} style={{ padding:"9px 20px", background:"#fff", border:"0.5px solid #DDE2EE", borderRadius:8, fontSize:13, cursor:"pointer" }}>
              Cancelar
            </button>
            <button onClick={confirmar} disabled={saving}
              style={{ padding:"9px 24px", background:"#16A34A", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
              {saving ? "Processando..." : todosFeitos ? "Concluir e Gerar Custo" : "Salvar Parcial"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function RecomendacoesPage() {
  const { fazendaId } = useAuth();

  const [recs,       setRecs]       = useState<Recomendacao[]>([]);
  const [talhoes,    setTalhoes]    = useState<Talhao[]>([]);
  const [insumos,    setInsumos]    = useState<Insumo[]>([]);
  const [anosSafra,  setAnosSafra]  = useState<AnoSafra[]>([]);
  const [todosCiclos,setTodosCiclos]= useState<Ciclo[]>([]);
  const [loading,    setLoading]    = useState(true);

  const [modalNova,  setModalNova]  = useState(false);
  const [modalEditar, setModalEditar] = useState<{
    rec: Recomendacao;
    talhoes: RecTalhao[];
    produtos: RecProduto[];
  } | null>(null);
  const [modalExec,  setModalExec]  = useState<{
    rec: Recomendacao;
    talhoes: RecTalhao[];
    produtos: RecProduto[];
  } | null>(null);

  const [filtroStatus, setFiltroStatus] = useState<StatusRec | "">("");
  const [filtroTipo,   setFiltroTipo]   = useState<TipoOp | "">("");
  const [busca,        setBusca]        = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const { data } = await supabase.from("recomendacoes").select("*")
      .eq("fazenda_id", fazendaId)
      .order("data_recomendacao", { ascending: false });
    setRecs((data ?? []) as Recomendacao[]);
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => {
    if (!fazendaId) return;
    carregar();
    listarTalhoes(fazendaId).then(setTalhoes);
    listarInsumos(fazendaId).then(ins => setInsumos(ins.filter(i => i.tipo === "insumo")));
    listarAnosSafra(fazendaId).then(setAnosSafra);
    listarTodosCiclos(fazendaId).then(setTodosCiclos);
  }, [fazendaId, carregar]);

  async function abrirExecucao(rec: Recomendacao) {
    const [{ data: tal }, { data: prod }] = await Promise.all([
      supabase.from("recomendacao_talhoes").select("*").eq("recomendacao_id", rec.id).order("ordem"),
      supabase.from("recomendacao_produtos").select("*").eq("recomendacao_id", rec.id).order("ordem"),
    ]);
    setModalExec({ rec, talhoes: (tal ?? []) as RecTalhao[], produtos: (prod ?? []) as RecProduto[] });
    // Muda status para em_execucao
    if (rec.status === "pendente") {
      await supabase.from("recomendacoes").update({ status: "em_execucao" }).eq("id", rec.id);
    }
  }

  async function concluirExecucao(ajustes: RecTalhao[], operador: string, obs: string) {
    if (!modalExec) return;
    const { rec } = modalExec;
    const todosFeitos = ajustes.every(a => a.concluido);

    // Atualiza área executada por talhão
    for (const a of ajustes) {
      if (a.id) {
        await supabase.from("recomendacao_talhoes").update({
          area_executada_ha: a.area_executada_ha,
          concluido: a.concluido,
        }).eq("id", a.id);
      }
    }

    // Registra execução
    await supabase.from("recomendacao_execucoes").insert({
      recomendacao_id: rec.id,
      operador_nome: operador || null,
      data_inicio: new Date().toISOString(),
      data_fim: new Date().toISOString(),
      observacoes: obs || null,
      origem: "web",
      sincronizado_em: new Date().toISOString(),
    });

    // Atualiza status da recomendação
    const novoStatus = todosFeitos ? "concluida" : "em_execucao";
    await supabase.from("recomendacoes").update({
      status: novoStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", rec.id);

    // Se concluída: integração completa com estoque e custos
    if (todosFeitos) {
      const areaExec = ajustes.filter(a => a.concluido).reduce((s, a) => s + (Number(a.area_executada_ha) || 0), 0);
      const produtos = modalExec.produtos;
      const hoje = new Date().toISOString().slice(0, 10);

      if (rec.tipo === "pulverizacao") {
        // 1. Criar registro de pulverização
        const { data: pulvRecord } = await supabase.from("pulverizacoes").insert({
          fazenda_id: fazendaId,
          ciclo_id: rec.ciclo_id || null,
          tipo: "outros",
          data_inicio: hoje,
          data_fim: hoje,
          area_ha: areaExec,
          cap_tanque_l: rec.cap_tanque_l || null,
          vazao_l_ha: rec.vazao_lha || null,
          observacao: `Recomendação agronômica. Operador: ${operador}. ${obs}`.trim(),
          fiscal: false,
        }).select("id").single();

        if (pulvRecord) {
          // 2. Buscar preços dos insumos
          const insumosIds = produtos.filter(p => p.insumo_id).map(p => p.insumo_id as string);
          const { data: insumosData } = insumosIds.length > 0
            ? await supabase.from("insumos").select("id,custo_medio,valor_unitario,estoque").in("id", insumosIds)
            : { data: [] };

          const nomesMap: Record<string, string> = {};
          const itensPulv = [];

          for (const p of produtos) {
            if (!p.insumo_id) continue;
            const ins = (insumosData ?? []).find((x: {id:string}) => x.id === p.insumo_id);
            const valorUnit = (ins as {custo_medio?:number;valor_unitario?:number} | undefined)?.custo_medio
              ?? (ins as {custo_medio?:number;valor_unitario?:number} | undefined)?.valor_unitario ?? 0;
            const totalConsumido = p.dose_ha * areaExec;
            const custoTotal     = valorUnit * totalConsumido;

            nomesMap[p.insumo_id] = p.produto_nome;

            const { data: itemRec } = await supabase.from("pulverizacao_itens").insert({
              pulverizacao_id: pulvRecord.id,
              fazenda_id:      fazendaId,
              insumo_id:       p.insumo_id,
              nome_produto:    p.produto_nome,
              dose_ha:         p.dose_ha,
              unidade:         p.unidade,
              total_consumido: totalConsumido,
              valor_unitario:  valorUnit,
              custo_ha:        valorUnit * p.dose_ha,
              custo_total:     custoTotal,
            }).select("*").single();

            if (itemRec) itensPulv.push(itemRec);
          }

          // 3. Baixar estoque + gerar CP via função existente
          if (itensPulv.length > 0) {
            await processarPulverizacao(
              { id: pulvRecord.id, fazenda_id: fazendaId ?? "", ciclo_id: rec.ciclo_id, tipo: "outros",
                data_inicio: hoje, data_fim: hoje, area_ha: areaExec, fiscal: false } as Parameters<typeof processarPulverizacao>[0],
              itensPulv as Parameters<typeof processarPulverizacao>[1],
              nomesMap,
            );
          }
        }
      } else {
        // Outros tipos: gera lançamento de custo direto por insumo
        for (const p of produtos) {
          if (!p.insumo_id) continue;
          const { data: ins } = await supabase.from("insumos")
            .select("custo_medio,valor_unitario,estoque,nome").eq("id", p.insumo_id).single();
          if (!ins) continue;
          const totalConsumido = p.dose_ha * areaExec;
          const valorUnit = (ins as {custo_medio?:number}).custo_medio ?? (ins as {valor_unitario?:number}).valor_unitario ?? 0;

          // Baixa de estoque
          await supabase.from("insumos")
            .update({ estoque: Math.max(0, ((ins as {estoque?:number}).estoque ?? 0) - totalConsumido) })
            .eq("id", p.insumo_id);
          await supabase.from("movimentacoes_estoque").insert({
            insumo_id: p.insumo_id, fazenda_id: fazendaId,
            tipo: "saida", quantidade: totalConsumido,
            data: hoje, safra: rec.ciclo_id,
            operacao: rec.tipo,
            observacao: `${TIPOS_OP[rec.tipo].label} via recomendação agronômica`,
            auto: true,
          });

          // CP se tiver custo
          const custoTotal = valorUnit * totalConsumido;
          if (custoTotal > 0) {
            await supabase.from("lancamentos").insert({
              fazenda_id: fazendaId, tipo: "pagar", moeda: "BRL",
              descricao: `${TIPOS_OP[rec.tipo].label} — ${p.produto_nome}`,
              categoria: rec.tipo === "adubacao" ? "Insumos — Fertilizantes" : rec.tipo === "correcao_solo" ? "Insumos — Corretivos" : rec.tipo === "plantio" || rec.tipo === "tratamento_sementes" ? "Insumos — Sementes" : "Insumos — Defensivos",
              data_lancamento: hoje, data_vencimento: hoje,
              valor: custoTotal, safra_id: rec.ciclo_id,
              status: "em_aberto", auto: true,
            });
          }
        }
      }
    }

    setModalExec(null);
    await carregar();
  }

  async function cancelarRec(id: string) {
    if (!confirm("Cancelar esta recomendação?")) return;
    await supabase.from("recomendacoes").update({ status: "cancelada" }).eq("id", id);
    await carregar();
  }

  async function editarRec(rec: Recomendacao) {
    const [{ data: tal }, { data: prod }] = await Promise.all([
      supabase.from("recomendacao_talhoes").select("*").eq("recomendacao_id", rec.id).order("ordem"),
      supabase.from("recomendacao_produtos").select("*").eq("recomendacao_id", rec.id).order("ordem"),
    ]);
    setModalEditar({ rec, talhoes: (tal ?? []) as RecTalhao[], produtos: (prod ?? []) as RecProduto[] });
  }

  async function excluirRec(id: string) {
    if (!confirm("Excluir esta recomendação? Esta ação não pode ser desfeita.")) return;
    await supabase.from("recomendacoes").delete().eq("id", id);
    await carregar();
  }

  // Filtros
  const recsFiltradas = recs.filter(r => {
    if (filtroStatus && r.status !== filtroStatus) return false;
    if (filtroTipo   && r.tipo   !== filtroTipo)   return false;
    if (busca) {
      const b = busca.toLowerCase();
      if (!r.agronomo_nome?.toLowerCase().includes(b) && !r.tipo.includes(b) && !r.codigo?.toLowerCase().includes(b)) return false;
    }
    return true;
  });

  const stats = {
    pendente:    recs.filter(r => r.status === "pendente").length,
    em_execucao: recs.filter(r => r.status === "em_execucao").length,
    concluida:   recs.filter(r => r.status === "concluida").length,
  };

  return (
    <>
      <TopNav />
      <div style={{ padding:"24px 32px", maxWidth:1200, margin:"0 auto" }}>
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <h1 style={{ margin:0, fontSize:20, fontWeight:700 }}>Recomendações Agronômicas</h1>
            <p style={{ margin:"4px 0 0", fontSize:13, color:"#888" }}>Emissão e acompanhamento de receituários de campo</p>
          </div>
          <div style={{ display:"flex", gap:10 }}>
            <a href="/lavoura/execucao"
              style={{ padding:"9px 18px", background:"#F0FFF4", color:"#16A34A", border:"0.5px solid #86EFAC", borderRadius:8, fontSize:13, fontWeight:600, textDecoration:"none" }}>
              📱 Modo Campo
            </a>
            <button onClick={() => setModalNova(true)}
              style={{ padding:"9px 20px", background:"#1A4870", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer" }}>
              + Nova Recomendação
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:12, marginBottom:20 }}>
          {([
            { k: "pendente",    label: "Pendentes",     cor: STATUS_META.pendente },
            { k: "em_execucao", label: "Em Execução",   cor: STATUS_META.em_execucao },
            { k: "concluida",   label: "Concluídas",    cor: STATUS_META.concluida },
          ] as const).map(s => (
            <div key={s.k} onClick={() => setFiltroStatus(filtroStatus === s.k ? "" : s.k)}
              style={{ background:"#fff", borderRadius:10, padding:"16px 20px", border:`0.5px solid ${filtroStatus === s.k ? s.cor.cor : "#DDE2EE"}`,
                cursor:"pointer", transition:"border .15s" }}>
              <div style={{ fontSize:28, fontWeight:800, color: s.cor.cor }}>{stats[s.k]}</div>
              <div style={{ fontSize:12, color:"#888", marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
          <input placeholder="Buscar por agrônomo, código..." value={busca} onChange={e => setBusca(e.target.value)}
            style={{ ...inp, width:240 }} />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as TipoOp | "")} style={{ ...inp, width:200 }}>
            <option value="">Todos os tipos</option>
            {(Object.keys(TIPOS_OP) as TipoOp[]).map(t => <option key={t} value={t}>{TIPOS_OP[t].label}</option>)}
          </select>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as StatusRec | "")} style={{ ...inp, width:180 }}>
            <option value="">Todos os status</option>
            {(Object.keys(STATUS_META) as StatusRec[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          {(filtroStatus || filtroTipo || busca) && (
            <button onClick={() => { setFiltroStatus(""); setFiltroTipo(""); setBusca(""); }}
              style={{ padding:"8px 14px", background:"#F4F6FA", border:"0.5px solid #DDE2EE", borderRadius:8, fontSize:12, cursor:"pointer", color:"#666" }}>
              Limpar filtros
            </button>
          )}
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ textAlign:"center", padding:60, color:"#888" }}>Carregando...</div>
        ) : recsFiltradas.length === 0 ? (
          <div style={{ textAlign:"center", padding:60, background:"#fff", borderRadius:12, border:"0.5px solid #DDE2EE" }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:15, fontWeight:600, color:"#555" }}>Nenhuma recomendação encontrada</div>
            <div style={{ fontSize:13, color:"#888", marginTop:4 }}>Crie a primeira recomendação usando o botão acima.</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {recsFiltradas.map(rec => {
              const tipo   = TIPOS_OP[rec.tipo];
              const status = STATUS_META[rec.status];
              return (
                <div key={rec.id} style={{ background:"#fff", borderRadius:10, border:"0.5px solid #DDE2EE", padding:"16px 20px",
                  display:"grid", gridTemplateColumns:"auto 1fr auto auto", gap:16, alignItems:"center" }}>
                  {/* Tipo badge */}
                  <div style={{ textAlign:"center" }}>
                    <div style={{ padding:"6px 12px", background:tipo.bg, color:tipo.cor, borderRadius:20, fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>
                      {tipo.label}
                    </div>
                  </div>
                  {/* Info */}
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>
                        {rec.data_prevista_inicio ? fmtData(rec.data_prevista_inicio) : fmtData(rec.data_recomendacao)}
                        {rec.data_prevista_fim && rec.data_prevista_fim !== rec.data_prevista_inicio
                          ? ` → ${fmtData(rec.data_prevista_fim)}` : ""}
                      </span>
                      {rec.codigo && <span style={{ fontSize:11, color:"#888" }}>#{rec.codigo}</span>}
                    </div>
                    <div style={{ fontSize:12, color:"#555", display:"flex", gap:16, flexWrap:"wrap" }}>
                      {rec.agronomo_nome && <span>Agrônomo: <strong>{rec.agronomo_nome}</strong></span>}
                      {rec.area_total_recomendada_ha && <span>Área: <strong>{fmtN(rec.area_total_recomendada_ha)} ha</strong></span>}
                      {rec.vazao_lha && rec.tipo === "pulverizacao" && <span>Vazão: <strong>{rec.vazao_lha} L/ha</strong></span>}
                    </div>
                  </div>
                  {/* Status */}
                  <div style={{ padding:"5px 12px", background:status.bg, color:status.cor, borderRadius:20, fontSize:11, fontWeight:700 }}>
                    {status.label}
                  </div>
                  {/* Ações */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end" }}>
                    {(rec.status === "pendente" || rec.status === "em_execucao") && (
                      <button onClick={() => abrirExecucao(rec)}
                        style={{ padding:"7px 14px", background:"#1A4870", color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        {rec.status === "pendente" ? "Executar" : "Continuar"}
                      </button>
                    )}
                    <button onClick={() => editarRec(rec)}
                      style={{ padding:"7px 12px", background:"#F0F5FA", border:"0.5px solid #1A487040", borderRadius:8, fontSize:12, cursor:"pointer", color:"#1A4870" }}>
                      Editar
                    </button>
                    {rec.status === "pendente" && (
                      <button onClick={() => cancelarRec(rec.id)}
                        style={{ padding:"7px 12px", background:"#FBF3E0", border:"0.5px solid #C9921B40", borderRadius:8, fontSize:12, cursor:"pointer", color:"#C9921B" }}>
                        Cancelar
                      </button>
                    )}
                    <button onClick={() => excluirRec(rec.id)}
                      style={{ padding:"7px 12px", background:"#FCEBEB", border:"0.5px solid #E24B4A50", borderRadius:8, fontSize:12, cursor:"pointer", color:"#E24B4A" }}>
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalNova && (
        <ModalNova
          talhoes={talhoes} insumos={insumos} anosSafra={anosSafra} todosCiclos={todosCiclos}
          onSave={async () => { setModalNova(false); await carregar(); }}
          onClose={() => setModalNova(false)}
        />
      )}

      {modalEditar && (
        <ModalNova
          talhoes={talhoes} insumos={insumos} anosSafra={anosSafra} todosCiclos={todosCiclos}
          recEdit={modalEditar.rec}
          talhoesInit={modalEditar.talhoes}
          produtosInit={modalEditar.produtos}
          onSave={async () => { setModalEditar(null); await carregar(); }}
          onClose={() => setModalEditar(null)}
        />
      )}

      {modalExec && (
        <ModalExecutar
          rec={modalExec.rec}
          talhoes={modalExec.talhoes}
          produtos={modalExec.produtos}
          onClose={() => setModalExec(null)}
          onConcluir={concluirExecucao}
        />
      )}
    </>
  );
}
