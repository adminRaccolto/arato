"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

// ─────────────────────────────────────────────────────────────
// Estilos base
// ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 20px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? new Date(s + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const hoje = () => new Date().toISOString().split("T")[0];

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────
interface LancTesoura {
  id: string; fazenda_id: string; tipo: "pagar" | "receber";
  descricao: string; categoria: string; valor: number; moeda: string;
  data_lancamento: string; data_vencimento: string;
  status: string; conta_bancaria?: string; observacao?: string;
  origem_lancamento?: string; auto: boolean;
}
interface OpTesoura {
  id: string; fazenda_id: string; nome: string;
  tipo: "entrada" | "saida" | "ambos" | "transferencia" | "ajuste";
  categoria?: string; observacao?: string; ativo: boolean;
}
interface ContaBancariaMin { id: string; banco?: string; agencia?: string; conta?: string; descricao?: string; }

const TIPOS_OP_PADRAO = [
  { id: "__mutuo__",         nome: "Mútuo entre Empresas",      tipo: "ambos"        },
  { id: "__seguro__",        nome: "Seguros",                    tipo: "saida"        },
  { id: "__consorcio__",     nome: "Consórcio",                  tipo: "saida"        },
  { id: "__ajuste__",        nome: "Ajuste de Saldo",           tipo: "ajuste"       },
  { id: "__transferencia__", nome: "Transferência entre Contas", tipo: "transferencia"},
  { id: "__taxa__",          nome: "Taxa Bancária",              tipo: "saida"        },
  { id: "__aplicacao__",     nome: "Aplicação Financeira",       tipo: "saida"        },
  { id: "__resgate__",       nome: "Resgate de Aplicação",       tipo: "entrada"      },
  { id: "__outros__",        nome: "Outros",                     tipo: "ambos"        },
] as const;

