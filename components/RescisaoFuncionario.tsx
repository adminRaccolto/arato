"use client";
import { hojeLocal } from "../lib/data-local";
import SelectField from "./SelectField";
import InputData from "../components/InputData";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Funcionario, FuncionarioFerias } from "../lib/supabase";
import {
  TIPOS_DESLIGAMENTO, calcularRescisao, estimarSaldoFgts, estornarRescisao, lancarRescisao, listarRescisoes,
  multaFgtsPct, type AvisoPrevio, type RescisaoRegistro, type TipoDesligamento, type VerbaRescisao,
} from "../lib/rh-financeiro";
import { decimoJaPago, impostosRescisao, linhasAutomaticas, multaFgts, totaisRescisao, valorComplemento } from "../lib/folha/rescisao";
import { descontoNoSalario } from "../lib/folha/gratificacoes";
import { aplicarPadraoRelatorio } from "../lib/relatorios/layout";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => { const n = parseFloat((s || "").replace(/\./g, "").replace(",", ".")); return isNaN(n) ? 0 : n; };
const mask = (n: number) => n.toFixed(2).replace(".", ",");
const fmtD = (iso?: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const addDias = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const inp = { width: "100%", padding: "8px 10px", border: "0.5px solid var(--border-table, #DDE2EE)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, background: "var(--bg-input, #fff)" };
const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-2, #555)", marginBottom: 4 };

/** Comprovante da rescisão para impressão/PDF, com espaço para assinatura. */
export function imprimirComprovanteRescisao(p: {
  func: Pick<Funcionario, "nome"> & { cpf?: string | null; funcao?: string | null; data_admissao?: string | null };
  empregador?: string | null; desligamento: string; tipo: TipoDesligamento; aviso: AvisoPrevio; verbas: VerbaRescisao[];
  fgtsMes: number; multa: number; dataPagamento?: string | null; salarioBase: number; complemento: number; obs?: string | null;
}) {
  const t = totaisRescisao(p.verbas);
  const linhas = (tipo: "provento" | "desconto") => p.verbas.filter(v => v.tipo === tipo && v.valor > 0)
    .map(v => `<tr><td>${esc(v.descricao)}${v.nota ? `<div class="nota">${esc(v.nota)}</div>` : ""}</td><td class="v">${fmt(v.valor)}</td></tr>`).join("");
  const avisoTxt = p.aviso === "trabalhado" ? "Trabalhado" : p.aviso === "indenizado" ? (p.tipo === "pedido_demissao" ? "Não cumprido (descontado)" : "Indenizado") : "Sem aviso";
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Rescisão — ${esc(p.func.nome)}</title><style>
    body{font-family:system-ui,Arial,sans-serif;font-size:12px;color:#1a1a1a;margin:24px}
    h1{font-size:17px;margin:0 0 4px;color:#0B2D50} .sub{color:#555;margin-bottom:14px}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 18px;margin-bottom:14px} .grid b{display:block;font-size:10px;color:#666;font-weight:600}
    table{width:100%;border-collapse:collapse;margin-bottom:10px} th{text-align:left;font-size:11px;background:#F4F6FA;padding:6px 8px;border-bottom:0.5px solid #DDE2EE}
    td{padding:5px 8px;border-bottom:0.5px solid #EEF0F5} td.v{text-align:right;white-space:nowrap} .nota{font-size:10px;color:#888}
    .tot td{font-weight:700;background:#F4F6FA} .liq td{font-weight:700;font-size:14px;color:#0B2D50}
    .ass{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:56px} .ass div{border-top:0.5px solid #555;padding-top:6px;text-align:center;font-size:11px}
    .rt-toolbar{margin-bottom:12px} @media print{.rt-toolbar{display:none}}
  </style></head><body>
  <div class="rt-toolbar"><button onclick="window.print()">&#128438; Imprimir / Salvar PDF</button></div>
  <h1>Termo de Rescisão do Contrato de Trabalho</h1>
  <div class="sub">Demonstrativo para conferência e assinatura · emitido em ${fmtD(hojeLocal())}</div>
  <div class="grid">
    <div><b>Empregado</b>${esc(p.func.nome)}</div><div><b>CPF</b>${esc(p.func.cpf ?? "—")}</div><div><b>Função</b>${esc(p.func.funcao ?? "—")}</div>
    <div><b>Empregador</b>${esc(p.empregador ?? "—")}</div><div><b>Admissão</b>${fmtD(p.func.data_admissao)}</div><div><b>Desligamento</b>${fmtD(p.desligamento)}</div>
    <div><b>Tipo</b>${esc(TIPOS_DESLIGAMENTO[p.tipo])}</div><div><b>Aviso prévio</b>${avisoTxt}</div><div><b>Pagamento até</b>${fmtD(p.dataPagamento)}</div>
    <div><b>Salário base</b>${fmt(p.salarioBase)}</div><div><b>Complemento salarial</b>${fmt(p.complemento)}</div><div></div>
  </div>
  <table><thead><tr><th>Proventos</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhas("provento")}<tr class="tot"><td>Total de proventos</td><td class="v">${fmt(t.proventos)}</td></tr></tbody></table>
  <table><thead><tr><th>Descontos</th><th style="text-align:right">Valor</th></tr></thead><tbody>${linhas("desconto") || `<tr><td colspan="2">Nenhum</td></tr>`}<tr class="tot"><td>Total de descontos</td><td class="v">${fmt(t.descontos)}</td></tr></tbody></table>
  <table><tbody><tr class="liq"><td>Líquido a receber</td><td class="v">${fmt(t.liquido)}</td></tr></tbody></table>
  <table><thead><tr><th>Recolhimentos do empregador (não descontados do empregado)</th><th style="text-align:right">Valor</th></tr></thead><tbody>
    <tr><td>FGTS do mês da rescisão (8%)</td><td class="v">${fmt(p.fgtsMes)}</td></tr>
    <tr><td>Multa rescisória do FGTS</td><td class="v">${fmt(p.multa)}</td></tr></tbody></table>
  ${p.obs ? `<div><b>Observação:</b> ${esc(p.obs)}</div>` : ""}
  <div class="ass"><div>Empregador</div><div>${esc(p.func.nome)}<br>Empregado</div></div>
  </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("O navegador bloqueou a janela de impressão. Libere pop-ups para este site."); return; }
  w.document.write(aplicarPadraoRelatorio(html, window.location.origin));
  w.document.close();
}

// Rescisão de um funcionário: calcula sobre o salário base (impostos inclusive), soma o complemento no valor pago,
// desconta adiantamentos pendentes e 13º já pago, lança no Contas a Pagar e desliga o funcionário. Tudo editável.
export default function RescisaoFuncionario({ func, fazendaId, ferias, onChanged, empregador }: {
  func: Funcionario; fazendaId: string; ferias: FuncionarioFerias[]; onChanged: (f: Partial<Funcionario>) => void; empregador?: string | null;
}) {
  const hoje = hojeLocal();
  const salarioBase = Number(func.salario_base ?? 0);
  const complementoMensal = Number(func.complemento_salarial ?? 0);
  const [registros, setRegistros] = useState<RescisaoRegistro[]>([]);
  const [tipo, setTipo] = useState<TipoDesligamento>("sem_justa_causa");
  const [aviso, setAviso] = useState<AvisoPrevio>("indenizado");
  const [desligamento, setDesligamento] = useState(hoje);
  const [pagto, setPagto] = useState("");
  const [saldoFgts, setSaldoFgts] = useState<string | null>(null);
  const [fgtsMesEd, setFgtsMesEd] = useState<string | null>(null);
  const [ajustes, setAjustes] = useState<Record<string, string>>({});
  const [outros, setOutros] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [adis, setAdis] = useState<{ ids: string[]; total: number }>({ ids: [], total: 0 });
  const [decimoPago, setDecimoPago] = useState(0);

  useEffect(() => { listarRescisoes(func.id).then(setRegistros).catch(() => setRegistros([])); }, [func.id]);
  // Adiantamentos ainda não descontados: saem da rescisão
  useEffect(() => {
    supabase.from("adiantamentos_salario").select("id, valor, descontado_gratificacao_cp, tipo").eq("funcionario_id", func.id).eq("status", "pendente")
      .then(({ data }) => {
        const l = ((data ?? []) as { id: string; valor: number; descontado_gratificacao_cp?: number | null; tipo?: string | null }[]).filter(a => a.tipo !== "devolucao");
        setAdis({ ids: l.map(a => a.id), total: Math.round(l.reduce((s, a) => s + descontoNoSalario(a), 0) * 100) / 100 });
      });
  }, [func.id]);
  // 13º já lançado no ano do desligamento
  const anoDeslig = Number(desligamento.slice(0, 4)) || new Date().getFullYear();
  useEffect(() => {
    supabase.from("decimo_terceiro").select("parcela1_valor, parcela1_lancamento_id, parcela2_valor, parcela2_lancamento_id").eq("funcionario_id", func.id).eq("ano", anoDeslig).maybeSingle()
      .then(({ data }) => setDecimoPago(decimoJaPago(data)));
  }, [func.id, anoDeslig]);

  const ativa = registros.find(r => r.status === "lancada");

  const calc = useMemo(() => {
    if (!func.data_admissao || !desligamento) return null;
    return calcularRescisao({ salario: salarioBase, admissao: func.data_admissao, desligamento, tipo, aviso, periodosFerias: ferias });
  }, [func.data_admissao, desligamento, salarioBase, tipo, aviso, ferias]);
  const complemento = useMemo(() => {
    if (!func.data_admissao || !desligamento || complementoMensal <= 0) return 0;
    return valorComplemento(calcularRescisao({ salario: complementoMensal, admissao: func.data_admissao, desligamento, tipo, aviso, periodosFerias: ferias }).verbas);
  }, [func.data_admissao, desligamento, complementoMensal, tipo, aviso, ferias]);

  const avisoOpcoes: AvisoPrevio[] = tipo === "termino_contrato" || tipo === "justa_causa" ? ["dispensado"] : ["trabalhado", "indenizado"];
  useEffect(() => { if (!avisoOpcoes.includes(aviso)) setAviso(avisoOpcoes[0]); /* eslint-disable-next-line */ }, [tipo]);

  const aplicar = (v: VerbaRescisao): VerbaRescisao => ({ ...v, valor: ajustes[v.codigo] !== undefined ? num(ajustes[v.codigo]) : v.valor });
  // Verbas do salário base (editáveis) → impostos sobre os valores editados → linhas automáticas (também editáveis)
  const verbasBase = useMemo(() => (calc?.verbas ?? []).map(aplicar), [calc, ajustes]); // eslint-disable-line react-hooks/exhaustive-deps
  const impostos = useMemo(() => impostosRescisao(verbasBase), [verbasBase]);
  const automaticas = useMemo(() => linhasAutomaticas({ complemento, impostos, adiantamentos: adis.total, decimoPago }).map(aplicar),
    [complemento, impostos, adis.total, decimoPago, ajustes]); // eslint-disable-line react-hooks/exhaustive-deps
  const verbas: VerbaRescisao[] = useMemo(() => [
    ...verbasBase, ...automaticas,
    ...(num(outros) > 0 ? [{ codigo: "outros", descricao: "Outros descontos", valor: num(outros), tipo: "desconto" as const }] : []),
  ], [verbasBase, automaticas, outros]);

  const { proventos, descontos, liquido } = totaisRescisao(verbas);
  const fgtsEst = func.data_admissao ? estimarSaldoFgts(salarioBase, func.data_admissao, desligamento) : 0;
  const fgtsBase = saldoFgts !== null ? num(saldoFgts) : fgtsEst;
  const fgtsMes = fgtsMesEd !== null ? num(fgtsMesEd) : impostos.fgtsMes;
  const multa = multaFgts(fgtsBase, fgtsMes, multaFgtsPct(tipo));
  const prazo = pagto || (desligamento ? addDias(desligamento, 10) : "");
  const demitidoNoCadastro = !!func.data_demissao && func.ativo !== false;

  async function confirmar() {
    setErro("");
    if (!func.data_admissao) { setErro("Funcionário sem data de admissão."); return; }
    if (salarioBase <= 0) { setErro("Funcionário sem salário base (aba Remuneração)."); return; }
    if (!confirm(`Lançar a rescisão de ${func.nome}?\n\nLíquido a pagar: ${fmt(liquido)}\nFGTS do mês: ${fmt(fgtsMes)}${multa > 0 ? `\nMulta do FGTS: ${fmt(multa)}` : ""}\n\nO funcionário será desligado em ${fmtD(desligamento)}, os salários previstos depois dessa data são cancelados e os adiantamentos pendentes ficam descontados.`)) return;
    setSaving(true);
    try {
      const r = await lancarRescisao(func, fazendaId, { desligamento, tipo, aviso, salario: salarioBase, saldoFgts: fgtsBase, verbas, multaFgts: multa,
        dataPagamento: prazo, obs, fgtsMes, adiantamentoIds: verbas.some(v => v.codigo === "adiantamentos" && v.valor > 0) ? adis.ids : [] });
      setRegistros(prev => [r, ...prev]);
      onChanged({ ativo: false, data_demissao: desligamento });
    } catch (e) { setErro(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)); }
    finally { setSaving(false); }
  }

  async function estornar(r: RescisaoRegistro) {
    if (!confirm("Estornar esta rescisão? Os títulos em aberto no Contas a Pagar são excluídos, os salários previstos e os adiantamentos voltam e o funcionário volta a ficar ativo.")) return;
    try {
      await estornarRescisao(r);
      setRegistros(prev => prev.map(x => x.id === r.id ? { ...x, status: "estornada" } : x));
      onChanged({ ativo: true, data_demissao: undefined });
    } catch (e) { alert("Erro: " + (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))); }
  }

  const imprimir = (r?: RescisaoRegistro) => imprimirComprovanteRescisao({
    func, empregador, desligamento: r?.data_desligamento ?? desligamento, tipo: r?.tipo_desligamento ?? tipo, aviso: r?.aviso_previo ?? aviso,
    verbas: r?.verbas ?? verbas, fgtsMes: r ? Number(r.fgts_mes ?? 0) : fgtsMes, multa: r?.multa_fgts ?? multa, dataPagamento: r?.data_pagamento ?? prazo,
    salarioBase: r?.salario_base ?? salarioBase, complemento: complementoMensal, obs: r?.obs ?? obs,
  });
  const historico = registros.filter(r => r.status === "estornada");
  const btnSec = { padding: "6px 12px", borderRadius: 8, border: "0.5px solid #1A4870", background: "transparent", color: "#1A4870", cursor: "pointer", fontSize: 12, fontWeight: 600 };

  return (
    <div>
      {ativa && (
        <div style={{ border: "0.5px solid #16A34A", background: "#F0FDF4", borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#16A34A" }}>Rescisão lançada — desligamento em {fmtD(ativa.data_desligamento)}</div>
          <div style={{ fontSize: 12, color: "#555", margin: "4px 0 10px" }}>{TIPOS_DESLIGAMENTO[ativa.tipo_desligamento]} · pagamento até {fmtD(ativa.data_pagamento)}</div>
          <table data-arato-grid="true" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
            <tbody>
              {ativa.verbas.map(v => (
                <tr key={v.codigo}><td style={{ padding: "3px 0" }}>{v.descricao}</td><td style={{ textAlign: "right", color: v.tipo === "desconto" ? "#E24B4A" : "inherit" }}>{v.tipo === "desconto" ? "− " : ""}{fmt(v.valor)}</td></tr>
              ))}
              <tr style={{ fontWeight: 700, borderTop: "0.5px solid #BBF7D0" }}><td style={{ padding: "6px 0" }}>Líquido lançado no Contas a Pagar</td><td style={{ textAlign: "right" }}>{fmt(ativa.total_liquido)}</td></tr>
              {Number(ativa.fgts_mes ?? 0) > 0 && <tr style={{ fontWeight: 700 }}><td>FGTS do mês (lançado à parte)</td><td style={{ textAlign: "right" }}>{fmt(Number(ativa.fgts_mes))}</td></tr>}
              {ativa.multa_fgts > 0 && <tr style={{ fontWeight: 700 }}><td>Multa do FGTS (lançada à parte)</td><td style={{ textAlign: "right" }}>{fmt(ativa.multa_fgts)}</td></tr>}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button type="button" data-arato-button="secondary" onClick={() => imprimir(ativa)} style={btnSec}>🖨 Comprovante</button>
            <button type="button" data-arato-button="secondary" onClick={() => estornar(ativa)} style={{ ...btnSec, border: "0.5px solid #E24B4A", color: "#E24B4A" }}>Estornar rescisão</button>
          </div>
        </div>
      )}

      {!ativa && (
        <>
          {demitidoNoCadastro && <div style={{ fontSize: 12, color: "#7A5500", background: "#FBF3E0", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>⚠ O cadastro tem data de demissão ({fmtD(func.data_demissao)}), mas o funcionário segue ativo e sem rescisão lançada.</div>}
          {!func.data_admissao && <div style={{ color: "#E24B4A", fontSize: 12, marginBottom: 10 }}>Informe a data de admissão na aba Dados Pessoais para calcular a rescisão.</div>}
          <div data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label data-arato-label="true" style={lbl}>Tipo de desligamento</label>
              <SelectField style={inp} value={tipo} onChange={e => setTipo(e.target.value as TipoDesligamento)}>
                {(Object.keys(TIPOS_DESLIGAMENTO) as TipoDesligamento[]).map(k => <option key={k} value={k}>{TIPOS_DESLIGAMENTO[k]}</option>)}
              </SelectField></div>
            <div><label data-arato-label="true" style={lbl}>Data do desligamento</label><InputData type="date" style={inp} value={desligamento} onChange={e => setDesligamento(e.target.value)} /></div>
            <div><label data-arato-label="true" style={lbl}>Aviso prévio</label>
              <SelectField style={inp} value={aviso} onChange={e => setAviso(e.target.value as AvisoPrevio)}>
                {avisoOpcoes.map(a => <option key={a} value={a}>{a === "trabalhado" ? "Trabalhado" : a === "indenizado" ? (tipo === "pedido_demissao" ? "Não cumprido (descontar)" : "Indenizado") : "Sem aviso"}</option>)}
              </SelectField></div>
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
            Cálculo sobre o salário base de {fmt(salarioBase)}{complementoMensal > 0 ? `; o complemento de ${fmt(complementoMensal)} entra no valor pago, sem impostos` : ""}.
          </div>

          {calc && (
            <div style={{ marginTop: 12, border: "0.5px solid var(--border-table, #DDE2EE)", borderRadius: 10, overflow: "hidden" }}>
              <table data-arato-grid="true" style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "var(--bg-page, #F4F6FA)" }}><th style={{ textAlign: "left", padding: "8px 12px", fontSize: 11 }}>Verba</th><th style={{ textAlign: "right", padding: "8px 12px", fontSize: 11, width: 160 }}>Valor (editável)</th></tr></thead>
                <tbody>
                  {[...(calc.verbas), ...linhasAutomaticas({ complemento, impostos, adiantamentos: adis.total, decimoPago })].map(v => (
                    <tr key={v.codigo} style={{ borderTop: "0.5px solid #F0F2F6" }}>
                      <td style={{ padding: "6px 12px", color: v.tipo === "desconto" ? "#E24B4A" : "inherit" }}>{v.tipo === "desconto" ? "(−) " : ""}{v.descricao}{v.nota && <span style={{ fontSize: 10, color: "#888" }}> · {v.nota}</span>}</td>
                      <td style={{ padding: "4px 12px" }}><input style={{ ...inp, textAlign: "right", padding: "4px 8px" }} value={ajustes[v.codigo] ?? mask(verbas.find(x => x.codigo === v.codigo)?.valor ?? v.valor)} onChange={e => setAjustes(p => ({ ...p, [v.codigo]: e.target.value }))} /></td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "0.5px solid #F0F2F6" }}>
                    <td style={{ padding: "6px 12px", color: "#E24B4A" }}>(−) Outros descontos (vales, danos…)</td>
                    <td style={{ padding: "4px 12px" }}><input style={{ ...inp, textAlign: "right", padding: "4px 8px" }} placeholder="0,00" value={outros} onChange={e => setOutros(e.target.value)} /></td>
                  </tr>
                  <tr style={{ borderTop: "0.5px solid var(--border-table, #DDE2EE)", background: "var(--bg-page, #F4F6FA)" }}>
                    <td style={{ padding: "6px 12px" }}>Proventos {fmt(proventos)} · Descontos {fmt(descontos)}</td><td />
                  </tr>
                  <tr style={{ fontWeight: 700, background: "var(--bg-page, #F4F6FA)" }}>
                    <td style={{ padding: "8px 12px" }}>Líquido a pagar ao funcionário</td><td style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(liquido)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {Object.keys(ajustes).length > 0 && <div style={{ textAlign: "right", marginTop: 4 }}><button type="button" onClick={() => setAjustes({})} style={{ border: "none", background: "none", color: "#1A4870", fontSize: 11, cursor: "pointer" }}>↺ Voltar aos valores calculados</button></div>}
          {calc?.avisos.map((a, i) => <div key={i} style={{ fontSize: 11, color: "#7A5500", background: "#FBF3E0", borderRadius: 8, padding: "6px 10px", marginTop: 8 }}>⚠ {a}</div>)}

          <div data-arato-fields="true" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 14 }}>
            <div><label data-arato-label="true" style={lbl}>FGTS do mês (8%)</label>
              <input style={inp} value={fgtsMesEd ?? mask(impostos.fgtsMes)} onChange={e => setFgtsMesEd(e.target.value)} />
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Sobre saldo, aviso e 13º ({fmt(impostos.baseFgts)})</div></div>
            <div><label data-arato-label="true" style={lbl}>Saldo do FGTS{multaFgtsPct(tipo) > 0 ? ` (multa ${multaFgtsPct(tipo) * 100}%)` : ""}</label>
              <input style={inp} disabled={multaFgtsPct(tipo) === 0} value={saldoFgts ?? mask(fgtsEst)} onChange={e => setSaldoFgts(e.target.value)} />
              <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Estimativa; corrija com o extrato do FGTS.</div></div>
            <div><label data-arato-label="true" style={lbl}>Multa do FGTS</label><input style={{ ...inp, background: "var(--bg-page, #F4F6FA)" }} readOnly value={fmt(multa)} /></div>
            <div><label data-arato-label="true" style={lbl}>Pagar até (10 dias corridos)</label><InputData type="date" style={inp} value={prazo} onChange={e => setPagto(e.target.value)} /></div>
          </div>
          <div style={{ marginTop: 12 }}><label data-arato-label="true" style={lbl}>Observação</label><input style={inp} value={obs} onChange={e => setObs(e.target.value)} /></div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 10 }}>
            Cálculo de referência (CLT), a conferir com o contador. Ao lançar: Contas a Pagar com o líquido, o FGTS do mês e a multa; salários previstos depois do desligamento cancelados; adiantamentos pendentes descontados; funcionário desligado.
          </div>
          {erro && <div style={{ color: "#E24B4A", fontSize: 12, marginTop: 10 }}>{erro}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button type="button" data-arato-button="secondary" onClick={() => imprimir()} disabled={!calc} style={btnSec}>🖨 Prévia do comprovante</button>
            <button type="button" data-arato-button="danger" onClick={confirmar} disabled={saving || !calc} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#E24B4A", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
              {saving ? "Lançando…" : "Lançar rescisão"}
            </button>
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
