"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthProvider";

// ── Parsers ───────────────────────────────────────────────────────────────────
function parseToledo(linha: string): number | null {
  const l = linha.replace(/[\x00-\x1F\x7F]/g, " ").trim();
  if (!l) return null;
  const m1 = l.match(/[+-]?\d+[\.,]?\d*\s*kg/i);
  if (m1) { const v = parseFloat(m1[0].replace(/kg/i,"").replace(",",".").trim()); return isFinite(v) && v > 0 ? v : null; }
  const m2 = l.match(/^P\s+0*(\d+)/i);
  if (m2) { const v = parseInt(m2[1], 10); return v > 0 ? v : null; }
  const m3 = l.match(/^[+-]?\s*0*(\d{3,7}[\.,]?\d*)\s*$/);
  if (m3) { const v = parseFloat(m3[1].replace(",",".")); return isFinite(v) && v >= 100 ? v : null; }
  return null;
}
function parseCapital(linha: string): number | null {
  const l = linha.replace(/[\x00-\x1F\x7F]/g, " ").trim();
  if (!l) return null;
  const m1 = l.match(/^[GBSsgbs]\s+0*(\d+[\.,]?\d*)/);
  if (m1) { const v = parseFloat(m1[1].replace(",",".")); return isFinite(v) && v > 0 ? v : null; }
  const m2 = l.match(/[+-]?\d+[\.,]?\d*\s*kg/i);
  if (m2) { const v = parseFloat(m2[0].replace(/kg/i,"").replace(",",".").trim()); return isFinite(v) && v > 0 ? v : null; }
  const m3 = l.match(/^[+-]?\s*0*(\d{3,7}[\.,]?\d*)\s*$/);
  if (m3) { const v = parseFloat(m3[1].replace(",",".")); return isFinite(v) && v >= 100 ? v : null; }
  return null;
}

// ── Config por marca ──────────────────────────────────────────────────────────
const MARCA_CONFIG = {
  toledo:  { label: "Toledo PRIX",      baud: 9600, defaultModo: "bridge" as const, parser: parseToledo  },
  capital: { label: "Capital Balancas", baud: 9600, defaultModo: "serial" as const, parser: parseCapital },
} as const;
export type MarcaBalanca = keyof typeof MARCA_CONFIG;
type Modo = "bridge" | "serial";

// ── Singleton de conexão serial ───────────────────────────────────────────────
// Sobrevive à navegação entre páginas (remontagens do componente).
// Cada "slot" é identificado pela lsKey (conta-isolada).
type PesoCb = (kg: number | null) => void;
interface SlotSerial {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  port: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reader: ReadableStreamDefaultReader<string> | null;
  marca: MarcaBalanca;
  pesoAtual: number | null;
  ativo: boolean;
  assinantes: Set<PesoCb>;
}
interface SlotBridge {
  ws: WebSocket;
  pesoAtual: number | null;
  ativo: boolean;
  assinantes: Set<PesoCb>;
}
const slotsSerial: Record<string, SlotSerial> = {};
const slotsBridge: Record<string, SlotBridge> = {};

async function abrirSerial(key: string, marca: MarcaBalanca, pedirNovo: boolean): Promise<SlotSerial> {
  await fecharSerial(key);
  const cfg = MARCA_CONFIG[marca];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let port: any;
  if (pedirNovo) {
    port = await nav.serial.requestPort();
  } else {
    const ports = await nav.serial.getPorts();
    if (!ports.length) throw Object.assign(new Error("Nenhuma porta autorizada"), { name: "NotFoundError" });
    port = ports[0];
  }
  if (!port.readable) {
    await port.open({ baudRate: cfg.baud, dataBits: 8, stopBits: 1, parity: "none" });
  }
  const slot: SlotSerial = { port, reader: null, marca, pesoAtual: null, ativo: true, assinantes: new Set() };
  slotsSerial[key] = slot;

  // Loop de leitura em background — não bloqueia o componente
  (async () => {
    const decoder = new TextDecoderStream();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (port.readable as any).pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader();
    slot.reader = reader;
    let buf = "";
    while (slot.ativo) {
      try {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const linhas = buf.split(/\r?\n/);
        buf = linhas.pop() ?? "";
        for (const linha of linhas) {
          const p = cfg.parser(linha);
          if (p !== null) { slot.pesoAtual = p; slot.assinantes.forEach(fn => fn(p)); }
        }
      } catch { break; }
    }
    try { reader.releaseLock(); } catch { /* */ }
    slot.reader = null;
  })();

  return slot;
}

async function fecharSerial(key: string) {
  const slot = slotsSerial[key];
  if (!slot) return;
  slot.ativo = false;
  slot.assinantes.forEach(fn => fn(null));
  try { await slot.reader?.cancel(); } catch { /* */ }
  try { slot.reader?.releaseLock(); } catch { /* */ }
  slot.reader = null;
  try { await slot.port?.close(); } catch { /* */ }
  delete slotsSerial[key];
}

