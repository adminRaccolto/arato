"use client";
// Página de execução de campo — mobile-first, offline-capable via localStorage
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../components/AuthProvider";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoOp = "pulverizacao" | "adubacao" | "plantio" | "correcao_solo" | "tratamento_sementes" | "colheita";
type StatusRec = "pendente" | "em_execucao" | "concluida" | "cancelada";

interface Recomendacao {
  id: string;
  tipo: TipoOp;
  status: StatusRec;
  agronomo_nome?: string;
  data_prevista_inicio?: string;
  data_prevista_fim?: string;
  area_total_recomendada_ha?: number;
  vazao_lha?: number;
  bico?: string;
  pressao_min?: number;
  pressao_max?: number;
  ph_min?: number;
  ph_max?: number;
  vento_max?: number;
  velocidade_min?: number;
  velocidade_max?: number;
  umidade_min?: number;
  temperatura_min?: number;
  temperatura_max?: number;
  observacoes?: string;
}

interface RecTalhao {
  id: string;
  talhao_nome: string;
  area_recomendada_ha: number;
  area_executada_ha?: number;
  concluido?: boolean;
}

interface RecProduto {
  id: string;
  produto_nome: string;
  dose_ha: number;
  unidade: string;
}

interface ExecucaoOffline {
  recomendacao_id: string;
  operador_nome: string;
  observacoes: string;
  talhoes: { id: string; area_executada_ha: number; concluido: boolean }[];
  timestamp: string;
  sincronizado: boolean;
}

// ─── Constantes visuais ───────────────────────────────────────────────────────

const TIPOS_LABEL: Record<TipoOp, string> = {
  pulverizacao:       "Pulverização",
  adubacao:           "Adubação",
  plantio:            "Plantio",
  correcao_solo:      "Correção de Solo",
  tratamento_sementes:"Tratamento de Sementes",
  colheita:           "Colheita",
};

const TIPOS_COR: Record<TipoOp, string> = {
  pulverizacao:       "#0C447C",
  adubacao:           "#5A3E00",
  plantio:            "#16A34A",
  correcao_solo:      "#6B21A8",
  tratamento_sementes:"#9A3412",
  colheita:           "#B45309",
};

const TIPOS_BG: Record<TipoOp, string> = {
  pulverizacao:       "#E6F1FB",
  adubacao:           "#FBF3E0",
  plantio:            "#F0FFF4",
  correcao_solo:      "#F5F0FF",
  tratamento_sementes:"#FFF1EE",
  colheita:           "#FFFBEB",
};

const QUEUE_KEY = "arato_execucoes_offline";

function getQueue(): ExecucaoOffline[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]"); }
  catch { return []; }
}

