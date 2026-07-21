"use client";
import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "../../../components/AuthProvider";
import type { Fazenda, Deposito, Insumo, Maquina } from "../../../lib/supabase";

interface ItemSolicitacao {
  insumo_id: string;
  insumo_nome: string;
  quantidade: string;
  unidade_medida: string;
}

const card: React.CSSProperties = {
  background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 12, padding: "18px 18px", marginBottom: 14,
};
const inp: React.CSSProperties = {
  width: "100%", padding: "12px 14px", border: "0.5px solid #DDE2EE", borderRadius: 10,
  fontSize: 15, color: "#1a1a1a", background: "#fff", outline: "none", boxSizing: "border-box", appearance: "none",
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

export default function CampoTransferenciasPage() {
  const { fazendaId, nomeFazendaSelecionada, nomeUsuario } = useAuth();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [aba, setAba] = useState<"insumos" | "maquinas">("insumos");

  // ── Estado insumos ──
  const [todasFazendas,       setTodasFazendas]       = useState<Fazenda[]>([]);
  const [depositosPorFazenda, setDepositosPorFazenda] = useState<Record<string, Deposito[]>>({});
  const [insumosPorFazenda,   setInsumosPorFazenda]   = useState<Record<string, Insumo[]>>({});
  const [carregando,          setCarregando]           = useState(true);

  const [fazendaOrigemId,  setFazendaOrigemId]  = useState(fazendaId ?? "");
  const [depositoOrigemId, setDepositoOrigemId] = useState("");
  const [fazendaDestinoId, setFazendaDestinoId] = useState("");
  const [depositoDestinoId,setDepositoDestinoId]= useState("");
  const [urgencia,         setUrgencia]         = useState<"programado" | "urgente">("programado");
  const [dataTransf,       setDataTransf]       = useState(new Date().toISOString().slice(0, 10));
  const [observacao,       setObservacao]       = useState("");
  const [itens, setItens] = useState<ItemSolicitacao[]>([
    { insumo_id: "", insumo_nome: "", quantidade: "", unidade_medida: "kg" },
  ]);

  // ── Estado máquinas ──
  const [maquinasPorFazenda, setMaquinasPorFazenda] = useState<Record<string, Maquina[]>>({});
  const [fMaqOrigem,      setFMaqOrigem]      = useState(fazendaId ?? "");
  const [fMaqDestino,     setFMaqDestino]     = useState("");
  const [maquinaId,       setMaquinaId]       = useState("");
  const [motivoTransf,    setMotivoTransf]    = useState("");
  const [dataNecessidade, setDataNecessidade] = useState("");
  const [urgenciaMaq,     setUrgenciaMaq]     = useState<"programado" | "urgente">("programado");
  const [obsMaq,          setObsMaq]          = useState("");

  const [enviando, setEnviando] = useState(false);
  const [sucesso,  setSucesso]  = useState(false);
  const [erro,     setErro]     = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setCarregando(true);
    try {
      const res  = await fetch("/api/fazenda/da-conta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fazenda_id: fazendaId }),
      });
      const json = await res.json() as { ok: boolean; fazendas?: Fazenda[] };
      const fazendas = json.fazendas ?? [];
      setTodasFazendas(fazendas);

      const depMap:  Record<string, Deposito[]> = {};
      const insMap:  Record<string, Insumo[]>   = {};
      const maqMap:  Record<string, Maquina[]>  = {};

      await Promise.all(fazendas.map(async (f) => {
        const [depRes, insRes, maqRes] = await Promise.all([
          supabase.from("depositos").select("*").eq("fazenda_id", f.id).order("nome"),
          supabase.from("insumos").select("id,nome,unidade,estoque,categoria").eq("fazenda_id", f.id).order("nome"),
          supabase.from("maquinas").select("id,nome,tipo,patrimonio,horimetro_atual,consome_combustivel").eq("fazenda_id", f.id).eq("ativa", true).order("nome"),
        ]);
        depMap[f.id] = (depRes.data ?? []) as Deposito[];
        insMap[f.id] = (insRes.data ?? []) as Insumo[];
        maqMap[f.id] = (maqRes.data ?? []) as Maquina[];
      }));

      setDepositosPorFazenda(depMap);
      setInsumosPorFazenda(insMap);
      setMaquinasPorFazenda(maqMap);
    } finally { setCarregando(false); }
  }, [fazendaId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (fazendaId) { setFazendaOrigemId(fazendaId); setFMaqOrigem(fazendaId); } }, [fazendaId]);

  const depositosOrigem  = depositosPorFazenda[fazendaOrigemId] ?? [];
  const depositosDestino = depositosPorFazenda[fazendaDestinoId] ?? [];
  const insumosOrigem    = insumosPorFazenda[fazendaOrigemId] ?? [];
  const maquinasOrigem   = maquinasPorFazenda[fMaqOrigem] ?? [];

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
        if (ins) { updated.insumo_nome = ins.nome; updated.unidade_medida = ins.unidade ?? "kg"; }
      }
      return updated;
    }));
  }

  async function enviarSolicitacaoInsumos() {
    if (!fazendaOrigemId || !fazendaDestinoId) { setErro("Selecione fazenda de origem e destino."); return; }
    if (!depositoOrigemId) { setErro("Selecione o depósito de origem."); return; }
    if (!depositoDestinoId) { setErro("Selecione o depósito de destino."); return; }
    if (itens.some(it => !it.insumo_id || !it.quantidade)) { setErro("Preencha todos os itens com insumo e quantidade."); return; }
    if (fazendaOrigemId === fazendaDestinoId && depositoOrigemId === depositoDestinoId) { setErro("Origem e destino não podem ser iguais."); return; }

    setEnviando(true); setErro(null);
    try {
      const numero        = `SOL-${Date.now().toString().slice(-6)}`;
      const fazOrigem     = todasFazendas.find(f => f.id === fazendaOrigemId);
      const fazDestino    = todasFazendas.find(f => f.id === fazendaDestinoId);
      const ieDiferentes  = fazOrigem?.estado !== fazDestino?.estado;
      const cfop          = ieDiferentes ? "6409" : "5409";
      const itensParsed   = itens.map(it => ({ insumo_id: it.insumo_id, quantidade: parseFloat(it.quantidade.replace(",", ".")), unidade_medida: it.unidade_medida }));

      const res  = await fetch("/api/campo/transferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferencia: { numero, fazenda_origem_id: fazendaOrigemId, deposito_origem_id: depositoOrigemId, fazenda_destino_id: fazendaDestinoId, deposito_destino_id: depositoDestinoId, cfop, ie_diferentes: ieDiferentes, entrada_automatica: true, status: "solicitada", data_transferencia: dataTransf, observacao: observacao || null, solicitante_nome: nomeUsuario ?? "App Campo", via_app: true, urgencia },
          itens: itensParsed,
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Erro ao salvar solicitação");
      setSucesso(true);
    } catch (e) { setErro(String(e)); }
    setEnviando(false);
  }

  async function enviarSolicitacaoMaquinas() {
    if (!fMaqOrigem || !fMaqDestino) { setErro("Selecione fazenda de origem e destino."); return; }
    if (!maquinaId)                  { setErro("Selecione a máquina."); return; }
    if (!motivoTransf.trim())        { setErro("Informe o motivo da transferência."); return; }
    if (fMaqOrigem === fMaqDestino)  { setErro("Origem e destino não podem ser iguais."); return; }

    setEnviando(true); setErro(null);
    try {
      const numero = `STM-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from("solicitacoes_transferencia_maquinas").insert({
        numero,
        fazenda_origem_id:  fMaqOrigem,
        fazenda_destino_id: fMaqDestino,
        maquina_id:         maquinaId,
        status:             "pendente",
        motivo:             motivoTransf.trim(),
        data_solicitacao:   new Date().toISOString().split("T")[0],
        data_necessidade:   dataNecessidade || null,
        solicitante_nome:   nomeUsuario ?? "App Campo",
        urgencia:           urgenciaMaq,
        observacao:         obsMaq.trim() || null,
        via_app:            true,
      });
      if (error) throw new Error(error.message);
      setSucesso(true);
    } catch (e) { setErro(String(e)); }
    setEnviando(false);
  }

  function novaSolicitacao() {
    setSucesso(false); setErro(null);
    setFazendaOrigemId(fazendaId ?? ""); setDepositoOrigemId(""); setFazendaDestinoId(""); setDepositoDestinoId("");
    setUrgencia("programado"); setDataTransf(new Date().toISOString().slice(0, 10)); setObservacao("");
    setItens([{ insumo_id: "", insumo_nome: "", quantidade: "", unidade_medida: "kg" }]);
    setFMaqOrigem(fazendaId ?? ""); setFMaqDestino(""); setMaquinaId(""); setMotivoTransf(""); setDataNecessidade(""); setUrgenciaMaq("programado"); setObsMaq("");
  }

  if (sucesso) return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px", textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Solicitação enviada!</h2>
      <p style={{ fontSize: 14, color: "#555", marginBottom: 28 }}>
        {aba === "insumos"
          ? "Sua solicitação foi registrada e aparecerá como pendente no painel do Arato. A NF de transferência será emitida pelo escritório."
          : "Solicitação de movimentação de máquina registrada. O responsável receberá notificação para aprovar."}
      </p>
      <button onClick={novaSolicitacao} style={btnPrimary}>Nova Solicitação</button>
      <div style={{ marginTop: 12 }}>
        <a href="/campo" style={{ fontSize: 13, color: "#1A4870" }}>← Voltar ao App Campo</a>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 14px", fontFamily: "system-ui, sans-serif" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <a href="/campo" style={{ fontSize: 20, textDecoration: "none" }}>←</a>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#1a1a1a" }}>Solicitação de Transferência</h1>
          <p style={{ fontSize: 12, color: "#888", margin: "2px 0 0" }}>{nomeFazendaSelecionada}</p>
        </div>
      </div>

      {/* Toggle de aba */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        {(["insumos", "maquinas"] as const).map(a => (
          <button key={a} onClick={() => { setAba(a); setErro(null); }}
            style={{ padding: "12px", border: aba === a ? "2px solid #1A4870" : "0.5px solid #DDE2EE", borderRadius: 10, background: aba === a ? "#EFF4FA" : "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, color: aba === a ? "#1A4870" : "#555" }}>
            {a === "insumos" ? "📦 Insumos" : "🚜 Máquinas"}
          </button>
        ))}
      </div>

      {/* ══ ABA INSUMOS ══ */}
      {aba === "insumos" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {(["programado", "urgente"] as const).map(u => (
              <button key={u} onClick={() => setUrgencia(u)}
                style={{ padding: "12px", border: urgencia === u ? "2px solid" : "0.5px solid #DDE2EE", borderColor: urgencia === u ? (u === "urgente" ? "#E24B4A" : "#16A34A") : "#DDE2EE", borderRadius: 10, background: urgencia === u ? (u === "urgente" ? "#FEF2F2" : "#F0FDF4") : "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, color: urgencia === u ? (u === "urgente" ? "#E24B4A" : "#16A34A") : "#555" }}>
                {u === "urgente" ? "🔴 Urgente" : "🟢 Programado"}
              </button>
            ))}
          </div>

          <div style={card}>
            <label style={lbl}>Data de Transferência</label>
            <input type="date" value={dataTransf} onChange={e => setDataTransf(e.target.value)} style={inp} />
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>📦 Origem</div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Fazenda de Origem</label>
              <select value={fazendaOrigemId} onChange={e => { setFazendaOrigemId(e.target.value); setDepositoOrigemId(""); }} style={inp}>
                <option value="">— Selecione —</option>
                {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Depósito de Origem *</label>
              {fazendaOrigemId && depositosOrigem.length === 0
                ? <div style={{ background: "#FFF1F1", border: "0.5px solid #E24B4A", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#B91C1C" }}>⚠️ Sem depósito cadastrado para esta fazenda.</div>
                : <select value={depositoOrigemId} onChange={e => setDepositoOrigemId(e.target.value)} style={inp} disabled={!fazendaOrigemId}>
                    <option value="">— Selecione o depósito —</option>
                    {depositosOrigem.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#C9921B", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>🏠 Destino</div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Fazenda de Destino</label>
              <select value={fazendaDestinoId} onChange={e => { setFazendaDestinoId(e.target.value); setDepositoDestinoId(""); }} style={inp}>
                <option value="">— Selecione —</option>
                {todasFazendas.filter(f => f.id !== fazendaOrigemId).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Depósito de Destino *</label>
              {fazendaDestinoId && depositosDestino.length === 0
                ? <div style={{ background: "#FFF1F1", border: "0.5px solid #E24B4A", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#B91C1C" }}>⚠️ Sem depósito cadastrado para a fazenda destino.</div>
                : <select value={depositoDestinoId} onChange={e => setDepositoDestinoId(e.target.value)} style={inp} disabled={!fazendaDestinoId}>
                    <option value="">— Selecione o depósito —</option>
                    {depositosDestino.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>}
            </div>
          </div>

          <div style={{ ...card, padding: "16px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Itens a Transferir</span>
              <button onClick={addItem} style={{ padding: "6px 14px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>+ Adicionar</button>
            </div>
            {itens.map((it, i) => (
              <div key={i} style={{ border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "12px 14px", marginBottom: 10, background: "#FAFBFC" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#888" }}>Item {i + 1}</span>
                  {itens.length > 1 && <button onClick={() => removeItem(i)} style={{ padding: "3px 10px", background: "#FEF2F2", color: "#E24B4A", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Remover</button>}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={lbl}>Insumo</label>
                  {carregando
                    ? <div style={{ ...inp, color: "#888", background: "#F4F6FA" }}>Carregando…</div>
                    : <select value={it.insumo_id} onChange={e => updateItem(i, "insumo_id", e.target.value)} style={inp}>
                        <option value="">— Selecione o insumo —</option>
                        {insumosOrigem.map(ins => <option key={ins.id} value={ins.id}>{ins.nome} {ins.estoque != null ? `(${ins.estoque.toFixed(2)} ${ins.unidade ?? ""})` : ""}</option>)}
                      </select>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                  <div>
                    <label style={lbl}>Quantidade</label>
                    <input type="text" inputMode="decimal" placeholder="0,000" value={it.quantidade} onChange={e => updateItem(i, "quantidade", e.target.value)} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Unidade</label>
                    <input type="text" value={it.unidade_medida} onChange={e => updateItem(i, "unidade_medida", e.target.value)} style={inp} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={card}>
            <label style={lbl}>Observação (opcional)</label>
            <input type="text" placeholder="Motivo, referência…" value={observacao} onChange={e => setObservacao(e.target.value)} style={inp} />
          </div>

          {erro && <div style={{ background: "#FFF1F1", border: "0.5px solid #E24B4A", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 14, color: "#B91C1C" }}>{erro}</div>}

          <button onClick={enviarSolicitacaoInsumos} disabled={enviando} style={{ ...btnPrimary, marginBottom: 12 }}>
            {enviando ? "Enviando…" : "📤 Enviar Solicitação de Transferência"}
          </button>
        </>
      )}

      {/* ══ ABA MÁQUINAS ══ */}
      {aba === "maquinas" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {(["programado", "urgente"] as const).map(u => (
              <button key={u} onClick={() => setUrgenciaMaq(u)}
                style={{ padding: "12px", border: urgenciaMaq === u ? "2px solid" : "0.5px solid #DDE2EE", borderColor: urgenciaMaq === u ? (u === "urgente" ? "#E24B4A" : "#16A34A") : "#DDE2EE", borderRadius: 10, background: urgenciaMaq === u ? (u === "urgente" ? "#FEF2F2" : "#F0FDF4") : "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14, color: urgenciaMaq === u ? (u === "urgente" ? "#E24B4A" : "#16A34A") : "#555" }}>
                {u === "urgente" ? "🔴 Urgente" : "🟢 Programado"}
              </button>
            ))}
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1A4870", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>🚜 Máquina</div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Fazenda de Origem (onde está a máquina)</label>
              <select value={fMaqOrigem} onChange={e => { setFMaqOrigem(e.target.value); setMaquinaId(""); }} style={inp}>
                <option value="">— Selecione —</option>
                {todasFazendas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Máquina / Equipamento *</label>
              {fMaqOrigem && maquinasOrigem.length === 0
                ? <div style={{ background: "#FFF1F1", border: "0.5px solid #E24B4A", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#B91C1C" }}>⚠️ Sem máquinas cadastradas para esta fazenda.</div>
                : <select value={maquinaId} onChange={e => setMaquinaId(e.target.value)} style={inp} disabled={!fMaqOrigem}>
                    <option value="">— Selecione —</option>
                    {maquinasOrigem.map(m => <option key={m.id} value={m.id}>{m.patrimonio ? `[${m.patrimonio}] ` : ""}{m.nome} ({m.tipo})</option>)}
                  </select>}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#C9921B", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>📍 Destino</div>
            <label style={lbl}>Fazenda de Destino *</label>
            <select value={fMaqDestino} onChange={e => setFMaqDestino(e.target.value)} style={inp}>
              <option value="">— Selecione —</option>
              {todasFazendas.filter(f => f.id !== fMaqOrigem).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </div>

          <div style={card}>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Motivo da Transferência *</label>
              <input type="text" placeholder="Ex: Início do plantio da soja, colheita antecipada…" value={motivoTransf} onChange={e => setMotivoTransf(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Data de necessidade</label>
              <input type="date" value={dataNecessidade} onChange={e => setDataNecessidade(e.target.value)} style={inp} />
            </div>
          </div>

          <div style={card}>
            <label style={lbl}>Observações (opcional)</label>
            <input type="text" placeholder="Informações adicionais, referência operação…" value={obsMaq} onChange={e => setObsMaq(e.target.value)} style={inp} />
          </div>

          {erro && <div style={{ background: "#FFF1F1", border: "0.5px solid #E24B4A", borderRadius: 10, padding: "12px 16px", marginBottom: 14, fontSize: 14, color: "#B91C1C" }}>{erro}</div>}

          <button onClick={enviarSolicitacaoMaquinas} disabled={enviando} style={{ ...btnPrimary, marginBottom: 12 }}>
            {enviando ? "Enviando…" : "🚜 Solicitar Transferência de Máquina"}
          </button>
        </>
      )}

      <a href="/campo" style={{ ...btnSecondary, display: "block", textAlign: "center", textDecoration: "none" }}>
        Cancelar
      </a>
      <p style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 16 }}>
        Sua solicitação ficará pendente no painel do Arato até ser aprovada pelo responsável.
      </p>
    </div>
  );
}
