"use client";
// Devolução de compra recusada pelo fornecedor (Painel de Notas → Nota de Devolução → "Recusada pelo fornecedor").
// Até 24 h da autorização: oferece cancelar a NF-e (o cancelamento já desfaz estoque e financeiro). Depois disso — ou se a
// mercadoria saiu e voltou — emite a NF-e de ENTRADA do retorno (mesmos itens, valores, desconto e ICMS, referenciando a
// chave da devolução) e desfaz a devolução no Arato. Servidor: app/api/fiscal/devolucao-recusada/route.ts.
import { useEffect, useState } from "react";
import type { NotaFiscal } from "../../lib/supabase";
import { confirmarAcao } from "../ConfirmarAcao";

type Previa = {
  ok: boolean; error?: string;
  nota?: { numero: string; serie: string; destinatario: string; cfop: string; valor_total: number };
  autorizada_em?: string | null; prazo?: { dentro: boolean; limite: string | null };
  cfop_sugerido?: string;
  itens?: { descricao: string; unidade: string; quantidade: number; valor_produto: number; valor_desconto: number; cst: string | null }[];
  total?: number; bloqueio?: string | null;
  recusa?: { status: string; motivo?: string; ultimo_erro?: string; retorno?: { numero: string; serie: string; chave: string } } | null;
};

const fmtR = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDH = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtCfop = (c: string) => { const d = c.replace(/\D/g, ""); return d.length === 4 ? `${d[0]}.${d.slice(1)}` : c; };

const lbl: React.CSSProperties = { fontSize: 11, color: "#555", display: "block", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13, boxSizing: "border-box", fontFamily: "inherit", background: "var(--bg-card, #fff)", color: "var(--text-1, #1a1a1a)" };
const btn = (cor: "azul" | "mostarda" | "neutro"): React.CSSProperties => ({
  padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
  ...(cor === "azul" ? { background: "#1A4870", color: "#fff", border: "none" }
    : cor === "mostarda" ? { background: "#FBF3E0", color: "#7A5A12", border: "0.5px solid #C9921B" }
    : { background: "transparent", color: "#555", border: "0.5px solid #DDE2EE" }),
});

