"use client";
import { OperationalButton, OperationalFilters, OperationalGrid, OperationalHeading } from "../../../components/OperationalUI";
import SelectField from "../../../components/SelectField";
import InputData from "../../../components/InputData";
import { useState, useEffect, useCallback, useRef } from "react";
import { buscarPaginado } from "../../../lib/buscar-paginado";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";
import { ultimoDiaMes } from "../../../lib/resultados/apuracao";
import { apurarEmpresa, type RegistroEmpresa } from "../../../lib/resultados/empresa";
import { abrirPreviewImpressao } from "../../../lib/print";
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


const S = {
  page:  { background: "#F4F6FA", minHeight: "100vh", fontFamily: "system-ui,sans-serif" },
  body:  { maxWidth: 1320, margin: "0 auto", padding: "24px 20px" },
  card:  { background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 8, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "block", marginBottom: 4 },
  inp:   { border: "0.5px solid #DDE2EE", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: "100%", background: "#fff" },
  btn:   (bg: string, color = "#fff") => ({ background: bg, color, border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }),
};

// ─── Estrutura DRE por empresa (simplificada) ─────────────────
function buildDRE(receitas: number, cogs: number, salarios: number, inssPatronal: number, fgts: number, outrasDespOp: number, despFinanceiras: number, depreciacao = 0, deducoes = 0, descontos = 0, receitasFinanceiras = 0, outrasReceitas = 0): LinhaDRE[] {
  const lucBruto  = receitas - deducoes - cogs;
  const despOp    = salarios + inssPatronal + fgts + outrasDespOp;
  const ebitda    = lucBruto - despOp;
  const ebit      = ebitda - depreciacao;
  const lair      = ebit + receitasFinanceiras + outrasReceitas - despFinanceiras;
  const lucLiq = lair + descontos;

  return [
    { codigo: "1",    descricao: "RECEITA BRUTA",                  nivel: 0, tipo: "titulo",   valor: 0 },
    { codigo: "1.1",  descricao: "Receita de Serviços / Fretes",    nivel: 1, tipo: "linha",    valor: receitas },
    { codigo: "1.T",  descricao: "TOTAL RECEITA BRUTA",             nivel: 0, tipo: "subtotal", valor: receitas, cor: "#1A4870" },
    { codigo: "DED", descricao: "Deduções registradas da receita", nivel: 1, tipo: "linha", valor: -deducoes },
    { codigo: "2",    descricao: "CUSTOS DOS SERVIÇOS PRESTADOS",   nivel: 0, tipo: "titulo",   valor: 0 },
    { codigo: "2.1",  descricao: "Custos diretos (classificação gerencial)",        nivel: 1, tipo: "linha",    valor: cogs },
    { codigo: "2.T",  descricao: "TOTAL CUSTOS SERVIÇOS",           nivel: 0, tipo: "subtotal", valor: -cogs, cor: "#E24B4A" },
    { codigo: "LB",   descricao: "= LUCRO BRUTO",                   nivel: 0, tipo: "total",    valor: lucBruto, cor: lucBruto >= 0 ? "#1A4870" : "#E24B4A" },
    { codigo: "3",    descricao: "DESPESAS OPERACIONAIS",           nivel: 0, tipo: "titulo",   valor: 0 },
    { codigo: "3.1",  descricao: "Salários brutos e complemento",        nivel: 1, tipo: "linha",    valor: salarios },
    { codigo: "3.2",  descricao: "INSS Patronal",                   nivel: 1, tipo: "linha",    valor: inssPatronal },
    { codigo: "3.3",  descricao: "FGTS",                            nivel: 1, tipo: "linha",    valor: fgts },
    { codigo: "3.4",  descricao: "Outras Despesas Operacionais",    nivel: 1, tipo: "linha",    valor: outrasDespOp },
    { codigo: "3.T",  descricao: "TOTAL DESPESAS OPERACIONAIS",     nivel: 0, tipo: "subtotal", valor: -despOp, cor: "#E24B4A" },
    { codigo: "EBITDA",descricao: "= EBITDA",                       nivel: 0, tipo: "total",    valor: ebitda,   cor: ebitda  >= 0 ? "#1A4870" : "#E24B4A" },
    { codigo: "DEP", descricao: "Depreciação registrada", nivel: 1, tipo: "linha", valor: -depreciacao },
    { codigo: "EBIT", descricao: "= RESULTADO OPERACIONAL", nivel: 0, tipo: "total", valor: ebit },
    { codigo: "4",    descricao: "DESPESAS FINANCEIRAS",            nivel: 0, tipo: "titulo",   valor: 0 },
    { codigo: "RF", descricao: "Receitas financeiras e outras receitas", nivel: 1, tipo: "linha", valor: receitasFinanceiras + outrasReceitas },
    { codigo: "4.1",  descricao: "Juros e Encargos Financeiros",    nivel: 1, tipo: "linha",    valor: despFinanceiras },
    { codigo: "4.T",  descricao: "TOTAL DESP. FINANCEIRAS",         nivel: 0, tipo: "subtotal", valor: -despFinanceiras, cor: "#E24B4A" },
    { codigo: "LAIR", descricao: "= LAIR (antes do IRPJ)",          nivel: 0, tipo: "total",    valor: lair,     cor: lair    >= 0 ? "#1A4870" : "#E24B4A" },
    { codigo: "DESC", descricao: "Descontos obtidos", nivel: 1, tipo: "linha", valor: descontos },
    { codigo: "LL", descricao: "= RESULTADO GERENCIAL (tributos conforme lançamentos)", nivel: 0, tipo: "total", valor: lucLiq, cor: lucLiq >= 0 ? "#16A34A" : "#E24B4A" },
  ];
}

