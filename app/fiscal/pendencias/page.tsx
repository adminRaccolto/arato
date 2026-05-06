"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { consultarNfePorChave, salvarXmlStorage } from "../../../lib/sefaz-consulta";

type Pendencia = {
  id: string;
  fazenda_id: string;
  lancamento_id: string | null;
  movimentacao_id: string | null;
  tipo: string;
  status: "aguardando" | "recebida" | "dispensada";
  descricao: string;
  valor: number | null;
  data_operacao: string;
  fornecedor_nome: string | null;
  chave_acesso: string | null;
  xml_storage_path: string | null;
  origem: string;
  observacoes: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; cor: string; bg: string }> = {
  aguardando:  { label: "Aguardando NF",  cor: "#9D4900", bg: "#FFF4E5" },
  recebida:    { label: "NF Recebida",    cor: "#166534", bg: "#DCFCE7" },
  dispensada:  { label: "Dispensada",     cor: "#555",    bg: "#F3F4F6" },
};

const TIPO_LABEL: Record<string, string> = {
  abastecimento:     "Abastecimento",
  entrada_estoque:   "Entrada em Estoque",
  operacao_lavoura:  "Operação de Lavoura",
  saida_estoque:     "Saída de Estoque",
  lancamento_cp:     "Conta a Pagar",
  outro:             "Outro",
};

