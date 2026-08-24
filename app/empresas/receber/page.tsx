"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { listarEmpresasDaConta, listarEmpresaLancamentos, criarEmpresaLancamento, atualizarEmpresaLancamento, excluirEmpresaLancamento, baixarEmpresaLancamento, listarPessoasDaConta, listarContasBancariasDaConta } from "../../../lib/db";
import type { EmpresaLancamento, Empresa, Pessoa } from "../../../lib/supabase";

// ─── Categorias ───────────────────────────────────────────────
const CATS_CR = [
  "Faturamento de Frete",
  "Prestação de Serviços",
  "Comissões",
  "Dividendos / Lucros",
  "Reembolso de Despesas",
  "Outros recebimentos",
];

const FORMAS = ["PIX", "TED", "Boleto", "Dinheiro", "Cheque", "Outros"];
const TODAY = new Date().toISOString().split("T")[0];

const fmtBRL  = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso?: string | null) => { if (!iso) return "—"; const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`; };
function competenciaAtual() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }

const S = {
  page:  { background: "#F4F6FA", minHeight: "100vh", fontFamily: "system-ui,sans-serif" },
  body:  { maxWidth: 1440, margin: "0 auto", padding: "24px 20px" },
  card:  { background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "block", marginBottom: 4 },
  inp:   { border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "7px 10px", fontSize: 13, width: "100%", background: "#fff", boxSizing: "border-box" as const },
  btn:   (bg: string, color = "#fff") => ({ background: bg, color, border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  th:    { padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#555", background: "#F4F6FA", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" as const },
  td:    { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #F0F2F7", verticalAlign: "middle" as const },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal:   { background: "#fff", borderRadius: 10, padding: 28, width: "min(96vw,720px)", maxHeight: "90vh", overflowY: "auto" as const },
};

type StatusFiltro = "aberto" | "vencido" | "recebido" | "todos";
interface ContaBancariaMin { id: string; nome: string; }

function formVazio(empresaId = ""): Partial<EmpresaLancamento> {
  return {
    empresa_id: empresaId, tipo: "receber", descricao: "", valor: 0,
    moeda: "BRL", status: "pendente", data_vencimento: "",
    competencia: competenciaAtual(), categoria: CATS_CR[0],
    centro_custo: "", pessoa_id: "", conta_bancaria: "",
    forma_pagamento: "PIX", numero_documento: "", observacao: "",
  };
}

export default function EmpresaReceberPage() {
  const { fazendaId, fazendaIds = [] } = useAuth();

  const [empresas,    setEmpresas]    = useState<Empresa[]>([]);
  const [lancamentos, setLancamentos] = useState<EmpresaLancamento[]>([]);
  const [pessoas,     setPessoas]     = useState<Pessoa[]>([]);
  const [contas,      setContas]      = useState<ContaBancariaMin[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [fEmpresa, setFEmpresa] = useState("");
  const [fStatus,  setFStatus]  = useState<StatusFiltro>("aberto");
  const [fCat,     setFCat]     = useState("");
  const [fBusca,   setFBusca]   = useState("");
  const [fDe,      setFDe]      = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; });
  const [fAte,     setFAte]     = useState(() => { const d = new Date(); d.setMonth(d.getMonth()+3); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-28`; });

  const [modalOpen, setModalOpen] = useState(false);
  const [form,      setForm]      = useState<Partial<EmpresaLancamento>>(formVazio());
  const [editId,    setEditId]    = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [msg,       setMsg]       = useState("");

  const [baixaOpen,  setBaixaOpen]  = useState(false);
  const [baixaLanc,  setBaixaLanc]  = useState<EmpresaLancamento | null>(null);
  const [baixaData,  setBaixaData]  = useState(TODAY);
  const [baixaValor, setBaixaValor] = useState("");

  const carregar = useCallback(async () => {
    if (!fazendaIds.length) return;
    setLoading(true);
    try {
      const [emps, lancs, pess, conts] = await Promise.all([
        listarEmpresasDaConta(fazendaIds),
        listarEmpresaLancamentos(fazendaIds, { tipo: "receber", de: fDe, ate: fAte }),
        listarPessoasDaConta(fazendaIds[0] ?? ""),
        listarContasBancariasDaConta(fazendaIds[0]),
      ]);
      setEmpresas(emps);
      setLancamentos(lancs);
      setPessoas(pess as Pessoa[]);
      setContas(conts as ContaBancariaMin[]);
    } finally {
      setLoading(false);
    }
  }, [fazendaIds, fDe, fAte]);

  useEffect(() => { carregar(); }, [carregar]);

  const hoje = TODAY;
  const filtrados = useMemo(() => {
    return lancamentos.filter(l => {
      if (fEmpresa && l.empresa_id !== fEmpresa) return false;
      if (fCat && l.categoria !== fCat) return false;
      if (fBusca) {
        const b = fBusca.toLowerCase();
        if (!l.descricao.toLowerCase().includes(b) && !(l.pessoa_nome ?? "").toLowerCase().includes(b)) return false;
      }
      if (fStatus === "aberto")    return l.status === "pendente" && l.data_vencimento >= hoje;
      if (fStatus === "vencido")   return l.status === "pendente" && l.data_vencimento < hoje;
      if (fStatus === "recebido")  return l.status === "pago";
      return true;
    });
  }, [lancamentos, fEmpresa, fCat, fBusca, fStatus, hoje]);

  const totAberto    = lancamentos.filter(l => l.status==="pendente" && l.data_vencimento>=hoje).reduce((s,l)=>s+l.valor,0);
  const totVencido   = lancamentos.filter(l => l.status==="pendente" && l.data_vencimento<hoje).reduce((s,l)=>s+l.valor,0);
  const totRecebido  = lancamentos.filter(l => l.status==="pago").reduce((s,l)=>s+(l.valor_pago??l.valor),0);

  async function salvar() {
    if (!fazendaId || !form.empresa_id || !form.descricao || !form.valor || !form.data_vencimento) {
      setMsg("Preencha empresa, descrição, valor e vencimento."); return;
    }
    setSaving(true);
    try {
      const payload = { ...form, fazenda_id: fazendaId, tipo: "receber" as const };
      if (editId) { await atualizarEmpresaLancamento(editId, payload); }
      else         { await criarEmpresaLancamento(payload as any); }
      setModalOpen(false); carregar();
    } catch (e: any) { setMsg("Erro: " + e.message); }
    finally { setSaving(false); }
  }

  function abrirNovo() { setForm(formVazio(fEmpresa)); setEditId(null); setMsg(""); setModalOpen(true); }
  function abrirEditar(l: EmpresaLancamento) { setForm({ ...l }); setEditId(l.id); setMsg(""); setModalOpen(true); }
  async function excluir(id: string) { if (!confirm("Excluir?")) return; await excluirEmpresaLancamento(id); carregar(); }

  async function confirmarBaixa() {
    if (!baixaLanc) return;
    setSaving(true);
    await baixarEmpresaLancamento(baixaLanc.id, baixaData, parseFloat(baixaValor.replace(",",".")) || baixaLanc.valor);
    setBaixaOpen(false); carregar(); setSaving(false);
  }

  const badge = (l: EmpresaLancamento) => {
    if (l.status === "pago")      return { label: "Recebido", bg: "#DCFCE7", color: "#16A34A" };
    if (l.status === "cancelado") return { label: "Cancelado", bg: "#F0F0F0", color: "#888" };
    if (l.data_vencimento < hoje) return { label: "Em Atraso", bg: "#FFEAEA", color: "#E24B4A" };
    return { label: "A Receber", bg: "#E6F1FB", color: "#1A4870" };
  };

  return (
    <div style={S.page}>
      <TopNav />
      <div style={S.body}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Contas a Receber — Empresas</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>Receitas e faturamentos das empresas não-rurais</p>
          </div>
          <button style={S.btn("#1A4870")} onClick={abrirNovo}>+ Nova CR</button>
        </div>

        {msg && <div style={{ background: "#FFF0F0", border: "0.5px solid #E24B4A", borderRadius: 6, padding: "10px 16px", fontSize: 13, marginBottom: 14, color: "#E24B4A" }}>{msg} <button onClick={() => setMsg("")} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>×</button></div>}

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 16 }}>
          {[
            { label: "A Receber",  val: totAberto,   color: "#1A4870", s: "aberto" },
            { label: "Em Atraso",  val: totVencido,  color: "#E24B4A", s: "vencido" },
            { label: "Recebido",   val: totRecebido, color: "#16A34A", s: "recebido" },
          ].map(k => (
            <div key={k.label} style={{ ...S.card, padding: "14px 18px", margin: 0, cursor: "pointer" }} onClick={() => setFStatus(k.s as StatusFiltro)}>
              <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.color, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(k.val)}</div>
            </div>
          ))}
        </div>

        {/* filtros */}
        <div style={{ ...S.card, padding: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 180px" }}>
              <label style={S.label}>Empresa</label>
              <select style={S.inp} value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}>
                <option value="">Todas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 0 160px" }}>
              <label style={S.label}>Categoria</label>
              <select style={S.inp} value={fCat} onChange={e => setFCat(e.target.value)}>
                <option value="">Todas</option>
                {CATS_CR.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 0 130px" }}>
              <label style={S.label}>De</label>
              <input type="date" style={S.inp} value={fDe} onChange={e => setFDe(e.target.value)} />
            </div>
            <div style={{ flex: "0 0 130px" }}>
              <label style={S.label}>Até</label>
              <input type="date" style={S.inp} value={fAte} onChange={e => setFAte(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={S.label}>Buscar</label>
              <input style={S.inp} placeholder="Cliente ou descrição..." value={fBusca} onChange={e => setFBusca(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {(["aberto","vencido","recebido","todos"] as StatusFiltro[]).map(s => (
              <button key={s} onClick={() => setFStatus(s)} style={{ ...S.btn(fStatus===s ? "#1A4870" : "transparent", fStatus===s ? "#fff" : "#555"), border: "0.5px solid #DDE2EE", fontSize: 12, padding: "5px 12px" }}>
                {{ aberto:"A Receber", vencido:"Em Atraso", recebido:"Recebidos", todos:"Todos" }[s]}
                {" "}({s==="aberto" ? lancamentos.filter(l=>l.status==="pendente"&&l.data_vencimento>=hoje).length
                       :s==="vencido" ? lancamentos.filter(l=>l.status==="pendente"&&l.data_vencimento<hoje).length
                       :s==="recebido" ? lancamentos.filter(l=>l.status==="pago").length
                       :lancamentos.length})
              </button>
            ))}
          </div>
        </div>

        {/* tabela */}
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#888" }}>Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#888" }}>Nenhum lançamento encontrado.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Nº","Empresa","Cliente","Descrição","Categoria","Competência","Vencimento","Valor","Status",""].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(l => {
                    const b = badge(l);
                    return (
                      <tr key={l.id} onDoubleClick={() => abrirEditar(l)} style={{ cursor: "pointer" }}>
                        <td style={{ ...S.td, color: "#888", fontSize: 11 }}>{l.numero}</td>
                        <td style={{ ...S.td, fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.empresa_nome}</td>
                        <td style={{ ...S.td, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.pessoa_nome ?? "—"}</td>
                        <td style={{ ...S.td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao}</td>
                        <td style={{ ...S.td, color: "#666", fontSize: 12 }}>{l.categoria ?? "—"}</td>
                        <td style={{ ...S.td, fontSize: 12 }}>{l.competencia ? l.competencia.split("-").reverse().join("/") : "—"}</td>
                        <td style={{ ...S.td, color: b.color, fontWeight: 600 }}>{fmtData(l.data_vencimento)}</td>
                        <td style={{ ...S.td, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(l.valor)}</td>
                        <td style={S.td}>
                          <span style={{ fontSize: 11, fontWeight: 700, background: b.bg, color: b.color, borderRadius: 4, padding: "2px 8px" }}>{b.label}</span>
                        </td>
                        <td style={S.td}>
                          <div style={{ display: "flex", gap: 4 }}>
                            {l.status === "pendente" && (
                              <button style={{ ...S.btn("#16A34A"), fontSize: 11, padding: "3px 8px" }} onClick={() => { setBaixaLanc(l); setBaixaData(TODAY); setBaixaValor(l.valor.toFixed(2).replace(".",",")); setBaixaOpen(true); }}>↓ Baixar</button>
                            )}
                            <button style={{ ...S.btn("#1A4870"), fontSize: 11, padding: "3px 8px" }} onClick={() => abrirEditar(l)}>✏</button>
                            <button style={{ ...S.btn("#E24B4A"), fontSize: 11, padding: "3px 8px" }} onClick={() => excluir(l.id)}>✕</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#F4F6FA" }}>
                    <td colSpan={7} style={{ ...S.td, fontWeight: 700, textAlign: "right" }}>Total ({filtrados.length})</td>
                    <td style={{ ...S.td, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBRL(filtrados.reduce((s,l)=>s+l.valor,0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal lançamento */}
      {modalOpen && (
        <div style={S.overlay} onClick={() => setModalOpen(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{editId ? "Editar CR" : "Nova Conta a Receber"}</h3>
              <button onClick={() => setModalOpen(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={S.label}>Empresa *</label>
                <select style={S.inp} value={form.empresa_id ?? ""} onChange={e => setForm(p=>({...p, empresa_id: e.target.value}))}>
                  <option value="">Selecione...</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={S.label}>Descrição *</label>
                <input style={S.inp} value={form.descricao ?? ""} onChange={e => setForm(p=>({...p, descricao: e.target.value}))} placeholder="Ex: Frete contratado — Fazenda X" />
              </div>
              <div>
                <label style={S.label}>Categoria *</label>
                <select style={S.inp} value={form.categoria ?? ""} onChange={e => setForm(p=>({...p, categoria: e.target.value}))}>
                  {CATS_CR.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Competência</label>
                <input type="month" style={S.inp} value={form.competencia ?? ""} onChange={e => setForm(p=>({...p, competencia: e.target.value}))} />
              </div>
              <div>
                <label style={S.label}>Valor (R$) *</label>
                <input type="number" step="0.01" style={S.inp} value={form.valor || ""} onChange={e => setForm(p=>({...p, valor: parseFloat(e.target.value)||0}))} />
              </div>
              <div>
                <label style={S.label}>Vencimento *</label>
                <input type="date" style={S.inp} value={form.data_vencimento ?? ""} onChange={e => setForm(p=>({...p, data_vencimento: e.target.value}))} />
              </div>
              <div>
                <label style={S.label}>Cliente</label>
                <select style={S.inp} value={form.pessoa_id ?? ""} onChange={e => setForm(p=>({...p, pessoa_id: e.target.value||undefined}))}>
                  <option value="">— Nenhum —</option>
                  {pessoas.map((p: any) => <option key={p.id} value={p.id}>{p.nome_razao_social}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Centro de Custo</label>
                <input style={S.inp} value={form.centro_custo ?? ""} onChange={e => setForm(p=>({...p, centro_custo: e.target.value}))} />
              </div>
              <div>
                <label style={S.label}>Forma de Recebimento</label>
                <select style={S.inp} value={form.forma_pagamento ?? ""} onChange={e => setForm(p=>({...p, forma_pagamento: e.target.value}))}>
                  {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Conta Bancária</label>
                <select style={S.inp} value={form.conta_bancaria ?? ""} onChange={e => setForm(p=>({...p, conta_bancaria: e.target.value||undefined}))}>
                  <option value="">— Nenhuma —</option>
                  {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Nº Documento</label>
                <input style={S.inp} value={form.numero_documento ?? ""} onChange={e => setForm(p=>({...p, numero_documento: e.target.value}))} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={S.label}>Observação</label>
                <textarea style={{ ...S.inp, height: 64, resize: "vertical" }} value={form.observacao ?? ""} onChange={e => setForm(p=>({...p, observacao: e.target.value}))} />
              </div>
            </div>
            {msg && <div style={{ marginTop: 10, color: "#E24B4A", fontSize: 13 }}>{msg}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, borderTop: "0.5px solid #DDE2EE", paddingTop: 14 }}>
              <button style={{ ...S.btn("transparent","#555"), border: "0.5px solid #DDE2EE" }} onClick={() => setModalOpen(false)}>Cancelar</button>
              <button style={S.btn("#1A4870")} onClick={salvar} disabled={saving}>{saving ? "Salvando..." : editId ? "Salvar" : "Criar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal baixa */}
      {baixaOpen && baixaLanc && (
        <div style={{ ...S.overlay, zIndex: 1100 }} onClick={() => setBaixaOpen(false)}>
          <div style={{ ...S.modal, width: "min(96vw,420px)" }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Registrar Recebimento</h3>
            <p style={{ fontSize: 13, color: "#555", marginBottom: 14 }}><strong>{baixaLanc.descricao}</strong> — {fmtBRL(baixaLanc.valor)}</p>
            <div style={{ display: "grid", gap: 12 }}>
              <div><label style={S.label}>Data *</label><input type="date" style={S.inp} value={baixaData} onChange={e => setBaixaData(e.target.value)} /></div>
              <div><label style={S.label}>Valor Recebido</label><input style={S.inp} value={baixaValor} onChange={e => setBaixaValor(e.target.value)} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button style={{ ...S.btn("transparent","#555"), border: "0.5px solid #DDE2EE" }} onClick={() => setBaixaOpen(false)}>Cancelar</button>
              <button style={S.btn("#16A34A")} onClick={confirmarBaixa} disabled={saving}>✓ Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
