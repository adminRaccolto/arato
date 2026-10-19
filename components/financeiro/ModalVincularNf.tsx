"use client";
// Vincular Nota Fiscal à baixa do CP — restaurado da tela anterior de Contas a Pagar (a tela unificada
// de 01/10/2026 perdeu esta etapa). Ao baixar um título lançado à mão e sem NF, oferece vincular uma NF
// pendente (NF-e de entrada ou NFS-e) ou seguir "sem NF".
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type NfVinc = { id: string; tipo: "nf" | "nfse"; numero: string; serie?: string; emitente_nome?: string; data_emissao?: string; data_vencimento_cp?: string; valor_total: number; status?: string };

const fmtD = (s?: string | null) => { if (!s) return "—"; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };
const fmtM = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ModalVincularNf({ titulo, fazendaId, onCancelar, onSemNf, onVinculado }: {
  titulo: { id: string; descricao: string | null; valor: number | null };
  fazendaId: string;
  onCancelar: () => void;
  onSemNf: () => void;
  onVinculado: (numero: string) => void;
}) {
  const [lista, setLista] = useState<NfVinc[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<NfVinc | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from("nf_entradas").select("id,numero,serie,emitente_nome,valor_total,data_emissao,data_vencimento_cp,status")
        .eq("fazenda_id", fazendaId).in("status", ["pendente"]).order("data_emissao", { ascending: false }).limit(150),
      supabase.from("nf_servicos").select("id,numero_nf,prestador_nome,valor_liquido,data_prestacao,data_vencimento_cp,status")
        .eq("fazenda_id", fazendaId).in("status", ["pendente"]).order("data_prestacao", { ascending: false }).limit(50),
    ]).then(([{ data: nfs }, { data: svcs }]) => {
      if (!vivo) return;
      const l: NfVinc[] = [
        ...(nfs ?? []).map(n => ({ id: n.id as string, tipo: "nf" as const, numero: String(n.numero ?? ""), serie: n.serie as string | undefined, emitente_nome: n.emitente_nome as string | undefined, data_emissao: n.data_emissao as string | undefined, data_vencimento_cp: n.data_vencimento_cp as string | undefined, valor_total: Number(n.valor_total ?? 0), status: n.status as string | undefined })),
        ...(svcs ?? []).map(s => ({ id: s.id as string, tipo: "nfse" as const, numero: String(s.numero_nf ?? ""), emitente_nome: s.prestador_nome as string | undefined, data_emissao: s.data_prestacao as string | undefined, data_vencimento_cp: s.data_vencimento_cp as string | undefined, valor_total: Number(s.valor_liquido ?? 0), status: s.status as string | undefined })),
      ];
      l.sort((a, b) => (b.data_emissao ?? "").localeCompare(a.data_emissao ?? ""));
      setLista(l); setCarregando(false);
    }).catch(() => { if (vivo) { setErro("Não foi possível carregar as NFs."); setCarregando(false); } });
    return () => { vivo = false; };
  }, [fazendaId]);

  const b = busca.toLowerCase();
  const filtradas = lista.filter(nf => !b || nf.numero.includes(b) || (nf.emitente_nome ?? "").toLowerCase().includes(b) || nf.valor_total.toFixed(2).includes(b));

  async function vincular() {
    if (!sel) return;
    setSalvando(true); setErro("");
    const { data, error } = await supabase.from("lancamentos").update({ nfe_numero: sel.numero }).eq("id", titulo.id).select("id");
    setSalvando(false);
    if (error || !data?.length) { setErro(`Não foi possível vincular a NF${error ? `: ${error.message}` : " (sessão expirada — reconecte e tente novamente)"}.`); return; }
    onVinculado(sel.numero);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div role="dialog" aria-label="Vincular Nota Fiscal à Baixa" style={{ background: "#fff", borderRadius: 14, width: 680, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.4)", border: "0.5px solid #DDE2EE" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #DDE2EE", display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>Vincular Nota Fiscal à Baixa</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>{titulo.descricao} — {fmtM(titulo.valor ?? 0)}</div>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Fechar" style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666" }}>×</button>
        </div>
        <div style={{ padding: "12px 22px 8px" }}>
          <input autoFocus placeholder="Buscar por nº NF, emitente ou valor…" value={busca} onChange={e => setBusca(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 22px 8px" }}>
          {carregando ? <div style={{ textAlign: "center", padding: 24, color: "#666", fontSize: 13 }}>Carregando NFs…</div>
            : filtradas.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 16px", color: "#666", fontSize: 13 }}>
                {lista.length === 0 ? "Nenhuma NF pendente de processamento encontrada. Importe NFs pelo SIEG ou cadastre em Documentos Fiscais; ao processar, o financeiro é gerado automaticamente." : "Nenhuma NF corresponde à busca."}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ background: "#F4F6FA" }}>
                  {["Nº NF", "Emitente", "Emissão", "Vencimento", "Valor"].map((h, i) => <th key={h} style={{ padding: "7px 10px", textAlign: i === 4 ? "right" : i >= 2 ? "center" : "left", fontWeight: 600, color: "#555", borderBottom: "0.5px solid #DDE2EE" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {filtradas.map(nf => {
                    const s = sel?.id === nf.id;
                    return (
                      <tr key={nf.id} onClick={() => setSel(s ? null : nf)} style={{ cursor: "pointer", background: s ? "#E8E8E8" : "transparent", borderBottom: "0.5px solid #F0F2F7" }}>
                        <td style={{ padding: "8px 10px", fontWeight: 700 }}>
                          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, marginRight: 5, background: nf.tipo === "nfse" ? "#EDF2FB" : "#E8F5E9", color: nf.tipo === "nfse" ? "#1A3A6B" : "#1A6B3C" }}>{nf.tipo === "nfse" ? "NFS-e" : "NF-e"}</span>
                          {nf.numero}{nf.serie ? `/${nf.serie}` : ""}
                        </td>
                        <td style={{ padding: "8px 10px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nf.emitente_nome || "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: "#555" }}>{fmtD(nf.data_emissao)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: "#555" }}>{fmtD(nf.data_vencimento_cp)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{fmtM(nf.valor_total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
        <div style={{ padding: "12px 22px", borderTop: "0.5px solid #DDE2EE", display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {erro ? <span style={{ fontSize: 12, color: "#791F1F", marginRight: "auto" }}>{erro}</span>
            : sel ? <span style={{ fontSize: 12, background: "#E8E8E8", padding: "4px 12px", borderRadius: 8, fontWeight: 600, marginRight: "auto" }}>NF {sel.numero} selecionada</span> : null}
          <button type="button" onClick={onCancelar} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #CCC", background: "#F4F6FA", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button type="button" onClick={onSemNf} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #888", background: "transparent", color: "#555", cursor: "pointer", fontSize: 13 }}>Baixar sem NF</button>
          <button type="button" disabled={!sel || salvando} onClick={vincular}
            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: sel ? "#111111" : "#CCC", color: "#fff", cursor: sel ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700 }}>{salvando ? "Vinculando…" : "Vincular e Baixar"}</button>
        </div>
      </div>
    </div>
  );
}