// ─────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────
export default function TesourariaPage() {
  const { fazendaId } = useAuth();

  const [lancamentos, setLancamentos] = useState<LancTesoura[]>([]);
  const [contas, setContas]           = useState<ContaBancariaMin[]>([]);
  const [opsTesouraria, setOpsTesouraria] = useState<OpTesoura[]>([]);

  // Modal Lançamento
  const [modalLanc, setModalLanc] = useState(false);
  const [lForm, setLForm] = useState({
    tipo_op: "__outros__",
    conta_origem: "", conta_destino: "", valor: "", valor_destino: "",
    tipo: "pagar" as "pagar" | "receber",
    descricao: "", categoria: "Tesouraria",
    data: hoje(), data_vencimento: "",
    observacao: "",
    conta_ajuste: "", saldo_atual: "", saldo_correto: "",
  });
  const [lSaving, setLSaving] = useState(false);
  const [lErr, setLErr]       = useState("");

  // ── Carregar ───────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;

    const [{ data: lb }, { data: cb }, { data: ob }] = await Promise.all([
      supabase.from("lancamentos").select("*").eq("fazenda_id", fazendaId).eq("origem_lancamento", "tesouraria").order("data_lancamento", { ascending: false }),
      supabase.from("contas_bancarias").select("id, banco, agencia, conta, descricao").eq("fazenda_id", fazendaId),
      supabase.from("operacoes_tesouraria").select("*").eq("fazenda_id", fazendaId).order("nome"),
    ]);

    setLancamentos(lb ?? []);
    setContas(cb ?? []);
    setOpsTesouraria(ob ?? []);
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ── KPIs ──────────────────────────────────────────────────
  const totalEntradas = lancamentos.filter(l => l.tipo === "receber").reduce((s, l) => s + l.valor, 0);
  const totalSaidas   = lancamentos.filter(l => l.tipo === "pagar").reduce((s, l) => s + l.valor, 0);
  const emAberto      = lancamentos.filter(l => l.status === "em_aberto").length;

  // ── Salvar Lançamento ─────────────────────────────────────
  async function salvarLancTesoura() {
    if (!fazendaId) return;
    setLSaving(true); setLErr("");
    try {
      const op = lForm.tipo_op;
      const isAjuste = op === "__ajuste__";
      const isTransf  = op === "__transferencia__";

      if (isAjuste) {
        const atual = parseFloat(lForm.saldo_atual) || 0;
        const correto = parseFloat(lForm.saldo_correto) || 0;
        const dif = correto - atual;
        if (!lForm.conta_ajuste) throw new Error("Selecione a conta.");
        await supabase.from("lancamentos").insert({
          fazenda_id: fazendaId, tipo: dif >= 0 ? "receber" : "pagar" as const,
          moeda: "BRL", descricao: `Ajuste de Saldo — ${lForm.conta_ajuste}`,
          categoria: "Ajuste de Saldo", valor: Math.abs(dif),
          data_lancamento: lForm.data, data_vencimento: lForm.data,
          status: "baixado", auto: false,
          conta_bancaria: lForm.conta_ajuste,
          observacao: lForm.observacao || null,
          origem_lancamento: "tesouraria",
        });
      } else if (isTransf) {
        if (!lForm.conta_origem || !lForm.conta_destino || !lForm.valor) throw new Error("Preencha todos os campos.");
        const v = parseFloat(lForm.valor);
        const base = { fazenda_id: fazendaId, moeda: "BRL", categoria: "Transferência entre Contas", valor: v, data_lancamento: lForm.data, data_vencimento: lForm.data, status: "baixado", auto: false, origem_lancamento: "tesouraria", observacao: lForm.observacao || null };
        await supabase.from("lancamentos").insert([
          { ...base, tipo: "pagar"   as const, descricao: `Transferência → ${lForm.conta_destino}`, conta_bancaria: lForm.conta_origem },
          { ...base, tipo: "receber" as const, descricao: `Transferência ← ${lForm.conta_origem}`, conta_bancaria: lForm.conta_destino },
        ]);
      } else {
        if (!lForm.valor || !lForm.descricao.trim()) throw new Error("Preencha valor e descrição.");
        const nomeOp = [...TIPOS_OP_PADRAO, ...opsTesouraria.map(o => ({ id: o.id, nome: o.nome, tipo: o.tipo }))].find(o => o.id === op);
        const tipoLanc = (nomeOp?.tipo === "entrada" || lForm.tipo === "receber") ? "receber" as const : "pagar" as const;
        await supabase.from("lancamentos").insert({
          fazenda_id: fazendaId, tipo: tipoLanc, moeda: "BRL",
          descricao: lForm.descricao.trim(), categoria: nomeOp?.nome ?? "Tesouraria",
          valor: parseFloat(lForm.valor),
          data_lancamento: lForm.data, data_vencimento: lForm.data_vencimento || lForm.data,
          status: "em_aberto" as const, auto: false,
          conta_bancaria: lForm.conta_origem || null,
          observacao: lForm.observacao || null,
          origem_lancamento: "tesouraria",
        });
      }
      await carregar();
      setModalLanc(false);
      setLForm({ tipo_op: "__outros__", conta_origem: "", conta_destino: "", valor: "", valor_destino: "", tipo: "pagar", descricao: "", categoria: "Tesouraria", data: hoje(), data_vencimento: "", observacao: "", conta_ajuste: "", saldo_atual: "", saldo_correto: "" });
    } catch (e: unknown) {
      setLErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setLSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Lançamento de Tesouraria</h1>
            <p style={{ fontSize: 13, color: "#666", marginTop: 4, marginBottom: 0 }}>
              Registre operações financeiras de tesouraria: transferências, ajustes de saldo, seguros, consórcios e outros.
            </p>
          </div>
          <button onClick={() => setModalLanc(true)} style={btnV}>+ Novo Lançamento</button>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 22 }}>
          {[
            { label: "Total Entradas",    value: fmtBRL(totalEntradas), color: "#16A34A" },
            { label: "Total Saídas",      value: fmtBRL(totalSaidas),   color: "#E24B4A" },
            { label: "Lançamentos em Aberto", value: String(emAberto),  color: "#1A4870" },
          ].map(k => (
            <div key={k.label} style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: "16px 18px" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Lista de lançamentos */}
        {lancamentos.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", padding: 48, textAlign: "center", color: "#888", fontSize: 13 }}>
            Nenhum lançamento de tesouraria registrado.<br />
            <span style={{ fontSize: 12, color: "#aaa" }}>Use o botão "+ Novo Lançamento" para registrar.</span>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #D4DCE8", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F3F6F9" }}>
                  {["Data", "Operação", "Descrição", "Conta", "Entrada", "Saída", "Status", ""].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: h === "Entrada" || h === "Saída" ? "right" : "left", fontSize: 11, fontWeight: 600, color: "#555", borderBottom: "0.5px solid #D4DCE8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lancamentos.map((l, li) => (
                  <tr key={l.id} style={{ borderBottom: li < lancamentos.length - 1 ? "0.5px solid #DEE5EE" : "none", borderLeft: `3px solid ${l.tipo === "receber" ? "#16A34A" : "#E24B4A"}` }}>
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "#444", whiteSpace: "nowrap" }}>{fmtData(l.data_lancamento)}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: 10, background: "#EEE6F8", color: "#4A1A7A", padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>{l.categoria}</span>
                    </td>
                    <td style={{ padding: "9px 12px", fontSize: 12, color: "#1a1a1a" }}>{l.descricao}</td>
                    <td style={{ padding: "9px 12px", fontSize: 11, color: "#555" }}>{l.conta_bancaria ?? "—"}</td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "#16A34A" }}>
                      {l.tipo === "receber" ? fmtBRL(l.valor) : ""}
                    </td>
                    <td style={{ padding: "9px 12px", textAlign: "right", fontSize: 12, fontWeight: 600, color: "#E24B4A" }}>
                      {l.tipo === "pagar" ? fmtBRL(l.valor) : ""}
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: 10, background: l.status === "baixado" ? "#DCFCE7" : "#E6F1FB", color: l.status === "baixado" ? "#166534" : "#0C447C", padding: "2px 7px", borderRadius: 8, fontWeight: 600 }}>
                        {l.status === "baixado" ? "Baixado" : "Em aberto"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "center" }}>
                      <button onClick={async () => { if (confirm("Excluir este lançamento?")) { await supabase.from("lancamentos").delete().eq("id", l.id); await carregar(); } }} style={{ fontSize: 11, padding: "3px 8px", border: "0.5px solid #E24B4A40", borderRadius: 6, background: "transparent", color: "#E24B4A", cursor: "pointer" }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════
          MODAL NOVO LANÇAMENTO
      ══════════════════════════════════════════════════════ */}
      {modalLanc && (() => {
        const isAjuste = lForm.tipo_op === "__ajuste__";
        const isTransf  = lForm.tipo_op === "__transferencia__";
        const isAmbos  = lForm.tipo_op === "__mutuo__" || lForm.tipo_op === "__outros__"
          || (!TIPOS_OP_PADRAO.find(o => o.id === lForm.tipo_op) && opsTesouraria.find(o => o.id === lForm.tipo_op)?.tipo === "ambos");
        const contaLabel = (c: ContaBancariaMin) => `${c.banco ?? ""} ${c.agencia ? `Ag. ${c.agencia}` : ""} ${c.conta ? `C/C ${c.conta}` : ""}`.trim() || c.descricao || c.id;
        const contaOpts = contas.length > 0
          ? contas.map(c => <option key={c.id} value={contaLabel(c)}>{contaLabel(c)}</option>)
          : [<option key="_vazio" value="" disabled>Nenhuma conta cadastrada — acesse Cadastros &gt; Contas Bancárias</option>];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, overflowY: "auto", padding: "24px 0" }}>
            <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, margin: "0 20px", boxShadow: "0 16px 48px rgba(0,0,0,0.18)" }}>
              <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid #EEF1F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Novo Lançamento de Tesouraria</div>
                <button onClick={() => setModalLanc(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#888" }}>×</button>
              </div>
              <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
                {lErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{lErr}</div>}

                <div>
                  <label style={lbl}>Operação</label>
                  <select value={lForm.tipo_op} onChange={e => setLForm(f => ({ ...f, tipo_op: e.target.value }))} style={inp}>
                    <optgroup label="Operações Padrão">
                      {TIPOS_OP_PADRAO.map(op => <option key={op.id} value={op.id}>{op.nome}</option>)}
                    </optgroup>
                    {opsTesouraria.length > 0 && (
                      <optgroup label="Operações Personalizadas">
                        {opsTesouraria.map(op => <option key={op.id} value={op.id}>{op.nome}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>

                {/* AJUSTE DE SALDO */}
                {isAjuste && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label style={lbl}>Conta</label>
                      <select value={lForm.conta_ajuste} onChange={e => setLForm(f => ({ ...f, conta_ajuste: e.target.value }))} style={inp}>
                        <option value="">— selecione —</option>
                        {contaOpts}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Saldo Atual (R$)</label>
                        <input type="number" step="0.01" value={lForm.saldo_atual} onChange={e => setLForm(f => ({ ...f, saldo_atual: e.target.value }))} style={inp} placeholder="0.00" />
                      </div>
                      <div>
                        <label style={lbl}>Saldo Correto (R$)</label>
                        <input type="number" step="0.01" value={lForm.saldo_correto} onChange={e => setLForm(f => ({ ...f, saldo_correto: e.target.value }))} style={inp} placeholder="0.00" />
                      </div>
                    </div>
                    {lForm.saldo_atual && lForm.saldo_correto && (
                      <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                        Diferença:{" "}
                        <strong style={{ color: parseFloat(lForm.saldo_correto) - parseFloat(lForm.saldo_atual) >= 0 ? "#16A34A" : "#E24B4A" }}>
                          {fmtBRL(Math.abs(parseFloat(lForm.saldo_correto) - parseFloat(lForm.saldo_atual)))}
                          {parseFloat(lForm.saldo_correto) - parseFloat(lForm.saldo_atual) >= 0 ? " (crédito)" : " (débito)"}
                        </strong>
                      </div>
                    )}
                    <div>
                      <label style={lbl}>Data</label>
                      <input type="date" value={lForm.data} onChange={e => setLForm(f => ({ ...f, data: e.target.value }))} style={inp} />
                    </div>
                  </div>
                )}

                {/* TRANSFERÊNCIA ENTRE CONTAS */}
                {isTransf && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label style={lbl}>Conta Origem</label>
                      <select value={lForm.conta_origem} onChange={e => setLForm(f => ({ ...f, conta_origem: e.target.value }))} style={inp}>
                        <option value="">— selecione —</option>
                        {contaOpts}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Conta Destino</label>
                      <select value={lForm.conta_destino} onChange={e => setLForm(f => ({ ...f, conta_destino: e.target.value }))} style={inp}>
                        <option value="">— selecione —</option>
                        {contaOpts}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Valor (R$)</label>
                        <input type="number" step="0.01" min="0" value={lForm.valor} onChange={e => setLForm(f => ({ ...f, valor: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Data</label>
                        <input type="date" value={lForm.data} onChange={e => setLForm(f => ({ ...f, data: e.target.value }))} style={inp} />
                      </div>
                    </div>
                    <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0B2D50" }}>
                      Dois lançamentos serão criados: débito na conta origem e crédito na conta destino, ambos com status Baixado.
                    </div>
                  </div>
                )}

                {/* OPERAÇÃO NORMAL */}
                {!isAjuste && !isTransf && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {isAmbos && (
                      <div>
                        <label style={lbl}>Tipo</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          {(["pagar", "receber"] as const).map(t => (
                            <button key={t} onClick={() => setLForm(f => ({ ...f, tipo: t }))}
                              style={{ flex: 1, padding: "9px 14px", border: `2px solid ${lForm.tipo === t ? "#1A4870" : "#D4DCE8"}`, borderRadius: 8, background: lForm.tipo === t ? "#D5E8F5" : "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: lForm.tipo === t ? "#0B2D50" : "#555" }}>
                              {t === "pagar" ? "Saída (Pagar)" : "Entrada (Receber)"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={lbl}>Descrição</label>
                      <input value={lForm.descricao} onChange={e => setLForm(f => ({ ...f, descricao: e.target.value }))} style={inp} placeholder="Ex.: Prêmio de seguro agrícola" />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div>
                        <label style={lbl}>Valor (R$)</label>
                        <input type="number" step="0.01" min="0" value={lForm.valor} onChange={e => setLForm(f => ({ ...f, valor: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Data</label>
                        <input type="date" value={lForm.data} onChange={e => setLForm(f => ({ ...f, data: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Vencimento</label>
                        <input type="date" value={lForm.data_vencimento} onChange={e => setLForm(f => ({ ...f, data_vencimento: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>Conta Bancária</label>
                        <select value={lForm.conta_origem} onChange={e => setLForm(f => ({ ...f, conta_origem: e.target.value }))} style={inp}>
                          <option value="">— não informado —</option>
                          {contaOpts}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label style={lbl}>Observação</label>
                  <textarea value={lForm.observacao} onChange={e => setLForm(f => ({ ...f, observacao: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} />
                </div>
              </div>
              <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid #EEF1F6", display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button style={btnR} onClick={() => setModalLanc(false)}>Cancelar</button>
                <button onClick={salvarLancTesoura} disabled={lSaving} style={{ ...btnV, background: lSaving ? "#aaa" : "#1A4870", cursor: lSaving ? "default" : "pointer" }}>
                  {lSaving ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
