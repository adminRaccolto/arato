"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import TopNav from "../../../components/TopNav";

// ─── Tipos ────────────────────────────────────────────────────
interface Empresa { id: string; nome: string; cnpj?: string; }
interface LinhaDRE {
  codigo: string;
  descricao: string;
  nivel: number;
  tipo: "titulo" | "linha" | "subtotal" | "total";
  valor: number;
  cor?: string;
}

// ─── Helpers ─────────────────────────────────────────────────
function moeda(v: number) {
  const abs = Math.abs(v);
  const fmt = abs.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return v < 0 ? `(${fmt})` : fmt;
}

function nomeMes(comp: string) {
  const [ano, mes] = comp.split("-");
  const nomes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${nomes[parseInt(mes) - 1]}/${ano}`;
}

function gerarCompetencias(meses = 12) {
  const lista = [];
  const d = new Date();
  for (let i = 0; i < meses; i++) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    lista.unshift(`${y}-${String(m).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return lista;
}

const S = {
  page:  { background: "#F4F6FA", minHeight: "100vh", fontFamily: "system-ui,sans-serif" },
  body:  { maxWidth: 1320, margin: "0 auto", padding: "24px 20px" },
  card:  { background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "block", marginBottom: 4 },
  inp:   { border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: "100%", background: "#fff" },
  btn:   (bg: string, color = "#fff") => ({ background: bg, color, border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
};

// ─── Estrutura DRE por empresa (simplificada) ─────────────────
function buildDRE(receitas: number, cogs: number, salarios: number, inssPatronal: number, fgts: number, outrasDespOp: number, despFinanceiras: number): LinhaDRE[] {
  const lucBruto  = receitas - cogs;
  const despOp    = salarios + inssPatronal + fgts + outrasDespOp;
  const ebitda    = lucBruto - despOp;
  const ebit      = ebitda; // sem depreciação por ora
  const lair      = ebit - despFinanceiras;
  const csll      = lair > 0 ? lair * 0.09  : 0;
  const irpj      = lair > 0 ? lair * 0.15  : 0;
  const lucLiq    = lair - csll - irpj;

  return [
    { codigo: "1",    descricao: "RECEITA BRUTA",                  nivel: 0, tipo: "titulo",   valor: 0 },
    { codigo: "1.1",  descricao: "Receita de Serviços / Fretes",    nivel: 1, tipo: "linha",    valor: receitas },
    { codigo: "1.T",  descricao: "TOTAL RECEITA BRUTA",             nivel: 0, tipo: "subtotal", valor: receitas, cor: "#1A4870" },
    { codigo: "2",    descricao: "CUSTOS DOS SERVIÇOS PRESTADOS",   nivel: 0, tipo: "titulo",   valor: 0 },
    { codigo: "2.1",  descricao: "Combustível e Manutenção",        nivel: 1, tipo: "linha",    valor: cogs },
    { codigo: "2.T",  descricao: "TOTAL CUSTOS SERVIÇOS",           nivel: 0, tipo: "subtotal", valor: -cogs, cor: "#E24B4A" },
    { codigo: "LB",   descricao: "= LUCRO BRUTO",                   nivel: 0, tipo: "total",    valor: lucBruto, cor: lucBruto >= 0 ? "#1A4870" : "#E24B4A" },
    { codigo: "3",    descricao: "DESPESAS OPERACIONAIS",           nivel: 0, tipo: "titulo",   valor: 0 },
    { codigo: "3.1",  descricao: "Salários (líquido folha)",        nivel: 1, tipo: "linha",    valor: salarios },
    { codigo: "3.2",  descricao: "INSS Patronal",                   nivel: 1, tipo: "linha",    valor: inssPatronal },
    { codigo: "3.3",  descricao: "FGTS",                            nivel: 1, tipo: "linha",    valor: fgts },
    { codigo: "3.4",  descricao: "Outras Despesas Operacionais",    nivel: 1, tipo: "linha",    valor: outrasDespOp },
    { codigo: "3.T",  descricao: "TOTAL DESPESAS OPERACIONAIS",     nivel: 0, tipo: "subtotal", valor: -despOp, cor: "#E24B4A" },
    { codigo: "EBITDA",descricao: "= EBITDA",                       nivel: 0, tipo: "total",    valor: ebitda,   cor: ebitda  >= 0 ? "#1A4870" : "#E24B4A" },
    { codigo: "4",    descricao: "DESPESAS FINANCEIRAS",            nivel: 0, tipo: "titulo",   valor: 0 },
    { codigo: "4.1",  descricao: "Juros e Encargos Financeiros",    nivel: 1, tipo: "linha",    valor: despFinanceiras },
    { codigo: "4.T",  descricao: "TOTAL DESP. FINANCEIRAS",         nivel: 0, tipo: "subtotal", valor: -despFinanceiras, cor: "#E24B4A" },
    { codigo: "LAIR", descricao: "= LAIR (antes do IRPJ)",          nivel: 0, tipo: "total",    valor: lair,     cor: lair    >= 0 ? "#1A4870" : "#E24B4A" },
    { codigo: "5",    descricao: "TRIBUTOS SOBRE LUCRO",            nivel: 0, tipo: "titulo",   valor: 0 },
    { codigo: "5.1",  descricao: "CSLL (9%)",                       nivel: 1, tipo: "linha",    valor: csll },
    { codigo: "5.2",  descricao: "IRPJ (15%)",                      nivel: 1, tipo: "linha",    valor: irpj },
    { codigo: "5.T",  descricao: "TOTAL TRIBUTOS",                  nivel: 0, tipo: "subtotal", valor: -(csll+irpj), cor: "#E24B4A" },
    { codigo: "LL",   descricao: "= LUCRO LÍQUIDO",                 nivel: 0, tipo: "total",    valor: lucLiq,   cor: lucLiq  >= 0 ? "#16A34A" : "#E24B4A" },
  ];
}

// ─── Componente ───────────────────────────────────────────────
export default function DREEmpresasPage() {
  const { fazendaId } = useAuth();
  const [empresas,  setEmpresas]  = useState<Empresa[]>([]);
  const [loading,   setLoading]   = useState(true);

  // filtros
  const [fEmpresa, setFEmpresa] = useState("");
  const [fDe,      setFDe]      = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-2); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
  const [fAte,     setFAte]     = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });

  // dados brutos
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [folhas,      setFolhas]      = useState<any[]>([]);
  const [fol_funcs,   setFolFuncs]    = useState<any[]>([]);

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    setLoading(true);
    try {
      const [{ data: emp }, { data: lanc }, { data: fols }] = await Promise.all([
        supabase.from("empresas").select("id,nome,cnpj").eq("fazenda_id", fazendaId).order("nome"),
        supabase.from("empresa_lancamentos")
          .select("id,tipo,valor,categoria,empresa_id,competencia,status,data_vencimento")
          .eq("fazenda_id", fazendaId)
          .gte("data_vencimento", fDe + "-01")
          .lte("data_vencimento", fAte + "-31"),
        supabase.from("folha_pagamento")
          .select("id,empresa_id,competencia,valor_bruto,valor_liquido,inss_patronal,fgts_total,status")
          .eq("fazenda_id", fazendaId)
          .gte("competencia", fDe)
          .lte("competencia", fAte),
      ]);
      setEmpresas(emp ?? []);
      setLancamentos(lanc ?? []);
      setFolhas(fols ?? []);
    } finally {
      setLoading(false);
    }
  }, [fazendaId, fDe, fAte]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Computar DRE por empresa ────────────────────────────────
  function computarDRE(empresaId: string): LinhaDRE[] {
    const lancs = lancamentos.filter(l => l.empresa_id === empresaId);
    const folsEmp = folhas.filter(f => f.empresa_id === empresaId && (f.status === "fechado" || f.status === "pago"));

    const receitas      = lancs.filter(l => l.tipo === "receber").reduce((s, l) => s + (l.valor || 0), 0);
    const desp          = lancs.filter(l => l.tipo === "pagar"  );
    const combustivel   = desp.filter(l => ["combustivel","manutencao","servicos_terceiros"].includes(l.categoria)).reduce((s,l) => s + (l.valor||0), 0);
    const outrasDespOp  = desp.filter(l => !["combustivel","manutencao","servicos_terceiros","salarios","financeiro","juros","encargos"].includes(l.categoria)).reduce((s,l) => s + (l.valor||0), 0);
    const despFinanc    = desp.filter(l => ["financeiro","juros","encargos"].includes(l.categoria)).reduce((s,l) => s + (l.valor||0), 0);

    const salarios    = folsEmp.reduce((s, f) => s + (f.valor_liquido   || 0), 0);
    const inssPatronal= folsEmp.reduce((s, f) => s + (f.inss_patronal   || 0), 0);
    const fgts        = folsEmp.reduce((s, f) => s + (f.fgts_total      || 0), 0);

    return buildDRE(receitas, combustivel, salarios, inssPatronal, fgts, outrasDespOp, despFinanc);
  }

  const empresasFiltradas = fEmpresa ? empresas.filter(e => e.id === fEmpresa) : empresas;

  return (
    <div style={S.page}>
      <TopNav />
      <div style={S.body}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>DRE por Empresa</h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>Demonstrativo de Resultado por empresa não-rural no período</p>
          </div>
          <button style={S.btn("#555")} onClick={() => window.print()}>Imprimir</button>
        </div>

        {/* filtros */}
        <div style={{ ...S.card, padding: 14, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 220px" }}>
              <label style={S.label}>Empresa</label>
              <select style={S.inp} value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}>
                <option value="">Todas as empresas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 0 150px" }}>
              <label style={S.label}>De (competência)</label>
              <input type="month" style={S.inp} value={fDe} onChange={e => setFDe(e.target.value)} />
            </div>
            <div style={{ flex: "0 0 150px" }}>
              <label style={S.label}>Até (competência)</label>
              <input type="month" style={S.inp} value={fAte} onChange={e => setFAte(e.target.value)} />
            </div>
            <button style={{ ...S.btn("#1A4870"), alignSelf: "flex-end" }} onClick={carregar}>Atualizar</button>
          </div>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Carregando...</div>}
        {!loading && empresasFiltradas.length === 0 && (
          <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#888" }}>
            Nenhuma empresa cadastrada. Cadastre empresas em <strong>Cadastros → Empresas</strong>.
          </div>
        )}

        {!loading && empresasFiltradas.map(emp => {
          const dre = computarDRE(emp.id);
          const lucLiq = dre.find(d => d.codigo === "LL")?.valor ?? 0;
          const receita = dre.find(d => d.codigo === "1.T")?.valor ?? 0;
          const ebitda  = dre.find(d => d.codigo === "EBITDA")?.valor ?? 0;
          const margem  = receita > 0 ? (lucLiq / receita * 100) : 0;

          return (
            <div key={emp.id} style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{emp.nome}</h2>
                  {emp.cnpj && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>CNPJ: {emp.cnpj}</div>}
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Período: {nomeMes(fDe)} a {nomeMes(fAte)}</div>
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "Receita Bruta", val: receita,  color: "#1A4870" },
                    { label: "EBITDA",        val: ebitda,   color: ebitda  >= 0 ? "#1A4870" : "#E24B4A" },
                    { label: "Lucro Líquido", val: lucLiq,   color: lucLiq  >= 0 ? "#16A34A" : "#E24B4A" },
                    { label: "Margem Líq.",   val: margem,   color: margem  >= 0 ? "#16A34A" : "#E24B4A", pct: true },
                  ].map(k => (
                    <div key={k.label} style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 16px", minWidth: 140 }}>
                      <div style={{ fontSize: 10, color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                        {(k as any).pct ? `${k.val.toFixed(1)}%` : moeda(k.val)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#555", borderBottom: "0.5px solid #DDE2EE", background: "#F4F6FA", textAlign: "left" }}>Conta</th>
                      <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#555", borderBottom: "0.5px solid #DDE2EE", background: "#F4F6FA", textAlign: "right" }}>Valor (R$)</th>
                      <th style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#555", borderBottom: "0.5px solid #DDE2EE", background: "#F4F6FA", textAlign: "right" }}>% Receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dre.map((linha, i) => {
                      if (linha.tipo === "titulo") {
                        return (
                          <tr key={i} style={{ background: "#F8FAFC" }}>
                            <td colSpan={3} style={{ padding: "10px 10px 6px", fontSize: 11, fontWeight: 700, color: "#1A4870", textTransform: "uppercase", letterSpacing: "0.04em", borderTop: i > 0 ? "0.5px solid #DDE2EE" : undefined }}>
                              {linha.descricao}
                            </td>
                          </tr>
                        );
                      }
                      if (linha.tipo === "total" || linha.tipo === "subtotal") {
                        return (
                          <tr key={i} style={{ background: linha.tipo === "total" ? "#F0F4FF" : "#FAFAFA" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700, fontSize: linha.tipo === "total" ? 14 : 13, paddingLeft: 10, color: linha.cor ?? "#1a1a1a", borderTop: "0.5px solid #DDE2EE", borderBottom: "0.5px solid #DDE2EE" }}>
                              {linha.descricao}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: linha.tipo === "total" ? 14 : 13, color: linha.cor ?? "#1a1a1a", fontVariantNumeric: "tabular-nums", borderTop: "0.5px solid #DDE2EE", borderBottom: "0.5px solid #DDE2EE" }}>
                              {moeda(linha.valor)}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "#888", fontVariantNumeric: "tabular-nums", borderTop: "0.5px solid #DDE2EE", borderBottom: "0.5px solid #DDE2EE" }}>
                              {receita > 0 && linha.valor !== 0 ? `${(Math.abs(linha.valor) / receita * 100).toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        );
                      }
                      // linha normal
                      if (linha.valor === 0) return null;
                      return (
                        <tr key={i} style={{ borderBottom: "0.5px solid #F4F6FA" }}>
                          <td style={{ padding: "6px 10px 6px 24px", fontSize: 13, color: "#555" }}>{linha.descricao}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{moeda(linha.valor)}</td>
                          <td style={{ padding: "6px 10px", textAlign: "right", fontSize: 12, color: "#888", fontVariantNumeric: "tabular-nums" }}>
                            {receita > 0 ? `${(linha.valor / receita * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Análise rápida */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginTop: 16, padding: 14, background: "#F4F6FA", borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Margem EBITDA</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: ebitda >= 0 ? "#1A4870" : "#E24B4A" }}>
                    {receita > 0 ? `${(ebitda / receita * 100).toFixed(1)}%` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Custo Folha / Receita</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#C9921B" }}>
                    {(() => {
                      const folsEmp = folhas.filter(f => f.empresa_id === emp.id && (f.status === "fechado" || f.status === "pago"));
                      const custoFolha = folsEmp.reduce((s, f) => s + (f.valor_bruto || 0) + (f.inss_patronal || 0), 0);
                      return receita > 0 ? `${(custoFolha / receita * 100).toFixed(1)}%` : "—";
                    })()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Ponto de Equilíbrio</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>
                    {receita > 0 && ebitda !== 0 ? (
                      ebitda > 0
                        ? <span style={{ color: "#16A34A" }}>Acima do PE ✓</span>
                        : <span style={{ color: "#E24B4A" }}>Abaixo do PE ✗</span>
                    ) : "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @media print {
          nav, button { display: none !important; }
          body { background: white; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
