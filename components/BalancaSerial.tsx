"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// ── Parser Toledo PRIX ────────────────────────────────────────────────────────
// Suporta: "P  0012345", "ST,GS,  +0012345 kg", número isolado ≥ 100
function parseToledo(linha: string): number | null {
  const limpa = linha.replace(/[\x00-\x1F\x7F]/g, " ").trim();
  if (!limpa) return null;
  const m1 = limpa.match(/[+-]?\d+[\.,]?\d*\s*kg/i);
  if (m1) { const v = parseFloat(m1[0].replace(/kg/i,"").replace(",",".").trim()); return isFinite(v) && v > 0 ? v : null; }
  const m2 = limpa.match(/^P\s+0*(\d+)/i);
  if (m2) { const v = parseInt(m2[1], 10); return v > 0 ? v : null; }
  const m3 = limpa.match(/^[+-]?\s*0*(\d{3,7}[\.,]?\d*)\s*$/);
  if (m3) { const v = parseFloat(m3[1].replace(",",".")); return isFinite(v) && v >= 100 ? v : null; }
  return null;
}

type Modo = "bridge" | "serial";

interface Props {
  onCapturarBruto: (kg: number) => void;
  onCapturarTara:  (kg: number) => void;
}

export default function BalancaSerial({ onCapturarBruto, onCapturarTara }: Props) {
  const [modo,      setModo]      = useState<Modo>("bridge");
  const [conectada, setConectada] = useState(false);
  const [pesoAtual, setPesoAtual] = useState<number | null>(null);
  const [status,    setStatus]    = useState<string>("");
  const [erro,      setErro]      = useState<string | null>(null);
  const [temSerial, setTemSerial] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portRef  = useRef<any>(null);
  const wsRef    = useRef<WebSocket | null>(null);
  const ativoRef = useRef(false);

  useEffect(() => {
    setTemSerial(typeof window !== "undefined" && "serial" in navigator);
  }, []);

  // ── Modo Bridge (RJ45 via bridge.exe local) ───────────────────
  const conectarBridge = useCallback(() => {
    setErro(null);
    setStatus("Conectando ao bridge…");
    const ws = new WebSocket("ws://localhost:8765");
    wsRef.current  = ws;
    ativoRef.current = true;

    ws.onopen = () => {
      setConectada(true);
      setStatus("Aguardando leitura…");
    };
    ws.onmessage = e => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.tipo === "peso" && typeof msg.kg === "number") {
          setPesoAtual(msg.kg);
          setStatus("");
        }
        if (msg.tipo === "status") setStatus(msg.msg);
      } catch { /* ignora */ }
    };
    ws.onerror = () => {
      setErro("Não foi possível conectar ao bridge. Verifique se o bridge.exe está rodando no PC da balança.");
      setConectada(false);
      setStatus("");
    };
    ws.onclose = () => {
      if (ativoRef.current) {
        setErro("Conexão com o bridge encerrada.");
        setConectada(false);
      }
    };
  }, []);

  const desconectarBridge = useCallback(() => {
    ativoRef.current = false;
    wsRef.current?.close();
    wsRef.current = null;
    setConectada(false);
    setPesoAtual(null);
    setStatus("");
    setErro(null);
  }, []);

  // ── Modo Serial (USB direto) ──────────────────────────────────
  const conectarSerial = useCallback(async () => {
    setErro(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" });
      portRef.current  = port;
      ativoRef.current = true;
      setConectada(true);
      setStatus("Aguardando leitura…");

      const decoder = new TextDecoderStream();
      (port.readable as ReadableStream).pipeTo(decoder.writable).catch(() => {});
      const reader = decoder.readable.getReader();
      let buf = "";
      while (ativoRef.current) {
        try {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const linhas = buf.split(/\r?\n/);
          buf = linhas.pop() ?? "";
          for (const l of linhas) { const p = parseToledo(l); if (p !== null) { setPesoAtual(p); setStatus(""); } }
        } catch { break; }
      }
      reader.releaseLock();
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name !== "NotFoundError") setErro("Erro: " + (err?.message ?? String(e)));
    }
  }, []);

  const desconectarSerial = useCallback(async () => {
    ativoRef.current = false;
    try { await portRef.current?.close(); } catch { /* ignora */ }
    portRef.current = null;
    setConectada(false);
    setPesoAtual(null);
    setStatus("");
  }, []);

  const conectar    = modo === "bridge" ? conectarBridge    : conectarSerial;
  const desconectar = modo === "bridge" ? desconectarBridge : desconectarSerial;

  return (
    <div style={{ background: "var(--bg-page)", border: "0.5px solid var(--border-table)", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>

      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)" }}>Balança Toledo PRIX</span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 10,
            background: conectada ? "#DCFCE7" : "var(--bg-tag)",
            color: conectada ? "#166534" : "var(--text-3)",
            border: "0.5px solid", borderColor: conectada ? "#16A34A40" : "var(--border-table)",
          }}>
            {conectada ? "● Conectada" : "○ Desconectada"}
          </span>
        </div>

        {/* Seletor de modo */}
        {!conectada && (
          <div style={{ display: "flex", gap: 4, background: "var(--bg-tag)", borderRadius: 8, padding: 3 }}>
            {([["bridge", "RJ45 (Bridge)"], ["serial", "USB Serial"]] as [Modo, string][]).map(([m, label]) => (
              <button key={m} type="button" onClick={() => { setModo(m); setErro(null); }}
                disabled={m === "serial" && !temSerial}
                style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, border: "none", cursor: m === "serial" && !temSerial ? "not-allowed" : "pointer",
                  background: modo === m ? "#fff" : "transparent",
                  color: modo === m ? "#1A4870" : "var(--text-3)",
                  boxShadow: modo === m ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  opacity: m === "serial" && !temSerial ? 0.4 : 1,
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Conectar / Desconectar */}
        {!conectada ? (
          <button type="button" onClick={conectar}
            style={{ fontSize: 11, fontWeight: 600, padding: "5px 14px", borderRadius: 7, background: "#1A4870", color: "#fff", border: "none", cursor: "pointer" }}>
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
          border: "0.5px solid", borderColor: conectada ? "#1A487040" : "var(--border-table)", borderRadius: 8,
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: conectada && pesoAtual ? "#1A4870" : "#bbb", letterSpacing: 2 }}>
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
              background: conectada && pesoAtual != null ? "#1A4870" : "var(--bg-tag)",
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
