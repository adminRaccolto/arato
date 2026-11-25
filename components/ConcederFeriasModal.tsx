"use client";
import InputData from "../components/InputData";
import InputMonetario from "../components/InputMonetario";
import { useId, useMemo, useRef, useState } from "react";
import type { Funcionario, FuncionarioFerias } from "../lib/supabase";
import { concederFerias, salarioReferencia } from "../lib/rh-financeiro";
import { calcularFerias, dataFerias, DIAS_DIREITO_FERIAS, limiteAbonoFerias, validarConcessaoFerias } from "../lib/folha/ferias";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (v: string) => v ? v.split("-").reverse().join("/") : "—";
const inp = { width: "100%", padding: "8px 10px", border: "1px solid var(--border-table)", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, background: "var(--bg-input)", color: "var(--text-1)" };
const lbl = { display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 4 };
const campos = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 12 };

export default function ConcederFeriasModal({ func, fazendaId, fer, vendaInicial = false, onClose, onDone }: {
  func: Funcionario; fazendaId: string; fer: FuncionarioFerias; vendaInicial?: boolean;
  onClose: () => void; onDone: (f: FuncionarioFerias) => void;
}) {
  const tituloId = useId();
  const salario = salarioReferencia(func);
  const direitoInicial = fer.dias_direito ?? 30;
  const [inicio, setInicio] = useState("");
  const [diasDireito, setDiasDireito] = useState(direitoInicial);
  const [dias, setDias] = useState(String(vendaInicial ? direitoInicial - limiteAbonoFerias(direitoInicial) : direitoInicial));
  const [abono, setAbono] = useState(vendaInicial);
  const [diasAbono, setDiasAbono] = useState(String(limiteAbonoFerias(direitoInicial)));
  const [solicitacao, setSolicitacao] = useState("");
  const [pagto, setPagto] = useState("");
  const [vFerias, setVFerias] = useState<number | null>(null);
  const [vAbono, setVAbono] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const salvando = useRef(false);
  const [erro, setErro] = useState("");

  const nDias = Number(dias), nAbono = abono ? Number(diasAbono) : 0;
  const fim = inicio && Number.isInteger(nDias) && nDias > 0 && nDias <= 30 ? dataFerias(inicio, nDias - 1) : "";
  const calc = useMemo(() => calcularFerias(Number.isFinite(salario) ? salario : 0, Number.isFinite(nDias) ? nDias : 0, abono, Number.isFinite(nAbono) ? nAbono : 0), [salario, nDias, abono, nAbono]);
  const valorFerias = vFerias ?? calc.totalFerias, valorAbono = abono ? (vAbono ?? calc.totalAbono) : 0;
  const vencPagto = pagto || dataFerias(inicio, -2);
  const prazoSolicitacao = dataFerias(fer.periodo_fim, -15);
  const recalcular = () => { setVFerias(null); setVAbono(null); setErro(""); };
  function escolherVenda(venda: boolean) {
    if (salvando.current || venda === abono) return;
    const vendidos = limiteAbonoFerias(diasDireito);
    setAbono(venda); setDiasAbono(String(vendidos));
    setDias(String(venda ? diasDireito - vendidos : diasDireito)); recalcular();
  }
  function alterarVendidos(valor: string) {
    setDiasAbono(valor);
    const n = Number(valor);
    if (Number.isInteger(n) && n > 0 && n <= limiteAbonoFerias(diasDireito)) setDias(String(diasDireito - n));
    recalcular();
  }
  async function confirmar() {
    if (salvando.current) return;
    const dados = { inicio, fim, dias: nDias, diasDireito, abono, diasAbono: nAbono, solicitacaoAbono: solicitacao,
      valorFerias, valorAbono, dataPagamento: vencPagto };
    const falha = validarConcessaoFerias(dados, salario);
    if (falha) { setErro(falha); return; }
    setErro(""); salvando.current = true; setSaving(true);
    try { onDone(await concederFerias(func, fazendaId, fer, dados)); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível conceder as férias."); }
    finally { salvando.current = false; setSaving(false); }
  }
  const fechar = () => { if (!salvando.current) onClose(); };

  return (
    <div data-arato-overlay="true" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={fechar}>
      <div role="dialog" aria-modal="true" aria-labelledby={tituloId} data-arato-dialog="page" style={{ background: "var(--bg-card)", color: "var(--text-1)", borderRadius: 12, padding: "22px 26px", width: "min(96vw,680px)", maxHeight: "92vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div id={tituloId} data-arato-dialog-body="true" style={{ fontSize: 16, fontWeight: 700 }}>Férias e venda de dias — {func.nome}</div>
        <div data-arato-dialog-body="true" style={{ fontSize: 12, color: "var(--text-2)", margin: "2px 0 14px" }}>Período aquisitivo {dataBR(fer.periodo_inicio)} → {dataBR(fer.periodo_fim)} · salário de referência {fmt(salario)}</div>
        <fieldset disabled={saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div data-arato-fields="true" style={campos}>
            <label data-arato-label="true" style={lbl}>Direito do período
              <select aria-label="Direito do período" style={{ ...inp, marginTop: 4 }} value={diasDireito} onChange={e => {
                const direito = Number(e.target.value), vendidos = limiteAbonoFerias(direito);
                setDiasDireito(direito); setDiasAbono(String(vendidos)); setDias(String(abono ? direito - vendidos : direito)); recalcular();
              }}>{DIAS_DIREITO_FERIAS.map(n => <option key={n} value={n}>{n} dias</option>)}</select>
            </label>
            <label data-arato-label="true" style={lbl}>Início do descanso *<InputData aria-label="Início do descanso" type="date" style={{ ...inp, marginTop: 4 }} value={inicio} onChange={e => setInicio(e.target.value)} /></label>
          </div>
          <section aria-label="Venda de dias de férias" data-arato-panel="true" style={{ marginTop: 12, border: "1px solid var(--border-table)", borderRadius: 10, padding: 14, background: "var(--bg-page)" }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Venda de dias de férias (abono pecuniário)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              {[false, true].map(venda => <button key={String(venda)} type="button" aria-pressed={abono === venda} data-arato-button={abono === venda ? "primary" : "secondary"} onClick={() => escolherVenda(venda)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border-table)", cursor: "pointer", fontSize: 12, background: abono === venda ? "var(--c-primary)" : "var(--bg-input)", color: abono === venda ? "var(--on-primary)" : "var(--text-1)" }}>{venda ? "Com venda de dias" : "Sem venda de dias"}</button>)}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-2)" }}>Por solicitação do funcionário, até {limiteAbonoFerias(diasDireito)} dos {diasDireito} dias de direito podem ser convertidos em pagamento.</div>
            {abono && <>
              <div data-arato-fields="true" style={{ ...campos, marginTop: 12 }}>
                <label data-arato-label="true" style={lbl}>Dias vendidos *<input aria-label="Dias vendidos" type="number" min={1} max={limiteAbonoFerias(diasDireito)} step={1} style={{ ...inp, marginTop: 4 }} value={diasAbono} onChange={e => alterarVendidos(e.target.value)} /></label>
                <label data-arato-label="true" style={lbl}>Data da solicitação (opcional)<InputData aria-label="Data da solicitação" type="date" style={{ ...inp, marginTop: 4 }} value={solicitacao} onChange={e => setSolicitacao(e.target.value)} /></label>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 8 }}>Prazo legal da solicitação: {dataBR(prazoSolicitacao)} (15 dias antes do fim do período aquisitivo). <a href="https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm#art143" target="_blank" rel="noreferrer">Art. 143 da CLT</a>.</div>
              {solicitacao && prazoSolicitacao && solicitacao > prazoSolicitacao && <div role="status" style={{ fontSize: 12, color: "var(--status-warning-text)", marginTop: 6 }}>Solicitação posterior ao prazo legal. Confira o registro com o responsável pela folha.</div>}
            </>}
          </section>
          <div data-arato-fields="true" style={{ ...campos, marginTop: 12 }}>
            <label data-arato-label="true" style={lbl}>Dias de descanso *<input aria-label="Dias de descanso" type="number" min={1} max={diasDireito - nAbono} step={1} style={{ ...inp, marginTop: 4 }} value={dias} onChange={e => { setDias(e.target.value); recalcular(); }} /></label>
            <label data-arato-label="true" style={lbl}>Fim do descanso<input aria-label="Fim do descanso" style={{ ...inp, marginTop: 4 }} value={dataBR(fim)} readOnly /></label>
          </div>
          <div data-arato-panel="true" style={{ marginTop: 14, border: "1px solid var(--border-table)", borderRadius: 10, padding: 14, background: "var(--bg-page)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Cálculo separado para o Contas a Pagar</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", fontSize: 12 }}>
              <span>Férias — {nDias} dias de descanso</span><span>{fmt(calc.ferias)}</span>
              <span>1/3 sobre as férias</span><span>{fmt(calc.tercoFerias)}</span>
              {abono && <><span>Abono — {nAbono} dias vendidos</span><span>{fmt(calc.valAbono)}</span><span>1/3 sobre o abono</span><span>{fmt(calc.tercoAbono)}</span></>}
            </div>
            <div data-arato-fields="true" style={{ ...campos, marginTop: 12 }}>
              <label data-arato-label="true" style={lbl}>Férias a lançar (R$)<InputMonetario aria-label="Valor das férias" style={{ ...inp, marginTop: 4 }} value={valorFerias} onChange={setVFerias} /></label>
              {abono && <label data-arato-label="true" style={lbl}>Abono a lançar (R$)<InputMonetario aria-label="Valor do abono" style={{ ...inp, marginTop: 4 }} value={valorAbono} onChange={setVAbono} /></label>}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 8 }}>Valores brutos, ajustáveis conforme o cálculo da folha. Confira o salário dos dias trabalhados na folha mensal.</div>
          </div>
          <div style={{ marginTop: 12, maxWidth: 280 }}>
            <label data-arato-label="true" style={lbl}>Vencimento no CP<InputData aria-label="Vencimento no CP" type="date" style={{ ...inp, marginTop: 4 }} value={vencPagto} onChange={e => setPagto(e.target.value)} /></label>
            <div style={{ fontSize: 11, color: "var(--text-2)" }}>Pagamento previsto até dois dias antes do início do descanso.</div>
          </div>
        </fieldset>
        <div data-arato-dialog-body="true" role="status" style={{ fontSize: 12, marginTop: 12 }}>Ao confirmar: {abono ? "dois títulos separados" : "um título"} no CP, total de <strong>{fmt(valorFerias + valorAbono)}</strong>.</div>
        {erro && <div role="alert" style={{ color: "var(--status-danger-text)", fontSize: 12, marginTop: 10 }}>{erro}</div>}
        <div data-arato-dialog-actions="true" style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <button type="button" data-arato-button="secondary" disabled={saving} onClick={fechar} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border-table)", background: "transparent", color: "var(--text-1)", cursor: "pointer" }}>Cancelar</button>
          <button type="button" data-arato-button="primary" onClick={confirmar} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--c-primary)", color: "var(--on-primary)", fontWeight: 700, cursor: "pointer" }}>{saving ? "Lançando…" : "Conceder e lançar no financeiro"}</button>
        </div>
      </div>
    </div>
  );
}