export default function ModalRecusaDevolucao({ nota, onFechar, onCancelarNfe, onConcluido }: {
  nota: NotaFiscal;
  onFechar: () => void;
  /** Abre o cancelamento da NF-e (dentro do prazo de 24 h) */
  onCancelarNfe: (n: NotaFiscal) => void;
  onConcluido: () => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [mostrarEntrada, setMostrarEntrada] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [cfop, setCfop] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [concluida, setConcluida] = useState<{ numero: string; serie: string; chave: string } | null>(null);
  const [retomar, setRetomar] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/fiscal/devolucao-recusada?nota_id=${nota.id}`, { cache: "no-store" })
      .then(r => r.json() as Promise<Previa>)
      .then(p => {
        if (!vivo) return;
        setPrevia(p);
        setCfop(fmtCfop(p.cfop_sugerido ?? ""));
        if (p.recusa?.motivo) setMotivo(p.recusa.motivo);
        if (p.recusa?.status === "registrada" && p.recusa.retorno) setConcluida(p.recusa.retorno);
        // Emissão já iniciada/autorizada numa tentativa anterior: só concluir
        if (p.recusa?.status === "emitindo" || p.recusa?.status === "emitida") { setMostrarEntrada(true); setRetomar(true); }
        if (p.recusa?.status === "rejeitada" && p.recusa.ultimo_erro) setErro(`Tentativa anterior recusada — ${p.recusa.ultimo_erro}`);
        if (p.prazo && !p.prazo.dentro) setMostrarEntrada(true);
      })
      .catch(() => { if (vivo) setPrevia({ ok: false, error: "Sem conexão com o servidor." }); });
    return () => { vivo = false; };
  }, [nota.id]);

  async function registrar() {
    setErro(""); setAviso("");
    if (!retomar) {
      if (motivo.trim().length < 10) { setErro("Descreva o motivo da recusa (mínimo 10 caracteres)."); return; }
      if (!(await confirmarAcao({
        titulo: "Emitir a NF-e de entrada do retorno?",
        mensagem: `Será emitida e transmitida à SEFAZ uma NF-e de entrada (CFOP ${cfop}) referenciando a devolução ${nota.numero}, com os mesmos itens e valores. A mercadoria volta ao estoque e os títulos da compra voltam como estavam.`,
        perigo: false,
      }))) return;
    }
    setEnviando(true);
    try {
      const r = await fetch("/api/fiscal/devolucao-recusada", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota_id: nota.id, motivo: motivo.trim(), cfop }),
      });
      const j = await r.json().catch(() => ({})) as { ok?: boolean; pendente?: boolean; emitida?: boolean; error?: string; recusa?: { retorno?: { numero: string; serie: string; chave: string } } };
      if (j.ok && j.recusa?.retorno) { setConcluida(j.recusa.retorno); onConcluido(); return; }
      if (j.pendente) { setAviso(j.error ?? "Emissão pendente na SEFAZ."); setRetomar(true); return; }
      if (j.emitida) { setErro(j.error ?? "Ajuste pendente."); setRetomar(true); onConcluido(); return; }
      setErro(j.error ?? "Não foi possível registrar a recusa.");
      setRetomar(false);
    } catch {
      setErro("Sem conexão: não foi possível confirmar. Clique de novo para conferir — não será emitida outra nota.");
      setRetomar(true);
    } finally { setEnviando(false); }
  }

  const p = previa;
  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}>
      <div data-arato-dialog="page" role="dialog" aria-modal="true" style={{ background: "var(--bg-card, #fff)", borderRadius: 14, padding: 24, width: 760, maxWidth: "100%", maxHeight: "94vh", overflowY: "auto", fontSize: 13, color: "var(--text-1, #1a1a1a)" }}>
        <div style={{ fontWeight: 600, fontSize: 16 }}>Devolução recusada pelo fornecedor</div>
        <div style={{ fontSize: 12, color: "#555", marginTop: 2, marginBottom: 16 }}>
          NF-e de devolução {nota.numero}/{nota.serie} · {nota.destinatario} · {fmtR(nota.valor_total)}
        </div>

        {!p && <div style={{ padding: 24, textAlign: "center", color: "#666" }}>Carregando a devolução…</div>}
        {p && !p.ok && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 12px", color: "#791F1F" }}>{p.error}</div>}

        {p?.ok && concluida && (
          <div style={{ background: "#E8F5E9", border: "0.5px solid #A5D6A7", borderRadius: 10, padding: "14px 16px", lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, color: "#1A6B3C" }}>Recusa registrada</div>
            <div>NF-e de entrada <strong>{concluida.numero}/{concluida.serie}</strong> autorizada. A mercadoria voltou ao estoque, os títulos da compra voltaram como estavam e a NF do fornecedor está livre para uma devolução nova (Notas de Fornecedores → Devolver).</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" style={btn("neutro")} onClick={() => window.open(`/api/fiscal/danfe?chave=${concluida.chave}&fazenda_id=${nota.fazenda_id}`, "_blank")}>🖨 DANFE da entrada</button>
            </div>
          </div>
        )}

        {p?.ok && !concluida && (
          <>
            {/* Itens da devolução */}
            {!!p.itens?.length && (
              <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 10, overflow: "hidden", marginBottom: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: "var(--bg-page, #F4F6FA)" }}>
                    {["Item", "Qtd.", "Valor cheio", "Desconto", "Líquido"].map((h, i) => <th key={h} style={{ padding: "7px 10px", textAlign: i ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {p.itens.map((i, k) => (
                      <tr key={k} style={{ borderTop: "0.5px solid #EEF1F6" }}>
                        <td style={{ padding: "7px 10px" }}>{i.descricao}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{i.quantidade.toLocaleString("pt-BR")} {i.unidade}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{fmtR(i.valor_produto)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>{i.valor_desconto ? fmtR(i.valor_desconto) : "—"}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{fmtR(i.valor_produto - i.valor_desconto)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "0.5px solid #DDE2EE" }}>
                      <td colSpan={4} style={{ padding: "7px 10px", textAlign: "right", color: "#555" }}>Total</td>
                      <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>{fmtR(p.total ?? 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {p.bloqueio && (
              <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 12px", color: "#791F1F", marginBottom: 14 }}>{p.bloqueio}</div>
            )}

            {/* Dentro do prazo: o caminho é cancelar */}
            {!p.bloqueio && p.prazo?.dentro && !retomar && (
              <div style={{ background: "#E6F1FB", border: "0.5px solid #B5D4F4", borderRadius: 10, padding: "12px 14px", marginBottom: 14, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, color: "#0B2D50" }}>Ainda dá para cancelar esta NF-e</div>
                <div style={{ color: "#0B2D50" }}>
                  O prazo de cancelamento vai até <strong>{p.prazo.limite ? fmtDH(p.prazo.limite) : "—"}</strong>. Se a mercadoria <strong>não saiu</strong> da
                  fazenda, cancele a NF-e: o Arato desfaz o estoque e o financeiro da devolução sozinho, e a NF do fornecedor fica livre para uma devolução nova.
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button type="button" style={btn("azul")} onClick={() => onCancelarNfe(nota)}>Cancelar a NF-e de devolução</button>
                  {!mostrarEntrada && <button type="button" style={btn("neutro")} onClick={() => setMostrarEntrada(true)}>A mercadoria saiu e voltou — emitir NF-e de entrada</button>}
                </div>
              </div>
            )}

            {/* Fora do prazo (ou mercadoria que circulou): NF-e de entrada do retorno */}
            {!p.bloqueio && mostrarEntrada && (
              <div style={{ border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "14px 16px" }}>
                {!p.prazo?.dentro && (
                  <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
                    O prazo de cancelamento terminou{p.prazo?.limite ? ` em ${fmtDH(p.prazo.limite)}` : ""}. A regularização é uma NF-e de entrada emitida pela fazenda, trazendo a mercadoria de volta.
                  </div>
                )}
                <ul style={{ margin: "0 0 12px", paddingLeft: 18, lineHeight: 1.6, fontSize: 12, color: "#1a1a1a" }}>
                  <li>NF-e de <strong>entrada</strong> referenciando a chave da devolução, com os mesmos itens, valores, desconto e ICMS.</li>
                  <li>A mercadoria volta ao estoque e os títulos da compra voltam como estavam (o título a receber da devolução sai).</li>
                  <li>A NF do fornecedor fica livre para uma devolução nova. As duas NF-e continuam no Painel de Notas.</li>
                </ul>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
                  <div>
                    <label style={lbl}>Motivo da recusa *</label>
                    <textarea value={motivo} disabled={retomar} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Ex.: fornecedor recusou o recebimento — produto já substituído na troca" style={{ ...inp, resize: "vertical" }} />
                  </div>
                  <div>
                    <label style={lbl}>CFOP da entrada *</label>
                    <input value={cfop} disabled={retomar} onChange={e => setCfop(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} style={inp} />
                    <div style={{ fontSize: 11, color: "#666", marginTop: 4, lineHeight: 1.4 }}>Sugerido: outra entrada não especificada. Confirme com o contador.</div>
                  </div>
                </div>
              </div>
            )}

            {aviso && <div style={{ background: "#FBF3E0", border: "0.5px solid #EF9F27", borderRadius: 8, padding: "10px 12px", color: "#7A4300", marginTop: 12 }}>{aviso}</div>}
            {erro && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 12px", color: "#791F1F", marginTop: 12 }}>{erro}</div>}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button type="button" style={btn("neutro")} onClick={onFechar}>{concluida ? "Fechar" : "Voltar"}</button>
          {p?.ok && !concluida && !p.bloqueio && mostrarEntrada && (
            <button type="button" disabled={enviando} style={{ ...btn("mostarda"), opacity: enviando ? 0.6 : 1, cursor: enviando ? "default" : "pointer" }} onClick={registrar}>
              {enviando ? "Transmitindo…" : retomar ? "Concluir o registro da recusa" : "Emitir NF-e de entrada e registrar recusa"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
