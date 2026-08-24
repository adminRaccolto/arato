"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";

// ─── Tipos ────────────────────────────────────────────────────
interface Empresa { id: string; nome: string; }
interface Funcionario { id: string; nome: string; cargo?: string; salario_base?: number; }
interface FolhaFunc {
  id?: string;
  folha_id?: string;
  funcionario_id?: string;
  nome_funcionario: string;
  cargo: string;
  salario_bruto: number;
  inss_trabalhador: number;
  irrf: number;
  adiantamento: number;
  outros_descontos: number;
  desc_outros_descontos: string;
  vale_transporte: number;
  vale_refeicao: number;
  outros_beneficios: number;
  desc_outros_beneficios: string;
  inss_patronal: number;
  fgts: number;
  salario_liquido?: number;
  cp_lancamento_id?: string;
}
interface Folha {
  id: string;
  fazenda_id: string;
  empresa_id?: string;
  empresa_nome?: string;
  competencia: string;
  status: "rascunho" | "fechado" | "pago";
  valor_bruto: number;
  valor_liquido: number;
  inss_patronal: number;
  fgts_total: number;
  obs?: string;
  funcionarios?: FolhaFunc[];
}

// ─── Cálculos trabalhistas ───────────────────────────────────
function calcularINSS(bruto: number): number {
  // Tabela progressiva 2026
  const faixas = [
    { limite: 1518.00,  aliquota: 0.075 },
    { limite: 2793.88,  aliquota: 0.09  },
    { limite: 4190.83,  aliquota: 0.12  },
    { limite: 8157.41,  aliquota: 0.14  },
  ];
  let inss = 0;
  let anterior = 0;
  for (const f of faixas) {
    if (bruto <= anterior) break;
    const base = Math.min(bruto, f.limite) - anterior;
    inss += base * f.aliquota;
    anterior = f.limite;
    if (bruto <= f.limite) break;
  }
  return Math.round(inss * 100) / 100;
}

function calcularIRRF(bruto: number, inss: number): number {
  const base = bruto - inss;
  const faixas = [
    { limite: 2259.20,  aliquota: 0,      deducao: 0       },
    { limite: 2826.65,  aliquota: 0.075,  deducao: 169.44  },
    { limite: 3751.05,  aliquota: 0.15,   deducao: 381.44  },
    { limite: 4664.68,  aliquota: 0.225,  deducao: 662.77  },
    { limite: Infinity, aliquota: 0.275,  deducao: 896.00  },
  ];
  for (const f of faixas) {
    if (base <= f.limite) {
      const val = base * f.aliquota - f.deducao;
      return Math.max(0, Math.round(val * 100) / 100);
    }
  }
  return 0;
}

function calcularFGTS(bruto: number) { return Math.round(bruto * 0.08 * 100) / 100; }
function calcularINSSPatronal(bruto: number) { return Math.round(bruto * 0.28 * 100) / 100; } // 20% INSS + 8% FGTS + 5.8% terceiros ~28%

function liquidoCalc(f: FolhaFunc) {
  return Math.round((
    f.salario_bruto
    - f.inss_trabalhador
    - f.irrf
    - f.adiantamento
    - f.outros_descontos
    + f.vale_transporte
    + f.vale_refeicao
    + f.outros_beneficios
  ) * 100) / 100;
}