function abrirBridge(key: string): SlotBridge {
  fecharBridge(key);
  const ws = new WebSocket("ws://localhost:8765");
  const slot: SlotBridge = { ws, pesoAtual: null, ativo: true, assinantes: new Set() };
  slotsBridge[key] = slot;
  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data as string);
      if (msg.tipo === "peso" && typeof msg.kg === "number") {
        slot.pesoAtual = msg.kg;
        slot.assinantes.forEach(fn => fn(msg.kg));
      }
    } catch { /* */ }
  };
  ws.onclose = () => {
    if (slot.ativo) { slot.assinantes.forEach(fn => fn(null)); delete slotsBridge[key]; }
  };
  ws.onerror = () => {
    slot.assinantes.forEach(fn => fn(null));
  };
  return slot;
}

function fecharBridge(key: string) {
  const slot = slotsBridge[key];
  if (!slot) return;
  slot.ativo = false;
  slot.ws.close();
  delete slotsBridge[key];
}

// ── Componente ────────────────────────────────────────────────────────────────
interface Props {
  onCapturarBruto: (kg: number) => void;
  onCapturarTara:  (kg: number) => void;
  marca?: MarcaBalanca; // prop explícita: cards de teste na pág de Integrações
}

export default function BalancaSerial({ onCapturarBruto, onCapturarTara, marca: marcaExplicita }: Props) {
  const { contaId } = useAuth();
  const lsKey = `balanca_marca_${contaId ?? "default"}`;

  const [marca,     setMarca]     = useState<MarcaBalanca>(marcaExplicita ?? "toledo");
  const [modo,      setModo]      = useState<Modo>("bridge");
  const [conectada, setConectada] = useState(false);
  const [pesoAtual, setPesoAtual] = useState<number | null>(null);
  const [status,    setStatus]    = useState<string>("");
  const [erro,      setErro]      = useState<string | null>(null);
  const [temSerial, setTemSerial] = useState(false);

  // Callback de peso — wrapping em useCallback para estabilidade na Set de assinantes
  const onPeso = useCallback((kg: number | null) => {
    setPesoAtual(kg);
    if (kg === null) { setConectada(false); setStatus(""); }
  }, []);

  // Mount: lê config, subscreve slot existente ou tenta auto-connect
  useEffect(() => {
    setTemSerial(typeof window !== "undefined" && "serial" in navigator);

    // Determina marca a usar
    let m: MarcaBalanca;
    if (marcaExplicita) {
      m = marcaExplicita;
    } else {
      const salva = localStorage.getItem(lsKey) as MarcaBalanca | null;
      m = (salva && MARCA_CONFIG[salva]) ? salva : "toledo";
    }
    setMarca(m);
    setModo(MARCA_CONFIG[m].defaultModo);

    const modoEfetivo = MARCA_CONFIG[m].defaultModo;

    // ── Slot serial já ativo? Subscreve sem reabrir porta ────────────────────
    if (modoEfetivo === "serial" && slotsSerial[lsKey]) {
      const s = slotsSerial[lsKey];
      s.assinantes.add(onPeso);
      setConectada(true);
      setPesoAtual(s.pesoAtual);
      setStatus("Aguardando leitura…");
      return () => { slotsSerial[lsKey]?.assinantes.delete(onPeso); };
    }
    if (modoEfetivo === "bridge" && slotsBridge[lsKey]) {
      const s = slotsBridge[lsKey];
      s.assinantes.add(onPeso);
      setConectada(true);
      setPesoAtual(s.pesoAtual);
      setStatus("Aguardando leitura…");
      return () => { slotsBridge[lsKey]?.assinantes.delete(onPeso); };
    }

    // ── Auto-connect serial (porta já autorizada, sem diálogo) ───────────────
    if (modoEfetivo === "serial" && !marcaExplicita && typeof window !== "undefined" && "serial" in navigator) {
      abrirSerial(lsKey, m, false)
        .then(s => {
          s.assinantes.add(onPeso);
          setConectada(true);
          setStatus("Aguardando leitura…");
          setErro(null);
        })
        .catch(() => { /* sem porta autorizada — aguarda clique */ });
    }

    return () => {
      slotsSerial[lsKey]?.assinantes.delete(onPeso);
      slotsBridge[lsKey]?.assinantes.delete(onPeso);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  // ── Ações manuais ────────────────────────────────────────────────────────────
  const conectar = useCallback(async () => {
    setErro(null);
    setStatus("Conectando…");
    if (modo === "bridge") {
      try {
        const s = abrirBridge(lsKey);
        s.assinantes.add(onPeso);
        await new Promise<void>((res, rej) => {
          const t = setTimeout(() => rej(new Error("Timeout")), 4000);
          s.ws.onopen = () => { clearTimeout(t); setConectada(true); setStatus("Aguardando leitura…"); res(); };
          s.ws.onerror = () => { clearTimeout(t); rej(new Error("Falha ao conectar ao bridge")); };
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setErro(msg.includes("Timeout") || msg.includes("Falha")
          ? "Bridge não encontrado. Verifique se o bridge.exe está rodando no PC da balança."
          : msg);
        setStatus("");
        fecharBridge(lsKey);
      }
    } else {
      try {
        const s = await abrirSerial(lsKey, marca, true);
        s.assinantes.add(onPeso);
        setConectada(true);
        setStatus("Aguardando leitura…");
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string };
        if (err?.name !== "NotFoundError") setErro("Erro: " + (err?.message ?? String(e)));
        setStatus("");
      }
    }
  }, [modo, lsKey, marca, onPeso]);

  const desconectar = useCallback(async () => {
    if (modo === "bridge") fecharBridge(lsKey);
    else await fecharSerial(lsKey);
    setConectada(false);
    setPesoAtual(null);
    setStatus("");
    setErro(null);
  }, [modo, lsKey]);

  const cfg = MARCA_CONFIG[marca];

  return (
    <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>Balança {cfg.label}</span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 10,
            background: conectada ? "#DCFCE7" : "var(--bg-tag)",
            color: conectada ? "#166534" : "var(--text-3)",
            border: "0.5px solid", borderColor: conectada ? "#16A34A40" : "var(--border-table)",
          }}>
            {conectada ? "● Conectada" : "○ Desconectada"}
          </span>
        </div>

        {/* Seletor de modo — só quando desconectada */}
        {!conectada && (
          <div style={{ display: "flex", gap: 4, background: "var(--bg-tag)", borderRadius: 8, padding: 3 }}>
            {([["bridge", "RJ45 (Bridge)"], ["serial", "USB Serial"]] as [Modo, string][]).map(([m, label]) => (
              <button key={m} type="button" onClick={() => { setModo(m); setErro(null); }}
                disabled={m === "serial" && !temSerial}
                style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: "none",
                  cursor: m === "serial" && !temSerial ? "not-allowed" : "pointer",
                  background: modo === m ? "#fff" : "transparent",
                  color: modo === m ? "#111111" : "var(--text-3)",
                  boxShadow: modo === m ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  opacity: m === "serial" && !temSerial ? 0.4 : 1,
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {!conectada ? (
          <button type="button" onClick={conectar}
            style={{ fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 7, background: "#111111", color: "#fff", border: "none", cursor: "pointer" }}>
            Conectar
          </button>
        ) : (
          <button type="button" onClick={desconectar}
            style={{ fontSize: 11, padding: "5px 14px", borderRadius: 7, background: "#FCEBEB", color: "#E24B4A", border: "0.5px solid #E24B4A40", cursor: "pointer" }}>
            Desconectar
          </button>
        )}
      </div>

      {/* Display + botões */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          flex: 1, textAlign: "center", padding: "10px 0",
          background: conectada ? "#fff" : "#EBEDF2",
          border: "0.5px solid", borderColor: conectada ? "#11111140" : "var(--border-table)", borderRadius: 8,
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: conectada && pesoAtual ? "#111111" : "#bbb", letterSpacing: 2 }}>
            {pesoAtual != null ? pesoAtual.toLocaleString("pt-BR") : "— — —"}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2 }}>kg</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" disabled={!conectada || pesoAtual == null}
            onClick={() => pesoAtual != null && onCapturarBruto(pesoAtual)}
            style={{
              fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", whiteSpace: "nowrap",
              cursor: conectada && pesoAtual != null ? "pointer" : "not-allowed",
              background: conectada && pesoAtual != null ? "#111111" : "var(--bg-tag)",
              color:      conectada && pesoAtual != null ? "#fff"    : "var(--text-muted)",
            }}>
            ↓ Capturar Peso Bruto
          </button>
          <button type="button" disabled={!conectada || pesoAtual == null}
            onClick={() => pesoAtual != null && onCapturarTara(pesoAtual)}
            style={{
              fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 7, border: "none", whiteSpace: "nowrap",
              cursor: conectada && pesoAtual != null ? "pointer" : "not-allowed",
              background: conectada && pesoAtual != null ? "#C9921B" : "var(--bg-tag)",
              color:      conectada && pesoAtual != null ? "#fff"    : "var(--text-muted)",
            }}>
            ↓ Capturar Tara
          </button>
        </div>
      </div>

      {status && !erro && <div style={{ marginTop: 6, fontSize: 10, color: "var(--text-3)", textAlign: "center" }}>{status}</div>}
      {erro && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#E24B4A" }}>
          {erro}
          {modo === "bridge" && (
            <div style={{ marginTop: 4, fontSize: 10, color: "var(--text-3)" }}>
              Certifique-se de que o <strong>bridge.exe</strong> está rodando no PC da balança.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