export default function PendenciasFiscaisPage() {
  const { fazendaId } = useAuth();

  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<string>("aguardando");
  const [filtroTipo,   setFiltroTipo]   = useState<string>("");
  const [busca,        setBusca]        = useState("");

  // Modal de anexar NF
  const [modal,       setModal]       = useState<Pendencia | null>(null);
  const [modoAnexo,   setModoAnexo]   = useState<"chave" | "foto">("chave");
  const [chaveInput,  setChaveInput]  = useState("");
  const [fotoBase64,  setFotoBase64]  = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [msgResultado,setMsgResultado]= useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    let q = supabase.from("pendencias_fiscais")
      .select("*")
      .eq("fazenda_id", fazendaId)
      .order("data_operacao", { ascending: false });
    if (filtroStatus) q = q.eq("status", filtroStatus);
    if (filtroTipo)   q = q.eq("tipo", filtroTipo);
    const { data } = await q;
    setPendencias((data as Pendencia[]) ?? []);
    setLoading(false);
  }, [fazendaId, filtroStatus, filtroTipo]);

  useEffect(() => { carregar(); }, [carregar]);

  const pendenciasFiltradas = pendencias.filter(p =>
    !busca || p.descricao?.toLowerCase().includes(busca.toLowerCase()) ||
    p.fornecedor_nome?.toLowerCase().includes(busca.toLowerCase())
  );

  // ── Contadores ──────────────────────────────────────────────────────────────
  const contadores = pendencias.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ── Abrir modal ─────────────────────────────────────────────────────────────
  function abrirModal(p: Pendencia) {
    setModal(p);
    setModoAnexo("chave");
    setChaveInput(p.chave_acesso ?? "");
    setFotoBase64(null);
    setMsgResultado(null);
  }

  function fecharModal() {
    setModal(null);
    setConsultando(false);
    setMsgResultado(null);
  }

  // ── Upload de foto ──────────────────────────────────────────────────────────
  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      setFotoBase64(base64);
    };
    reader.readAsDataURL(file);
  }

  // ── Consultar NF-e por chave ─────────────────────────────────────────────
  async function consultarPorChave() {
    if (!modal || !fazendaId) return;
    const chave = chaveInput.replace(/\D/g, "");
    if (chave.length !== 44) {
      setMsgResultado({ ok: false, texto: "Chave de acesso deve ter 44 dígitos." });
      return;
    }
    setConsultando(true);
    setMsgResultado(null);
    try {
      const resultado = await fetch("/api/fiscal/consultar-nfe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chaveAcesso: chave, fazendaId, pendenciaId: modal.id }),
      });
      const json = await resultado.json() as { ok: boolean; erro?: string; fornecedor?: string; valor?: number };
      if (json.ok) {
        setMsgResultado({ ok: true, texto: `✅ NF-e recebida com sucesso! Fornecedor: ${json.fornecedor ?? "—"} · Valor: ${json.valor ? `R$ ${json.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}` });
        await carregar();
      } else {
        setMsgResultado({ ok: false, texto: json.erro ?? "Erro ao consultar SEFAZ." });
      }
    } catch {
      setMsgResultado({ ok: false, texto: "Erro de conexão." });
    }
    setConsultando(false);
  }

  // ── Consultar por foto (Claude Vision) ──────────────────────────────────
  async function consultarPorFoto() {
    if (!modal || !fotoBase64 || !fazendaId) return;
    setConsultando(true);
    setMsgResultado(null);
    try {
      const resultado = await fetch("/api/fiscal/consultar-nfe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fotoBase64, fazendaId, pendenciaId: modal.id }),
      });
      const json = await resultado.json() as { ok: boolean; erro?: string; fornecedor?: string; valor?: number; chaveEncontrada?: string };
      if (json.ok) {
        setMsgResultado({ ok: true, texto: `✅ NF-e lida e recebida! Fornecedor: ${json.fornecedor ?? "—"} · Chave: ${json.chaveEncontrada ? json.chaveEncontrada.substring(0, 12) + "…" : "—"}` });
        await carregar();
      } else {
        setMsgResultado({ ok: false, texto: json.erro ?? "Não foi possível ler a nota na foto." });
      }
    } catch {
      setMsgResultado({ ok: false, texto: "Erro de conexão." });
    }
    setConsultando(false);
  }

  // ── Dispensar pendência ──────────────────────────────────────────────────
  async function dispensar(id: string, obs: string) {
    await supabase.from("pendencias_fiscais")
      .update({ status: "dispensada", observacoes: obs })
      .eq("id", id);
    fecharModal();
    await carregar();
  }

  const totalAguardando = contadores["aguardando"] ?? 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "28px 32px", background: "#F4F6FA", minHeight: "100vh" }}>

      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Pendências Fiscais</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#666" }}>
            Consumos registrados sem documento fiscal — WhatsApp IA ou lançamentos manuais
          </p>
        </div>
        {totalAguardando > 0 && (
          <div style={{ background: "#FFF4E5", border: "0.5px solid #EFB672", borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#9D4900" }}>{totalAguardando}</div>
            <div style={{ fontSize: 11, color: "#9D4900" }}>aguardando NF</div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {(["", "aguardando", "recebida", "dispensada"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFiltroStatus(s)}
            style={{
              padding: "5px 14px", borderRadius: 20, border: "0.5px solid",
              fontSize: 12, cursor: "pointer", fontWeight: filtroStatus === s ? 600 : 400,
              borderColor: filtroStatus === s ? "#1A4870" : "#D4DCE8",
              background: filtroStatus === s ? "#1A4870" : "#fff",
              color: filtroStatus === s ? "#fff" : "#444",
            }}
          >
            {s === "" ? `Todos (${pendencias.length})` : `${STATUS_LABEL[s]?.label} (${contadores[s] ?? 0})`}
          </button>
        ))}
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          style={{ padding: "5px 10px", borderRadius: 8, border: "0.5px solid #D4DCE8", fontSize: 12, background: "#fff", color: "#444" }}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          placeholder="Buscar por descrição ou fornecedor..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{ padding: "5px 12px", borderRadius: 8, border: "0.5px solid #D4DCE8", fontSize: 12, background: "#fff", minWidth: 240 }}
        />
      </div>

      {/* Tabela */}
      <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>Carregando...</div>
        ) : pendenciasFiltradas.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
            {filtroStatus === "aguardando" ? "Nenhuma pendência fiscal no momento." : "Nenhum registro encontrado."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFB", borderBottom: "0.5px solid #DDE2EE" }}>
                {["Data", "Tipo", "Descrição", "Fornecedor", "Valor", "Origem", "Status", ""].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pendenciasFiltradas.map((p, idx) => {
                const st = STATUS_LABEL[p.status];
                return (
                  <tr key={p.id} style={{ borderBottom: "0.5px solid #EEF1F6", background: idx % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#444", whiteSpace: "nowrap" }}>
                      {new Date(p.data_operacao + "T12:00").toLocaleDateString("pt-BR")}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#555" }}>
                      {TIPO_LABEL[p.tipo] ?? p.tipo}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#1a1a1a", maxWidth: 260 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.descricao}</div>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#555" }}>
                      {p.fornecedor_nome ?? "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#1a1a1a", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {p.valor != null ? `R$ ${p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>
                      <span style={{
                        padding: "3px 8px", borderRadius: 20, fontWeight: 500,
                        background: p.origem === "whatsapp" ? "#EEF5FF" : "#F3F6F9",
                        color: p.origem === "whatsapp" ? "#1A4870" : "#555",
                        border: "0.5px solid",
                        borderColor: p.origem === "whatsapp" ? "#B8D0EE" : "#D4DCE8",
                      }}>
                        {p.origem === "whatsapp" ? "WhatsApp" : p.origem === "manual" ? "Manual" : p.origem}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        padding: "3px 8px", borderRadius: 20, fontSize: 12, fontWeight: 500,
                        background: st?.bg ?? "#F3F4F6", color: st?.cor ?? "#555",
                        border: "0.5px solid", borderColor: st?.cor ?? "#ccc",
                      }}>
                        {st?.label ?? p.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {p.status === "aguardando" && (
                        <button
                          onClick={() => abrirModal(p)}
                          style={{
                            padding: "5px 12px", borderRadius: 8, border: "0.5px solid #C9921B",
                            background: "#FBF3E0", color: "#9D4900", fontSize: 12, cursor: "pointer", fontWeight: 600,
                          }}
                        >
                          Anexar NF
                        </button>
                      )}
                      {p.status === "recebida" && p.xml_storage_path && (
                        <span style={{ fontSize: 12, color: "#166534" }}>XML salvo</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de Anexar NF */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, boxShadow: "0 12px 40px rgba(0,0,0,0.20)" }}>
            {/* Header modal */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "0.5px solid #EEF1F6" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>Anexar Nota Fiscal</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{modal.descricao}</div>
              </div>
              <button onClick={fecharModal} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#888", lineHeight: 1 }}>×</button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Info da pendência */}
              <div style={{ background: "#F8FAFB", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px" }}>
                  <div><span style={{ color: "#888" }}>Data: </span><span style={{ color: "#333", fontWeight: 500 }}>{new Date(modal.data_operacao + "T12:00").toLocaleDateString("pt-BR")}</span></div>
                  <div><span style={{ color: "#888" }}>Tipo: </span><span style={{ color: "#333", fontWeight: 500 }}>{TIPO_LABEL[modal.tipo] ?? modal.tipo}</span></div>
                  {modal.valor != null && <div><span style={{ color: "#888" }}>Valor: </span><span style={{ color: "#333", fontWeight: 500 }}>R$ {modal.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span></div>}
                  {modal.fornecedor_nome && <div><span style={{ color: "#888" }}>Fornecedor: </span><span style={{ color: "#333", fontWeight: 500 }}>{modal.fornecedor_nome}</span></div>}
                </div>
              </div>

              {/* Abas de modo */}
              <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                {(["chave", "foto"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setModoAnexo(m); setMsgResultado(null); }}
                    style={{
                      padding: "7px 16px", borderRadius: 8, border: "0.5px solid",
                      fontSize: 13, cursor: "pointer", fontWeight: modoAnexo === m ? 600 : 400,
                      borderColor: modoAnexo === m ? "#1A4870" : "#D4DCE8",
                      background: modoAnexo === m ? "#D5E8F5" : "#fff",
                      color: modoAnexo === m ? "#0B2D50" : "#555",
                    }}
                  >
                    {m === "chave" ? "🔑 Chave de Acesso" : "📷 Foto da Nota"}
                  </button>
                ))}
              </div>

              {/* Modo: chave de acesso */}
              {modoAnexo === "chave" && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
                    Chave de Acesso NF-e (44 dígitos)
                  </label>
                  <input
                    value={chaveInput}
                    onChange={e => setChaveInput(e.target.value.replace(/\D/g, "").substring(0, 44))}
                    placeholder="Digite ou cole os 44 dígitos da chave..."
                    style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "0.5px solid #D4DCE8", fontSize: 13, boxSizing: "border-box", fontFamily: "monospace" }}
                  />
                  <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                    {chaveInput.length}/44 dígitos — a chave está impressa abaixo do código de barras da DANFE
                  </div>
                  <button
                    onClick={consultarPorChave}
                    disabled={consultando || chaveInput.replace(/\D/g, "").length !== 44}
                    style={{
                      marginTop: 14, width: "100%", padding: "10px", borderRadius: 8,
                      border: "none", cursor: consultando ? "wait" : "pointer",
                      background: consultando ? "#aaa" : "#1A4870", color: "#fff",
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {consultando ? "Consultando SEFAZ..." : "Consultar e Baixar XML"}
                  </button>
                </div>
              )}

              {/* Modo: foto */}
              {modoAnexo === "foto" && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 6 }}>
                    Foto da Nota Fiscal ou DANFE
                  </label>
                  <div style={{ border: "1.5px dashed #D4DCE8", borderRadius: 10, padding: "24px", textAlign: "center", background: "#FAFBFC" }}>
                    {fotoBase64 ? (
                      <div>
                        <div style={{ fontSize: 13, color: "#166534", fontWeight: 600, marginBottom: 8 }}>✅ Foto carregada</div>
                        <button onClick={() => setFotoBase64(null)} style={{ fontSize: 12, color: "#888", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Trocar foto</button>
                      </div>
                    ) : (
                      <label style={{ cursor: "pointer" }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                        <div style={{ fontSize: 13, color: "#666" }}>Clique para selecionar uma foto</div>
                        <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>JPG ou PNG — a IA Claude extrai a chave automaticamente</div>
                        <input type="file" accept="image/*" onChange={handleFoto} style={{ display: "none" }} />
                      </label>
                    )}
                  </div>
                  <button
                    onClick={consultarPorFoto}
                    disabled={consultando || !fotoBase64}
                    style={{
                      marginTop: 14, width: "100%", padding: "10px", borderRadius: 8,
                      border: "none", cursor: consultando || !fotoBase64 ? "not-allowed" : "pointer",
                      background: consultando || !fotoBase64 ? "#aaa" : "#1A4870", color: "#fff",
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {consultando ? "Lendo com IA..." : "Ler Nota e Consultar SEFAZ"}
                  </button>
                </div>
              )}

              {/* Resultado */}
              {msgResultado && (
                <div style={{
                  marginTop: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
                  background: msgResultado.ok ? "#DCFCE7" : "#FEE2E2",
                  color: msgResultado.ok ? "#166534" : "#991B1B",
                  border: `0.5px solid ${msgResultado.ok ? "#86EFAC" : "#FCA5A5"}`,
                }}>
                  {msgResultado.texto}
                </div>
              )}

              {/* Rodapé */}
              <div style={{ display: "flex", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "0.5px solid #EEF1F6" }}>
                <button
                  onClick={fecharModal}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "0.5px solid #D4DCE8", background: "#fff", fontSize: 13, cursor: "pointer", color: "#555" }}
                >
                  Fechar
                </button>
                <button
                  onClick={async () => {
                    const obs = prompt("Motivo da dispensa (opcional):");
                    await dispensar(modal.id, obs ?? "Dispensado pelo usuário");
                  }}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "0.5px solid #D4DCE8", background: "#F8FAFB", fontSize: 13, cursor: "pointer", color: "#666" }}
                >
                  Dispensar Pendência
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
