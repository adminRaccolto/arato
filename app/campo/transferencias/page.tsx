"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "../../../components/AuthProvider";
import type { Fazenda, Deposito, Insumo } from "../../../lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ItemSolicitacao {
  insumo_id: string;
  insumo_nome: string;
  quantidade: string;
  unidade_medida: string;
}

// ─── Estilos (mobile-first) ───────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: "18px 18px", marginBottom: 14,
};

const inp: React.CSSProperties = {
  width: "100%", padding: "12px 14px", border: "0.5px solid #DDE2EE", borderRadius: 10,
  fontSize: 15, color: "#1a1a1a", background: "#fff", outline: "none", boxSizing: "border-box",
  appearance: "none",
};

const lbl: React.CSSProperties = {
  fontSize: 12, color: "#555", fontWeight: 700, display: "block", marginBottom: 6,
};

const btnPrimary: React.CSSProperties = {
  width: "100%", padding: "14px", background: "#1A4870", color: "#fff",
  border: "none", borderRadius: 12, fontWeight: 700, cursor: "pointer", fontSize: 16,
};

const btnSecondary: React.CSSProperties = {
  width: "100%", padding: "12px", background: "#F4F6FA", color: "#555",
  border: "0.5px solid #DDE2EE", borderRadius: 12, fontWeight: 600, cursor: "pointer", fontSize: 15,
};

// ─── Componente ───────────────────────────────────────────────────────────────

