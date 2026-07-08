"use client";
import { useState, useEffect } from "react";
import TopNav from "../../../components/TopNav";
import InputMonetario from "../../../components/InputMonetario";
import { useAuth } from "../../../components/AuthProvider";
import {
  listarAdiantamentos, criarAdiantamento, cancelarAdiantamento,
  aplicarAdiantamento, listarAplicacoesAdiantamento,
  listarPessoas, listarContas, listarAnosSafra,
} from "../../../lib/db";
import type {
  AdiantamentoFornecedor, AdiantamentoAplicacao,
  Pessoa, ContaBancaria, AnoSafra,
} from "../../../lib/supabase";

// ── Estilos base ──────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid #D4DCE8", borderRadius: 8, fontSize: 13, color: "#1a1a1a", background: "#fff", boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 11, color: "#555", marginBottom: 4, display: "block" };
const btnV: React.CSSProperties = { padding: "8px 18px", background: "#1A5C38", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnR: React.CSSProperties = { padding: "8px 18px", border: "0.5px solid #D4DCE8", borderRadius: 8, background: "transparent", cursor: "pointer", fontSize: 13, color: "#1a1a1a" };
const btnAzul: React.CSSProperties = { padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnSm: React.CSSProperties = { padding: "4px 10px", border: "0.5px solid #D4DCE8", borderRadius: 6, background: "transparent", cursor: "pointer", fontSize: 11, color: "#555" };
const btnSmX: React.CSSProperties = { ...btnSm, border: "0.5px solid #E24B4A50", background: "#FCEBEB", color: "#791F1F" };
const thS: React.CSSProperties = { padding: "8px 12px", fontSize: 11, fontWeight: 600, color: "#555", textAlign: "left", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" };
const tdS: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#1a1a1a", borderBottom: "0.5px solid #F0F4F8", verticalAlign: "middle" };

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (s?: string) => s ? s.split("-").reverse().join("/") : "—";

type Tab = "em_aberto" | "parcial" | "aplicado" | "cancelado" | "todos";
type Moeda = "BRL" | "USD";

const STATUS_LABEL: Record<AdiantamentoFornecedor["status"], string> = {
  em_aberto: "Em Aberto", parcial: "Parcial", aplicado: "Aplicado", cancelado: "Cancelado",
};
const STATUS_COLOR: Record<AdiantamentoFornecedor["status"], { bg: string; color: string }> = {
  em_aberto: { bg: "#D5E8F5", color: "#0B2D50" },
  parcial:   { bg: "#FBF3E0", color: "#7A5520" },
  aplicado:  { bg: "#D5F0DD", color: "#1A5C38" },
  cancelado: { bg: "#F1EFE8", color: "#555"    },
};

function badge(status: AdiantamentoFornecedor["status"]) {
  const { bg, color } = STATUS_COLOR[status];
  return <span style={{ fontSize: 10, fontWeight: 600, background: bg, color, padding: "2px 8px", borderRadius: 8 }}>{STATUS_LABEL[status]}</span>;
}

function Modal({ titulo, onClose, width = 640, children }: { titulo: string; onClose: () => void; width?: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,45,80,0.28)", zIndex:2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>{titulo}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#666", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

const VAZIO_FORM = {
  pessoa_id: "", descricao: "", nr_documento: "", data_emissao: "", data_previsao: "",
  valor: "", moeda: "BRL" as Moeda, cotacao_usd: "", conta_bancaria_id: "",
  ano_safra_id: "", observacao: "", ja_quitado: true,
};

const VAZIO_APLIQ = { valor_aplicado: "", data_aplicacao: "", descricao: "", nr_nf: "" };

export default function AdiantamentosPage() {
  const { fazendaId } = useAuth();

  const [adiantamentos, setAdiantamentos] = useState<AdiantamentoFornecedor[]>([]);
  const [pessoas, setPessoas]             = useState<Pessoa[]>([]);
  const [contas, setContas]               = useState<ContaBancaria[]>([]);
  const [anosSafra, setAnosSafra]         = useState<AnoSafra[]>([]);
  const [tab, setTab]                     = useState<Tab>("em_aberto");
  const [busca, setBusca]                 = useState("");
  const [carregando, setCarregando]       = useState(true);
  const [salvando, setSalvando]           = useState(false);
  const [erro, setErro]                   = useState("");

  // Modais
  const [modalNovo, setModalNovo]       = useState(false);
  const [modalApliq, setModalApliq]     = useState<AdiantamentoFornecedor | null>(null);
  const [modalDetalhe, setModalDetalhe] = useState<AdiantamentoFornecedor | null>(null);
  const [aplicacoes, setAplicacoes]     = useState<AdiantamentoAplicacao[]>([]);
  const [loadAplic, setLoadAplic]       = useState(false);

  const [form, setForm]   = useState({ ...VAZIO_FORM });
  const [fApliq, setFApliq] = useState({ ...VAZIO_APLIQ });

  useEffect(() => {
    if (!fazendaId) return;
    setCarregando(true);
    Promise.all([
      listarAdiantamentos(fazendaId),
      listarPessoas(fazendaId),
      listarContas(fazendaId),
      listarAnosSafra(fazendaId),
    ]).then(([a, p, c, s]) => {
      setAdiantamentos(a); setPessoas(p); setContas(c); setAnosSafra(s);
    }).catch(e => setErro(e.message)).finally(() => setCarregando(false));
  }, [fazendaId]);

  // ── Filtros ───────────────────────────────────────────────────
  const lista = adiantamentos.filter(a => {
    if (tab !== "todos" && a.status !== tab) return false;
    if (busca) {
      const b = busca.toLowerCase();
      const nome = pessoas.find(p => p.id === a.pessoa_id)?.nome?.toLowerCase() ?? "";
      if (!a.descricao.toLowerCase().includes(b) && !nome.includes(b) && !(a.nr_documento ?? "").toLowerCase().includes(b)) return false;
    }
    return true;
  });

  // ── KPIs ──────────────────────────────────────────────────────
  const ativos = adiantamentos.filter(a => a.status === "em_aberto" || a.status === "parcial");
  const totalAdiantado = ativos.reduce((s, a) => s + a.valor, 0);
  const totalAplicado  = ativos.reduce((s, a) => s + (a.valor_aplicado ?? 0), 0);
  const saldoDisp      = totalAdiantado - totalAplicado;
  const nFornecedores  = new Set(ativos.filter(a => a.pessoa_id).map(a => a.pessoa_id)).size;

  // ── Salvar novo ───────────────────────────────────────────────
  const salvarNovo = async () => {
    if (!fazendaId || !form.descricao.trim() || !form.data_emissao || !form.valor) return;
    setSalvando(true); setErro("");
    try {
      const novo = await criarAdiantamento({
        fazenda_id:       fazendaId,
        pessoa_id:        form.pessoa_id || undefined,
        descricao:        form.descricao.trim(),
        nr_documento:     form.nr_documento || undefined,
        data_emissao:     form.data_emissao,
        data_previsao:    form.data_previsao || undefined,
        valor:            Number(form.valor),
        moeda:            form.moeda,
        cotacao_usd:      form.cotacao_usd ? Number(form.cotacao_usd) : undefined,
        conta_bancaria_id: form.conta_bancaria_id || undefined,
        ano_safra_id:     form.ano_safra_id || undefined,
        observacao:       form.observacao || undefined,
        status:           "em_aberto",
      }, form.ja_quitado);
      setAdiantamentos(p => [novo, ...p]);
      setModalNovo(false);
      setForm({ ...VAZIO_FORM });
    } catch (e) { setErro((e as Error).message); }
    finally { setSalvando(false); }
  };

  // ── Aplicar ───────────────────────────────────────────────────
  const salvarApliq = async () => {
    if (!modalApliq || !fApliq.valor_aplicado || !fApliq.data_aplicacao || !fApliq.descricao.trim()) return;
    const val = Number(fApliq.valor_aplicado);
    const saldo = modalApliq.valor - (modalApliq.valor_aplicado ?? 0);
    if (val > saldo + 0.01) { setErro(`Valor maior que o saldo disponível (${fmtBRL(saldo)})`); return; }
    setSalvando(true); setErro("");
    try {
      await aplicarAdiantamento(modalApliq, val, fApliq.data_aplicacao, fApliq.descricao.trim(), fApliq.nr_nf || undefined);
      // Recarrega lista para refletir novo saldo/status
      listarAdiantamentos(fazendaId!).then(setAdiantamentos);
      setModalApliq(null);
      setFApliq({ ...VAZIO_APLIQ });
    } catch (e) { setErro((e as Error).message); }
    finally { setSalvando(false); }
  };

  // ── Cancelar ──────────────────────────────────────────────────
  const handleCancelar = async (id: string) => {
    if (!confirm("Cancelar este adiantamento?")) return;
    await cancelarAdiantamento(id);
    setAdiantamentos(p => p.map(a => a.id === id ? { ...a, status: "cancelado" } : a));
  };

  // ── Abrir detalhe ─────────────────────────────────────────────
  const abrirDetalhe = async (a: AdiantamentoFornecedor) => {
    setModalDetalhe(a);
    setLoadAplic(true);
    listarAplicacoesAdiantamento(a.id).then(setAplicacoes).finally(() => setLoadAplic(false));
  };

  const nomePessoa = (id?: string) => id ? (pessoas.find(p => p.id === id)?.nome ?? "—") : "—";

  const TABS: { key: Tab; label: string }[] = [
    { key: "em_aberto", label: "Em Aberto" },
    { key: "parcial",   label: "Parcialmente Aplicados" },
    { key: "aplicado",  label: "Aplicados" },
    { key: "cancelado", label: "Cancelados" },
    { key: "todos",     label: "Todos" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F4F6FA" }}>
      <TopNav />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>Adiantamentos a Fornecedores</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>Pré-pagamentos de insumos, serviços e contratos</div>
          </div>
          <button style={btnAzul} onClick={() => { setForm({ ...VAZIO_FORM, data_emissao: new Date().toISOString().slice(0,10) }); setModalNovo(true); }}>
            + Novo Adiantamento
          </button>
        </div>

        {erro && <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A40", borderRadius: 8, padding: "10px 14px", color: "#791F1F", marginBottom: 16, fontSize: 13 }}>{erro}</div>}

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Adiantado (ativos)", valor: fmtBRL(totalAdiantado), cor: "#1A4870", bg: "#D5E8F5" },
            { label: "Total Aplicado",           valor: fmtBRL(totalAplicado),  cor: "#1A5C38", bg: "#D5F0DD" },
            { label: "Saldo Disponível",         valor: fmtBRL(saldoDisp),      cor: saldoDisp > 0 ? "#7A5520" : "#555", bg: saldoDisp > 0 ? "#FBF3E0" : "#F4F6FA" },
            { label: "Fornecedores c/ saldo",    valor: String(nFornecedores),  cor: "#555", bg: "#F4F6FA" },
          ].map(c => (
            <div key={c.label} style={{ background: "#fff", borderRadius: 10, padding: "16px 18px", border: "0.5px solid #DDE2EE" }}>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.cor }}>{c.valor}</div>
              <div style={{ height: 3, borderRadius: 2, background: c.bg, marginTop: 8 }} />
            </div>
          ))}
        </div>

        {/* Tabela */}
        <div style={{ background: "#fff", borderRadius: 12, border: "0.5px solid #DDE2EE", overflow: "hidden" }}>

          {/* Tabs + Busca */}
          <div style={{ padding: "14px 20px", borderBottom: "0.5px solid #DDE2EE", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 0, border: "0.5px solid #DDE2EE", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "6px 14px", border: "none", background: tab === t.key ? "#1A4870" : "transparent", color: tab === t.key ? "#fff" : "#555", cursor: "pointer", fontSize: 12, fontWeight: tab === t.key ? 600 : 400, borderRight: "0.5px solid #DDE2EE" }}>
                  {t.label}
                  <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.8 }}>
                    ({t.key === "todos" ? adiantamentos.length : adiantamentos.filter(a => a.status === t.key).length})
                  </span>
                </button>
              ))}
            </div>
            <input style={{ ...inp, maxWidth: 260, marginLeft: "auto" }} placeholder="Buscar fornecedor, descrição, nº doc..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>

          {carregando ? (
            <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Carregando…</div>
          ) : lista.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 13 }}>
              {tab === "em_aberto" ? "Nenhum adiantamento em aberto." : "Nenhum registro encontrado."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["Fornecedor", "Descrição", "Nº Doc", "Emissão", "Previsão Entrega", "Valor", "Aplicado", "Saldo", "Status", ""].map((h, i) => (
                    <th key={i} style={{ ...thS, textAlign: i >= 5 && i <= 7 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map(a => {
                  const saldo = a.valor - (a.valor_aplicado ?? 0);
                  const pctApliq = a.valor > 0 ? (a.valor_aplicado ?? 0) / a.valor * 100 : 0;
                  return (
                    <tr key={a.id} style={{ borderBottom: "0.5px solid #F0F4F8" }}>
                      <td style={tdS}>
                        <div style={{ fontWeight: 600 }}>{nomePessoa(a.pessoa_id)}</div>
                      </td>
                      <td style={tdS}>
                        <div>{a.descricao}</div>
                        {a.observacao && <div style={{ fontSize: 11, color: "#888" }}>{a.observacao}</div>}
                      </td>
                      <td style={{ ...tdS, fontFamily: "monospace", fontSize: 12, color: "#555" }}>{a.nr_documento || "—"}</td>
                      <td style={tdS}>{fmtData(a.data_emissao)}</td>
                      <td style={{ ...tdS, color: a.data_previsao ? "#1a1a1a" : "#aaa" }}>
                        {a.data_previsao ? (() => {
                          const dias = Math.ceil((new Date(a.data_previsao).getTime() - Date.now()) / 86400000);
                          const cor = dias < 0 ? "#E24B4A" : dias <= 7 ? "#EF9F27" : "#1a1a1a";
                          return <span style={{ color: cor }}>{fmtData(a.data_previsao)}{dias < 0 ? " (atrasado)" : dias <= 7 ? ` (${dias}d)` : ""}</span>;
                        })() : "—"}
                      </td>
                      <td style={{ ...tdS, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(a.valor)}</td>
                      <td style={{ ...tdS, textAlign: "right" }}>
                        <div style={{ fontVariantNumeric: "tabular-nums", color: pctApliq > 0 ? "#1A5C38" : "#aaa" }}>{fmtBRL(a.valor_aplicado ?? 0)}</div>
                        {pctApliq > 0 && (
                          <div style={{ height: 3, borderRadius: 2, background: "#D5F0DD", marginTop: 3, position: "relative", overflow: "hidden" }}>
                            <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(pctApliq, 100)}%`, background: "#1A5C38" }} />
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdS, textAlign: "right", fontWeight: 600, color: saldo > 0 ? "#7A5520" : "#1A5C38", fontVariantNumeric: "tabular-nums" }}>{fmtBRL(saldo)}</td>
                      <td style={tdS}>{badge(a.status)}</td>
                      <td style={{ ...tdS, textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button style={btnSm} onClick={() => abrirDetalhe(a)}>Detalhes</button>
                          {(a.status === "em_aberto" || a.status === "parcial") && (
                            <button style={{ ...btnSm, background: "#FBF3E0", color: "#7A5520", border: "0.5px solid #C9921B40" }}
                              onClick={() => { setModalApliq(a); setFApliq({ ...VAZIO_APLIQ, data_aplicacao: new Date().toISOString().slice(0,10) }); setErro(""); }}>
                              Aplicar
                            </button>
                          )}
                          {a.status === "em_aberto" && (
                            <button style={btnSmX} onClick={() => handleCancelar(a.id)}>Cancelar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Modal Novo Adiantamento ─────────────────────────────── */}
      {modalNovo && (
        <Modal titulo="Novo Adiantamento a Fornecedor" onClose={() => setModalNovo(false)} width={720}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Fornecedor</label>
              <select style={inp} value={form.pessoa_id} onChange={e => setForm(p => ({ ...p, pessoa_id: e.target.value }))}>
                <option value="">— selecione —</option>
                {pessoas.filter(p => p.fornecedor).map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf_cnpj ? ` — ${p.cpf_cnpj}` : ""}</option>)}
                {pessoas.filter(p => !p.fornecedor).length > 0 && <optgroup label="── Outros ──">
                  {pessoas.filter(p => !p.fornecedor).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </optgroup>}
              </select>
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Descrição *</label>
              <input style={inp} placeholder="Ex: Adiantamento Insumos Safra 25/26 — Bayer" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>

            <div>
              <label style={lbl}>Nº Documento / Pedido</label>
              <input style={inp} placeholder="Ex: PED-2025-001" value={form.nr_documento} onChange={e => setForm(p => ({ ...p, nr_documento: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Data de Emissão *</label>
              <input style={inp} type="date" value={form.data_emissao} onChange={e => setForm(p => ({ ...p, data_emissao: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Previsão de Entrega</label>
              <input style={inp} type="date" value={form.data_previsao} onChange={e => setForm(p => ({ ...p, data_previsao: e.target.value }))} />
            </div>

            <div>
              <label style={lbl}>Valor *</label>
              <InputMonetario style={inp} placeholder="0,00" value={form.valor} onChange={v => setForm(p => ({ ...p, valor: String(v) }))} />
            </div>
            <div>
              <label style={lbl}>Moeda</label>
              <select style={inp} value={form.moeda} onChange={e => setForm(p => ({ ...p, moeda: e.target.value as Moeda }))}>
                <option value="BRL">BRL — Real</option>
                <option value="USD">USD — Dólar</option>
              </select>
            </div>
            {form.moeda === "USD" && (
              <div>
                <label style={lbl}>Cotação USD (R$)</label>
                <InputMonetario style={inp} placeholder="5,90" value={form.cotacao_usd} onChange={v => setForm(p => ({ ...p, cotacao_usd: String(v) }))} />
              </div>
            )}

            <div>
              <label style={lbl}>Conta Bancária</label>
              <select style={inp} value={form.conta_bancaria_id} onChange={e => setForm(p => ({ ...p, conta_bancaria_id: e.target.value }))}>
                <option value="">— selecione —</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Ano Safra</label>
              <select style={inp} value={form.ano_safra_id} onChange={e => setForm(p => ({ ...p, ano_safra_id: e.target.value }))}>
                <option value="">— selecione —</option>
                {anosSafra.map(a => <option key={a.id} value={a.id}>{a.descricao}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Observação</label>
              <input style={inp} placeholder="Opcional — notas internas" value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} />
            </div>

            <div style={{ gridColumn: "1/-1", background: "#F4F6FA", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <input type="checkbox" id="jaQuitado" checked={form.ja_quitado} onChange={e => setForm(p => ({ ...p, ja_quitado: e.target.checked }))} style={{ width: 16, height: 16, cursor: "pointer" }} />
              <label htmlFor="jaQuitado" style={{ fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>
                Pagamento já realizado — gera CP como <strong>baixado</strong> (saída de caixa já ocorreu)
              </label>
            </div>
          </div>

          {erro && <div style={{ marginTop: 12, background: "#FCEBEB", borderRadius: 8, padding: "8px 12px", color: "#791F1F", fontSize: 12 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => setModalNovo(false)}>Cancelar</button>
            <button style={{ ...btnAzul, opacity: salvando || !form.descricao.trim() || !form.data_emissao || !form.valor ? 0.5 : 1 }}
              disabled={salvando || !form.descricao.trim() || !form.data_emissao || !form.valor}
              onClick={salvarNovo}>{salvando ? "Salvando…" : "Salvar Adiantamento"}</button>
          </div>
        </Modal>
      )}

      {/* ── Modal Aplicar ──────────────────────────────────────── */}
      {modalApliq && (
        <Modal titulo="Aplicar Adiantamento" onClose={() => { setModalApliq(null); setErro(""); }} width={560}>
          <div style={{ background: "#F4F6FA", borderRadius: 8, padding: "12px 14px", marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div><div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.04em" }}>Fornecedor</div><div style={{ fontWeight: 600 }}>{nomePessoa(modalApliq.pessoa_id)}</div></div>
            <div><div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.04em" }}>Valor Total</div><div style={{ fontWeight: 600 }}>{fmtBRL(modalApliq.valor)}</div></div>
            <div><div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.04em" }}>Saldo Disponível</div><div style={{ fontWeight: 700, color: "#7A5520", fontSize: 16 }}>{fmtBRL(modalApliq.valor - (modalApliq.valor_aplicado ?? 0))}</div></div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={lbl}>Valor a Aplicar *</label>
              <InputMonetario style={inp} placeholder="0,00" value={fApliq.valor_aplicado} onChange={v => setFApliq(p => ({ ...p, valor_aplicado: String(v) }))} />
            </div>
            <div>
              <label style={lbl}>Data de Aplicação *</label>
              <input style={inp} type="date" value={fApliq.data_aplicacao} onChange={e => setFApliq(p => ({ ...p, data_aplicacao: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Descrição *</label>
              <input style={inp} placeholder="Ex: Aplicado na NF de Insumos 001234" value={fApliq.descricao} onChange={e => setFApliq(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={lbl}>Nº da NF / Referência</label>
              <input style={inp} placeholder="Ex: NF 001234 — Bayer Brasil" value={fApliq.nr_nf} onChange={e => setFApliq(p => ({ ...p, nr_nf: e.target.value }))} />
            </div>
          </div>

          {/* Botão "Aplicar Tudo" */}
          {(modalApliq.valor - (modalApliq.valor_aplicado ?? 0)) > 0 && (
            <button style={{ ...btnSm, marginTop: 8, color: "#7A5520", background: "#FBF3E0", border: "0.5px solid #C9921B40" }}
              onClick={() => setFApliq(p => ({ ...p, valor_aplicado: String(modalApliq.valor - (modalApliq.valor_aplicado ?? 0)) }))}>
              Aplicar saldo total ({fmtBRL(modalApliq.valor - (modalApliq.valor_aplicado ?? 0))})
            </button>
          )}

          {erro && <div style={{ marginTop: 12, background: "#FCEBEB", borderRadius: 8, padding: "8px 12px", color: "#791F1F", fontSize: 12 }}>{erro}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <button style={btnR} onClick={() => { setModalApliq(null); setErro(""); }}>Cancelar</button>
            <button style={{ ...btnV, opacity: salvando || !fApliq.valor_aplicado || !fApliq.data_aplicacao || !fApliq.descricao.trim() ? 0.5 : 1 }}
              disabled={salvando || !fApliq.valor_aplicado || !fApliq.data_aplicacao || !fApliq.descricao.trim()}
              onClick={salvarApliq}>{salvando ? "Salvando…" : "Confirmar Aplicação"}</button>
          </div>
        </Modal>
      )}

      {/* ── Modal Detalhes ─────────────────────────────────────── */}
      {modalDetalhe && (
        <Modal titulo={`Detalhes — ${modalDetalhe.descricao}`} onClose={() => setModalDetalhe(null)} width={700}>
          {/* Resumo */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            {[
              ["Fornecedor", nomePessoa(modalDetalhe.pessoa_id)],
              ["Emissão", fmtData(modalDetalhe.data_emissao)],
              ["Nº Documento", modalDetalhe.nr_documento ?? "—"],
              ["Valor Total", fmtBRL(modalDetalhe.valor)],
              ["Aplicado", fmtBRL(modalDetalhe.valor_aplicado ?? 0)],
              ["Saldo", fmtBRL(modalDetalhe.valor - (modalDetalhe.valor_aplicado ?? 0))],
            ].map(([k, v]) => (
              <div key={k} style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{k}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Barra de progresso */}
          {modalDetalhe.valor > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#666", marginBottom: 4 }}>
                <span>Aplicado</span>
                <span>{((modalDetalhe.valor_aplicado ?? 0) / modalDetalhe.valor * 100).toFixed(1)}%</span>
              </div>
              <div style={{ height: 8, background: "#F0F4F8", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min((modalDetalhe.valor_aplicado ?? 0) / modalDetalhe.valor * 100, 100)}%`, background: "#1A5C38", borderRadius: 4, transition: "width 0.3s" }} />
              </div>
            </div>
          )}

          {/* Histórico de Aplicações */}
          <div style={{ fontSize: 11, fontWeight: 600, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Histórico de Aplicações</div>
          {loadAplic ? (
            <div style={{ color: "#888", fontSize: 13, padding: 12 }}>Carregando…</div>
          ) : aplicacoes.length === 0 ? (
            <div style={{ color: "#888", fontSize: 13, padding: "12px 0" }}>Nenhuma aplicação registrada.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {["Data", "Descrição", "NF / Ref.", "Valor Aplicado"].map((h, i) => (
                    <th key={i} style={{ ...thS, textAlign: i === 3 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aplicacoes.map(apl => (
                  <tr key={apl.id} style={{ borderBottom: "0.5px solid #F0F4F8" }}>
                    <td style={tdS}>{fmtData(apl.data_aplicacao)}</td>
                    <td style={tdS}>{apl.descricao}</td>
                    <td style={{ ...tdS, fontFamily: "monospace", fontSize: 12, color: "#555" }}>{apl.nr_nf || "—"}</td>
                    <td style={{ ...tdS, textAlign: "right", fontWeight: 600, color: "#1A5C38" }}>{fmtBRL(apl.valor_aplicado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {modalDetalhe.observacao && (
            <div style={{ marginTop: 16, background: "#F4F6FA", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#555" }}>
              <strong>Obs:</strong> {modalDetalhe.observacao}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
