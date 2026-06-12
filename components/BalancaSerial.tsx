"use client";
import { useState, useRef, useCallback, useEffect } from "react";

// Toledo PRIX: 9600 baud, 8N1
// Formatos de saída conhecidos:
//   "P  0012345\r\n"           — modo contínuo padrão
//   "ST,GS,  +0012345 kg\r\n"  — formato estendido
//   "\x02P  0012345\r\n\x03"   — com delimitadores STX/ETX
const TOLEDO_CONFIG = { baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" } as const;

function parseToledo(linha: string): number | null {
  const limpa = linha.replace(/[\x00-\x1F\x7F]/g, " ").trim();
  if (!limpa) return null;

  // "ST,GS,  +0012345 kg" ou "ST,GS,  +0012345.6 kg"
  const m1 = limpa.match(/[+-]?\d+[\.,]?\d*\s*kg/i);
  if (m1) {
    const v = parseFloat(m1[0].replace(/kg/i, "").replace(",", ".").trim());
    return isFinite(v) && v > 0 ? v : null;
  }

  // "P  0012345" — prefixo P + espaços + número
  const m2 = limpa.match(/^P\s+0*(\d+)/i);
  if (m2) {
    const v = parseInt(m2[1], 10);
    return v > 0 ? v : null;
  }

  // Número isolado grande (>= 100 kg — evita lixo)
  const m3 = limpa.match(/^[+-]?\s*0*(\d{3,7}[\.,]?\d*)\s*$/);
  if (m3) {
    const v = parseFloat(m3[1].replace(",", "."));
    return isFinite(v) && v >= 100 ? v : null;
  }

  return null;
}

interface Props {
  onCapturarBruto: (kg: number) => void;
  onCapturarTara:  (kg: number) => void;
}

export default function BalancaSerial({ onCapturarBruto, onCapturarTara }: Props) {
  const [conectada, setConectada] = useState(false);
  const [pesoAtual, setPesoAtual] = useState<number | null>(null);
  const [erro,      setErro]      = useState<string | null>(null);
  const [suportado, setSuportado] = useState(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const portRef  = useRef<any>(null);
  const ativoRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !("serial" in navigator)) {
      setSuportado(false);
    }
  }, []);

  const conectar = useCallback(async () => {
    setErro(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      const port = await nav.serial.requestPort();
      await port.open(TOLEDO_CONFIG);
      portRef.current  = port;
      ativoRef.current = true;
      setConectada(true);
      lerStream(port);
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name !== "NotFoundError") {
        setErro("Erro ao conectar: " + (err?.message ?? String(e)));
      }
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function lerStream(port: any) {
    const decoder = new TextDecoderStream();
    (port.readable as ReadableStream).pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader();
    let buffer = "";

    while (ativoRef.current) {
      try {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const linhas = buffer.split(/\r?\n/);
        buffer = linhas.pop() ?? "";
        for (const linha of linhas) {
          const peso = parseToledo(linha);
          if (peso !== null) setPesoAtual(peso);
        }
      } catch {
        break;
      }
    }
    reader.releaseLock();
  }

  const desconectar = useCallback(async () => {
    ativoRef.current = false;
    try { await portRef.current?.close(); } catch { /* ignora */ }
    portRef.current = null;
    setConectada(false);
    setPesoAtual(null);
  }, []);

  if (!suportado) {
    return (
      <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B40", borderRadius: 8, padding: "8px 14px", fontSize: 11, color: "#7A4300", marginBottom: 12 }}>
        ⚠ Integração com balança requer <strong>Google Chrome</strong>. Abra o sistema no Chrome no computador conectado à balança.
      </div>
    );
  }

  return (
    <div style={{ background: "#F4F6FA", border: "0.5px solid #D4DCE8", borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>Balança Toledo PRIX</span>
          <span style={{
            fontSize: 10, padding: "2px 8px", borderRadius: 10,
            background: conectada ? "#DCFCE7" : "#EEF1F6",
            color:      conectada ? "#166534" : "#888",
            border: "0.5px solid", borderColor: conectada ? "#16A34A40" : "#D4DCE8",
          }}>
            {conectada ? "● Conectada" : "○ Desconectada"}
          </span>
        </div>
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

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          flex: 1, textAlign: "center", padding: "10px 0",
          background: conectada ? "#fff" : "#EBEDF2",
          border: "0.5px solid", borderColor: conectada ? "#1A487040" : "#D4DCE8",
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: conectada && pesoAtual ? "#1A4870" : "#bbb", letterSpacing: 2 }}>
            {pesoAtual != null ? pesoAtual.toLocaleString("pt-BR") : "— — —"}
          </div>
          <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>kg</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" disabled={!conectada || pesoAtual == null}
            onClick={() => pesoAtual != null && onCapturarBruto(pesoAtual)}
            style={{
              fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 7,
              cursor: conectada && pesoAtual != null ? "pointer" : "not-allowed",
              background: conectada && pesoAtual != null ? "#1A4870" : "#EEF1F6",
              color:      conectada && pesoAtual != null ? "#fff"    : "#aaa",
              border: "none", whiteSpace: "nowrap",
            }}>
            ↓ Capturar Peso Bruto
          </button>
          <button type="button" disabled={!conectada || pesoAtual == null}
            onClick={() => pesoAtual != null && onCapturarTara(pesoAtual)}
            style={{
              fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 7,
              cursor: conectada && pesoAtual != null ? "pointer" : "not-allowed",
              background: conectada && pesoAtual != null ? "#C9921B" : "#EEF1F6",
              color:      conectada && pesoAtual != null ? "#fff"    : "#aaa",
              border: "none", whiteSpace: "nowrap",
            }}>
            ↓ Capturar Tara
          </button>
        </div>
      </div>

      {erro && <div style={{ marginTop: 8, fontSize: 11, color: "#E24B4A" }}>{erro}</div>}
      {conectada && pesoAtual == null && (
        <div style={{ marginTop: 6, fontSize: 10, color: "#888", textAlign: "center" }}>Aguardando leitura da balança…</div>
      )}
    </div>
  );
}