export default function CampoTransferenciasPage() {
  const { fazendaId, nomeFazendaSelecionada, nomeUsuario } = useAuth();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [todasFazendas, setTodasFazendas] = useState<Fazenda[]>([]);
  const [depositosPorFazenda, setDepositosPorFazenda] = useState<Record<string, Deposito[]>>({});
  const [insumosPorFazenda, setInsumosPorFazenda] = useState<Record<string, Insumo[]>>({});
  const [carregando, setCarregando] = useState(true);

  const [fazendaOrigemId, setFazendaOrigemId] = useState(fazendaId ?? "");
  const [depositoOrigemId, setDepositoOrigemId] = useState("");
  const [fazendaDestinoId, setFazendaDestinoId] = useState("");
  const [depositoDestinoId, setDepositoDestinoId] = useState("");
  const [urgencia, setUrgencia] = useState<"programado" | "urgente">("programado");
  const [dataTransferencia, setDataTransferencia] = useState(new Date().toISOString().slice(0, 10));
  const [observacao, setObservacao] = useState("");
  const [itens, setItens] = useState<ItemSolicitacao[]>([
    { insumo_id: "", insumo_nome: "", quantidade: "", unidade_medida: "kg" },
  ]);

  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    try {
      const res = await fetch("/api/fazenda/da-conta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId }),
      });
      const json = await res.json() as { ok: boolean; fazendas?: Fazenda[] };
      const fazendas = json.fazendas ?? [];
      setTodasFazendas(fazendas);

      const depMap: Record<string, Deposito[]> = {};
      const insMap: Record<string, Insumo[]> = {};
      await Promise.all(fazendas.map(async (f) => {
        const [depRes, insRes] = await Promise.all([
          supabase.from("depositos").select("*").eq("fazenda_id", f.id).order("nome"),
          supabase.from("insumos").select("id,nome,unidade,estoque,categoria").eq("fazenda_id", f.id).order("nome"),
        ]);
        depMap[f.id] = (depRes.data ?? []) as Deposito[];
        insMap[f.id] = (insRes.data ?? []) as Insumo[];
      }));
      setDepositosPorFazenda(depMap);
      setInsumosPorFazenda(insMap);
    } finally {
      setCarregando(false);
    }
  }, [fazendaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (fazendaId) setFazendaOrigemId(fazendaId); }, [fazendaId]);

  const depositosOrigem  = depositosPorFazenda[fazendaOrigemId] ?? [];
  const depositosDestino = depositosPorFazenda[fazendaDestinoId] ?? [];
  const insumosOrigem    = insumosPorFazenda[fazendaOrigemId] ?? [];

  function addItem() {
    setItens(prev => [...prev, { insumo_id: "", insumo_nome: "", quantidade: "", unidade_medida: "kg" }]);
  }

  function removeItem(i: number) {
    setItens(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, field: keyof ItemSolicitacao, value: string) {
    setItens(prev => prev.map((it, idx) => {
      if (idx !== i) return it;
      const updated = { ...it, [field]: value };
      if (field === "insumo_id") {
        const ins = insumosOrigem.find(x => x.id === value);
        if (ins) {
          updated.insumo_nome    = ins.nome;
          updated.unidade_medida = ins.unidade ?? "kg";
        }
      }
      return updated;
    }));
  }

  async function enviarSolicitacao() {
    if (!fazendaOrigemId || !fazendaDestinoId) {
      setErro("Selecione fazenda de origem e destino."); return;
    }
    if (!depositoOrigemId) {
      setErro("Selecione o depósito de origem."); return;
    }
    if (!depositoDestinoId) {
      setErro("Selecione o depósito de destino."); return;
    }
    if (itens.some(it => !it.insumo_id || !it.quantidade)) {
      setErro("Preencha todos os itens com insumo e quantidade."); return;
    }
    if (fazendaOrigemId === fazendaDestinoId && depositoOrigemId === depositoDestinoId) {
      setErro("Origem e destino não podem ser iguais."); return;
    }

    setEnviando(true); setErro(null);
    try {
      const numero = `SOL-${Date.now().toString().slice(-6)}`;

      const fazOrigem  = todasFazendas.find(f => f.id === fazendaOrigemId);
      const fazDestino = todasFazendas.find(f => f.id === fazendaDestinoId);
      const ieDiferentes = fazOrigem?.estado !== fazDestino?.estado;
      const cfop = ieDiferentes ? "6409" : "5409";

      const itensParsed = itens.map(it => ({
        insumo_id:      it.insumo_id,
        quantidade:     parseFloat(it.quantidade.replace(",", ".")),
        unidade_medida: it.unidade_medida,
      }));

      // Usa API route com service_role_key para contornar RLS
      const res = await fetch("/api/campo/transferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferencia: {
            numero,
            fazenda_origem_id:   fazendaOrigemId,
            deposito_origem_id:  depositoOrigemId,
            fazenda_destino_id:  fazendaDestinoId,
            deposito_destino_id: depositoDestinoId,
            cfop,
            ie_diferentes:       ieDiferentes,
            entrada_automatica:  true,
            status:              "solicitada",
            data_transferencia:  dataTransferencia,
            observacao:          observacao || null,
            solicitante_nome:    nomeUsuario ?? "App Campo",
            via_app:             true,
            urgencia,
          },
          itens: itensParsed,
        }),
      });

      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Erro ao salvar solicitação");

      setSucesso(true);
    } catch (e) {
      setErro(String(e));
    } finally {
      setEnviando(false);
    }
  }

  function novaSolicitacao() {
    setSucesso(false);
    setFazendaOrigemId(fazendaId ?? "");
    setDepositoOrigemId("");
    setFazendaDestinoId("");
    setDepositoDestinoId("");
    setUrgencia("programado");
    setDataTransferencia(new Date().toISOString().slice(0, 10));
    setObservacao("");
    setItens([{ insumo_id: "", insumo_nome: "", quantidade: "", unidade_medida: "kg" }]);
    setErro(null);
  }

  // ── Tela de sucesso ───────────────────────────────────────────────────────
  if (sucesso) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Solicitação enviada!</h2>
        <p style={{ fontSize: 14, color: "#555", marginBottom: 28 }}>
          Sua solicitação foi registrada e aparecerá como pendente no painel do Arato.
          A NF de transferência será emitida pelo escritório.
        </p>
        <button onClick={novaSolicitacao} style={btnPrimary}>Nova Solicitação</button>
        <div style={{ marginTop: 12 }}>
          <a href="/campo" style={{ fontSize: 13, color: "#1A4870" }}>← Voltar ao App Campo</a>
        </div>
      </div>
    );
  }

  // ── Formulário ────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 14px", fontFamily: "system-ui, sans-serif" }}>

      {/* Header mobile */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <a href="/campo" style={{ fontSize: 20, textDecoration: "none" }}>←</a>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#1a1a1a" }}>Transferência de Insumos</h1>
          <p style={{ fontSize: 12, color: "#888", margin: "2px 0 0" }}>{nomeFazendaSelecionada}</p>
        </div>
      </div>

      {/* Urgência */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {(["programado", "urgente"] as const).map(u => (
          <button
            key={u}
            onClick={() => setUrgencia(u)}
            style={{
              padding: "12px", border: urgencia === u ? "2px solid" : "0.5px solid #DDE2EE",
              borderColor: urgencia === u ? (u === "urgente" ? "#E24B4A" : "#16A34A") : "#DDE2EE",
              borderRadius: 10, background: urgencia === u ? (u === "urgente" ? "#FEF2F2" : "#F0FDF4") : "#fff",
              fontWeight: 700, cursor: "pointer", fontSize: 14,
              color: urgencia === u ? (u === "urgente" ? "#E24B4A" : "#16A34A") : "#555",
            }}
          >
            {u === "urgente" ? "🔴 Urgente" : "🟢 Programado"}
          </button>
        ))}
      </div>

      {/* Data */}
      <div style={card}>
        <label style={lbl}>Data de Transferência</label>
        <input type="date" value={dataTransferencia} onChange={e => setDataTransferencia(e.target.value)} style={inp} />
      </div>

      {/* Origem */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          📦 Origem
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Fazenda de Origem</label>
          <select value={fazendaOrigemId} onChange={e => { setFazendaOrigemId(e.target.value); setDepositoOrigemId(""); }} style={inp}>
            <option value="">— Selecione —</option>
            {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Depósito de Origem *</label>
          {fazendaOrigemId && depositosOrigem.length === 0 ? (
            <div style={{ background: "#FFF1F1", border: "0.5px solid #E24B4A", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#B91C1C" }}>
              ⚠️ Sem depósito cadastrado para esta fazenda.
            </div>
          ) : (
            <select value={depositoOrigemId} onChange={e => setDepositoOrigemId(e.target.value)} style={inp} disabled={!fazendaOrigemId}>
              <option value="">— Selecione o depósito —</option>
              {depositosOrigem.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Destino */}
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#C9921B", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          🏠 Destino
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Fazenda de Destino</label>
          <select value={fazendaDestinoId} onChange={e => { setFazendaDestinoId(e.target.value); setDepositoDestinoId(""); }} style={inp}>
            <option value="">— Selecione —</option>
            {todasFazendas.filter(f => f.id !== fazendaOrigemId).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>Depósito de Destino *</label>
          {fazendaDestinoId && depositosDestino.length === 0 ? (
            <div style={{ background: "#FFF1F1", border: "0.5px solid #E24B4A", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#B91C1C" }}>
              ⚠️ Sem depósito cadastrado para a fazenda destino.
            </div>
          ) : (
            <select value={depositoDestinoId} onChange={e => setDepositoDestinoId(e.target.value)} style={inp} disabled={!fazendaDestinoId}>
              <option value="">— Selecione o depósito —</option>
              {depositosDestino.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Itens */}
      <div style={{ ...card, padding: "16px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Itens a Transferir</span>
          <button onClick={addItem} style={{ padding: "6px 14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
            + Adicionar
          </button>
        </div>
        {itens.map((it, i) => (
          <div key={i} style={{ border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "12px 14px", marginBottom: 10, background: "#FAFBFC" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#888" }}>Item {i + 1}</span>
              {itens.length > 1 && (
                <button onClick={() => removeItem(i)} style={{ padding: "3px 10px", background: "#FEF2F2", color: "#E24B4A", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                  Remover
                </button>
              )}
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Insumo</label>
              {carregando ? (
                <div style={{ ...inp, color: "#888", background: "#F4F6FA" }}>Carregando…</div>
              ) : (
                <select value={it.insumo_id} onChange={e => updateItem(i, "insumo_id", e.target.value)} style={inp}>
                  <option value="">— Selecione o insumo —</option>
                  {insumosOrigem.map(ins => (
                    <option key={ins.id} value={ins.id}>
                      {ins.nome} {ins.estoque != null ? `(${ins.estoque.toFixed(2)} ${ins.unidade ?? ""})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
              <div>
                <label style={lbl}>Quantidade</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,000"
                  value={it.quantidade}
                  onChange={e => updateItem(i, "quantidade", e.target.value)}
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>Unidade</label>
                <input
                  type="text"
                  value={it.unidade_medida}
                  onChange={e => updateItem(i, "unidade_medida", e.target.value)}
                  style={inp}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Observação */}
      <div style={card}>
        <label style={lbl}>Observação (opcional)</label>
        <input
          type="text"
          placeholder="Motivo, referência, urgência extra…"
          value={observacao}
          onChange={e => setObservacao(e.target.value)}
          style={inp}
        />
      </div>

      {/* Erro */}
      {erro && (
        <div style={{ background: "#FFF1F1", border: "0.5px solid #E24B4A", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 14, color: "#B91C1C" }}>
          {erro}
        </div>
      )}

      {/* Botão enviar */}
      <button onClick={enviarSolicitacao} disabled={enviando} style={{ ...btnPrimary, marginBottom: 12 }}>
        {enviando ? "Enviando…" : "📤 Enviar Solicitação de Transferência"}
      </button>
      <a href="/campo" style={{ ...btnSecondary, display: "block", textAlign: "center", textDecoration: "none" }}>
        Cancelar
      </a>

      <p style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 16 }}>
        Sua solicitação ficará pendente no painel do Arato até a NF ser emitida pelo escritório.
      </p>
    </div>
  );
}
