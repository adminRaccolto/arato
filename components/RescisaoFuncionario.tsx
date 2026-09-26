"use client";
import { useEffect, useMemo, useState } from "react";
import type { Funcionario, FuncionarioFerias } from "../lib/supabase";
import {
  TIPOS_DESLIGAMENTO, calcularRescisao, estimarSaldoFgts, estornarRescisao, lancarRescisao, listarRescisoes,
  multaFgtsPct, salarioReferencia, type AvisoPrevio, type RescisaoRegistro, type TipoDesligamento, type VerbaRescisao,
} from "../lib/rh-financeiro";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => { const n = parseFloat((s || "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const mask = (n: number) => n.toFixed(2).replace(".", ",");
const fmtD = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const addDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const inp = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table, #DDE2EE)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, background: "var(--bg-input, #fff)", color: "var(--text-1, #1a1a1a)" };
const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-2, #555)", marginBottom: 4 };

// Aba "Rescisão" do funcionário: calcula verbas, permite ajustar, lança no Contas a Pagar e desliga o funcionário.
export default function RescisaoFuncionario({ func, fazendaId, ferias, onChanged }: {
  func: Funcionario; fazendaId: string; ferias: FuncionarioFerias[]; onChanged: (f: Partial<Funcionario>) => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const salario = salarioReferencia(func);
  const [registros, setRegistros] = useState<RescisaoRegistro[]>([]);
  const [tipo, setTipo] = useState<TipoDesligamento>("sem_justa_causa");
  const [aviso, setAviso] = useState<AvisoPrevio>("indenizado");
  const [desligamento, setDesligamento] = useState(hoje);
  const [pagto, setPagto] = useState("");
  const [saldoFgts, setSaldoFgts] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<{ inss: string; irrf: string; outros: string }>({ inss: "", irrf: "", outros: "" });
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => { listarRescisoes(func.id).then(setRegistros).catch(() => setRegistros([])); }, [func.id]);
  const ativa = registros.find(r => r.status === "lancada");

  const calc = useMemo(() => {
    if (!func.data_admissao || !desligamento) return null;
    return calcularRescisao({ salario, admissao: func.data_admissao, desligamento, tipo, aviso, periodosFerias: ferias });
  }, [func.data_admissao, desligamento, salario, tipo, aviso, ferias]);

  // aviso trabalhado/dispensado só faz sentido para algumas rescisões
  const avisoOpcoes: AvisoPrevio[] = tipo === "termino_contrato" || tipo === "justa_causa" ? ["dispensado"] : ["trabalhado", "indenizado"];
  useEffect(() => { if (!avisoOpcoes.includes(aviso)) setAviso(avisoOpcoes[0]); /* eslint-disable-next-line */ }, [tipo]);

  const verbas: VerbaRescisao[] = useMemo(() => {
    if (!calc) return [];
    const base = calc.verbas.map(v => ({ ...v, valor: ajustes[v.codigo] !== undefined ? num(ajustes[v.codigo]) : v.valor }));
    const extra = (codigo: string, descricao: string, s: string): VerbaRescisao[] => (num(s) > 0 ? [{ codigo, descricao, valor: num(s), tipo: "desconto" }] : []);
    return [...base, ...extra("inss", "INSS sobre verbas rescisórias", extras.inss), ...extra("irrf", "IRRF sobre verbas rescisórias", extras.irrf), ...extra("outros", "Outros descontos", extras.outros)];
  }, [calc, ajustes, extras]);

  const proventos = verbas.filter(v => v.tipo === "provento").reduce((s, v) => s + v.valor, 0);
  const descontos = verbas.filter(v => v.tipo === "desconto").reduce((s, v) => s + v.valor, 0);
  const liquido = proventos - descontos;
  const fgtsEst = func.data_admissao ? estimarSaldoFgts(salario, func.data_admissao, desligamento) : 0;
  const fgtsBase = saldoFgts !== null ? num(saldoFgts) : fgtsEst;
  const multa = Math.round(fgtsBase * multaFgtsPct(tipo) * 100) / 100;
  const prazo = pagto || (desligamento ? addDias(desligamento, 10) : "");

  async function confirmar() {
    setErro("");
    if (!func.data_admissao) { setErro("Funcionário sem data de admissão."); return; }
    if (salario <= 0) { setErro("Funcionário sem salário base (aba Remuneração)."); return; }
    if (!confirm(`Lançar a rescisão de ${func.nome}?\n\nLíquido a pagar: ${fmt(liquido)}${multa > 0 ? `\nMulta do FGTS: ${fmt(multa)}` : ""}\n\nO funcionário será marcado como desligado em ${fmtD(desligamento)}.`)) return;
    setSaving(true);
    try {
      const r = await lancarRescisao(func, fazendaId, { desligamento, tipo, aviso, salario, saldoFgts: fgtsBase, verbas, multaFgts: multa, dataPagamento: prazo, obs });
      setRegistros(prev => [r, ...prev]);
      onChanged({ ativo: false, data_demissao: desligamento });
    } catch (e) { setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)); }
    finally { setSaving(false); }
  }

  async function estornar(r: RescisaoRegistro) {
    if (!confirm("Estornar esta rescisão? Os lançamentos em aberto no Contas a Pagar são excluídos e o funcionário volta a ficar ativo.")) return;
    try {
      await estornarRescisao(r);
      setRegistros(prev => prev.map(x => x.id === r.id ? { ...x, status: "estornada" } : x));
      onChanged({ ativo: true, data_demissao: undefined });
    } catch (e) { alert("Erro: " + (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))); }
  }

  const historico = registros.filter(r => r.status === "estornada");

  return (
    <div>
      {ativa && (
        <div style={{ border: "0.5px solid #16A34A", background: "#F0FDF4", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>Rescisão lançada — desligamento em {fmtD(ativa.data_desligamento)}</div>
          <div style={{ fontSize: 12, color: "#555", margin: "4px 0 10px" }}>{TIPOS_DESLIGAMENTO[ativa.tipo_desligamento]} · pagamento até {fmtD(ativa.data_pagamento)}</div>
          <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <tbody>
              {ativa.verbas.map(v => (
                <tr key={v.codigo}><td style={{ padding: "3px 0" }}>{v.descricao}</td><td style={{ textAlign: "right", color: v.tipo === "desconto" ? "#E24B4A" : "inherit" }}>{v.tipo === "desconto" ? "− " : ""}{fmt(v.valor)}</td></tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: "0.5px solid #BBF7D0" }}><td style={{ padding: "6px 0" }}>Líquido lançado no Contas a Pagar</td><td style={{ textAlign: "right" }}>{fmt(ativa.total_liquido)}</td></tr>
              {ativa.multa_fgts > 0 && <tr style={{ fontWeight: 700 }}><td>Multa do FGTS (lançada à parte)</td><td style={{ textAlign: "right" }}>{fmt(ativa.multa_fgts)}</td></tr>}
            </tbody>
          </table>
          <div style={{ textAlign: "right", marginTop: 10 }}>
            <button onClick={() => estornar(ativa)} style={{ padding: "6px 12px", borderRadius: 8, border: "0.5px solid #E24B4A", background: "transparent", color: "#E24B4A", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>↺ Estornar rescisão</button>
          </div>
        </div>
      )}

      {!ativa && (
        <>
          {!func.data_admissao && <div style={{ color: "#E24B4A", fontSize: 12, marginBottom: 10 }}>Informe a data de admissão na aba Dados Pessoais para calcular a rescisão.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label style={lbl}>Tipo de desligamento</label>
              <select style={inp} value={tipo} onChange={e => setTipo(e.target.value as TipoDesligamento)}>
                {(Object.keys(TIPOS_DESLIGAMENTO) as TipoDesligamento[]).map(k => <option key={k} value={k}>{TIPOS_DESLIGAMENTO[k]}</option>)}
              </select></div>
            <div><label style={lbl}>Data do desligamento</label><input type="date" style={inp} value={desligamento} onChange={e => setDesligamento(e.target.value)} /></div>
            <div><label style={lbl}>Aviso prévio</label>
              <select style={inp} value={aviso} onChange={e => setAviso(e.target.value as AvisoPrevio)}>
                {avisoOpcoes.map(a => <option key={a} value={a}>{a === "trabalhado" ? "Trabalhado" : a === "indenizado" ? (tipo === "pedido_demissao" ? "Não cumprido (descontar)" : "Indenizado") : "Sem aviso"}</option>)}
              </select></div>
          </div>

          {calc && (
            <div style={{ marginTop: 14, border: "0.5px solid var(--border-table, #DDE2EE)", borderRadius: 10, overflow: "hidden" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "var(--bg-page, #F4F6FA)" }}><th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11 }}>Verba</th><th style={{ textAlign: "right", padding: "8px 12px", fontSize: 11, width: 150 }}>Valor (editável)</th></tr></thead>
                <tbody>
                  {calc.verbas.map(v => (
                    <tr key={v.codigo} style={{ borderTop: "0.5px solid #F0F2F6" }}>
                      <td style={{ padding: "6px 12px", color: v.tipo === "desconto" ? "#E24B4A" : "inherit" }}>{v.tipo === "desconto" ? "(−) " : ""}{v.descricao}</td>
                      <td style={{ padding: "4px 12px" }}><input style={{ ...inp, textAlign: "right", padding: "4px 8px" }} value={ajustes[v.codigo] ?? mask(v.valor)} onChange={e => setAjustes(p => ({ ...p, [v.codigo]: e.target.value }))} /></td>
                    </tr>
                  ))}
                  {([["inss", "(−) INSS sobre verbas rescisórias"], ["irrf", "(−) IRRF sobre verbas rescisórias"], ["outros", "(−) Outros descontos (adiantamentos, vales…)"]] as const).map(([k, t]) => (
                    <tr key={k} style={{ borderTop: "0.5px solid #F0F2F6" }}>
                      <td style={{ padding: "6px 12px", color: "#E24B4A" }}>{t}</td>
                      <td style={{ padding: "4px 12px" }}><input style={{ ...inp, textAlign: "right", padding: "4px 8px" }} placeholder="0,00" value={extras[k]} onChange={e => setExtras(p => ({ ...p, [k]: e.target.value }))} /></td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "0.5px solid var(--border-table, #DDE2EE)", fontWeight: 700, background: "var(--bg-page, #F4F6FA)" }}>
                    <td style={{ padding: "8px 12px" }}>Líquido a pagar ao funcionário</td><td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(liquido)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {calc?.avisos.map((a, i) => <div key={i} style={{ fontSize: 11, color: "#7A5500", background: "#FBF3E0", borderRadius: 8, padding: "6px 10px", marginTop: 8 }}>⚠ {a}</div>)}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
            <div><label style={lbl}>Saldo do FGTS (para a multa){multaFgtsPct(tipo) > 0 ? ` — ${multaFgtsPct(tipo) * 100}%` : ""}</label>
              <input style={inp} disabled={multaFgtsPct(tipo) === 0} value={saldoFgts ?? mask(fgtsEst)} onChange={e => setSaldoFgts(e.target.value)} />
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Estimativa (8% × meses); corrija com o extrato do FGTS.</div></div>
            <div><label style={lbl}>Multa do FGTS (lançada à parte)</label><input style={{ ...inp, background: "var(--bg-page, #F4F6FA)" }} readOnly value={fmt(multa)} /></div>
            <div><label style={lbl}>Pagar até (10 dias corridos)</label><input type="date" style={inp} value={prazo} onChange={e => setPagto(e.target.value)} /></div>
          </div>
          <div style={{ marginTop: 12 }}><label style={lbl}>Observação</label><input style={inp} value={obs} onChange={e => setObs(e.target.value)} /></div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 10 }}>Cálculo de referência (CLT). INSS e IRRF ficam por sua conta ou do contador; férias vencidas em dobro e a homologação também. Ao lançar, o sistema cria o Contas a Pagar da rescisão{multa > 0 ? " e o da multa do FGTS" : ""} e marca o funcionário como desligado.</div>
          {erro && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 10 }}>{erro}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <button onClick={confirmar} disabled={saving || !calc} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#E24B4A", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>{saving ? "Lançando…" : "Lançar rescisão e desligar funcionário"}</button>
          </div>
        </>
      )}

      {historico.length > 0 && (
        <div style={{ marginTop: 16, fontSize: 11, color: "#888" }}>
          Rescisões estornadas: {historico.map(h => `${fmtD(h.data_desligamento)} (${fmt(h.total_liquido)})`).join(" · ")}
        </div>
      )}
    </div>
  );
}
