"use client";
import { useState, useEffect, useCallback } from "react";
import TopNav from "../../../../components/TopNav";
import InputMonetario from "../../../../components/InputMonetario";
import { useAuth } from "../../../../components/AuthProvider";
import CascadeSelector, { type CascadeValues } from "../../../../components/CascadeSelector";
import SelectBusca from "../../../../components/SelectBusca";
import { supabase } from "../../../../lib/supabase";
import type { Pessoa, Lancamento } from "../../../../lib/supabase";

// ─── Types ────────────────────────────────────────────────────
type StatusFatura = "aberta" | "aguardando_pagamento" | "paga" | "cancelada";

interface Fatura {
  id: string;
  fazenda_id: string;
  pessoa_id?: string | null;
  fornecedor_nome?: string | null;
  competencia: string;
  numero_fatura?: string | null;
  valor_total: number;
  valor_cp: number;
  status: StatusFatura;
  vencimento?: string | null;
  data_pagamento?: string | null;
  conta_pagamento?: string | null;
  observacao?: string | null;
  created_at?: string;
}

interface ContaBancariaMin { id: string; banco?: string; agencia?: string; conta?: string; descricao?: string; }

// ─── Helpers ─────────────────────────────────────────────────
const hoje = () => new Date().toISOString().split("T")[0];
const mesAtual = () => new Date().toISOString().slice(0, 7);
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (iso?: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const fmtCompetencia = (ym: string) => {
  const [y, m] = ym.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[Number(m) - 1]}/${y}`;
};

function diasAteVencer(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso + "T12:00:00").getTime() - Date.now()) / 86400000);
}

const STATUS_META: Record<StatusFatura, { label: string; bg: string; cl: string; border: string }> = {
  aberta:               { label: "Em aberto",           bg: "#E8F3FB", cl: "#0B2D50", border: "#378ADD" },
  aguardando_pagamento: { label: "Aguardando pagamento", bg: "#FBF3E0", cl: "#7A4300", border: "#C9921B" },
  paga:                 { label: "Paga",                 bg: "#DCFCE7", cl: "#166534", border: "#16A34A" },
  cancelada:            { label: "Cancelada",            bg: "#F5E8E8", cl: "#7A1F1F", border: "#E24B4A" },
};

const contaLabel = (c: ContaBancariaMin) => {
  if (c.descricao) return c.descricao;
  const parts = [c.banco];
  if (c.agencia) parts.push(`Ag. ${c.agencia}`);
  if (c.conta)   parts.push(`C/C ${c.conta}`);
  return parts.filter(Boolean).join(" ");
};

// ─── Estilos ─────────────────────────────────────────────────
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, background: "var(--bg-input)", boxSizing: "border-box", outline: "none", color: "var(--text-1)" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block" };
const btnPrimary: React.CSSProperties = { padding: "8px 18px", background: "#1A4870", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "8px 14px", background: "var(--bg-tag)", color: "var(--text-2)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 13, cursor: "pointer" };

// ─────────────────────────────────────────────────────────────
export default function FaturasFornecedorPage() {
  const { fazendaId, contaId } = useAuth();
  const [cascade, setCascade] = useState<Partial<CascadeValues>>({});
  const fid = cascade.fazendaId ?? fazendaId ?? "";

  const [faturas,  setFaturas]  = useState<Fatura[]>([]);
  const [pessoas,  setPessoas]  = useState<Pessoa[]>([]);
  const [contas,   setContas]   = useState<ContaBancariaMin[]>([]);
  const [loading,  setLoading]  = useState(true);

  // Filtros lista
  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusFatura>("todos");
  const [filtroComp,   setFiltroComp]   = useState("");
  const [filtroPessoa, setFiltroPessoa] = useState("");

  // Modal Nova Fatura
  const [modalNova, setModalNova] = useState(false);
  const [nForm, setNForm] = useState({
    pessoa_id: "", fornecedor_nome: "", competencia: mesAtual(),
    numero_fatura: "", valor_total: 0, vencimento: "", observacao: "",
  });
  const [cpsPendentes, setCpsPendentes] = useState<Lancamento[]>([]);
  const [cpsSelecionados, setCpsSelecionados] = useState<Set<string>>(new Set());
  const [nSaving, setNSaving] = useState(false);
  const [nErr, setNErr] = useState("");

  // Modal Detalhe / Pagamento
  const [modalDetalhe, setModalDetalhe] = useState<Fatura | null>(null);
  const [cpsDetalhe, setCpsDetalhe] = useState<Lancamento[]>([]);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);

  // Modal Pagamento
  const [modalPagto, setModalPagto] = useState<Fatura | null>(null);
  const [pgForm, setPgForm] = useState({ data: hoje(), conta: "", obs: "" });
  const [pgSaving, setPgSaving] = useState(false);
  const [pgErr, setPgErr] = useState("");

  // ─── Carregar ────────────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fid) return;
    setLoading(true);
    const [{ data: ff }, { data: ps }, { data: cb }] = await Promise.all([
      supabase.from("faturas_fornecedor")
        .select("*")
        .eq("fazenda_id", fid)
        .order("competencia", { ascending: false })
        .order("created_at",  { ascending: false }),
      supabase.from("pessoas").select("id, nome, cpf_cnpj").eq("fazenda_id", fid).order("nome"),
      supabase.from("contas_bancarias").select("id, banco, agencia, conta, descricao").eq("fazenda_id", fid),
    ]);
    setFaturas((ff ?? []) as Fatura[]);
    setPessoas((ps ?? []) as Pessoa[]);
    setContas((cb ?? []) as ContaBancariaMin[]);
    setLoading(false);
  }, [fid]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Carregar CPs pendentes ao selecionar fornecedor+competência ─
  useEffect(() => {
    if (!modalNova || !fid || !nForm.pessoa_id || !nForm.competencia) {
      setCpsPendentes([]); setCpsSelecionados(new Set()); return;
    }
    const [y, m] = nForm.competencia.split("-");
    const ini = `${y}-${m}-01`;
    const fim = new Date(Number(y), Number(m), 0).toISOString().split("T")[0];

    supabase.from("lancamentos")
      .select("*")
      .eq("fazenda_id", fid)
      .eq("tipo", "pagar")
      .eq("pessoa_id", nForm.pessoa_id)
      .is("fatura_id", null)
      .in("status", ["em_aberto", "vencido", "vencendo"])
      .gte("data_lancamento", ini)
      .lte("data_lancamento", fim)
      .order("data_lancamento", { ascending: true })
      .then(({ data }) => {
        const cps = (data ?? []) as Lancamento[];
        setCpsPendentes(cps);
        // Pré-seleciona todos
        setCpsSelecionados(new Set(cps.map(c => c.id)));
      });
  }, [modalNova, fid, nForm.pessoa_id, nForm.competencia]);

  // ─── Soma das CPs selecionadas ───────────────────────────────
  const somaCpsSel = cpsPendentes
    .filter(c => cpsSelecionados.has(c.id))
    .reduce((s, c) => s + (c.moeda === "USD" ? c.valor * (c.cotacao_usd ?? 5.12) : c.valor), 0);

  // ─── Criar fatura ────────────────────────────────────────────
  async function salvarNovaFatura() {
    try {
      setNSaving(true); setNErr("");
      if (!fid) throw new Error("Fazenda não selecionada.");
      if (!nForm.pessoa_id) throw new Error("Selecione o fornecedor.");
      if (!nForm.competencia) throw new Error("Informe a competência.");
      if (nForm.valor_total <= 0) throw new Error("Informe o valor total da fatura.");

      const valorCp = somaCpsSel;
      const diff = Math.abs(nForm.valor_total - valorCp);
      if (diff > 0.01 && cpsSelecionados.size > 0) {
        // Aviso mas não bloqueia — diferenças ocorrem (descontos, notas canceladas)
      }

      const { data: fat, error } = await supabase.from("faturas_fornecedor").insert({
        fazenda_id:     fid,
        pessoa_id:      nForm.pessoa_id || null,
        fornecedor_nome: pessoas.find(p => p.id === nForm.pessoa_id)?.nome ?? nForm.fornecedor_nome,
        competencia:    nForm.competencia,
        numero_fatura:  nForm.numero_fatura || null,
        valor_total:    nForm.valor_total,
        valor_cp:       valorCp,
        status:         "aguardando_pagamento" as StatusFatura,
        vencimento:     nForm.vencimento || null,
        observacao:     nForm.observacao || null,
      }).select().single();

      if (error) throw new Error(error.message);

      // Vincular CPs selecionados à fatura
      if (cpsSelecionados.size > 0) {
        const ids = [...cpsSelecionados];
        await supabase.from("lancamentos")
          .update({ fatura_id: fat.id })
          .in("id", ids);
      }

      setModalNova(false);
      resetNForm();
      await carregar();
    } catch (e: unknown) {
      setNErr(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setNSaving(false);
    }
  }

  function resetNForm() {
    setNForm({ pessoa_id: "", fornecedor_nome: "", competencia: mesAtual(), numero_fatura: "", valor_total: 0, vencimento: "", observacao: "" });
    setCpsPendentes([]); setCpsSelecionados(new Set()); setNErr("");
  }

  // ─── Carregar detalhe ────────────────────────────────────────
  async function abrirDetalhe(f: Fatura) {
    setModalDetalhe(f);
    setLoadingDetalhe(true);
    const { data } = await supabase.from("lancamentos")
      .select("*")
      .eq("fatura_id", f.id)
      .order("data_lancamento", { ascending: true });
    setCpsDetalhe((data ?? []) as Lancamento[]);
    setLoadingDetalhe(false);
  }

  // ─── Pagar fatura ────────────────────────────────────────────
  async function registrarPagamento() {
    try {
      setPgSaving(true); setPgErr("");
      if (!modalPagto) return;
      if (!pgForm.data) throw new Error("Informe a data do pagamento.");

      // Atualiza fatura
      await supabase.from("faturas_fornecedor").update({
        status: "paga" as StatusFatura,
        data_pagamento: pgForm.data,
        conta_pagamento: pgForm.conta || null,
        observacao: pgForm.obs || modalPagto.observacao || null,
      }).eq("id", modalPagto.id);

      // Baixa todos os CPs vinculados
      await supabase.from("lancamentos").update({
        status: "baixado",
        data_baixa: pgForm.data,
        conta_bancaria: pgForm.conta || null,
      }).eq("fatura_id", modalPagto.id);

      setModalPagto(null);
      setModalDetalhe(null);
      await carregar();
    } catch (e: unknown) {
      setPgErr(e instanceof Error ? e.message : "Erro ao registrar pagamento.");
    } finally {
      setPgSaving(false);
    }
  }

  // ─── Cancelar fatura ─────────────────────────────────────────
  async function cancelarFatura(f: Fatura) {
    if (!confirm(`Cancelar a fatura ${f.numero_fatura ?? "s/nº"} de ${f.fornecedor_nome ?? "fornecedor"}?\n\nOs CPs vinculados serão desvinculados e retornam para "Em aberto".`)) return;
    await supabase.from("lancamentos").update({ fatura_id: null }).eq("fatura_id", f.id);
    await supabase.from("faturas_fornecedor").update({ status: "cancelada" }).eq("id", f.id);
    setModalDetalhe(null);
    await carregar();
  }

  // ─── Filtros ─────────────────────────────────────────────────
  const faturasFiltradas = faturas.filter(f => {
    if (filtroStatus !== "todos" && f.status !== filtroStatus) return false;
    if (filtroComp && f.competencia !== filtroComp) return false;
    if (filtroPessoa && f.pessoa_id !== filtroPessoa) return false;
    return true;
  });

  // ─── KPIs ────────────────────────────────────────────────────
  const abertas     = faturas.filter(f => f.status === "aguardando_pagamento" || f.status === "aberta");
  const valorAberto = abertas.reduce((s, f) => s + f.valor_total, 0);
  const vencendo7   = abertas.filter(f => { const d = diasAteVencer(f.vencimento); return d !== null && d >= 0 && d <= 7; });

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 48px" }}>

        {/* Cabeçalho */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>Faturas de Fornecedor</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Faturamento mensal — múltiplas NFs, um único documento de cobrança</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <CascadeSelector contaId={contaId ?? null} values={cascade} onChange={setCascade} levels={["fazenda"]} />
            <button style={btnPrimary} onClick={() => { setModalNova(true); resetNForm(); }}>+ Nova Fatura</button>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Faturas a Pagar", val: abertas.length.toString(), sub: "aguardando pagamento",      cor: "#378ADD" },
            { label: "Valor Total em Aberto", val: fmtBRL(valorAberto), sub: "soma das faturas abertas", cor: "#1A4870" },
            { label: "Vencendo em 7 dias",   val: vencendo7.length.toString(), sub: vencendo7.map(f => f.fornecedor_nome).join(", ") || "nenhuma", cor: vencendo7.length > 0 ? "#E24B4A" : "#16A34A" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.cor }}>{k.val}</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 180 }}>
            <label style={lbl}>Status</label>
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as typeof filtroStatus)} style={{ ...inp, padding: "6px 10px" }}>
              <option value="todos">Todos</option>
              <option value="aguardando_pagamento">Aguardando pagamento</option>
              <option value="aberta">Em aberto</option>
              <option value="paga">Pagas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <label style={lbl}>Competência</label>
            <input type="month" value={filtroComp} onChange={e => setFiltroComp(e.target.value)} style={{ ...inp, padding: "6px 10px" }} />
          </div>
          <div style={{ minWidth: 220 }}>
            <label style={lbl}>Fornecedor</label>
            <select value={filtroPessoa} onChange={e => setFiltroPessoa(e.target.value)} style={{ ...inp, padding: "6px 10px" }}>
              <option value="">Todos</option>
              {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          {(filtroStatus !== "todos" || filtroComp || filtroPessoa) && (
            <button onClick={() => { setFiltroStatus("todos"); setFiltroComp(""); setFiltroPessoa(""); }} style={{ ...btnSecondary, padding: "6px 12px" }}>Limpar</button>
          )}
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)", alignSelf: "center" }}>{faturasFiltradas.length} fatura{faturasFiltradas.length !== 1 ? "s" : ""}</div>
        </div>

        {/* Tabela */}
        <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>Carregando…</div>
          ) : faturasFiltradas.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-3)" }}>
              {faturas.length === 0 ? "Nenhuma fatura cadastrada. Clique em «+ Nova Fatura» para criar." : "Nenhuma fatura encontrada com os filtros selecionados."}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "0.5px solid var(--border-table)" }}>
                  {["Competência","Fornecedor","Nº Fatura","Vencimento","Valor Fatura","Valor CPs","Divergência","Status",""].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {faturasFiltradas.map((f, i) => {
                  const sm = STATUS_META[f.status];
                  const diff = f.valor_total - f.valor_cp;
                  const dias = diasAteVencer(f.vencimento);
                  const urgente = f.status !== "paga" && f.status !== "cancelada" && dias !== null && dias <= 3;
                  return (
                    <tr key={f.id} style={{ borderBottom: "0.5px solid var(--border-row)", background: i % 2 === 0 ? "transparent" : "var(--bg-row-alt)" }}>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-1)", fontWeight: 600 }}>
                        {fmtCompetencia(f.competencia)}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-1)" }}>
                        {f.fornecedor_nome ?? "—"}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-2)" }}>
                        {f.numero_fatura ?? <span style={{ color: "var(--text-4)" }}>s/nº</span>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: urgente ? "#E24B4A" : "var(--text-1)", fontWeight: urgente ? 700 : 400 }}>
                        {fmtData(f.vencimento)}
                        {urgente && <span style={{ marginLeft: 6, fontSize: 10, background: "#FCEBEB", color: "#E24B4A", borderRadius: 4, padding: "1px 5px" }}>URGENTE</span>}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-1)", fontWeight: 600, textAlign: "right" }}>
                        {fmtBRL(f.valor_total)}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 13, color: "var(--text-3)", textAlign: "right" }}>
                        {fmtBRL(f.valor_cp)}
                      </td>
                      <td style={{ padding: "10px 12px", fontSize: 12, textAlign: "right" }}>
                        {Math.abs(diff) < 0.01
                          ? <span style={{ color: "#16A34A" }}>✓ OK</span>
                          : <span style={{ color: diff > 0 ? "#E24B4A" : "#EF9F27", fontWeight: 600 }}>
                              {diff > 0 ? "+" : ""}{fmtBRL(diff)}
                            </span>
                        }
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, background: sm.bg, color: sm.cl, border: `0.5px solid ${sm.border}`, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>
                          {sm.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => abrirDetalhe(f)} style={{ ...btnSecondary, padding: "4px 10px", fontSize: 12 }}>Detalhe</button>
                          {(f.status === "aguardando_pagamento" || f.status === "aberta") && (
                            <button onClick={() => { setModalPagto(f); setPgForm({ data: hoje(), conta: "", obs: "" }); setPgErr(""); }} style={{ ...btnPrimary, padding: "4px 10px", fontSize: 12 }}>Pagar</button>
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

      {/* ── Modal Nova Fatura ───────────────────────────────────── */}
      {modalNova && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "24px 0", overflowY: "auto" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 760, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Nova Fatura de Fornecedor</div>
              <button onClick={() => { setModalNova(false); resetNForm(); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>

            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              {nErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{nErr}</div>}

              {/* Linha 1: Fornecedor + Competência + Nº Fatura */}
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Fornecedor *</label>
                  <SelectBusca
                    value={nForm.pessoa_id}
                    onChange={v => setNForm(f => ({ ...f, pessoa_id: v }))}
                    options={pessoas.map(p => ({ value: p.id, label: p.nome }))}
                    placeholder="Buscar fornecedor…"
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>Competência *</label>
                  <input type="month" value={nForm.competencia} onChange={e => setNForm(f => ({ ...f, competencia: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Nº do Documento de Cobrança</label>
                  <input value={nForm.numero_fatura} onChange={e => setNForm(f => ({ ...f, numero_fatura: e.target.value }))} style={inp} placeholder="Ex.: FAT-2026-07-001" />
                </div>
              </div>

              {/* Linha 2: Valor Total + Vencimento */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Valor Total da Fatura (R$) *</label>
                  <InputMonetario value={nForm.valor_total} onChange={v => setNForm(f => ({ ...f, valor_total: v }))} style={inp} />
                  <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>Conforme documento de cobrança recebido</div>
                </div>
                <div>
                  <label style={lbl}>Vencimento</label>
                  <input type="date" value={nForm.vencimento} onChange={e => setNForm(f => ({ ...f, vencimento: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Observação</label>
                  <input value={nForm.observacao} onChange={e => setNForm(f => ({ ...f, observacao: e.target.value }))} style={inp} placeholder="Opcional" />
                </div>
              </div>

              {/* CPs do mês */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>NFs / CPs do mês para vincular</span>
                  {cpsPendentes.length > 0 && (
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setCpsSelecionados(new Set(cpsPendentes.map(c => c.id)))} style={{ ...btnSecondary, padding: "3px 10px", fontSize: 11 }}>Sel. todos</button>
                      <button onClick={() => setCpsSelecionados(new Set())} style={{ ...btnSecondary, padding: "3px 10px", fontSize: 11 }}>Desmarcar</button>
                    </div>
                  )}
                </div>

                {!nForm.pessoa_id && (
                  <div style={{ padding: "14px 16px", background: "var(--bg-tag)", borderRadius: 8, fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
                    Selecione o fornecedor para ver as NFs/CPs sem fatura do mês.
                  </div>
                )}

                {nForm.pessoa_id && cpsPendentes.length === 0 && (
                  <div style={{ padding: "14px 16px", background: "var(--bg-tag)", borderRadius: 8, fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
                    Nenhuma NF/CP sem fatura encontrada para este fornecedor em {fmtCompetencia(nForm.competencia)}.
                  </div>
                )}

                {cpsPendentes.length > 0 && (
                  <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--bg-tag)", borderBottom: "0.5px solid var(--border)" }}>
                          <th style={{ padding: "6px 10px", width: 32 }}></th>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase" }}>Emissão</th>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase" }}>Descrição</th>
                          <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase" }}>Categoria</th>
                          <th style={{ padding: "6px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase" }}>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cpsPendentes.map((c, i) => (
                          <tr key={c.id} style={{ borderBottom: "0.5px solid var(--border-row)", background: i % 2 === 0 ? "transparent" : "var(--bg-row-alt)", cursor: "pointer" }}
                              onClick={() => setCpsSelecionados(prev => { const n = new Set(prev); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}>
                            <td style={{ padding: "8px 10px", textAlign: "center" }}>
                              <input type="checkbox" checked={cpsSelecionados.has(c.id)} readOnly style={{ cursor: "pointer" }} />
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-3)" }}>{fmtData(c.data_lancamento)}</td>
                            <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-1)" }}>{c.descricao}</td>
                            <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-3)" }}>{c.categoria}</td>
                            <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-1)", fontWeight: 600, textAlign: "right" }}>
                              {c.moeda === "USD" ? `US$ ${c.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : fmtBRL(c.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Rodapé soma */}
                    <div style={{ background: "var(--bg-tag)", borderTop: "0.5px solid var(--border)", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
                      <span style={{ color: "var(--text-2)" }}>{cpsSelecionados.size} de {cpsPendentes.length} NFs/CPs selecionadas</span>
                      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                        <span style={{ color: "var(--text-2)" }}>Soma CPs: <strong>{fmtBRL(somaCpsSel)}</strong></span>
                        {nForm.valor_total > 0 && Math.abs(nForm.valor_total - somaCpsSel) > 0.01 && (
                          <span style={{ color: nForm.valor_total > somaCpsSel ? "#E24B4A" : "#EF9F27", fontWeight: 600 }}>
                            Divergência: {fmtBRL(nForm.valor_total - somaCpsSel)}
                          </span>
                        )}
                        {nForm.valor_total > 0 && Math.abs(nForm.valor_total - somaCpsSel) <= 0.01 && (
                          <span style={{ color: "#16A34A", fontWeight: 600 }}>✓ Valores conferem</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnSecondary} onClick={() => { setModalNova(false); resetNForm(); }}>Cancelar</button>
              <button onClick={salvarNovaFatura} disabled={nSaving} style={{ ...btnPrimary, cursor: nSaving ? "default" : "pointer", opacity: nSaving ? 0.6 : 1 }}>
                {nSaving ? "Salvando…" : "Criar Fatura"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Detalhe ──────────────────────────────────────── */}
      {modalDetalhe && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "24px 0", overflowY: "auto" }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 680, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>
                  Fatura {modalDetalhe.numero_fatura ?? "s/nº"} — {modalDetalhe.fornecedor_nome}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  Competência {fmtCompetencia(modalDetalhe.competencia)} · Vencimento {fmtData(modalDetalhe.vencimento)}
                </div>
              </div>
              <button onClick={() => setModalDetalhe(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>

            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Resumo */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {[
                  { l: "Valor da Fatura", v: fmtBRL(modalDetalhe.valor_total), cor: "#1A4870" },
                  { l: "Soma dos CPs",    v: fmtBRL(modalDetalhe.valor_cp),    cor: "var(--text-1)" },
                  { l: "Divergência",     v: (() => { const d = modalDetalhe.valor_total - modalDetalhe.valor_cp; return Math.abs(d) < 0.01 ? "✓ OK" : (d > 0 ? "+" : "") + fmtBRL(d); })(), cor: Math.abs(modalDetalhe.valor_total - modalDetalhe.valor_cp) < 0.01 ? "#16A34A" : "#E24B4A" },
                ].map(k => (
                  <div key={k.l} style={{ background: "var(--bg-tag)", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", marginBottom: 4 }}>{k.l}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: k.cor }}>{k.v}</div>
                  </div>
                ))}
              </div>

              {/* CPs vinculados */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>NFs / CPs vinculadas</div>
                {loadingDetalhe ? (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>Carregando…</div>
                ) : cpsDetalhe.length === 0 ? (
                  <div style={{ padding: "12px 16px", background: "var(--bg-tag)", borderRadius: 8, fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>Nenhum CP vinculado.</div>
                ) : (
                  <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--bg-tag)", borderBottom: "0.5px solid var(--border)" }}>
                          {["Emissão","Descrição","Categoria","Vencimento","Valor","Status"].map(h => (
                            <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cpsDetalhe.map((c, i) => (
                          <tr key={c.id} style={{ borderBottom: "0.5px solid var(--border-row)", background: i % 2 === 0 ? "transparent" : "var(--bg-row-alt)" }}>
                            <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-3)" }}>{fmtData(c.data_lancamento)}</td>
                            <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-1)" }}>{c.descricao}</td>
                            <td style={{ padding: "8px 10px", fontSize: 11, color: "var(--text-3)" }}>{c.categoria}</td>
                            <td style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-3)" }}>{fmtData(c.data_vencimento)}</td>
                            <td style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--text-1)", textAlign: "right" }}>{fmtBRL(c.valor)}</td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5,
                                background: c.status === "baixado" ? "#DCFCE7" : "#E8F3FB",
                                color:      c.status === "baixado" ? "#166534" : "#0B2D50",
                                border: `0.5px solid ${c.status === "baixado" ? "#16A34A" : "#378ADD"}`,
                              }}>
                                {c.status === "baixado" ? "Pago" : "Em aberto"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {modalDetalhe.data_pagamento && (
                <div style={{ background: "#DCFCE7", border: "0.5px solid #16A34A", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#166534" }}>
                  Paga em {fmtData(modalDetalhe.data_pagamento)}{modalDetalhe.conta_pagamento ? ` — ${modalDetalhe.conta_pagamento}` : ""}.
                </div>
              )}
            </div>

            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between" }}>
              <div>
                {modalDetalhe.status !== "paga" && modalDetalhe.status !== "cancelada" && (
                  <button onClick={() => cancelarFatura(modalDetalhe)} style={{ ...btnSecondary, color: "#E24B4A", borderColor: "#E24B4A", padding: "6px 14px", fontSize: 12 }}>
                    Cancelar Fatura
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={btnSecondary} onClick={() => setModalDetalhe(null)}>Fechar</button>
                {(modalDetalhe.status === "aguardando_pagamento" || modalDetalhe.status === "aberta") && (
                  <button style={btnPrimary} onClick={() => { setModalPagto(modalDetalhe); setPgForm({ data: hoje(), conta: "", obs: "" }); setPgErr(""); setModalDetalhe(null); }}>
                    Registrar Pagamento
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Pagamento ──────────────────────────────────────── */}
      {modalPagto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2100 }}>
          <div style={{ background: "var(--bg-card)", borderRadius: 14, width: "100%", maxWidth: 460, margin: "0 20px", boxShadow: "0 4px 20px rgba(11,45,80,0.10)" }}>
            <div style={{ padding: "18px 22px 14px", borderBottom: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Registrar Pagamento</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{modalPagto.fornecedor_nome} — {fmtBRL(modalPagto.valor_total)}</div>
              </div>
              <button onClick={() => setModalPagto(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-3)" }}>×</button>
            </div>

            <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {pgErr && <div style={{ background: "#FCEBEB", border: "0.5px solid #F5C6C6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#791F1F" }}>{pgErr}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={lbl}>Data do Pagamento *</label>
                  <input type="date" value={pgForm.data} onChange={e => setPgForm(f => ({ ...f, data: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Conta Bancária</label>
                  <select value={pgForm.conta} onChange={e => setPgForm(f => ({ ...f, conta: e.target.value }))} style={inp}>
                    <option value="">— selecione —</option>
                    {contas.map(c => <option key={c.id} value={contaLabel(c)}>{contaLabel(c)}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Observação</label>
                <input value={pgForm.obs} onChange={e => setPgForm(f => ({ ...f, obs: e.target.value }))} style={inp} placeholder="Opcional" />
              </div>
              <div style={{ background: "#D5E8F5", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#0B2D50" }}>
                O pagamento baixará automaticamente <strong>todos os CPs vinculados</strong> a esta fatura, marcando-os como "Pago" na data informada.
              </div>
            </div>

            <div style={{ padding: "14px 22px 18px", borderTop: "0.5px solid var(--bg-tag)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnSecondary} onClick={() => setModalPagto(null)}>Cancelar</button>
              <button onClick={registrarPagamento} disabled={pgSaving} style={{ ...btnPrimary, cursor: pgSaving ? "default" : "pointer", opacity: pgSaving ? 0.6 : 1 }}>
                {pgSaving ? "Registrando…" : "Confirmar Pagamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