// ─── Helpers de formatação ───────────────────────────────────
function moeda(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function nomeMes(comp: string) {
  const [ano, mes] = comp.split("-");
  const nomes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${nomes[parseInt(mes) - 1]}/${ano}`;
}
function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Func vazia ───────────────────────────────────────────────
function funcVazia(bruto = 0): FolhaFunc {
  const inss = calcularINSS(bruto);
  const irrf = calcularIRRF(bruto, inss);
  return {
    nome_funcionario: "", cargo: "",
    salario_bruto: bruto, inss_trabalhador: inss, irrf,
    adiantamento: 0, outros_descontos: 0, desc_outros_descontos: "",
    vale_transporte: 0, vale_refeicao: 0, outros_beneficios: 0, desc_outros_beneficios: "",
    inss_patronal: calcularINSSPatronal(bruto),
    fgts: calcularFGTS(bruto),
  };
}

const STATUS_LABEL: Record<string, string> = { rascunho: "Rascunho", fechado: "Fechado", pago: "Pago" };
const STATUS_COLOR: Record<string, string> = { rascunho: "#888", fechado: "#C9921B", pago: "#16A34A" };

// ─── Estilos ──────────────────────────────────────────────────
const S = {
  page: { background: "#F4F6FA", minHeight: "100vh", fontFamily: "system-ui,sans-serif" },
  body: { maxWidth: 1280, margin: "0 auto", padding: "24px 20px" },
  card: { background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: 20, marginBottom: 16 },
  row: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" as const },
  label: { fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "block", marginBottom: 4 },
  inp: { border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: "100%", background: "#fff" },
  btn: (bg: string, color = "#fff") => ({ background: bg, color, border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
  badge: (status: string) => ({ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[status] ?? "#888", background: STATUS_COLOR[status] + "20", borderRadius: 4, padding: "2px 8px" }),
  th: { padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#555", borderBottom: "0.5px solid #DDE2EE", whiteSpace: "nowrap" as const, background: "#F4F6FA" },
  td: { padding: "7px 10px", fontSize: 13, borderBottom: "0.5px solid #F0F2F7", verticalAlign: "middle" as const },
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
  modal: { background: "#fff", borderRadius: 10, padding: 28, width: "min(96vw,900px)", maxHeight: "90vh", overflowY: "auto" as const, position: "relative" as const },
};

// ─── Componente Principal ─────────────────────────────────────
export default function FolhaPagamentoPage() {
  const { fazendaId } = useAuth();

  const [empresas,     setEmpresas]     = useState<Empresa[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [folhas,       setFolhas]       = useState<Folha[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState("");

  // filtros
  const [fEmpresa,    setFEmpresa]    = useState("");
  const [fComp,       setFComp]       = useState(competenciaAtual());

  // modal folha
  const [modalOpen,   setModalOpen]   = useState(false);
  const [folhaEdit,   setFolhaEdit]   = useState<Partial<Folha> & { funcionarios: FolhaFunc[] }>({ funcionarios: [] });
  const [abaModal,    setAbaModal]    = useState<"funcionarios"|"resumo">("funcionarios");

  // modal funcionário
  const [funcModalOpen, setFuncModalOpen] = useState(false);
  const [funcEdit,      setFuncEdit]      = useState<FolhaFunc>(funcVazia());
  const [funcIdx,       setFuncIdx]       = useState<number | null>(null);

  // ─── Carregar dados ──────────────────────────────────────────
  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const [{ data: emp }, { data: funcs }, { data: fols }] = await Promise.all([
        supabase.from("empresas").select("id,nome").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("funcionarios").select("id,nome,cargo,salario_base").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("folha_pagamento")
          .select("*, empresas(nome)")
          .eq("fazenda_id", fazendaId)
          .order("competencia", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);
      setEmpresas(emp ?? []);
      setFuncionarios(funcs ?? []);
      const lista = (fols ?? []).map((f: any) => ({
        ...f,
        empresa_nome: f.empresas?.nome ?? null,
      }));
      setFolhas(lista);
    } finally {
      setLoading(false);
    }
  }, [fazendaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Filtro ──────────────────────────────────────────────────
  const folhasFiltradas = folhas.filter(f => {
    if (fEmpresa && f.empresa_id !== fEmpresa) return false;
    if (fComp && f.competencia !== fComp) return false;
    return true;
  });

  // ─── Nova Folha ──────────────────────────────────────────────
  function novaFolha() {
    setFolhaEdit({
      fazenda_id: fazendaId ?? "",
      empresa_id: fEmpresa || undefined,
      competencia: fComp || competenciaAtual(),
      status: "rascunho",
      obs: "",
      funcionarios: [],
    });
    setAbaModal("funcionarios");
    setModalOpen(true);
  }

  // ─── Abrir folha existente ───────────────────────────────────
  async function abrirFolha(f: Folha) {
    const { data: funcs } = await supabase
      .from("folha_funcionarios")
      .select("*")
      .eq("folha_id", f.id)
      .order("nome_funcionario");
    setFolhaEdit({ ...f, funcionarios: funcs ?? [] });
    setAbaModal("funcionarios");
    setModalOpen(true);
  }

  // ─── Salvar folha (rascunho) ─────────────────────────────────
  async function salvarFolha() {
    if (!fazendaId) return;
    setSaving(true);
    try {
      const funcs = folhaEdit.funcionarios ?? [];
      const vBruto = funcs.reduce((s, f) => s + f.salario_bruto, 0);
      const vLiq   = funcs.reduce((s, f) => s + liquidoCalc(f), 0);
      const vInssP = funcs.reduce((s, f) => s + f.inss_patronal, 0);
      const vFgts  = funcs.reduce((s, f) => s + f.fgts, 0);

      const payload = {
        fazenda_id:    fazendaId,
        empresa_id:    folhaEdit.empresa_id || null,
        competencia:   folhaEdit.competencia,
        status:        folhaEdit.status ?? "rascunho",
        valor_bruto:   vBruto,
        valor_liquido: vLiq,
        inss_patronal: vInssP,
        fgts_total:    vFgts,
        obs:           folhaEdit.obs ?? null,
      };

      let folhaId = folhaEdit.id;
      if (folhaId) {
        await supabase.from("folha_pagamento").update(payload).eq("id", folhaId);
      } else {
        const { data, error } = await supabase.from("folha_pagamento").insert(payload).select("id").single();
        if (error) throw error;
        folhaId = data.id;
      }

      // salvar funcionários
      await supabase.from("folha_funcionarios").delete().eq("folha_id", folhaId);
      if (funcs.length > 0) {
        const rows = funcs.map(fn => ({
          folha_id:              folhaId,
          funcionario_id:        fn.funcionario_id || null,
          nome_funcionario:      fn.nome_funcionario,
          cargo:                 fn.cargo || null,
          salario_bruto:         fn.salario_bruto,
          inss_trabalhador:      fn.inss_trabalhador,
          irrf:                  fn.irrf,
          adiantamento:          fn.adiantamento,
          outros_descontos:      fn.outros_descontos,
          desc_outros_descontos: fn.desc_outros_descontos || null,
          vale_transporte:       fn.vale_transporte,
          vale_refeicao:         fn.vale_refeicao,
          outros_beneficios:     fn.outros_beneficios,
          desc_outros_beneficios:fn.desc_outros_beneficios || null,
          inss_patronal:         fn.inss_patronal,
          fgts:                  fn.fgts,
        }));
        await supabase.from("folha_funcionarios").insert(rows);
      }

      setMsg("Folha salva com sucesso.");
      setModalOpen(false);
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + (e.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  // ─── Fechar folha → gera CPs ─────────────────────────────────
  async function fecharFolha() {
    if (!folhaEdit.id && folhaEdit.status !== "rascunho") return;
    setSaving(true);
    try {
      // salvar primeiro
      await salvarFolha();
      // buscar ID recém-salvo
      const { data: fol } = await supabase.from("folha_pagamento")
        .select("id,empresa_id,competencia")
        .eq("fazenda_id", fazendaId!)
        .eq("competencia", folhaEdit.competencia!)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!fol) return;

      const { data: funcs } = await supabase.from("folha_funcionarios").select("*").eq("folha_id", fol.id);
      const mesLabel = nomeMes(fol.competencia);

      // gerar CP por funcionário
      for (const fn of funcs ?? []) {
        const liq = liquidoCalc(fn);
        const { data: cp } = await supabase.from("lancamentos").insert({
          fazenda_id:  fazendaId,
          empresa_id:  fol.empresa_id ?? null,
          tipo:        "pagar",
          descricao:   `Salário ${fn.nome_funcionario} — ${mesLabel}`,
          valor:       liq,
          data_vencimento: `${fol.competencia}-05`,
          status:      "pendente",
          categoria:   "salarios",
        }).select("id").single();
        if (cp?.id) {
          await supabase.from("folha_funcionarios").update({ cp_lancamento_id: cp.id }).eq("id", fn.id);
        }
      }

      await supabase.from("folha_pagamento").update({ status: "fechado" }).eq("id", fol.id);
      setMsg("Folha fechada — CPs geradas.");
      setModalOpen(false);
      carregar();
    } catch (e: any) {
      setMsg("Erro: " + (e.message ?? String(e)));
    } finally {
      setSaving(false);
    }
  }

  // ─── Registrar Pagamento ─────────────────────────────────────
  async function registrarPagamento() {
    if (!folhaEdit.id) return;
    setSaving(true);
    await supabase.from("folha_pagamento").update({ status: "pago" }).eq("id", folhaEdit.id);
    setMsg("Pagamento registrado.");
    setModalOpen(false);
    carregar();
    setSaving(false);
  }

  // ─── Modal Funcionário ───────────────────────────────────────
  function abrirFuncModal(idx: number | null) {
    if (idx !== null) {
      setFuncEdit({ ...folhaEdit.funcionarios![idx] });
    } else {
      setFuncEdit(funcVazia());
    }
    setFuncIdx(idx);
    setFuncModalOpen(true);
  }

  function autoCalc(bruto: number) {
    const inss = calcularINSS(bruto);
    const irrf = calcularIRRF(bruto, inss);
    setFuncEdit(p => ({
      ...p,
      salario_bruto: bruto,
      inss_trabalhador: inss,
      irrf,
      inss_patronal: calcularINSSPatronal(bruto),
      fgts: calcularFGTS(bruto),
    }));
  }

  function confirmarFunc() {
    const funcs = [...(folhaEdit.funcionarios ?? [])];
    if (funcIdx !== null) {
      funcs[funcIdx] = funcEdit;
    } else {
      funcs.push(funcEdit);
    }
    setFolhaEdit(p => ({ ...p, funcionarios: funcs }));
    setFuncModalOpen(false);
  }

  function removerFunc(idx: number) {
    const funcs = [...(folhaEdit.funcionarios ?? [])];
    funcs.splice(idx, 1);
    setFolhaEdit(p => ({ ...p, funcionarios: funcs }));
  }

  // ─── Totais do modal ─────────────────────────────────────────
  const funcs = folhaEdit.funcionarios ?? [];
  const totBruto   = funcs.reduce((s, f) => s + f.salario_bruto, 0);
  const totINSS    = funcs.reduce((s, f) => s + f.inss_trabalhador, 0);
  const totIRRF    = funcs.reduce((s, f) => s + f.irrf, 0);
  const totAdiant  = funcs.reduce((s, f) => s + f.adiantamento, 0);
  const totDesc    = funcs.reduce((s, f) => s + f.outros_descontos, 0);
  const totBenef   = funcs.reduce((s, f) => s + f.vale_transporte + f.vale_refeicao + f.outros_beneficios, 0);
  const totLiq     = funcs.reduce((s, f) => s + liquidoCalc(f), 0);
  const totInssP   = funcs.reduce((s, f) => s + f.inss_patronal, 0);
  const totFGTS    = funcs.reduce((s, f) => s + f.fgts, 0);
  const custoTotal = totBruto + totInssP;

  const inp2 = { ...S.inp, width: "auto", flex: 1 };

  return (
    <div style={S.page}>
      <TopNav />
      <div style={S.body}>
        {/* ── Cabeçalho ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Folha de Pagamento</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>Gestão de salários por empresa e competência</p>
          </div>
          <button style={S.btn("#1A4870")} onClick={novaFolha}>+ Nova Folha</button>
        </div>

        {msg && (
          <div style={{ background: msg.startsWith("Erro") ? "#FFF0F0" : "#F0FFF4", border: `0.5px solid ${msg.startsWith("Erro") ? "#E24B4A" : "#16A34A"}`, borderRadius: 6, padding: "10px 16px", fontSize: 13, marginBottom: 16, color: msg.startsWith("Erro") ? "#E24B4A" : "#16A34A" }}>
            {msg} <button onClick={() => setMsg("")} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}>×</button>
          </div>
        )}

        {/* ── Filtros ── */}
        <div style={{ ...S.card, padding: 14 }}>
          <div style={S.row}>
            <div style={{ flex: "0 0 200px" }}>
              <label style={S.label}>Empresa</label>
              <select style={S.inp} value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}>
                <option value="">Todas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                <option value="__fazenda__">Fazenda (sem empresa)</option>
              </select>
            </div>
            <div style={{ flex: "0 0 160px" }}>
              <label style={S.label}>Competência</label>
              <input type="month" style={S.inp} value={fComp} onChange={e => setFComp(e.target.value)} />
            </div>
            <button style={{ ...S.btn("transparent", "#555"), border: "0.5px solid #DDE2EE", marginTop: 16 }} onClick={() => { setFEmpresa(""); setFComp(""); }}>Limpar</button>
          </div>
        </div>

        {/* ── KPIs rápidos ── */}
        {folhasFiltradas.length > 0 && (() => {
          const abertos = folhasFiltradas.filter(f => f.status === "rascunho" || f.status === "fechado");
          const totLiqAll = folhasFiltradas.reduce((s, f) => s + (f.valor_liquido || 0), 0);
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Total em Folhas", val: moeda(totLiqAll), color: "#1A4870" },
                { label: "Folhas Abertas", val: abertos.length, color: "#C9921B" },
                { label: "Funcionários (filtro)", val: folhasFiltradas.reduce((s, f) => s + 0, 0), color: "#555" },
              ].map(k => (
                <div key={k.label} style={{ ...S.card, padding: "14px 18px", margin: 0 }}>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" }}>{k.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.val}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── Tabela de Folhas ── */}
        <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#888" }}>Carregando...</div>
          ) : folhasFiltradas.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#888" }}>
              Nenhuma folha encontrada. Clique em <strong>+ Nova Folha</strong> para começar.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Competência","Empresa","Status","Funcionários","Bruto","Custo INSS","Líquido a Pagar",""].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {folhasFiltradas.map(f => (
                    <tr key={f.id} style={{ cursor: "pointer" }} onClick={() => abrirFolha(f)}>
                      <td style={{ ...S.td, fontWeight: 700 }}>{nomeMes(f.competencia)}</td>
                      <td style={S.td}>{f.empresa_nome ?? <span style={{ color: "#aaa" }}>Fazenda</span>}</td>
                      <td style={S.td}><span style={S.badge(f.status)}>{STATUS_LABEL[f.status]}</span></td>
                      <td style={{ ...S.td, textAlign: "center" }}>—</td>
                      <td style={{ ...S.td, fontVariantNumeric: "tabular-nums" }}>{moeda(f.valor_bruto)}</td>
                      <td style={{ ...S.td, fontVariantNumeric: "tabular-nums", color: "#E24B4A" }}>{moeda(f.inss_patronal)}</td>
                      <td style={{ ...S.td, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{moeda(f.valor_liquido)}</td>
                      <td style={S.td}><button style={{ ...S.btn("#1A4870"), fontSize: 12, padding: "4px 10px" }} onClick={e => { e.stopPropagation(); abrirFolha(f); }}>Abrir</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          Modal Folha
      ════════════════════════════════════════════════════════════ */}
      {modalOpen && (
        <div style={S.overlay} onClick={() => setModalOpen(false)}>
          <div style={{ ...S.modal, width: "min(96vw,1100px)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                  {folhaEdit.id ? `Folha — ${nomeMes(folhaEdit.competencia!)}` : "Nova Folha de Pagamento"}
                </h2>
                {folhaEdit.status && (
                  <span style={{ ...S.badge(folhaEdit.status), marginTop: 4, display: "inline-block" }}>{STATUS_LABEL[folhaEdit.status]}</span>
                )}
              </div>
              <button onClick={() => setModalOpen(false)} style={{ ...S.btn("transparent", "#555"), fontSize: 18, padding: "0 6px" }}>×</button>
            </div>

            {/* Campos cabeçalho */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 18, padding: 14, background: "#F4F6FA", borderRadius: 8 }}>
              <div>
                <label style={S.label}>Competência *</label>
                <input type="month" style={S.inp} value={folhaEdit.competencia ?? ""} onChange={e => setFolhaEdit(p => ({ ...p, competencia: e.target.value }))} />
              </div>
              <div>
                <label style={S.label}>Empresa</label>
                <select style={S.inp} value={folhaEdit.empresa_id ?? ""} onChange={e => setFolhaEdit(p => ({ ...p, empresa_id: e.target.value || undefined }))}>
                  <option value="">— Fazenda (sem empresa) —</option>
                  {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Observações</label>
                <input style={S.inp} value={folhaEdit.obs ?? ""} onChange={e => setFolhaEdit(p => ({ ...p, obs: e.target.value }))} placeholder="Observações gerais..." />
              </div>
            </div>

            {/* Abas */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "0.5px solid #DDE2EE" }}>
              {(["funcionarios","resumo"] as const).map(a => (
                <button key={a} onClick={() => setAbaModal(a)} style={{ ...S.btn(abaModal === a ? "#1A4870" : "transparent", abaModal === a ? "#fff" : "#555"), borderRadius: "6px 6px 0 0", fontSize: 13 }}>
                  {a === "funcionarios" ? `Funcionários (${funcs.length})` : "Resumo Financeiro"}
                </button>
              ))}
            </div>

            {/* ─── Aba Funcionários ─── */}
            {abaModal === "funcionarios" && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <button style={S.btn("#C9921B")} onClick={() => abrirFuncModal(null)}>+ Adicionar Funcionário</button>
                </div>
                {funcs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 32, color: "#888", background: "#F4F6FA", borderRadius: 8 }}>
                    Nenhum funcionário adicionado. Clique em <strong>+ Adicionar Funcionário</strong>.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["Funcionário","Cargo","Bruto","INSS","IRRF","Adiant.","Benefícios","Líquido",""].map(h => (
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {funcs.map((fn, i) => (
                          <tr key={i}>
                            <td style={{ ...S.td, fontWeight: 600 }}>{fn.nome_funcionario}</td>
                            <td style={{ ...S.td, color: "#666" }}>{fn.cargo || "—"}</td>
                            <td style={{ ...S.td, fontVariantNumeric: "tabular-nums" }}>{moeda(fn.salario_bruto)}</td>
                            <td style={{ ...S.td, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{moeda(fn.inss_trabalhador)}</td>
                            <td style={{ ...S.td, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{moeda(fn.irrf)}</td>
                            <td style={{ ...S.td, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{fn.adiantamento > 0 ? moeda(fn.adiantamento) : "—"}</td>
                            <td style={{ ...S.td, color: "#16A34A", fontVariantNumeric: "tabular-nums" }}>{(fn.vale_transporte + fn.vale_refeicao + fn.outros_beneficios) > 0 ? moeda(fn.vale_transporte + fn.vale_refeicao + fn.outros_beneficios) : "—"}</td>
                            <td style={{ ...S.td, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{moeda(liquidoCalc(fn))}</td>
                            <td style={S.td}>
                              <div style={{ display: "flex", gap: 4 }}>
                                <button style={S.btn("#1A4870", "#fff")} onClick={() => abrirFuncModal(i)} title="Editar">✏</button>
                                <button style={S.btn("#E24B4A")} onClick={() => removerFunc(i)} title="Remover">✕</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: "#F4F6FA" }}>
                          <td colSpan={2} style={{ ...S.td, fontWeight: 700 }}>TOTAL</td>
                          <td style={{ ...S.td, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{moeda(totBruto)}</td>
                          <td style={{ ...S.td, fontWeight: 700, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{moeda(totINSS)}</td>
                          <td style={{ ...S.td, fontWeight: 700, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{moeda(totIRRF)}</td>
                          <td style={{ ...S.td, fontWeight: 700, color: "#E24B4A", fontVariantNumeric: "tabular-nums" }}>{moeda(totAdiant)}</td>
                          <td style={{ ...S.td, fontWeight: 700, color: "#16A34A", fontVariantNumeric: "tabular-nums" }}>{moeda(totBenef)}</td>
                          <td style={{ ...S.td, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{moeda(totLiq)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ─── Aba Resumo ─── */}
            {abaModal === "resumo" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>Encargos do Trabalhador</h3>
                  {[
                    { label: "Salário Bruto Total",      val: totBruto,  color: "#1a1a1a" },
                    { label: "(-) INSS Trabalhador",     val: -totINSS,  color: "#E24B4A" },
                    { label: "(-) IRRF",                 val: -totIRRF,  color: "#E24B4A" },
                    { label: "(-) Adiantamentos",        val: -totAdiant,color: "#E24B4A" },
                    { label: "(-) Outros Descontos",     val: -totDesc,  color: "#E24B4A" },
                    { label: "(+) Vale Transporte",      val: totBenef,  color: "#16A34A" },
                    { label: "= LÍQUIDO A PAGAR",        val: totLiq,    color: "#1A4870", bold: true },
                  ].map(r => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "0.5px solid #F0F2F7", padding: "8px 0" }}>
                      <span style={{ fontSize: 13, color: "#555", fontWeight: (r as any).bold ? 700 : 400 }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: (r as any).bold ? 700 : 600, color: r.color, fontVariantNumeric: "tabular-nums" }}>{moeda(Math.abs(r.val))}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 14 }}>Custo Patronal (Empresa)</h3>
                  {[
                    { label: "Salário Bruto Total",    val: totBruto,   color: "#1a1a1a" },
                    { label: "(+) INSS Patronal (20%+RAT+3ª)", val: totInssP,color: "#E24B4A" },
                    { label: "(+) FGTS (8%)",          val: totFGTS,    color: "#E24B4A" },
                    { label: "= CUSTO TOTAL c/ Folha", val: custoTotal, color: "#1A4870", bold: true },
                  ].map(r => (
                    <div key={r.label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "0.5px solid #F0F2F7", padding: "8px 0" }}>
                      <span style={{ fontSize: 13, color: "#555", fontWeight: (r as any).bold ? 700 : 400 }}>{r.label}</span>
                      <span style={{ fontSize: 13, fontWeight: (r as any).bold ? 700 : 600, color: r.color, fontVariantNumeric: "tabular-nums" }}>{moeda(r.val)}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 20, padding: 14, background: "#FBF3E0", borderRadius: 8, border: "0.5px solid #C9921B" }}>
                    <div style={{ fontSize: 11, color: "#C9921B", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>Nota</div>
                    <div style={{ fontSize: 12, color: "#7a5a00" }}>
                      INSS Patronal: 20% + RAT estimado (2%) + contribuições a terceiros (5,8%) = ~28% sobre bruto.<br />
                      FGTS: 8% sobre bruto + multa rescisória (quando aplicável).
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24, borderTop: "0.5px solid #DDE2EE", paddingTop: 16 }}>
              <button style={{ ...S.btn("transparent", "#555"), border: "0.5px solid #DDE2EE" }} onClick={() => setModalOpen(false)}>Fechar</button>
              <div style={{ display: "flex", gap: 8 }}>
                {(folhaEdit.status === "rascunho" || !folhaEdit.id) && (
                  <>
                    <button style={S.btn("#555")} onClick={salvarFolha} disabled={saving}>{saving ? "Salvando..." : "Salvar Rascunho"}</button>
                    <button style={S.btn("#C9921B")} onClick={fecharFolha} disabled={saving || funcs.length === 0} title={funcs.length === 0 ? "Adicione funcionários primeiro" : "Fechar folha e gerar CPs"}>
                      {saving ? "Processando..." : "✓ Fechar Folha & Gerar CPs"}
                    </button>
                  </>
                )}
                {folhaEdit.status === "fechado" && (
                  <>
                    <button style={S.btn("#555")} onClick={salvarFolha} disabled={saving}>Atualizar</button>
                    <button style={S.btn("#16A34A")} onClick={registrarPagamento} disabled={saving}>✓ Registrar Pagamento</button>
                  </>
                )}
                {folhaEdit.status === "pago" && (
                  <span style={{ fontSize: 13, color: "#16A34A", fontWeight: 700, alignSelf: "center" }}>✓ Folha paga</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          Modal Funcionário
      ════════════════════════════════════════════════════════════ */}
      {funcModalOpen && (
        <div style={{ ...S.overlay, zIndex: 1100 }} onClick={() => setFuncModalOpen(false)}>
          <div style={{ ...S.modal, width: "min(96vw,680px)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{funcIdx !== null ? "Editar Funcionário" : "Adicionar Funcionário"}</h3>
              <button onClick={() => setFuncModalOpen(false)} style={{ ...S.btn("transparent", "#555"), fontSize: 18 }}>×</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={S.label}>Funcionário</label>
                <select style={S.inp} value={funcEdit.funcionario_id ?? ""} onChange={e => {
                  const fid = e.target.value;
                  const found = funcionarios.find(f => f.id === fid);
                  if (found) {
                    const bruto = found.salario_base ?? 0;
                    const inss  = calcularINSS(bruto);
                    const irrf  = calcularIRRF(bruto, inss);
                    setFuncEdit(p => ({
                      ...p,
                      funcionario_id:   fid,
                      nome_funcionario: found.nome,
                      cargo:            found.cargo ?? "",
                      salario_bruto:    bruto,
                      inss_trabalhador: inss,
                      irrf,
                      inss_patronal:    calcularINSSPatronal(bruto),
                      fgts:             calcularFGTS(bruto),
                    }));
                  } else {
                    setFuncEdit(p => ({ ...p, funcionario_id: undefined }));
                  }
                }}>
                  <option value="">— Digitar manualmente —</option>
                  {funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Nome *</label>
                <input style={S.inp} value={funcEdit.nome_funcionario} onChange={e => setFuncEdit(p => ({ ...p, nome_funcionario: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div>
                <label style={S.label}>Cargo</label>
                <input style={S.inp} value={funcEdit.cargo} onChange={e => setFuncEdit(p => ({ ...p, cargo: e.target.value }))} placeholder="Motorista, Aux. Adm..." />
              </div>
            </div>

            <div style={{ background: "#F4F6FA", borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Remuneração</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={S.label}>Salário Bruto *</label>
                  <input type="number" step="0.01" style={S.inp} value={funcEdit.salario_bruto || ""} onChange={e => autoCalc(parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label style={{ ...S.label, color: "#E24B4A" }}>(-) INSS Trabalhador</label>
                  <input type="number" step="0.01" style={{ ...S.inp, color: "#E24B4A" }} value={funcEdit.inss_trabalhador || ""} onChange={e => setFuncEdit(p => ({ ...p, inss_trabalhador: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ ...S.label, color: "#E24B4A" }}>(-) IRRF</label>
                  <input type="number" step="0.01" style={{ ...S.inp, color: "#E24B4A" }} value={funcEdit.irrf || ""} onChange={e => setFuncEdit(p => ({ ...p, irrf: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ ...S.label, color: "#E24B4A" }}>(-) Adiantamento</label>
                  <input type="number" step="0.01" style={S.inp} value={funcEdit.adiantamento || ""} onChange={e => setFuncEdit(p => ({ ...p, adiantamento: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ ...S.label, color: "#E24B4A" }}>(-) Outros Descontos</label>
                  <input type="number" step="0.01" style={S.inp} value={funcEdit.outros_descontos || ""} onChange={e => setFuncEdit(p => ({ ...p, outros_descontos: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ ...S.label, color: "#888" }}>Desc. Outros Descontos</label>
                  <input style={S.inp} value={funcEdit.desc_outros_descontos} onChange={e => setFuncEdit(p => ({ ...p, desc_outros_descontos: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={{ background: "#F0FFF4", borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Benefícios</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ ...S.label, color: "#16A34A" }}>(+) Vale Transporte</label>
                  <input type="number" step="0.01" style={S.inp} value={funcEdit.vale_transporte || ""} onChange={e => setFuncEdit(p => ({ ...p, vale_transporte: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ ...S.label, color: "#16A34A" }}>(+) Vale Refeição</label>
                  <input type="number" step="0.01" style={S.inp} value={funcEdit.vale_refeicao || ""} onChange={e => setFuncEdit(p => ({ ...p, vale_refeicao: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={{ ...S.label, color: "#16A34A" }}>(+) Outros Benefícios</label>
                  <input type="number" step="0.01" style={S.inp} value={funcEdit.outros_beneficios || ""} onChange={e => setFuncEdit(p => ({ ...p, outros_beneficios: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>

            <div style={{ background: "#F0F4FF", borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Custo Patronal (calculado)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={S.label}>INSS Patronal (~28%)</label>
                  <input type="number" step="0.01" style={S.inp} value={funcEdit.inss_patronal || ""} onChange={e => setFuncEdit(p => ({ ...p, inss_patronal: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={S.label}>FGTS (8%)</label>
                  <input type="number" step="0.01" style={S.inp} value={funcEdit.fgts || ""} onChange={e => setFuncEdit(p => ({ ...p, fgts: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>

            {/* Preview líquido */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#1A4870", borderRadius: 8, marginBottom: 18 }}>
              <span style={{ fontSize: 14, color: "#D5E8F5", fontWeight: 600 }}>Salário Líquido a Pagar</span>
              <span style={{ fontSize: 22, color: "#fff", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{moeda(liquidoCalc(funcEdit))}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button style={{ ...S.btn("transparent", "#555"), border: "0.5px solid #DDE2EE" }} onClick={() => setFuncModalOpen(false)}>Cancelar</button>
              <button style={S.btn("#1A4870")} onClick={confirmarFunc} disabled={!funcEdit.nome_funcionario || funcEdit.salario_bruto <= 0}>
                {funcIdx !== null ? "Salvar Alterações" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
