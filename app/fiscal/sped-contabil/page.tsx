"use client";
import { OperationalButton, OperationalHeading } from "../../../components/OperationalUI";
import { useState, useCallback, useEffect, useRef } from "react";
import TopNav from "../../../components/TopNav";
import { useAuth } from "../../../components/AuthProvider";
import { supabase } from "../../../lib/supabase";

import { lerPaginas } from "../../../lib/paginar";
import { listarOperacoesGerenciais } from "../../../lib/db";
import { prepararContabilAuxiliar,csvContabilAuxiliar,type EventoContabil } from "../../../lib/fiscal/contabil-auxiliar";

const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table)", borderRadius: 8, fontSize: 13, color: "var(--text-1)", background: "var(--bg-card)", boxSizing: "border-box", outline: "none" };
const lbl: React.CSSProperties = { fontSize: 11, color: "var(--text-2)", marginBottom: 4, display: "block", fontWeight: 600 };
const card: React.CSSProperties = { background: "var(--bg-card)", borderRadius: 12, border: "0.5px solid var(--border-table)", padding: "20px 24px", marginBottom: 20 };

export default function SpedContabilPage() {
  const { fazendaId, fazendaIds } = useAuth();
  const [entidade, setEntidade] = useState<"pf" | "pj">("pf");
  const [anoExercicio, setAnoExercicio] = useState(new Date().getFullYear() - 1 + "");
  const [vinculos, setVinculos] = useState<string[]>(["rural", "pessoa_fisica", "investimento", "nao_tributavel", "sem_vinculo"]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ total: number; erros: string[] } | null>(null);
  const [err, setErr] = useState("");

  function toggleVinculo(v: string) {
    setVinculos(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    );
  }

  const contexto = `${fazendaIds.join(",")}:${entidade}:${anoExercicio}:${vinculos.join(",")}`;
  const contextoRef=useRef(contexto);contextoRef.current=contexto;
  useEffect(()=>{setPreview(null);setErr("");},[contexto]);
  const gerar=useCallback(async(baixar:boolean)=>{
    if(!fazendaId||!fazendaIds.length)return;
    const atual=contexto;setLoading(true);setErr("");setPreview(null);
    try {
      const [pf,pj,ops]=await Promise.all([
        lerPaginas((a,b)=>supabase.from("lancamentos").select("*").in("fazenda_id",fazendaIds).eq("entidade_contabil",entidade).in("status",["baixado","pago","parcial"]).order("id").range(a,b)),
        entidade==="pj"?lerPaginas((a,b)=>supabase.from("empresa_lancamentos").select("*").in("fazenda_id",fazendaIds).in("status",["baixado","pago","parcial"]).order("id").range(a,b)):Promise.resolve([]),
        listarOperacoesGerenciais(fazendaId),
      ]);
      const eventos=[...pf.map(e=>({...e,origem:"lancamentos"})),...pj.map(e=>({...e,origem:"empresa_lancamentos"}))] as EventoContabil[];
      const linhas=prepararContabilAuxiliar(eventos.filter(e=>vinculos.includes(e.vinculo_atividade || "sem_vinculo")),ops,anoExercicio);
      if(contextoRef.current!==atual)return;
      const erros=linhas.filter(l=>l.pendencias.length).map(l=>`${l.origem}/${l.id}: ${l.pendencias.join("; ")}`);
      setPreview({total:linhas.length,erros});
      if(!baixar||!linhas.length)return;
      const url=URL.createObjectURL(new Blob([csvContabilAuxiliar(linhas)],{type:"text/csv;charset=utf-8"}));
      const a=document.createElement("a");a.href=url;a.download=`AUXILIAR_CONTABIL_${entidade.toUpperCase()}_${anoExercicio}.csv`;a.click();URL.revokeObjectURL(url);
    }catch(e){if(contextoRef.current===atual)setErr(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  },[fazendaId,fazendaIds,entidade,anoExercicio,vinculos,contexto]);

  const VINCULOS_DISPONIVEIS = [
    { id: "sem_vinculo", label:"Sem vínculo definido", cor:"var(--text-3)",bg:"var(--bg-page)" },
    { id: "rural",           label: "Atividade Rural",       cor: "#16A34A", bg: "#E8F5E9" },
    { id: "pessoa_fisica",   label: "Pessoa Física (não rural)", cor: "#2A2A2A", bg: "#E8E8E8" },
    { id: "investimento",    label: "Investimentos",         cor: "#C9921B", bg: "#FBF3E0" },
    { id: "nao_tributavel",  label: "Não Tributável",        cor: "var(--text-3)",    bg: "var(--bg-page)" },
  ];

  return (
    <div data-arato-page="true" style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <TopNav />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 20px" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <OperationalHeading data-arato-page-heading="true" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h1 data-arato-h1="true" style={{ fontSize: 20, fontWeight: 700, color: "#111111", margin: 0 }}>Preparação contábil</h1>
            </div>
            <a
              href="/configuracoes/contabilidade"
              style={{ fontSize: 12, color: "#2A2A2A", textDecoration: "none", whiteSpace: "nowrap" as const }}
            >
              ⚙ Configurar dados contábeis →
            </a>
          </OperationalHeading>
        </div>

        {/* Como funciona */}
        <div style={{ background: "#E8E8E8", border: "0.5px solid #A8CDE8", borderRadius: 10, padding: "14px 18px", marginBottom: 24, fontSize: 13, color: "#0D0D0D" }}>
          <strong>Exportação auxiliar ao contador:</strong> reúne pagamentos e recebimentos por data da baixa, com as contas sugeridas pelas operações gerenciais.
          O CSV mantém as pendências identificadas para conferência. A ECD exige escrituração por competência, saldos e demonstrações que devem ser preparados no sistema contábil.
        </div>

        {/* Parâmetros */}
        <div data-arato-panel="true" style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #E8EEF5" }}>
            Parâmetros de Geração
          </div>
          <div data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
            <div>
              <label data-arato-label="true" style={lbl}>Entidade Contábil</label>
              <div style={{ display: "flex", gap: 8 }}>
                {([["pf", "Produtor / PF"], ["pj", "Empresa / PJ"]] as [string, string][]).map(([v, l]) => (
                  <OperationalButton data-arato-button="toggle"
                    key={v}
                    onClick={() => setEntidade(v as "pf" | "pj")}
                    style={{
                      flex: 1, padding: "9px 0", border: entidade === v ? "none" : "0.5px solid var(--border-table)",
                      borderRadius: 8, background: entidade === v ? "#2A2A2A" : "var(--bg-card)",
                      color: entidade === v ? "#fff" : "var(--text-2)", fontWeight: entidade === v ? 700 : 400,
                      cursor: "pointer", fontSize: 13,
                    }}
                  >
                    {l}
                  </OperationalButton>
                ))}
              </div>
            </div>
            <div>
              <label data-arato-label="true" style={lbl}>Exercício (Ano)</label>
              <input
                style={inp}
                value={anoExercicio}
                onChange={e => setAnoExercicio(e.target.value)}
                placeholder="YYYY"
                maxLength={4}
              />
            </div>
          </div>

          {/* Vínculos de atividade */}
          <div style={{ marginTop: 20 }}>
            <label data-arato-label="true" style={{ ...lbl, marginBottom: 10 }}>Vínculos de Atividade a incluir</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              {VINCULOS_DISPONIVEIS.map(vd => (
                <OperationalButton data-arato-button="toggle"
                  key={vd.id}
                  onClick={() => toggleVinculo(vd.id)}
                  style={{
                    padding: "6px 14px", border: `0.5px solid ${vinculos.includes(vd.id) ? vd.cor : "var(--border-table)"}`,
                    borderRadius: 8, background: vinculos.includes(vd.id) ? vd.bg : "var(--bg-card)",
                    color: vinculos.includes(vd.id) ? vd.cor : "var(--text-3)",
                    cursor: "pointer", fontSize: 12, fontWeight: vinculos.includes(vd.id) ? 700 : 400,
                  }}
                >
                  {vinculos.includes(vd.id) ? "✓ " : ""}{vd.label}
                </OperationalButton>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
              Selecione quais vínculos devem integrar a conferência.
              Use “Sem vínculo definido” para conferir também os lançamentos sem classificação.
            </p>
          </div>
        </div>

        {/* Preview / resultado */}
        {preview && (
          <div data-arato-statistic="display" style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#111111", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid #E8EEF5" }}>
              Resultado da Análise
            </div>
            <div data-arato-kpis="true" style={{ display: "flex", gap: 20, marginBottom: 16 }}>
              <div data-arato-statistic="display" style={{ background: "#E8F5E9", border: "0.5px solid #16A34A40", borderRadius: 10, padding: "12px 20px", flex: 1, textAlign: "center" as const }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#16A34A" }}>{preview.total}</div>
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>eventos para conferência</div>
              </div>
              <div data-arato-statistic="display" style={{ background: preview.erros.length > 0 ? "#FCEBEB" : "#E8F5E9", border: `0.5px solid ${preview.erros.length > 0 ? "#E24B4A40" : "#16A34A40"}`, borderRadius: 10, padding: "12px 20px", flex: 1, textAlign: "center" as const }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: preview.erros.length > 0 ? "#E24B4A" : "#16A34A" }}>{preview.erros.length}</div>
                <div style={{ fontSize: 11, color: "var(--text-2)" }}>eventos com pendências</div>
              </div>
            </div>

            {preview.erros.length > 0 && (
              <div style={{ background: "#FFF8E8", border: "0.5px solid #C9921B50", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#7B4A00", marginBottom: 8 }}>Pendências mantidas no arquivo para revisão:</div>
                <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 160, overflowY: "auto" as const }}>
                  {preview.erros.slice(0, 20).map((e, i) => (
                    <li key={i} style={{ fontSize: 12, color: "#7B4A00", marginBottom: 4 }}>{e}</li>
                  ))}
                  {preview.erros.length > 20 && <li style={{ fontSize: 12, color: "var(--text-3)" }}>... e mais {preview.erros.length - 20}</li>}
                </ul>
              </div>
            )}

            {preview.total === 0 && (
              <div style={{ fontSize: 13, color: "#E24B4A", fontWeight: 600, textAlign: "center" as const, padding: "8px 0" }}>
                Nenhum lançamento contábil encontrado para os filtros selecionados.
              </div>
            )}
          </div>
        )}

        {err && (
          <div style={{ background: "#FCEBEB", border: "0.5px solid #E24B4A50", borderRadius: 8, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "#E24B4A" }}>
            {err}
          </div>
        )}

        {/* Ações */}
        <div style={{ display: "flex", gap: 12 }}>
          <OperationalButton data-arato-button="secondary"
            onClick={() => gerar(false)}
            disabled={loading}
            style={{ padding: "10px 24px", background: "var(--bg-page)", border: "0.5px solid #2A2A2A", color: "#2A2A2A", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}
          >
            {loading ? "Analisando..." : "Analisar (sem baixar)"}
          </OperationalButton>
          <OperationalButton data-arato-button="toggle"
            onClick={() => gerar(true)}
            disabled={loading || (preview !== null && preview.total === 0)}
            style={{
              padding: "10px 28px",
              background: loading || (preview !== null && preview.total === 0) ? "#ccc" : "#2A2A2A",
              color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14,
            }}
          >
            {loading ? "Gerando..." : "Baixar auxiliar contábil (.csv)"}
          </OperationalButton>
        </div>

        {/* Nota rodapé */}
        <div style={{ marginTop: 32, padding: "14px 18px", background: "var(--bg-card)", borderRadius: 10, border: "0.5px solid var(--border-table)", fontSize: 12, color: "#666", lineHeight: 1.6 }}>
          <strong>Sobre o arquivo:</strong>
          <ul style={{margin:"8px 0 0",paddingLeft:18}}>
            <li>CSV em UTF-8, separado por ponto e vírgula. Cada linha identifica a fonte, o registro e seus titulares.</li>
            <li>Pagamentos parciais acumulados, datas ausentes, compensações e contas não configuradas recebem indicação para conferência.</li>
            <li>Este arquivo auxilia a escrituração do contador. Não deve ser transmitido como ECD nem representa um livro contábil completo.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
