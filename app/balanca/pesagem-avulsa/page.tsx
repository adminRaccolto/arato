"use client";
import React, { useState, useEffect, useCallback, useRef } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { createBrowserClient } from "@supabase/ssr";

type Tipo   = "neutra" | "entrada" | "saida";
type Status = "aguardando_bruto" | "aguardando_tara" | "finalizado" | "cancelado";
type ModoEntrada = "manual" | "balanca";
type SerialStatus = "desconectado" | "conectando" | "conectado" | "lendo" | "erro";

interface SerialPortI {
  open(opts: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}
interface NavigatorSerialI {
  requestPort(): Promise<SerialPortI>;
}
type NavWithSerial = Navigator & { serial: NavigatorSerialI };

interface Pesagem {
  id: string;
  tipo: Tipo;
  status: Status;
  placa: string | null;
  motorista: string | null;
  produto: string | null;
  fornecedor_cliente: string | null;
  peso_tara_kg: number | null;
  peso_bruto_kg: number | null;
  peso_liquido_kg: number | null;
  data_tara: string | null;
  data_bruto: string | null;
  usuario_tara: string | null;
  usuario_bruto: string | null;
  observacao: string | null;
  created_at: string;
}

// ── Parsers de protocolo de balança ──────────────────────────────────────────
// Recebe o buffer acumulado e tenta extrair o peso em kg
function parsearPeso(raw: string): number | null {
  // Toledo Prix / Prix Fit: "SB +  002500 kg" ou "+000002500\r"
  let m = raw.match(/([+-])\s*(\d+[\.,]?\d*)\s*(?:kg)?/i);
  if (m) {
    const sinal = m[1] === "-" ? -1 : 1;
    const val = parseFloat(m[2].replace(",", "."));
    return isNaN(val) ? null : sinal * val;
  }
  // Filizola / Micheletti: "P+00002500" ou "P-00000000"
  m = raw.match(/P([+-])(\d{8})/i);
  if (m) {
    const sinal = m[1] === "-" ? -1 : 1;
    return sinal * parseInt(m[2], 10);
  }
  // Genérico: primeiro número da string
  m = raw.match(/(\d+[\.,]\d+)/);
  if (m) return parseFloat(m[1].replace(",", "."));
  return null;
}

const TIPO_LABEL: Record<Tipo, string> = { neutra: "Neutra", entrada: "Entrada", saida: "Saída" };
const TIPO_COR:   Record<Tipo, { bg: string; color: string }> = {
  neutra:  { bg: "#E8E8E8", color: "#333"     },
  entrada: { bg: "#DCFCE7", color: "#15803D"  },
  saida:   { bg: "#FEE2E2", color: "#B91C1C"  },
};

const fmtKg = (v: number | null) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const fmtTs = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtHM = (s: string | null) =>
  !s ? "" : new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 11px", border: "0.5px solid var(--border-table)",
  borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-input)",
  boxSizing: "border-box", outline: "none",
};
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };

// ── Componente de peso com suporte a Balança / Manual ────────────────────────
interface PesoInputProps {
  label: string;
  corFundo: string;
  corBorda: string;
  corLabel: string;
  value: string;
  onChange: (v: string) => void;
}