function saveQueue(q: ExecucaoOffline[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

// ─── Card de recomendação ─────────────────────────────────────────────────────

function CardRecomendacao({
  rec, onExecutar,
}: {
  rec: Recomendacao;
  onExecutar: (rec: Recomendacao) => void;
}) {
  const cor = TIPOS_COR[rec.tipo];
  const bg  = TIPOS_BG[rec.tipo];
  const temCondicoes = rec.bico || rec.vento_max || rec.ph_min;

  return (
    <div style={{
      background: "#fff", borderRadius: 14, overflow: "hidden",
      boxShadow: "0 2px 12px rgba(0,0,0,0.08)", marginBottom: 14,
      border: `1.5px solid ${rec.status === "em_execucao" ? cor : "#DDE2EE"}`,
    }}>
      {/* Header colorido */}
      <div style={{ background: bg, padding: "14px 18px", borderBottom: `1.5px solid ${cor}20` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: cor, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {TIPOS_LABEL[rec.tipo]}
          </span>
          {rec.status === "em_execucao" && (
            <span style={{ background: "#1A4870", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
              Em andamento
            </span>
          )}
        </div>
        {rec.agronomo_nome && (
          <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>Rec.: {rec.agronomo_nome}</div>
        )}
      </div>

      {/* Corpo */}
      <div style={{ padding: "14px 18px" }}>
        {/* Datas */}
        {rec.data_prevista_inicio && (
          <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
            📅 {rec.data_prevista_inicio?.split("-").reverse().join("/")}
            {rec.data_prevista_fim && rec.data_prevista_fim !== rec.data_prevista_inicio
              ? ` → ${rec.data_prevista_fim?.split("-").reverse().join("/")}` : ""}
          </div>
        )}

        {/* Área */}
        {rec.area_total_recomendada_ha && (
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 10 }}>
            {rec.area_total_recomendada_ha.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} ha
          </div>
        )}

        {/* Condições de aplicação */}
        {temCondicoes && (
          <div style={{ background: "#F0F4FF", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#3B5BDB", marginBottom: 6, textTransform: "uppercase" }}>
              ⚠️ Condições mínimas
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 12, color: "#444" }}>
              {rec.bico       && <span>Bico: <strong>{rec.bico}</strong></span>}
              {rec.vazao_lha  && <span>Vazão: <strong>{rec.vazao_lha} L/ha</strong></span>}
              {rec.pressao_min && rec.pressao_max && <span>Pressão: <strong>{rec.pressao_min}–{rec.pressao_max} psi</strong></span>}
              {rec.ph_min     && rec.ph_max     && <span>pH: <strong>{rec.ph_min}–{rec.ph_max}</strong></span>}
              {rec.vento_max  && <span>Vento máx: <strong>{rec.vento_max} km/h</strong></span>}
              {rec.velocidade_min && rec.velocidade_max && <span>Vel.: <strong>{rec.velocidade_min}–{rec.velocidade_max} km/h</strong></span>}
              {rec.umidade_min && <span>Umid. mín: <strong>{rec.umidade_min}%</strong></span>}
              {rec.temperatura_min && rec.temperatura_max && <span>Temp: <strong>{rec.temperatura_min}–{rec.temperatura_max}°C</strong></span>}
            </div>
          </div>
        )}

        {rec.observacoes && (
          <div style={{ fontSize: 12, color: "#666", fontStyle: "italic", marginBottom: 10 }}>
            "{rec.observacoes}"
          </div>
        )}

        <button onClick={() => onExecutar(rec)}
          style={{
            width: "100%", padding: "14px 0", background: cor, color: "#fff",
            border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700,
            cursor: "pointer", letterSpacing: "-0.2px",
          }}>
          {rec.status === "em_execucao" ? "Continuar Execução" : "Iniciar Execução"}
        </button>
      </div>
    </div>
  );
}

// ─── Tela de execução ─────────────────────────────────────────────────────────

function TelaExecucao({
  rec, talhoes, produtos, online,
  onVoltar, onConcluir,
}: {
  rec: Recomendacao;
  talhoes: RecTalhao[];
  produtos: RecProduto[];
  online: boolean;
  onVoltar: () => void;
  onConcluir: () => void;
}) {
  const [ajustes, setAjustes] = useState(
    talhoes.map(t => ({ ...t, area_executada_ha: t.area_executada_ha ?? t.area_recomendada_ha, concluido: t.concluido ?? false }))
  );
  const [operador, setOperador] = useState(() => localStorage.getItem("arato_ultimo_operador") ?? "");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const cor = TIPOS_COR[rec.tipo];

  function setA(i: number, k: string, v: unknown) {
    setAjustes(prev => prev.map((a, idx) => idx === i ? { ...a, [k]: v } : a));
  }

  const areaExecutada = ajustes.filter(a => a.concluido).reduce((s, a) => s + (Number(a.area_executada_ha) || 0), 0);
  const todosFeitos   = ajustes.length > 0 && ajustes.every(a => a.concluido);
  const algumFeito    = ajustes.some(a => a.concluido);

  async function salvar(finalizar: boolean) {
    if (!algumFeito && finalizar) {
      alert("Marque pelo menos 1 talhão como concluído.");
      return;
    }
    setSaving(true);
    localStorage.setItem("arato_ultimo_operador", operador);

    const payload: ExecucaoOffline = {
      recomendacao_id: rec.id,
      operador_nome: operador,
      observacoes: obs,
      talhoes: ajustes.map(a => ({ id: a.id, area_executada_ha: Number(a.area_executada_ha) || 0, concluido: a.concluido })),
      timestamp: new Date().toISOString(),
      sincronizado: false,
    };

    if (!online) {
      // Salvar offline
      const q = getQueue();
      q.push(payload);
      saveQueue(q);
      alert(`✓ Salvo offline! Será sincronizado quando houver conexão.`);
      setSaving(false);
      onConcluir();
      return;
    }

    // Online: enviar direto
    try {
      for (const a of ajustes) {
        await supabase.from("recomendacao_talhoes").update({
          area_executada_ha: Number(a.area_executada_ha) || 0,
          concluido: a.concluido,
        }).eq("id", a.id);
      }
      await supabase.from("recomendacao_execucoes").insert({
        recomendacao_id: rec.id,
        operador_nome: operador || null,
        data_inicio: payload.timestamp,
        data_fim: new Date().toISOString(),
        observacoes: obs || null,
        origem: "app",
        sincronizado_em: new Date().toISOString(),
      });
      const novoStatus = finalizar && todosFeitos ? "concluida" : "em_execucao";
      await supabase.from("recomendacoes").update({ status: novoStatus, updated_at: new Date().toISOString() }).eq("id", rec.id);
      onConcluir();
    } catch {
      // Falhou mesmo com online: salva offline
      const q = getQueue();
      q.push(payload);
      saveQueue(q);
      alert("⚠️ Sem conexão. Salvo localmente para sync posterior.");
      onConcluir();
    }
    setSaving(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA", paddingBottom: 100 }}>
      {/* Header mobile */}
      <div style={{ background: cor, color: "#fff", padding: "16px 18px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <button onClick={onVoltar}
            style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 16, cursor: "pointer" }}>
            ←
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{TIPOS_LABEL[rec.tipo]}</div>
            {rec.agronomo_nome && <div style={{ fontSize: 12, opacity: 0.8 }}>Rec.: {rec.agronomo_nome}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, opacity: 0.9, marginTop: 4 }}>
          {rec.area_total_recomendada_ha && <span>Área: {rec.area_total_recomendada_ha.toLocaleString("pt-BR",{minimumFractionDigits:1})} ha</span>}
          {areaExecutada > 0 && <span>Executado: {areaExecutada.toLocaleString("pt-BR",{minimumFractionDigits:1})} ha</span>}
          <span style={{ marginLeft: "auto", background: online ? "#16A34A" : "#E24B4A", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>
            {online ? "● Online" : "○ Offline"}
          </span>
        </div>
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        {/* Produtos */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 14, border: "0.5px solid #DDE2EE" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10, textTransform: "uppercase" }}>Produtos a aplicar</div>
          {produtos.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0",
              borderBottom: i < produtos.length - 1 ? "0.5px solid #F0F0F0" : "none", fontSize: 14 }}>
              <span style={{ color: "#1a1a1a" }}>{p.produto_nome}</span>
              <span style={{ fontWeight: 700, color: cor }}>{p.dose_ha} {p.unidade}</span>
            </div>
          ))}
        </div>

        {/* Talhões */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10, textTransform: "uppercase", padding: "0 4px" }}>
            Talhões ({ajustes.filter(a => a.concluido).length}/{ajustes.length} concluídos)
          </div>
          {ajustes.map((a, i) => (
            <div key={i} style={{
              background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 10,
              border: `1.5px solid ${a.concluido ? "#16A34A" : "#DDE2EE"}`,
              boxShadow: a.concluido ? "0 0 0 3px #16A34A15" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: a.concluido ? 10 : 0 }}>
                <div
                  onClick={() => setA(i, "concluido", !a.concluido)}
                  style={{
                    width: 28, height: 28, borderRadius: 8, cursor: "pointer", flexShrink: 0,
                    background: a.concluido ? "#16A34A" : "#F0F0F0",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, color: "#fff", fontWeight: 700,
                  }}>
                  {a.concluido ? "✓" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{a.talhao_nome}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    Recomendado: {a.area_recomendada_ha.toLocaleString("pt-BR",{minimumFractionDigits:1})} ha
                  </div>
                </div>
              </div>

              {a.concluido && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 6, textTransform: "uppercase" }}>
                    Área executada (ha)
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={Number(a.area_executada_ha) || ""}
                    onChange={e => setA(i, "area_executada_ha", parseFloat(e.target.value) || 0)}
                    style={{
                      width: "100%", padding: "12px 14px", border: "1.5px solid #DDE2EE", borderRadius: 10,
                      fontSize: 18, fontWeight: 700, boxSizing: "border-box", background: "#F9FAFB",
                    }}
                    step={0.01}
                  />
                  {Number(a.area_executada_ha) !== a.area_recomendada_ha && Number(a.area_executada_ha) > 0 && (
                    <div style={{ fontSize: 12, color: "#C9921B", marginTop: 4 }}>
                      Ajuste de {Number(a.area_executada_ha) > a.area_recomendada_ha ? "+" : ""}{(Number(a.area_executada_ha) - a.area_recomendada_ha).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})} ha em relação ao recomendado
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Operador e obs */}
        <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", marginBottom: 14, border: "0.5px solid #DDE2EE" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10, textTransform: "uppercase" }}>Dados do operador</div>
          <input
            placeholder="Nome do operador"
            value={operador}
            onChange={e => setOperador(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #DDE2EE", borderRadius: 10, fontSize: 14, boxSizing: "border-box", marginBottom: 10 }}
          />
          <textarea
            placeholder="Observações de campo (opcional)..."
            value={obs}
            onChange={e => setObs(e.target.value)}
            style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #DDE2EE", borderRadius: 10, fontSize: 14, boxSizing: "border-box", height: 80, resize: "vertical" }}
          />
        </div>
      </div>

      {/* Footer fixo com botões */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", padding: "14px 16px", boxShadow: "0 -2px 12px rgba(0,0,0,0.1)", display: "flex", gap: 10 }}>
        {!todosFeitos && algumFeito && (
          <button onClick={() => salvar(false)} disabled={saving}
            style={{ flex: 1, padding: "14px 0", background: "#F4F6FA", color: "#1A4870", border: "1.5px solid #DDE2EE", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Salvar Parcial
          </button>
        )}
        <button onClick={() => salvar(true)} disabled={saving || !algumFeito}
          style={{
            flex: 2, padding: "14px 0",
            background: algumFeito ? cor : "#DDE2EE",
            color: algumFeito ? "#fff" : "#888",
            border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: algumFeito ? "pointer" : "not-allowed",
          }}>
          {saving ? "Salvando..." : todosFeitos ? "✓ Concluir Tudo" : `Confirmar (${ajustes.filter(a=>a.concluido).length}/${ajustes.length})`}
        </button>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ExecucaoPage() {
  const { fazendaId, nomeFazendaSelecionada: fazendaNome } = useAuth();
  const [recs,    setRecs]    = useState<Recomendacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [online,  setOnline]  = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [offline, setOffline] = useState(0);

  const [execucao, setExecucao] = useState<{
    rec: Recomendacao;
    talhoes: RecTalhao[];
    produtos: RecProduto[];
  } | null>(null);

  // Monitor de conectividade
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Contador de execuções offline pendentes
  useEffect(() => {
    const q = getQueue().filter(x => !x.sincronizado);
    setOffline(q.length);
  }, []);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    const { data } = await supabase.from("recomendacoes").select("*")
      .eq("fazenda_id", fazendaId)
      .in("status", ["pendente", "em_execucao"])
      .order("data_prevista_inicio", { ascending: true });
    setRecs((data ?? []) as Recomendacao[]);
    setLoading(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function sincronizarOffline() {
    const q = getQueue();
    const pendentes = q.filter(x => !x.sincronizado);
    let ok = 0;
    for (const p of pendentes) {
      try {
        for (const t of p.talhoes) {
          await supabase.from("recomendacao_talhoes").update({
            area_executada_ha: t.area_executada_ha,
            concluido: t.concluido,
          }).eq("id", t.id);
        }
        await supabase.from("recomendacao_execucoes").insert({
          recomendacao_id: p.recomendacao_id,
          operador_nome: p.operador_nome || null,
          data_inicio: p.timestamp,
          data_fim: new Date().toISOString(),
          observacoes: p.observacoes || null,
          origem: "offline",
          sincronizado_em: new Date().toISOString(),
        });
        const todos = p.talhoes.every(t => t.concluido);
        await supabase.from("recomendacoes").update({ status: todos ? "concluida" : "em_execucao" }).eq("id", p.recomendacao_id);
        p.sincronizado = true;
        ok++;
      } catch { /* continua */ }
    }
    saveQueue(q);
    setOffline(q.filter(x => !x.sincronizado).length);
    if (ok > 0) { alert(`✓ ${ok} execução(ões) sincronizada(s).`); await carregar(); }
    else { alert("Nenhuma execução pôde ser sincronizada. Verifique a conexão."); }
  }

  async function abrirExecucao(rec: Recomendacao) {
    const [{ data: tal }, { data: prod }] = await Promise.all([
      supabase.from("recomendacao_talhoes").select("*").eq("recomendacao_id", rec.id).order("ordem"),
      supabase.from("recomendacao_produtos").select("*").eq("recomendacao_id", rec.id).order("ordem"),
    ]);
    if (rec.status === "pendente") {
      await supabase.from("recomendacoes").update({ status: "em_execucao" }).eq("id", rec.id);
    }
    setExecucao({ rec, talhoes: (tal ?? []) as RecTalhao[], produtos: (prod ?? []) as RecProduto[] });
  }

  if (execucao) {
    return (
      <TelaExecucao
        rec={execucao.rec}
        talhoes={execucao.talhoes}
        produtos={execucao.produtos}
        online={online}
        onVoltar={() => setExecucao(null)}
        onConcluir={() => { setExecucao(null); carregar(); }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      {/* Header mobile */}
      <div style={{ background: "#1A4870", color: "#fff", padding: "18px 18px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Modo Campo</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{fazendaNome ?? "Fazenda"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {offline > 0 && (
              <button onClick={sincronizarOffline}
                style={{ background: "#C9921B", color: "#fff", border: "none", borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                ↑ {offline} offline
              </button>
            )}
            <span style={{ background: online ? "#16A34A" : "#E24B4A", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
              {online ? "● Online" : "○ Offline"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px" }}>
        {offline > 0 && (
          <div style={{ background: "#FBF3E0", border: "1.5px solid #C9921B", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#7A5A12" }}>
              {offline} execução(ões) aguardando sincronização
            </div>
            <div style={{ fontSize: 12, color: "#7A5A12", marginTop: 2 }}>
              {online ? "Clique em ↑ para sincronizar agora." : "Será sincronizado automaticamente quando houver internet."}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#888", fontSize: 16 }}>Carregando...</div>
        ) : recs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#555" }}>Nenhuma tarefa pendente</div>
            <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Todas as recomendações foram executadas.</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#888", marginBottom: 12, textTransform: "uppercase" }}>
              {recs.length} tarefa{recs.length > 1 ? "s" : ""} pendente{recs.length > 1 ? "s" : ""}
            </div>
            {recs.map(rec => (
              <CardRecomendacao key={rec.id} rec={rec} onExecutar={abrirExecucao} />
            ))}
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <a href="/lavoura/recomendacoes"
            style={{ fontSize: 13, color: "#1A4870", textDecoration: "none", fontWeight: 600 }}>
            ← Voltar para Recomendações (desktop)
          </a>
        </div>
      </div>
    </div>
  );
}
