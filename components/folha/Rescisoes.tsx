"use client";
// Folha de Pagamento → aba Rescisões: lista das rescisões do cliente e nova rescisão (mesma tela da aba do cadastro).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthProvider";
import SelectField from "../SelectField";
import { OperationalButton } from "../OperationalUI";
import { supabase } from "../../lib/supabase";
import type { Funcionario, FuncionarioFerias } from "../../lib/supabase";
import { listarFeriasFuncionario } from "../../lib/db";
import { TIPOS_DESLIGAMENTO, type RescisaoRegistro } from "../../lib/rh-financeiro";
import RescisaoFuncionario, { imprimirComprovanteRescisao } from "../RescisaoFuncionario";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtD = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const th = { padding: "8px 10px", fontSize: 11, fontWeight: 600, color: "var(--text-2)", textAlign: "left" as const, borderBottom: "0.5px solid var(--border-table)" };
const td = { padding: "8px 10px", fontSize: 12, borderBottom: "0.5px solid #F0F2F6" };

export default function Rescisoes() {
  const { fazendaIds, fazendaId } = useAuth();
  const ids = useMemo(() => (fazendaIds?.length ? fazendaIds : fazendaId ? [fazendaId] : []), [fazendaIds, fazendaId]);
  const [funcs, setFuncs] = useState<Funcionario[]>([]);
  const [regs, setRegs] = useState<RescisaoRegistro[]>([]);
  const [nomesEmp, setNomesEmp] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<string>("");
  const [ferias, setFerias] = useState<FuncionarioFerias[]>([]);
  const [verEstornadas, setVerEstornadas] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    if (!ids.length) return;
    const { data: fs } = await supabase.from("funcionarios").select("*").in("fazenda_id", ids).order("nome");
    const lista = (fs ?? []) as Funcionario[];
    setFuncs(lista);
    const r: RescisaoRegistro[] = [];
    const fids = lista.map(f => f.id);
    for (let i = 0; i < fids.length; i += 200) {
      const { data } = await supabase.from("funcionario_rescisoes").select("*").in("funcionario_id", fids.slice(i, i + 200));
      r.push(...((data ?? []) as RescisaoRegistro[]));
    }
    setRegs(r.sort((a, b) => b.data_desligamento.localeCompare(a.data_desligamento)));
    const emp = [...new Set(lista.map(f => (f as unknown as { empresa_id?: string | null }).empresa_id).filter(Boolean))] as string[];
    const prod = [...new Set(lista.map(f => (f as unknown as { produtor_id?: string | null }).produtor_id).filter(Boolean))] as string[];
    const [{ data: es }, { data: ps }] = await Promise.all([
      emp.length ? supabase.from("empresas").select("id, nome, razao_social").in("id", emp) : Promise.resolve({ data: [] }),
      prod.length ? supabase.from("produtores").select("id, nome").in("id", prod) : Promise.resolve({ data: [] }),
    ]);
    const m: Record<string, string> = {};
    for (const e of (es ?? []) as { id: string; nome?: string; razao_social?: string }[]) m[e.id] = e.razao_social || e.nome || "";
    for (const p of (ps ?? []) as { id: string; nome: string }[]) m[p.id] = p.nome;
    setNomesEmp(m);
    setCarregando(false);
  }, [ids]);
  // Carga assíncrona: o estado só muda depois das consultas
  useEffect(() => { const t = setTimeout(() => { void carregar(); }, 0); return () => clearTimeout(t); }, [carregar]);

  const funcSel = funcs.find(f => f.id === sel) ?? null;
  useEffect(() => { if (sel) listarFeriasFuncionario(sel).then(setFerias).catch(() => setFerias([])); }, [sel]);
  const empregadorDe = (f?: Funcionario | null) => {
    const v = f as unknown as { empresa_id?: string | null; produtor_id?: string | null } | null;
    return (v?.empresa_id && nomesEmp[v.empresa_id]) || (v?.produtor_id && nomesEmp[v.produtor_id]) || null;
  };
  const nomeDe = (id: string) => funcs.find(f => f.id === id)?.nome ?? "—";
  const ativos = funcs.filter(f => f.ativo !== false);
  const comDemissaoAtivos = ativos.filter(f => f.data_demissao && !regs.some(r => r.funcionario_id === f.id && r.status === "lancada"));
  const lista = regs.filter(r => verEstornadas || r.status === "lancada");

  if (funcSel) return (
    <div style={{ background: "var(--bg-card)", border: "0.5px solid var(--border-table)", borderRadius: 12, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#0B2D50" }}>Rescisão — {funcSel.nome}</div>
          <div style={{ fontSize: 12, color: "#666" }}>{[funcSel.funcao, empregadorDe(funcSel), funcSel.data_admissao ? `admitido em ${fmtD(funcSel.data_admissao)}` : null].filter(Boolean).join(" · ")}</div>
        </div>
        <OperationalButton data-arato-button="secondary" onClick={() => { setSel(""); setFerias([]); carregar(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "0.5px solid var(--border-table)", background: "#fff", cursor: "pointer", fontSize: 12 }}>← Voltar à lista</OperationalButton>
      </div>
      <RescisaoFuncionario func={funcSel} fazendaId={funcSel.fazenda_id} ferias={ferias} empregador={empregadorDe(funcSel)}
        onChanged={ch => { setFuncs(prev => prev.map(f => f.id === funcSel.id ? { ...f, ...ch } as Funcionario : f)); carregar(); }} />
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
        <div style={{ minWidth: 280 }}>
          <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 3 }}>+ Nova rescisão</div>
          <SelectField value="" onChange={e => setSel(e.target.value)} style={{ width: "100%", padding: "7px 10px", border: "0.5px solid #DDE2EE", borderRadius: 8, fontSize: 13 }}>
            <option value="">Escolha o funcionário…</option>
            {ativos.map(f => <option key={f.id} value={f.id}>{f.nome}{empregadorDe(f) ? ` — ${empregadorDe(f)}` : ""}</option>)}
          </SelectField>
        </div>
        <label style={{ fontSize: 12, color: "#555", display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <input type="checkbox" checked={verEstornadas} onChange={e => setVerEstornadas(e.target.checked)} /> Mostrar estornadas
        </label>
      </div>

      {comDemissaoAtivos.length > 0 && (
        <div style={{ background: "#FBF3E0", border: "0.5px solid #C9921B", borderRadius: 8, padding: "8px 14px", marginBottom: 10, fontSize: 12, color: "#7A4300" }}>
          ⚠ Com data de demissão no cadastro, mas ativos e sem rescisão: {comDemissaoAtivos.map(f => (
            <button key={f.id} type="button" onClick={() => setSel(f.id)} style={{ border: "none", background: "none", color: "#7A4300", textDecoration: "underline", cursor: "pointer", fontSize: 12, padding: "0 4px" }}>
              {f.nome} ({fmtD(f.data_demissao)})
            </button>))}
        </div>
      )}

      <div style={{ background: "#fff", border: "0.5px solid #DDE2EE", borderRadius: 10, overflow: "hidden" }}>
        <table data-arato-grid="true" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Funcionário", "Desligamento", "Tipo", "Líquido", "FGTS + multa", "Pagamento até", "Situação", ""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {carregando ? <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#888", padding: 24 }}>Carregando…</td></tr>
              : !lista.length ? <tr><td colSpan={8} style={{ ...td, textAlign: "center", color: "#888", padding: 24 }}>Nenhuma rescisão lançada. Escolha o funcionário acima para fazer uma.</td></tr>
              : lista.map(r => {
                const f = funcs.find(x => x.id === r.funcionario_id);
                return (
                  <tr key={r.id} style={{ opacity: r.status === "estornada" ? 0.55 : 1 }}>
                    <td style={{ ...td, fontWeight: 600 }}>{nomeDe(r.funcionario_id)}<div style={{ fontSize: 11, color: "#888", fontWeight: 400 }}>{empregadorDe(f)}</div></td>
                    <td style={td}>{fmtD(r.data_desligamento)}</td>
                    <td style={td}>{TIPOS_DESLIGAMENTO[r.tipo_desligamento] ?? r.tipo_desligamento}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmt(Number(r.total_liquido ?? 0))}</td>
                    <td style={td}>{fmt(Number(r.fgts_mes ?? 0) + Number(r.multa_fgts ?? 0))}</td>
                    <td style={td}>{fmtD(r.data_pagamento)}</td>
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: r.status === "lancada" ? "#DCFCE7" : "#F1F2F4", color: r.status === "lancada" ? "#166534" : "#666" }}>{r.status === "lancada" ? "Lançada" : "Estornada"}</span></td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => setSel(r.funcionario_id)} style={{ border: "0.5px solid #DDE2EE", background: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", marginRight: 6 }}>Abrir</button>
                      {f && <button type="button" onClick={() => imprimirComprovanteRescisao({ func: f, empregador: empregadorDe(f), desligamento: r.data_desligamento, tipo: r.tipo_desligamento, aviso: r.aviso_previo,
                        verbas: r.verbas, fgtsMes: Number(r.fgts_mes ?? 0), multa: Number(r.multa_fgts ?? 0), dataPagamento: r.data_pagamento, salarioBase: Number(r.salario_base ?? 0),
                        complemento: Number(f.complemento_salarial ?? 0), obs: r.obs })} style={{ border: "0.5px solid #DDE2EE", background: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>🖨</button>}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