// ─── Componente ───────────────────────────────────────────────
export default function DREEmpresasPage() {
  const { fazendaId, fazendaIds } = useAuth();
  const [empresas,  setEmpresas]  = useState<Empresa[]>([]);
  const [loading,   setLoading]   = useState(true);

  // filtros
  const [fEmpresa, setFEmpresa] = useState("");
  const [fDe,      setFDe]      = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-2); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
  const [fAte,     setFAte]     = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });

  // dados brutos
  const [lancamentos, setLancamentos] = useState<RegistroEmpresa[]>([]);
  const [folhas,      setFolhas]      = useState<RegistroEmpresa[]>([]);
  const [fol_funcs, setFolFuncs] = useState<RegistroEmpresa[]>([]);
  const [ogMap, setOgMap] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState("");
  const [geradoPara, setGeradoPara] = useState("");
  const sequencia = useRef(0), areaRelatorio = useRef<HTMLDivElement>(null);
  const chave = JSON.stringify([fazendaId, fazendaIds, fDe, fAte]);
  const vigente = geradoPara === chave;

  const carregar = useCallback(async () => {
    if (!fazendaId) return;
    const req = ++sequencia.current;
    setLoading(true); setErro(""); setGeradoPara("");
    // Empresas, lançamentos e folhas de todo o cliente — nunca só de uma fazenda.
    const fids = fazendaIds.length ? fazendaIds : [fazendaId];
    try {
      if (!fDe || !fAte || fDe > fAte) throw new Error("Informe um período válido.");
      const [{ data: emp, error: erroEmp }, lanc, fols] = await Promise.all([
        supabase.from("empresas").select("id,nome,cnpj").in("fazenda_id", fids).order("nome"),
        buscarPaginado<Record<string, unknown>>((de, ate) => supabase.from("empresa_lancamentos")
          .select("*")
          .in("fazenda_id", fids)
          .gte("data_vencimento", fDe + "-01")
          .lte("data_vencimento", ultimoDiaMes(fAte))
          .order("id").range(de, ate)),
        buscarPaginado<Record<string, unknown>>((de, ate) => supabase.from("folha_pagamento")
          .select("*")
          .in("fazenda_id", fids)
          .gte("competencia", fDe)
          .lte("competencia", fAte)
          .order("id").range(de, ate)),
      ]);
      if (erroEmp) throw erroEmp;
      const fechadas = fols.filter(f => f.status === "fechado" || f.status === "pago");
      const funcs: RegistroEmpresa[] = [], ids = fechadas.map(f => String(f.id));
      for (let i = 0; i < ids.length; i += 150) funcs.push(...await buscarPaginado<RegistroEmpresa>((de, ate) => supabase.from("folha_funcionarios").select("*").in("folha_id", ids.slice(i, i + 150)).order("id").range(de, ate)));
      const ogIds = [...new Set(lanc.map(l => l.operacao_gerencial_id).filter(Boolean).map(String))];
      const ogs: RegistroEmpresa[] = [];
      for (let i = 0; i < ogIds.length; i += 150) ogs.push(...await buscarPaginado<RegistroEmpresa>((de, ate) => supabase.from("operacoes_gerenciais").select("id,classificacao").in("id", ogIds.slice(i, i + 150)).order("id").range(de, ate)));
      const mapa = new Map(ogs.map(o => [String(o.id), String(o.classificacao)]));
      // Valida moedas antes de publicar qualquer total.
      apurarEmpresa(lanc, funcs, mapa);
      if (req !== sequencia.current) return;
      setEmpresas(emp ?? []); setLancamentos(lanc); setFolhas(fechadas); setFolFuncs(funcs); setOgMap(mapa); setGeradoPara(chave);
    } catch (e) { if (req === sequencia.current) setErro(e instanceof Error ? e.message : String((e as {message?:string})?.message ?? e)); }
    finally { if (req === sequencia.current) setLoading(false); }
  }, [fazendaId, fazendaIds, fDe, fAte, chave]);

  useEffect(() => { const seq = sequencia; carregar(); return () => { seq.current++; }; }, [carregar]);

  // ─── Computar DRE por empresa ────────────────────────────────
  function computarDRE(empresaId: string): LinhaDRE[] {
    const idsFolhas = new Set(folhas.filter(f => f.empresa_id === empresaId).map(f => f.id));
    const v = apurarEmpresa(lancamentos.filter(l => l.empresa_id === empresaId), fol_funcs.filter(f => idsFolhas.has(f.folha_id)), ogMap);
    return buildDRE(v.receitas, v.cogs, v.salarios, v.inss, v.fgts, v.operacionais, v.financeiras, v.depreciacao, v.deducoes, v.descontos, v.receitasFinanceiras, v.outrasReceitas);
  }

  const empresasFiltradas = fEmpresa ? empresas.filter(e => e.id === fEmpresa) : empresas;

  return (
    <div data-arato-page="true" style={S.page}>
      <TopNav />
      <div style={S.body}>
        <OperationalHeading data-arato-page-heading="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 data-arato-h1="true" style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>DRE por Empresa</h1>
          </div>
          <OperationalButton data-arato-button="secondary" style={S.btn("#555")} disabled={!vigente || loading} onClick={() => { if (areaRelatorio.current) abrirPreviewImpressao("DRE por Empresa", areaRelatorio.current.innerHTML, { filtros: [{ rotulo: "Período", valor: `${fDe} a ${fAte}` }], orientation: "portrait" }); }}>Imprimir</OperationalButton>
        </OperationalHeading>

        {/* filtros */}
        <div style={{ ...S.card, padding: 14, marginBottom: 20 }}>
          <OperationalFilters data-arato-filters="true" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 220px" }}>
              <label data-arato-label="true" style={S.label}>Empresa</label>
              <SelectField style={S.inp} value={fEmpresa} onChange={e => setFEmpresa(e.target.value)}>
                <option value="">Todas as empresas</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </SelectField>
            </div>
            <div style={{ flex: "0 0 150px" }}>
              <label data-arato-label="true" style={S.label}>De (competência)</label>
              <InputData type="month" style={S.inp} value={fDe} onChange={e => setFDe(e.target.value)} />
            </div>
            <div style={{ flex: "0 0 150px" }}>
              <label data-arato-label="true" style={S.label}>Até (competência)</label>
              <InputData type="month" style={S.inp} value={fAte} onChange={e => setFAte(e.target.value)} />
            </div>
            <OperationalButton data-arato-button="secondary" style={{ ...S.btn("#1A4870"), alignSelf: "flex-end" }} onClick={carregar}>Atualizar</OperationalButton>
          </OperationalFilters>
        </div>

        {loading && <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Carregando...</div>}
        {erro && <p role="alert" style={{ color: "#b42318" }}>{erro} Nenhum total parcial foi apresentado.</p>}
        <p>Apuração gerencial pelos títulos reais do período, em reais pela cotação registrada. Folha fechada pelo bruto, complemento e encargos. IRPJ e CSLL entram pelos lançamentos classificados, sem aplicar alíquotas presumidas.</p>
        <div ref={areaRelatorio}>
        {!loading && vigente && empresasFiltradas.length === 0 && (
          <div style={{ ...S.card, textAlign: "center", padding: 40, color: "#888" }}>
            Nenhuma empresa cadastrada. Cadastre empresas em <strong>Cadastros → Empresas</strong>.
          </div>
        )}

        {!loading && vigente && empresasFiltradas.map(emp => {
          const dre = computarDRE(emp.id);
          const lucLiq = dre.find(d => d.codigo === "LL")?.valor ?? 0;
          const receita = dre.find(d => d.codigo === "1.T")?.valor ?? 0;
          const ebitda  = dre.find(d => d.codigo === "EBITDA")?.valor ?? 0;
          const margem  = receita > 0 ? (lucLiq / receita * 100) : 0;

          return (
            <div key={emp.id} style={{ ...S.card, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h2 data-arato-h2="true" style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{emp.nome}</h2>
                  {emp.cnpj && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>CNPJ: {emp.cnpj}</div>}
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Período: {nomeMes(fDe)} a {nomeMes(fAte)}</div>
                </div>
                <div data-arato-kpis="true" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {[
                    { label: "Receita Bruta", val: receita,  color: "#1A4870" },
                    { label: "EBITDA",        val: ebitda,   color: ebitda  >= 0 ? "#1A4870" : "#E24B4A" },
                    { label: "Resultado Gerencial", val: lucLiq,   color: lucLiq  >= 0 ? "#16A34A" : "#E24B4A" },
                    { label: "Margem Gerencial",   val: margem,   color: margem  >= 0 ? "#16A34A" : "#E24B4A", pct: true },
                  ].map(k => (
                    <div data-arato-statistic="display" key={k.label} style={{ background: "#F4F6FA", borderRadius: 8, padding: "10px 16px", minWidth: 140 }}>
                      <div style={{ fontSize: 10, color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{k.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
                        {("pct" in k && k.pct) ? `${k.val.toFixed(1)}%` : moeda(k.val)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div data-arato-grid-container="true" style={{ overflowX: "auto" }}>
                <OperationalGrid data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse" }}>
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
                              {receita > 0 && linha.valor !== 0 ? `${(linha.valor / receita * 100).toFixed(1)}%` : "—"}
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
                </OperationalGrid>
              </div>

              {/* Análise rápida */}
              <div data-arato-statistic="display" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginTop: 16, padding: 14, background: "#F4F6FA", borderRadius: 8 }}>
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
                      const idsFolhas = new Set(folsEmp.map(f => f.id));
                      const custoFolha = fol_funcs.filter(f => idsFolhas.has(f.folha_id)).reduce((s, f) => s + Number(f.salario_bruto || 0) + Number(f.complemento_salarial || 0) + Number(f.inss_patronal || 0) + Number(f.fgts || 0), 0);
                      return receita > 0 ? `${(custoFolha / receita * 100).toFixed(1)}%` : "—";
                    })()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Resultado operacional</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#555" }}>
                    {receita > 0 && ebitda !== 0 ? (
                      ebitda > 0
                        ? <span style={{ color: "#16A34A" }}>Operação com resultado positivo</span>
                        : <span style={{ color: "#E24B4A" }}>Operação com resultado negativo</span>
                    ) : "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        </div>
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