function PesoInput({ label, corFundo, corBorda, corLabel, value, onChange }: PesoInputProps) {
  const [modo,         setModo]        = useState<ModoEntrada>("manual");
  const [serialStatus, setSerialStatus] = useState<SerialStatus>("desconectado");
  const [serialMsg,    setSerialMsg]   = useState("");
  const [pesoLive,     setPesoLive]    = useState<number | null>(null);
  const portRef  = useRef<SerialPortI | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const bufRef   = useRef("");

  const serialSuportado = typeof navigator !== "undefined" && "serial" in navigator;

  // Desconecta quando fecha
  const desconectar = useCallback(async () => {
    try {
      if (readerRef.current) { await readerRef.current.cancel(); readerRef.current = null; }
      if (portRef.current) { await portRef.current.close(); portRef.current = null; }
    } catch {}
    setSerialStatus("desconectado");
    setSerialMsg("");
    setPesoLive(null);
    bufRef.current = "";
  }, []);

  // Cleanup ao desmontar
  useEffect(() => () => { desconectar(); }, [desconectar]);

  const conectar = async () => {
    if (!serialSuportado) { setSerialMsg("Web Serial não suportado neste navegador. Use Chrome ou Edge."); return; }
    setSerialStatus("conectando");
    setSerialMsg("Aguardando seleção da porta…");
    try {
      const port = await (navigator as unknown as NavWithSerial).serial.requestPort();
      portRef.current = port;
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" });
      setSerialStatus("conectado");
      setSerialMsg("Conectado. Aguardando leitura…");

      // Leitura contínua
      const reader = port.readable!.getReader();
      readerRef.current = reader;
      setSerialStatus("lendo");

      const decoder = new TextDecoder();
      const loop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bufRef.current += decoder.decode(value);
            // Tenta extrair peso a cada linha ou a cada 32 bytes
            if (bufRef.current.includes("\n") || bufRef.current.length > 32) {
              const peso = parsearPeso(bufRef.current);
              if (peso !== null && peso > 0) {
                setPesoLive(peso);
                setSerialMsg(`Leitura: ${peso.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kg`);
              }
              bufRef.current = "";
            }
          }
        } catch {}
      };
      loop();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("cancelled") || msg.includes("cancel")) {
        setSerialStatus("desconectado"); setSerialMsg("");
      } else {
        setSerialStatus("erro"); setSerialMsg("Erro: " + msg);
      }
    }
  };

  const capturar = () => {
    if (pesoLive !== null) {
      onChange(pesoLive.toFixed(2));
    }
  };

  const statusCor: Record<SerialStatus, string> = {
    desconectado: "#888", conectando: "#C9921B", conectado: "#16A34A",
    lendo: "#16A34A", erro: "#E24B4A",
  };
  const statusIcon: Record<SerialStatus, string> = {
    desconectado: "○", conectando: "◌", conectado: "●", lendo: "●", erro: "✕",
  };

  return (
    <div style={{ background: corFundo, border: `0.5px solid ${corBorda}`, borderRadius: 10, padding: "14px 18px" }}>
      {/* Cabeçalho: label + modo toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: corLabel }}>⚖ {label}</span>
        <div style={{ display: "flex", border: `0.5px solid ${corBorda}`, borderRadius: 7, overflow: "hidden" }}>
          {(["manual","balanca"] as ModoEntrada[]).map((m, i) => (
            <button key={m} onClick={() => { setModo(m); if (m === "manual") desconectar(); }}
              style={{ padding: "5px 14px", fontSize: 11, fontWeight: modo === m ? 700 : 400, cursor: "pointer", border: "none", borderRight: i === 0 ? `0.5px solid ${corBorda}` : "none", background: modo === m ? corLabel : "transparent", color: modo === m ? "#fff" : corLabel, transition: "all .15s" }}>
              {m === "manual" ? "✏ Manual" : "🔌 Balança"}
            </button>
          ))}
        </div>
      </div>

      {/* Modo Manual */}
      {modo === "manual" && (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0,00"
          type="number"
          min="0"
          step="0.01"
          style={{ ...inp, fontSize: 20, fontWeight: 700, textAlign: "right", letterSpacing: "0.02em", background: "rgba(255,255,255,0.7)" }}
          autoFocus
        />
      )}

      {/* Modo Balança */}
      {modo === "balanca" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!serialSuportado && (
            <div style={{ background: "#FEF3E2", border: "0.5px solid #C9921B", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#7A4300" }}>
              ⚠ Web Serial não disponível. Use <strong>Google Chrome</strong> ou <strong>Microsoft Edge</strong> para conectar à balança via USB/RS-232.
            </div>
          )}

          {serialSuportado && (
            <>
              {/* Status + botão conectar/desconectar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12, color: statusCor[serialStatus], fontWeight: 600 }}>
                  {statusIcon[serialStatus]} {serialStatus.charAt(0).toUpperCase() + serialStatus.slice(1)}
                </span>
                {serialMsg && <span style={{ fontSize: 11, color: "var(--text-3)", flex: 1 }}>{serialMsg}</span>}
                {serialStatus === "desconectado" || serialStatus === "erro" ? (
                  <button onClick={conectar}
                    style={{ padding: "6px 14px", borderRadius: 7, background: corLabel, color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Conectar Balança
                  </button>
                ) : (
                  <button onClick={desconectar}
                    style={{ padding: "6px 14px", borderRadius: 7, background: "var(--bg-page)", color: "#E24B4A", border: "0.5px solid #E24B4A", fontSize: 12, cursor: "pointer" }}>
                    Desconectar
                  </button>
                )}
              </div>

              {/* Display de peso ao vivo */}
              <div style={{ background: "rgba(255,255,255,0.75)", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 2 }}>Leitura ao vivo</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: pesoLive !== null ? corLabel : "var(--text-3)", fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>
                    {pesoLive !== null ? `${pesoLive.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} kg` : "— —"}
                  </div>
                </div>
                <button onClick={capturar} disabled={pesoLive === null}
                  style={{ padding: "10px 20px", borderRadius: 8, background: pesoLive !== null ? corLabel : "#ccc", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: pesoLive !== null ? "pointer" : "default" }}>
                  ✓ Usar este peso
                </button>
              </div>

              {/* Peso capturado (campo editável após capturar) */}
              {value ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>Peso capturado:</span>
                  <input value={value} onChange={e => onChange(e.target.value)} type="number" step="0.01"
                    style={{ ...inp, fontSize: 18, fontWeight: 700, textAlign: "right", flex: 1, background: "rgba(255,255,255,0.8)" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: corLabel }}>kg</span>
                </div>
              ) : null}
            </>
          )}

          {/* Config de balança */}
          <details style={{ fontSize: 11, color: "var(--text-3)" }}>
            <summary style={{ cursor: "pointer", userSelect: "none" }}>⚙ Configuração de porta</summary>
            <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,255,255,0.6)", borderRadius: 7, lineHeight: 1.8 }}>
              <strong>Protocolos suportados:</strong><br />
              Toledo Prix / Prix Fit · Filizola MK-III / PDV · Urano UR-E · Digilog · Micheletti · Genérico RS-232<br />
              <strong>Configuração padrão:</strong> 9600 baud · 8N1<br />
              Conecte a balança via cabo USB-Serial ou RS-232 antes de clicar em "Conectar".
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function PesagemAvulsa() {
  const { fazendaId, nomeFazendaSelecionada, nomeUsuario } = useAuth();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [pesagens,      setPesagens]      = useState<Pesagem[]>([]);
  const [carregando,    setCarregando]    = useState(true);
  const [abaPrincipal,  setAbaPrincipal]  = useState<"andamento" | "finalizadas">("andamento");
  const [filtrTipo,     setFiltrTipo]     = useState<Tipo | "todos">("todos");

  // Modal 1ª pesagem (tara)
  const [modalTara,    setModalTara]    = useState(false);
  const [formTara,     setFormTara]     = useState({
    tipo: "neutra" as Tipo,
    placa: "", motorista: "", produto: "",
    fornecedor_cliente: "", peso_tara_kg: "", observacao: "",
  });
  const [salvandoTara, setSalvandoTara] = useState(false);

  // Modal 2ª pesagem (bruto)
  const [modalBruto,    setModalBruto]    = useState(false);
  const [pesagemSel,    setPesagemSel]    = useState<Pesagem | null>(null);
  const [pesoBrutoStr,  setPesoBrutoStr]  = useState("");
  const [salvandoBruto, setSalvandoBruto] = useState(false);

  // Modal cancelar
  const [modalCancel, setModalCancel] = useState(false);
  const [cancelId,    setCancelId]    = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    const { data } = await supabase
      .from("pesagens_avulsas")
      .select("*")
      .eq("fazenda_id", fazendaId)
      .order("created_at", { ascending: false })
      .limit(500);
    setPesagens((data as Pesagem[]) ?? []);
    setCarregando(false);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const salvarTara = async () => {
    if (!fazendaId) return;
    const pesoNum = parseFloat(formTara.peso_tara_kg.replace(",", "."));
    if (isNaN(pesoNum) || pesoNum <= 0) { alert("Informe o peso válido."); return; }
    setSalvandoTara(true);
    // Entrada: 1ª pesagem = Bruto (chega carregado); Saída/Neutra: 1ª pesagem = Tara
    const isEntrada = formTara.tipo === "entrada";
    const { error } = await supabase.from("pesagens_avulsas").insert({
      fazenda_id:         fazendaId,
      tipo:               formTara.tipo,
      status:             isEntrada ? "aguardando_tara" : "aguardando_bruto",
      placa:              formTara.placa.toUpperCase() || null,
      motorista:          formTara.motorista || null,
      produto:            formTara.produto || null,
      fornecedor_cliente: formTara.fornecedor_cliente || null,
      peso_tara_kg:       isEntrada ? null : pesoNum,
      peso_bruto_kg:      isEntrada ? pesoNum : null,
      data_tara:          isEntrada ? null : new Date().toISOString(),
      data_bruto:         isEntrada ? new Date().toISOString() : null,
      usuario_tara:       isEntrada ? null : (nomeUsuario ?? null),
      usuario_bruto:      isEntrada ? (nomeUsuario ?? null) : null,
      observacao:         formTara.observacao || null,
    });
    setSalvandoTara(false);
    if (error) { alert("Erro ao salvar: " + error.message); return; }
    setModalTara(false);
    setFormTara({ tipo: "neutra", placa: "", motorista: "", produto: "", fornecedor_cliente: "", peso_tara_kg: "", observacao: "" });
    carregar();
  };

  const salvarBruto = async () => {
    if (!pesagemSel) return;
    const pesoNum = parseFloat(pesoBrutoStr.replace(",", "."));
    if (isNaN(pesoNum) || pesoNum <= 0) { alert("Informe o peso válido."); return; }
    const aguardandoTara = pesagemSel.status === "aguardando_tara";
    // aguardando_tara = Entrada (bruto já salvo, agora captura tara)
    // aguardando_bruto = Saída/Neutra (tara já salva, agora captura bruto)
    const tara  = aguardandoTara ? pesoNum : (pesagemSel.peso_tara_kg ?? 0);
    const bruto = aguardandoTara ? (pesagemSel.peso_bruto_kg ?? 0) : pesoNum;
    const liquido = bruto - tara;
    if (liquido < 0) { alert("Peso líquido negativo — verifique os valores."); return; }
    setSalvandoBruto(true);
    const { error } = await supabase
      .from("pesagens_avulsas")
      .update({
        peso_tara_kg:    tara,
        peso_bruto_kg:   bruto,
        peso_liquido_kg: liquido,
        data_tara:       aguardandoTara ? new Date().toISOString() : pesagemSel.data_tara,
        data_bruto:      aguardandoTara ? pesagemSel.data_bruto : new Date().toISOString(),
        usuario_tara:    aguardandoTara ? (nomeUsuario ?? null) : pesagemSel.usuario_tara,
        usuario_bruto:   aguardandoTara ? pesagemSel.usuario_bruto : (nomeUsuario ?? null),
        status:          "finalizado",
      })
      .eq("id", pesagemSel.id);
    setSalvandoBruto(false);
    if (error) { alert("Erro ao finalizar: " + error.message); return; }
    setModalBruto(false);
    setPesagemSel(null);
    setPesoBrutoStr("");
    carregar();
  };

  const cancelar = async () => {
    if (!cancelId) return;
    await supabase.from("pesagens_avulsas").update({ status: "cancelado" }).eq("id", cancelId);
    setModalCancel(false); setCancelId(null); carregar();
  };

  const emAndamento = pesagens.filter(p => (p.status === "aguardando_bruto" || p.status === "aguardando_tara") && (filtrTipo === "todos" || p.tipo === filtrTipo));
  const finalizadas = pesagens.filter(p => (p.status === "finalizado" || p.status === "cancelado") && (filtrTipo === "todos" || p.tipo === filtrTipo));

  const pesoNum2    = parseFloat(pesoBrutoStr.replace(",", "."));
  const aguardandoTara2 = pesagemSel?.status === "aguardando_tara";
  const liquidoPrev = pesagemSel && !isNaN(pesoNum2) && pesoNum2 > 0
    ? (aguardandoTara2
        ? (pesagemSel.peso_bruto_kg ?? 0) - pesoNum2   // bruto já salvo − tara digitada
        : pesoNum2 - (pesagemSel.peso_tara_kg ?? 0))   // bruto digitado − tara já salva
    : null;

  const BadgeTipo = ({ tipo }: { tipo: Tipo }) => (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: TIPO_COR[tipo].bg, color: TIPO_COR[tipo].color, letterSpacing: "0.04em" }}>
      {TIPO_LABEL[tipo].toUpperCase()}
    </span>
  );

  const SegTipo = ({ value, onChange }: { value: Tipo; onChange: (v: Tipo) => void }) => (
    <div style={{ display: "flex", border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "hidden" }}>
      {(["neutra","entrada","saida"] as Tipo[]).map((t, i) => (
        <button key={t} onClick={() => onChange(t)}
          style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: value === t ? 700 : 400, cursor: "pointer", border: "none", borderRight: i < 2 ? "0.5px solid var(--border-table)" : "none", background: value === t ? TIPO_COR[t].bg : "var(--bg-input)", color: value === t ? TIPO_COR[t].color : "var(--text-2)", transition: "all .15s" }}>
          {TIPO_LABEL[t]}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <TopNav />
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>Pesagem Avulsa</h1>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{nomeFazendaSelecionada}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", border: "0.5px solid var(--border-table)", borderRadius: 8, overflow: "hidden" }}>
              {(["todos","neutra","entrada","saida"] as const).map((t, i) => (
                <button key={t} onClick={() => setFiltrTipo(t)}
                  style={{ padding: "7px 14px", fontSize: 12, fontWeight: filtrTipo === t ? 700 : 400, cursor: "pointer", border: "none", borderRight: i < 3 ? "0.5px solid var(--border-table)" : "none", background: filtrTipo === t ? (t === "todos" ? "#1A5CB8" : TIPO_COR[t].bg) : "var(--bg-card)", color: filtrTipo === t ? (t === "todos" ? "#fff" : TIPO_COR[t].color) : "var(--text-2)" }}>
                  {t === "todos" ? "Todos" : TIPO_LABEL[t]}
                </button>
              ))}
            </div>
            <button onClick={() => carregar()} style={{ padding: "8px 14px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "var(--bg-card)", color: "var(--text-2)", fontSize: 12, cursor: "pointer" }}>
              ↻ Atualizar
            </button>
            <button onClick={() => setModalTara(true)}
              style={{ padding: "9px 18px", borderRadius: 8, background: "#1A5CB8", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              + Nova Pesagem (Tara)
            </button>
          </div>
        </div>

        {/* KPIs */}
        {!carregando && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Em Andamento",     v: pesagens.filter(p => p.status === "aguardando_bruto").length, color: "#C9921B" },
              { label: "Finalizadas hoje", v: pesagens.filter(p => p.status === "finalizado" && p.data_bruto?.startsWith(new Date().toISOString().slice(0,10))).length, color: "#16A34A" },
              { label: "Total hoje",       v: pesagens.filter(p => p.created_at?.startsWith(new Date().toISOString().slice(0,10))).length, color: "#1A5CB8" },
              { label: "Canceladas",       v: pesagens.filter(p => p.status === "cancelado").length, color: "#888" },
            ].map((k, i) => (
              <div key={i} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "14px 18px" }}>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.v}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "0.5px solid var(--border-table)", marginBottom: 16, gap: 2 }}>
          {([["andamento","Em Andamento",emAndamento.length],["finalizadas","Finalizadas",finalizadas.length]] as const).map(([id, label, count]) => (
            <button key={id} onClick={() => setAbaPrincipal(id)}
              style={{ padding: "10px 20px", fontSize: 13, fontWeight: abaPrincipal === id ? 700 : 400, color: abaPrincipal === id ? "#1A5CB8" : "var(--text-2)", background: "none", border: "none", borderBottom: abaPrincipal === id ? "2px solid #1A5CB8" : "2px solid transparent", cursor: "pointer" }}>
              {label} <span style={{ fontSize: 11, marginLeft: 4, color: abaPrincipal === id ? "#1A5CB8" : "var(--text-3)" }}>({count})</span>
            </button>
          ))}
        </div>

        {/* Lista Em Andamento */}
        {abaPrincipal === "andamento" && (
          carregando ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Carregando…</div>
          : emAndamento.length === 0
            ? <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)", fontSize: 14 }}><div style={{ fontSize: 40, marginBottom: 12 }}>⚖️</div>Nenhuma pesagem aguardando peso bruto.</div>
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {emAndamento.map(p => (
                  <div key={p.id} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 60, textAlign: "center" }}><BadgeTipo tipo={p.tipo} /></div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>{p.placa || "Sem placa"}</span>
                        <span style={{ fontSize: 12, color: "var(--text-3)" }}>{p.motorista || ""}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                        {p.produto && <span style={{ marginRight: 10 }}>📦 {p.produto}</span>}
                        {p.fornecedor_cliente && <span>🏢 {p.fornecedor_cliente}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
                      {p.status === "aguardando_tara" ? (
                        // Entrada: bruto já capturado, aguardando tara
                        <>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>Bruto ✓</div>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtKg(p.peso_bruto_kg)}</div>
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtHM(p.data_bruto)}</div>
                          </div>
                          <div style={{ fontSize: 22, color: "var(--border)" }}>→</div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "#C9921B" }}>Tara</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#C9921B" }}>Aguardando</div>
                          </div>
                        </>
                      ) : (
                        // Saída/Neutra: tara já capturada, aguardando bruto
                        <>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>Tara ✓</div>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtKg(p.peso_tara_kg)}</div>
                            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{fmtHM(p.data_tara)}</div>
                          </div>
                          <div style={{ fontSize: 22, color: "var(--border)" }}>→</div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "#C9921B" }}>Bruto</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#C9921B" }}>Aguardando</div>
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setPesagemSel(p); setPesoBrutoStr(""); setModalBruto(true); }}
                        style={{ padding: "9px 18px", borderRadius: 8, background: "#1A5CB8", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        {p.status === "aguardando_tara" ? "⚖ Pesar Tara" : "⚖ Pesar Bruto"}
                      </button>
                      <button onClick={() => { setCancelId(p.id); setModalCancel(true); }}
                        style={{ padding: "9px 14px", borderRadius: 8, background: "var(--bg-page)", color: "#E24B4A", border: "0.5px solid #E24B4A", fontSize: 12, cursor: "pointer" }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
        )}

        {/* Lista Finalizadas */}
        {abaPrincipal === "finalizadas" && (
          carregando ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-3)" }}>Carregando…</div>
          : finalizadas.length === 0
            ? <div style={{ textAlign: "center", padding: 60, color: "var(--text-3)", fontSize: 14 }}>Nenhuma pesagem finalizada ou cancelada.</div>
            : (
              <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--bg-page)", borderBottom: "0.5px solid var(--border-table)" }}>
                        {["Tipo","Placa","Motorista","Produto","Fornec./Cliente","Tara (kg)","Bruto (kg)","Líquido (kg)","Data Tara","Data Bruto","Status","Operadores"].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text-2)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {finalizadas.map((p, i) => (
                        <tr key={p.id} style={{ borderBottom: "0.5px solid var(--border-row)", background: i % 2 === 0 ? "#fff" : "#FAFBFD" }}>
                          <td style={{ padding: "9px 12px" }}><BadgeTipo tipo={p.tipo} /></td>
                          <td style={{ padding: "9px 12px", fontWeight: 600 }}>{p.placa || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "var(--text-2)" }}>{p.motorista || "—"}</td>
                          <td style={{ padding: "9px 12px" }}>{p.produto || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "var(--text-2)" }}>{p.fornecedor_cliente || "—"}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtKg(p.peso_tara_kg)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtKg(p.peso_bruto_kg)}</td>
                          <td style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: p.status === "finalizado" ? "#111" : "#bbb", fontVariantNumeric: "tabular-nums" }}>{p.status === "finalizado" ? fmtKg(p.peso_liquido_kg) : "—"}</td>
                          <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{fmtTs(p.data_tara)}</td>
                          <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}>{fmtTs(p.data_bruto)}</td>
                          <td style={{ padding: "9px 12px" }}>
                            {p.status === "finalizado"
                              ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "#DCFCE7", color: "#15803D" }}>FINALIZADO</span>
                              : <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, background: "#FEE2E2", color: "#B91C1C" }}>CANCELADO</span>}
                          </td>
                          <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-3)" }}>
                            {p.usuario_tara  && <div>Tara: {p.usuario_tara}</div>}
                            {p.usuario_bruto && <div>Bruto: {p.usuario_bruto}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
        )}
      </div>

      {/* ════ MODAL TARA ════ */}
      {modalTara && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, width: "100%", maxWidth: 560, boxShadow: "0 20px 60px rgba(0,0,0,.25)", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 24px", borderBottom: "0.5px solid var(--border-row)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {formTara.tipo === "entrada" ? "1ª Pesagem — Peso Bruto (Entrada Carregada)" : "1ª Pesagem — Tara"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                  {formTara.tipo === "entrada"
                    ? "Caminhão chega carregado. 2ª pesagem = Tara (após descarregar)."
                    : "O ticket ficará aberto para a 2ª pesagem (peso bruto)."}
                </div>
              </div>
              <button onClick={() => setModalTara(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
              <div>
                <span style={lbl}>Tipo de Pesagem</span>
                <SegTipo value={formTara.tipo} onChange={v => setFormTara(f => ({ ...f, tipo: v }))} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <span style={lbl}>Placa</span>
                  <input value={formTara.placa} onChange={e => setFormTara(f => ({ ...f, placa: e.target.value.toUpperCase() }))} placeholder="AAA-0000" style={inp} maxLength={10} />
                </div>
                <div>
                  <span style={lbl}>Motorista</span>
                  <input value={formTara.motorista} onChange={e => setFormTara(f => ({ ...f, motorista: e.target.value }))} placeholder="Nome do motorista" style={inp} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <span style={lbl}>Produto</span>
                  <input value={formTara.produto} onChange={e => setFormTara(f => ({ ...f, produto: e.target.value }))} placeholder="Soja, Milho, Algodão…" style={inp} />
                </div>
                <div>
                  <span style={lbl}>{formTara.tipo === "entrada" ? "Fornecedor" : formTara.tipo === "saida" ? "Cliente" : "Fornec./Cliente"}</span>
                  <input value={formTara.fornecedor_cliente} onChange={e => setFormTara(f => ({ ...f, fornecedor_cliente: e.target.value }))} placeholder="Nome ou razão social" style={inp} />
                </div>
              </div>

              {/* 1ª pesagem: Bruto (Entrada) ou Tara (Saída/Neutra) */}
              <PesoInput
                label={formTara.tipo === "entrada" ? "Peso Bruto (kg) * — caminhão carregado" : "Peso de Tara (kg) * — caminhão vazio"}
                corFundo="#EBF3FB"
                corBorda="#B8D4EE"
                corLabel="#1A5CB8"
                value={formTara.peso_tara_kg}
                onChange={v => setFormTara(f => ({ ...f, peso_tara_kg: v }))}
              />

              <div>
                <span style={lbl}>Observação</span>
                <input value={formTara.observacao} onChange={e => setFormTara(f => ({ ...f, observacao: e.target.value }))} placeholder="Opcional" style={inp} />
              </div>
            </div>

            <div style={{ padding: "14px 24px", borderTop: "0.5px solid var(--border-row)", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
              <button onClick={() => setModalTara(false)} style={{ padding: "9px 18px", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-2)", border: "0.5px solid var(--border-table)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarTara} disabled={salvandoTara}
                style={{ padding: "9px 24px", borderRadius: 8, background: salvandoTara ? "#aaa" : "#1A5CB8", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: salvandoTara ? "default" : "pointer" }}>
                {salvandoTara ? "Salvando…" : formTara.tipo === "entrada" ? "Salvar Peso Bruto →" : "Salvar Tara →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL BRUTO ════ */}
      {modalBruto && pesagemSel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 16, width: "100%", maxWidth: 560, boxShadow: "0 20px 60px rgba(0,0,0,.25)", overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 24px", borderBottom: "0.5px solid var(--border-row)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {aguardandoTara2 ? "2ª Pesagem — Tara (Entrada Descarregada)" : "2ª Pesagem — Peso Bruto"}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                  {aguardandoTara2
                    ? "Informe a tara (caminhão vazio) para calcular o líquido e finalizar."
                    : "Informe o peso bruto para calcular o líquido e finalizar o ticket."}
                </div>
              </div>
              <button onClick={() => setModalBruto(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-3)" }}>✕</button>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
              {/* Resumo */}
              <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-row)", borderRadius: 10, padding: "12px 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                <div><span style={{ color: "var(--text-3)" }}>Tipo: </span><BadgeTipo tipo={pesagemSel.tipo} /></div>
                <div><span style={{ color: "var(--text-3)" }}>Placa: </span><strong>{pesagemSel.placa || "—"}</strong></div>
                <div><span style={{ color: "var(--text-3)" }}>Produto: </span>{pesagemSel.produto || "—"}</div>
                <div><span style={{ color: "var(--text-3)" }}>Motorista: </span>{pesagemSel.motorista || "—"}</div>
                <div><span style={{ color: "var(--text-3)" }}>Fornec./Cliente: </span>{pesagemSel.fornecedor_cliente || "—"}</div>
                <div>
                  <span style={{ color: "var(--text-3)" }}>{aguardandoTara2 ? "Bruto (1ª pesagem): " : "Tara (1ª pesagem): "}</span>
                  <strong>{fmtKg(aguardandoTara2 ? pesagemSel.peso_bruto_kg : pesagemSel.peso_tara_kg)}</strong>
                </div>
              </div>

              {/* 2ª pesagem: Tara (Entrada) ou Bruto (Saída/Neutra) */}
              <PesoInput
                label={aguardandoTara2 ? "Peso de Tara (kg) * — caminhão vazio" : "Peso Bruto (kg) * — caminhão carregado"}
                corFundo="#FBF3E0"
                corBorda="#C9921B"
                corLabel="#7A4300"
                value={pesoBrutoStr}
                onChange={setPesoBrutoStr}
              />

              {/* Preview líquido */}
              {liquidoPrev !== null && (
                <div style={{ background: liquidoPrev < 0 ? "#FEE2E2" : "#DCFCE7", border: `0.5px solid ${liquidoPrev < 0 ? "#E24B4A" : "#16A34A"}`, borderRadius: 10, padding: "14px 18px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: liquidoPrev < 0 ? "#B91C1C" : "#15803D", marginBottom: 4 }}>
                    {liquidoPrev < 0
                      ? "⚠ Peso líquido negativo — verifique os valores!"
                      : aguardandoTara2
                        ? "Peso Líquido (Bruto já salvo − Tara digitada)"
                        : "Peso Líquido (Bruto digitado − Tara já salva)"}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: liquidoPrev < 0 ? "#B91C1C" : "#15803D" }}>
                    {fmtKg(liquidoPrev)}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: "14px 24px", borderTop: "0.5px solid var(--border-row)", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
              <button onClick={() => setModalBruto(false)} style={{ padding: "9px 18px", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-2)", border: "0.5px solid var(--border-table)", fontSize: 13, cursor: "pointer" }}>Voltar</button>
              <button onClick={salvarBruto} disabled={salvandoBruto || (liquidoPrev !== null && liquidoPrev < 0)}
                style={{ padding: "9px 24px", borderRadius: 8, background: salvandoBruto ? "#aaa" : "#1A5CB8", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {salvandoBruto ? "Finalizando…" : "✓ Finalizar Pesagem"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL CANCELAR ════ */}
      {modalCancel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 380, boxShadow: "0 20px 60px rgba(0,0,0,.25)", padding: 28 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Cancelar ticket?</div>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 20 }}>O ticket será marcado como cancelado e não poderá ser finalizado.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalCancel(false)} style={{ padding: "9px 18px", borderRadius: 8, background: "var(--bg-page)", color: "var(--text-2)", border: "0.5px solid var(--border-table)", fontSize: 13, cursor: "pointer" }}>Não</button>
              <button onClick={cancelar} style={{ padding: "9px 18px", borderRadius: 8, background: "#E24B4A", color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Sim, cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
